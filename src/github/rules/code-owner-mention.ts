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

// One ping per item: once owners were mentioned, no further mentions are made
// — even if new integrations or code owners show up later. The ping lives in
// the dashboard's `code-owners` block; this rule's persisted state records
// that it was sent. Assignment can fail silently (owners without repo
// access), so assignees can't serve as that record.
interface MentionState {
  mentioned: true;
}

function wasMentioned(state: unknown): boolean {
  return (state as MentionState | undefined)?.mentioned === true;
}

// Before the ping moved into the dashboard, it was a separate comment carrying
// this marker. Still recognized, so items pinged that way aren't pinged again.
export const MENTION_MARKER = "<!-- ha-bot-mention -->";

// The legacy bot's CodeOwnersMention comments carry no marker, so they're
// recognized by their template prose instead — the raw markdown including the
// link opener, which no human types verbatim.
export const LEGACY_MENTION_SENTINEL = "you are listed as a [code owner](";

/** Whether this comment is a separate code-owner mention comment (earlier or legacy deploy). */
export function isMentionComment(body: string | null | undefined): boolean {
  return !!body && (body.includes(MENTION_MARKER) || body.includes(LEGACY_MENTION_SENTINEL));
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

export function mentionCodeOwners(config: {
  pathPattern: (integration: string) => string;
  /**
   * Integration domains the item is about — repo policy (file layout, doc
   * links), injected by the manifest.
   */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
  itemLabel?: string;
}): Rule {
  async function handle(
    ctx: RuleContext<HandledEvent>,
    state: unknown,
  ): Promise<RuleOutput | undefined> {
    if (isNonIntegrationLabelEvent(ctx)) return;

    // Never mention or assign on closed items — label events and ON_DEMAND fire on them too.
    if ((await ctx.target.state()) !== "open") return;

    if (wasMentioned(state)) return;

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

    const mentioned: MentionState = { mentioned: true };
    return {
      effects,
      blocks: [{ block: "code-owners", args: { itemLabel, integrations } }],
      state: mentioned,
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
