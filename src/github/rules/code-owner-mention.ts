import { readFileSync } from "node:fs";
import Mustache from "mustache";
import { commandsForTarget, commandViews } from "../engine/command-render.js";
import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { BlockArgsMap } from "../engine/status/blocks.js";
import { isStatusComment } from "../engine/status/render.js";
import type { Effect, Rule, RuleOutput } from "../engine/types.js";
import { isNonIntegrationLabelEvent } from "../helpers/integration-domains.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.ISSUES_OPENED
  | EventType.ISSUES_LABELED
  | EventType.ISSUES_ON_DEMAND
  | EventType.ON_DEMAND;

type MentionEntry = BlockArgsMap["code-owners"]["integrations"][number];

// One ping per item: a bot comment carrying this marker means owners were
// already mentioned. Assignment can fail silently (owners without repo
// access), so the marker is the only reliable state. The dashboard's
// `code-owners` block writes it (see the dashboard templates), or the
// separate mention comment on targets without a dashboard (and on every
// target in earlier deploys).
export const MENTION_MARKER = "<!-- ha-bot-mention -->";

// The integrations a ping covers (mention comment or dashboard block), so a
// later dispatch can tell whether the list changed and edit the ping instead
// of posting another. Comments without it (legacy bot, older deploys) cover
// nothing, so they get rewritten.
const COVERED_PATTERN = /<!-- ha-bot-mention-integrations: ([a-z0-9_,]*) -->/;

function coveredIntegrations(body: string | null | undefined): Set<string> | undefined {
  const match = body?.match(COVERED_PATTERN);
  if (!match) return;
  return new Set(match[1].split(",").filter(Boolean));
}

// The legacy bot's CodeOwnersMention comments carry no marker, so they're
// recognized by their template prose instead — the raw markdown including the
// link opener, which no human types verbatim.
export const LEGACY_MENTION_SENTINEL = "you are listed as a [code owner](";

/**
 * Whether this comment carries a code-owner ping: the dashboard showing the
 * `code-owners` block, or a separate mention comment (targets without a
 * dashboard or listed in `commentOn`, and earlier or legacy deploys).
 */
export function isMentionComment(body: string | null | undefined): boolean {
  return !!body && (body.includes(MENTION_MARKER) || body.includes(LEGACY_MENTION_SENTINEL));
}

// The separate comment's layout and prose live in the template; this rule
// only builds the view. The marker is written literally there but grepped for
// here — fail at load if a template edit breaks the pair (one-ping detection
// depends on it).
const MENTION_TEMPLATE = readFileSync(new URL("./code-owner-mention.md", import.meta.url), "utf-8");
if (!MENTION_TEMPLATE.includes(MENTION_MARKER)) {
  throw new Error("code-owner-mention template lost its marker comment");
}

interface OwnedIntegration {
  integrationName: string;
  codeownersLine: string;
  /** Lowercased owner logins, the item's author excluded. */
  owners: string[];
}

function ownedIntegration(
  ctx: RuleContext<HandledEvent>,
  integrationName: string,
  codeownersContent: string,
  pathPattern: (name: string) => string,
  authorLogin: string,
): OwnedIntegration | undefined {
  if (!codeownersContent.includes(integrationName)) return;

  const entries = parseCodeOwners(codeownersContent);
  const match = matchCodeOwners(pathPattern(integrationName), entries);
  if (!match) return;

  return {
    integrationName,
    codeownersLine: `https://github.com/${ctx.repo.fullName}/blob/HEAD/CODEOWNERS#L${match.line}`,
    owners: match.owners
      .map((o) => o.substring(1).toLowerCase())
      .filter((usr) => usr !== authorLogin),
  };
}

/**
 * Assigns the code owners and pings them in the dashboard's `code-owners`
 * block, or in one separate comment on repos without a dashboard and on the
 * target kinds listed in `commentOn`.
 */
