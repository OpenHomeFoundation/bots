import { readFileSync } from "node:fs";
import Mustache from "mustache";
import { commandsForTarget, commandViews } from "../engine/command-render.js";
import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { BlockArgsMap } from "../engine/status/blocks.js";
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
// already mentioned, and no further mentions are made — even if new
// integrations or code owners show up later. Assignment can fail silently
// (owners without repo access), so the marker is the only reliable state.
// The dashboard's `code-owners` block writes it (see the dashboard
// templates), or the separate mention comment on targets without a dashboard
// (and on every target in earlier deploys).
// Like all dashboard state, the block can be lost when two dispatches race on
// the dashboard write — the owners would then be pinged again.
export const MENTION_MARKER = "<!-- ha-bot-mention -->";

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

function mentionComment(
  ctx: RuleContext<HandledEvent>,
  itemLabel: string,
  mention: MentionEntry,
): Effect {
  const applicable = commandsForTarget(ctx.repoConfig.commands, ctx.target.kind);
  return {
    type: "comment",
    // Escaping disabled: the output is markdown, not HTML.
    body: Mustache.render(
      MENTION_TEMPLATE,
      {
        mentions: mention.mentions,
        itemLabel,
        integrationName: mention.integration,
        codeownersLine: mention.codeownersLine,
        commandSlug: ctx.env.COMMAND_SLUG,
        hasCommands: applicable.length > 0,
        commands: commandViews(ctx.env.COMMAND_SLUG, applicable),
      },
      undefined,
      { escape: String },
    ),
  };
}

function processIntegration(
  ctx: RuleContext<HandledEvent>,
  integrationName: string,
  codeownersContent: string,
  pathPattern: (name: string) => string,
  authorLogin: string,
  assignees: string[],
  commenters: string[],
): { effects: Effect[]; mention?: MentionEntry } {
  if (!codeownersContent.includes(integrationName)) return { effects: [] };

  const entries = parseCodeOwners(codeownersContent);
  const match = matchCodeOwners(pathPattern(integrationName), entries);
  if (!match) return { effects: [] };

  const owners = match.owners.map((o) => o.substring(1).toLowerCase());
  const codeownersLine = `https://github.com/${ctx.repo.fullName}/blob/HEAD/CODEOWNERS#L${match.line}`;

  const ownersMinusAuthor = owners.filter((usr) => usr !== authorLogin);

  const effects: Effect[] = [];
  if (ownersMinusAuthor.length > 0) {
    effects.push({ type: "addAssignees", assignees: ownersMinusAuthor });
  }

  const mentions = ownersMinusAuthor
    .filter((usr) => !assignees.includes(usr) && !commenters.includes(usr))
    .map((usr) => `@${usr}`);

  if (mentions.length === 0) return { effects };
  return {
    effects,
    mention: { mentions: mentions.join(", "), integration: integrationName, codeownersLine },
  };
}

/**
 * Assigns the code owners and pings them in the dashboard's `code-owners`
 * block, or in a separate comment per integration on repos without a
 * dashboard and on the target kinds listed in `commentOn`.
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

    const integrationNames = await config.domains(ctx);
    if (integrationNames.length === 0) return;

    // The rule is only registered on repos that have a CODEOWNERS file, so a
    // missing one is a misconfiguration — surface it instead of no-opping.
    const codeownersContent = await ctx.codeownersContent();
    if (!codeownersContent) {
      throw new Error(`No CODEOWNERS file in ${ctx.repo.fullName}`);
    }

    const comments = await ctx.target.issueComments();
    if (comments.some((c) => ctx.isOwnComment(c) && isMentionComment(c.body))) return;

    const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
    const assignees = (await ctx.target.assigneeLogins()).map((a) => a.toLowerCase());
    const commenters = comments.map((c) => c.user?.login?.toLowerCase() ?? "");

    const itemLabel = config.itemLabel ?? (ctx.target.kind === "issue" ? "issue" : "pull request");

    const effects: Effect[] = [];
    const integrations: MentionEntry[] = [];
    for (const integrationName of integrationNames) {
      const result = processIntegration(
        ctx,
        integrationName,
        codeownersContent,
        config.pathPattern,
        authorLogin,
        assignees,
        commenters,
      );
      effects.push(...result.effects);
      if (result.mention) integrations.push(result.mention);
    }

    if (integrations.length === 0) return effects.length > 0 ? { effects } : undefined;

    if (!ctx.repoConfig.dashboard || config.commentOn?.includes(ctx.target.kind)) {
      effects.push(...integrations.map((mention) => mentionComment(ctx, itemLabel, mention)));
      return { effects };
    }
    return { effects, blocks: [{ block: "code-owners", args: { itemLabel, integrations } }] };
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