export function mentionCodeOwners(config: {
  pathPattern: (integration: string) => string;
  /**
   * Integration domains the item is about — repo policy (file layout, doc
   * links), injected by the manifest.
   */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
  itemLabel?: string;
  /**
   * Target kinds that get the ping as a separate comment instead of the
   * dashboard block — for targets whose dashboard would otherwise exist only
   * for the ping (e.g. home-assistant.io issues).
   */
  commentOn?: readonly ("pull_request" | "issue")[];
}): Rule {
  async function handle(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    if (isNonIntegrationLabelEvent(ctx)) return;

    // Never mention or assign on closed items — label events and ON_DEMAND fire on them too.
    if ((await ctx.target.state()) !== "open") return;

    // Alphabetical, so the comment doesn't depend on label or file order.
    const integrationNames = [...(await config.domains(ctx))].sort();
    if (integrationNames.length === 0) return;

    // The rule is only registered on repos that have a CODEOWNERS file, so a
    // missing one is a misconfiguration — surface it instead of no-opping.
    const codeownersContent = await ctx.codeownersContent();
    if (!codeownersContent) {
      throw new Error(`No CODEOWNERS file in ${ctx.repo.fullName}`);
    }

    const comments = await ctx.target.issueComments();
    const existing = comments.find((c) => ctx.isOwnComment(c) && isMentionComment(c.body));
    const covered = coveredIntegrations(existing?.body) ?? new Set<string>();

    const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
    const owned = integrationNames
      .map((name) =>
        ownedIntegration(ctx, name, codeownersContent, config.pathPattern, authorLogin),
      )
      .filter((o) => o !== undefined);
    if (
      existing &&
      owned.length === covered.size &&
      owned.every((o) => covered.has(o.integrationName))
    ) {
      return;
    }

    const assignees = (await ctx.target.assigneeLogins()).map((a) => a.toLowerCase());
    const commenters = comments.map((c) => c.user?.login?.toLowerCase() ?? "");
    // Owners the comment already names stay in it; they've been pinged.
    const alreadyMentioned = new Set(existing?.body?.toLowerCase().match(/@[\w/-]+/g));

    const itemLabel = config.itemLabel ?? (ctx.target.kind === "issue" ? "issue" : "pull request");

    const toAssign = new Set<string>();
    const mentioned: { integrationName: string; codeownersLine: string; mentions: string }[] = [];
    for (const o of owned) {
      if (!covered.has(o.integrationName)) {
        for (const usr of o.owners) if (!assignees.includes(usr)) toAssign.add(usr);
      }
      const mentions = o.owners
        .filter(
          (usr) =>
            alreadyMentioned.has(`@${usr}`) ||
            (!assignees.includes(usr) && !commenters.includes(usr)),
        )
        .map((usr) => `@${usr}`);
      if (mentions.length > 0) {
        mentioned.push({ ...o, mentions: mentions.join(", ") });
      }
    }

    const effects: Effect[] = [];
    if (toAssign.size > 0) {
      effects.push({ type: "addAssignees", assignees: [...toAssign] });
    }
    if (mentioned.length === 0) return effects.length > 0 ? { effects } : undefined;

    const covers = owned.map((o) => o.integrationName).join(",");

    // An existing ping is edited where it lives: an earlier separate comment
    // stays one even where the dashboard would carry the ping now.
    const asComment = existing
      ? !isStatusComment(existing.body ?? "")
      : !ctx.repoConfig.dashboard || !!config.commentOn?.includes(ctx.target.kind);
    if (asComment) {
      const applicable = commandsForTarget(ctx.repoConfig.commands, ctx.target.kind);
      // Escaping disabled: the output is markdown, not HTML.
      const body = Mustache.render(
        MENTION_TEMPLATE,
        {
          itemLabel,
          covered: covers,
          single: mentioned.length === 1 ? mentioned[0] : null,
          integrations: mentioned,
          codeownersUrl: `https://github.com/${ctx.repo.fullName}/blob/HEAD/CODEOWNERS`,
          commandSlug: ctx.env.COMMAND_SLUG,
          hasCommands: applicable.length > 0,
          commands: commandViews(ctx.env.COMMAND_SLUG, applicable),
        },
        undefined,
        { escape: String },
      );
      effects.push(
        existing
          ? { type: "updateComment", commentId: existing.id, body }
          : { type: "comment", body },
      );
      return { effects };
    }

    const integrations: MentionEntry[] = mentioned.map((m) => ({
      mentions: m.mentions,
      integration: m.integrationName,
      codeownersLine: m.codeownersLine,
    }));
    return {
      effects,
      blocks: [{ block: "code-owners", args: { itemLabel, covered: covers, integrations } }],
    };
  }

  return {
    name: "code-owner-mention",
    description: "Assigns and mentions code owners for integrations a PR/issue touches",
    events: on(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_EDITED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.PULL_REQUEST_LABELED,
        EventType.ISSUES_OPENED,
        EventType.ISSUES_LABELED,
        EventType.ISSUES_ON_DEMAND,
        EventType.ON_DEMAND,
      ],
      handle,
    ),
  };
}
