import { addLogContext, logContext, withCorrelationId } from "../../correlation.js";
import { log } from "../../log.js";
import { type ItemRef, slugOf } from "../../util/item-ref.js";
import { withItemLock } from "../item-lock.js";
import { evaluatePR } from "./evaluate.js";
import { EventType } from "./event.js";
import type { CommandContext } from "./model/command-context.js";
import { type RuleContext, ruleContextFromPullRequest } from "./model/rule-context.js";
import { draftPRIfNotDraft } from "./pr-state.js";
import type { BlockArgsMap, BlockId } from "./status/blocks.js";
import { hasFailingSections } from "./status/build.js";
import { emptyRuleState, parseState } from "./status/render.js";
import type { SectionOverride, StatusSection } from "./status/types.js";
import {
  createCommitStatusWithRetry,
  locateStatusComment,
  syncDashboard,
  updateCommitStatus,
} from "./status-sync.js";
import type { Command, Effect, Rule, RuleOutput } from "./types.js";
import { UsageError } from "./usage-error.js";

export function matchRules(context: RuleContext): Rule[] {
  return context.repoConfig.rules.filter(
    (rule) =>
      (rule.allowBots !== false || !context.senderIsBot) &&
      Object.hasOwn(rule.events, context.eventType),
  );
}

/** Collect every statusSection ID claimed by some rule in this repo's registry. */
function collectKnownStatusSectionIds(context: RuleContext): Set<string> {
  const ids = new Set<string>();
  for (const rule of context.repoConfig.rules) {
    if (rule.statusSections) for (const { id } of rule.statusSections) ids.add(id);
  }
  return ids;
}

/**
 * Everything the matched rules (or commands) produced in one dispatch,
 * bucketed by domain. `data` starts as the persisted per-rule state bag and
 * accumulates this dispatch's state updates.
 */
interface CollectedOutputs {
  statuses: Map<string, StatusSection>;
  overrides: SectionOverride[];
  /** Block updates by id; null args = clear. Later updates win within a dispatch. */
  blocks: Map<BlockId, BlockArgsMap[BlockId] | null>;
  effects: Effect[];
  data: Record<string, unknown>;
  dataChanged: boolean;
}

function newCollected(data: Record<string, unknown>): CollectedOutputs {
  return {
    statuses: new Map(),
    overrides: [],
    blocks: new Map(),
    effects: [],
    data,
    dataChanged: false,
  };
}

/**
 * Fold one rule's output into the dispatch buckets. `stateKey` is the rule
 * name owning the state slice; without one (commands) `state` is ignored.
 */
function collectOutput(collected: CollectedOutputs, output: RuleOutput, stateKey?: string): void {
  for (const status of output.statuses ?? []) collected.statuses.set(status.id, status);
  for (const block of output.blocks ?? []) collected.blocks.set(block.block, block.args);

  collected.overrides.push(...(output.overrides ?? []));
  collected.effects.push(...(output.effects ?? []));

  if (stateKey && output.state !== undefined) {
    if (output.state === null) delete collected.data[stateKey];
    else collected.data[stateKey] = output.state;
    collected.dataChanged = true;
  }
}

/** Drop state slices owned by no live rule (removed/renamed rules). */
function pruneData(
  data: Record<string, unknown>,
  ruleNames: ReadonlySet<string>,
): { data: Record<string, unknown>; swept: boolean } {
  const pruned: Record<string, unknown> = {};
  let swept = false;
  for (const [key, value] of Object.entries(data)) {
    if (ruleNames.has(key)) pruned[key] = value;
    else swept = true;
  }
  return { data: pruned, swept };
}

/**
 * Apply the GitHub side effects.
 */
async function applyEffects(context: RuleContext, effects: Effect[]): Promise<void> {
  const labels = new Set<string>();
  const removeLabels = new Set<string>();
  const assignees = new Set<string>();
  const removeAssignees = new Set<string>();
  const comments = new Set<string>();
  const pokes = new Map<string, ItemRef>();
  // Thunks, not started promises: awaits happen between collection and the
  // allSettled below, and a rejection during that window would be an
  // unhandled rejection (which kills the process) instead of a logged failure.
  // Each carries its effect name so a failure log says which op it was.
  const ops: { op: string; run: () => Promise<unknown> }[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case "addLabels":
        for (const l of effect.labels) labels.add(l);
        break;
      case "removeLabels":
        for (const l of effect.labels) removeLabels.add(l);
        break;
      case "addAssignees":
        for (const a of effect.assignees) assignees.add(a);
        break;
      case "comment":
        comments.add(effect.body);
        break;
      case "addLabelsCrossRepo":
        ops.push({
          op: effect.type,
          run: () =>
            context.github.issues.addLabels({
              owner: effect.owner,
              repo: effect.repo,
              issue_number: effect.issue_number,
              labels: effect.labels,
            }),
        });
        break;
      case "updatePullRequest":
        ops.push({
          op: effect.type,
          run: () =>
            context.github.pulls.update({
              owner: effect.owner,
              repo: effect.repo,
              pull_number: effect.pull_number,
              state: effect.state,
            }),
        });
        break;
      case "requestReviewers":
        ops.push({
          op: effect.type,
          run: () =>
            context.github.pulls.requestReviewers(
              context.pullParams({ reviewers: effect.reviewers }),
            ),
        });
        break;
      case "dismissReview":
        ops.push({
          op: effect.type,
          run: () =>
            context.github.pulls.dismissReview(
              context.pullParams({ review_id: effect.reviewId, message: effect.message }),
            ),
        });
        break;
      case "setTitle":
        ops.push({
          op: effect.type,
          run: () => context.github.issues.update(context.issueParams({ title: effect.title })),
        });
        break;
      case "setState":
        ops.push({
          op: effect.type,
          run: () => context.github.issues.update(context.issueParams({ state: effect.state })),
        });
        break;
      case "removeAssignees":
        for (const a of effect.assignees) removeAssignees.add(a);
        break;
      case "convertToDraft":
        ops.push({ op: effect.type, run: () => draftPRIfNotDraft(context) });
        break;
      case "updateBranch":
        ops.push({ op: effect.type, run: () => updateBranchOrExplain(context) });
        break;
      case "updateComment":
        ops.push({
          op: effect.type,
          run: () =>
            context.github.issues.updateComment(
              context.repoParams({ comment_id: effect.commentId, body: effect.body }),
            ),
        });
        break;
      case "commentOnce":
        ops.push({ op: effect.type, run: () => commentOnce(context, effect.marker, effect.body) });
        break;
      case "commitStatus":
        ops.push({ op: effect.type, run: () => writeRuleCommitStatus(context, effect) });
        break;
      case "evaluate":
        pokes.set(`${slugOf(effect.target)}#${effect.target.number}`, effect.target);
        break;
    }
  }

  if (context.eventType !== EventType.ON_DEMAND) {
    for (const [key, target] of pokes) poke(context, key, target);
  }

  // Collapse label effects to the net diff against the item's current labels,
  // so re-emitted labels don't produce API calls (rules emit unconditionally).
  if (labels.size > 0 || removeLabels.size > 0) {
    const current = new Set(await context.target.labels());
    const toAdd = [...labels].filter((label) => !current.has(label));
    if (toAdd.length > 0) {
      ops.push({
        op: "addLabels",
        run: () => context.github.issues.addLabels(context.issueParams({ labels: toAdd })),
      });
    }

    for (const label of removeLabels) {
      if (labels.has(label)) {
        log.warn("applyEffects: label added and removed in the same dispatch; add wins", {
          label,
        });
        continue;
      }
      if (!current.has(label)) continue;
      ops.push({
        op: `removeLabel:${label}`,
        run: () => context.github.issues.removeLabel(context.issueParams({ name: label })),
      });
    }
  }

  for (const body of comments) {
    ops.push({
      op: "comment",
      run: () => context.github.issues.createComment(context.issueParams({ body })),
    });
  }

  if (assignees.size > 0) {
    ops.push({
      op: "addAssignees",
      run: () =>
        context.github.issues.addAssignees(context.issueParams({ assignees: [...assignees] })),
    });
  }

  if (removeAssignees.size > 0) {
    ops.push({
      op: "removeAssignees",
      run: () =>
        context.github.issues.removeAssignees(
          context.issueParams({ assignees: [...removeAssignees] }),
        ),
    });
  }

  const settled = await Promise.allSettled(ops.map(({ run }) => run()));
  settled.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      log.warn("applyEffects: operation failed", {
        op: ops[index].op,
        error: String(outcome.reason),
      });
    }
  });
}

/**
 * Evaluate another PR without waiting for it: a dispatch that waits on a
 * second item's lock while holding its own deadlocks once that item pokes
 * back. A log context of its own keeps the target's identity off this
 * dispatch's remaining log lines.
 */
function poke(context: RuleContext, key: string, target: ItemRef): void {
  const correlationId = String(logContext()?.correlationId ?? "evaluate");
  withCorrelationId(correlationId, () =>
    withItemLock(key, () => evaluatePR(context.env, context.registry, context.github, target)),
  ).catch((err) => log.exception(err, { op: "evaluate", target: key }));
}

/** Post the marker-tagged comment unless the thread already carries one. */
async function commentOnce(context: RuleContext, marker: string, body: string): Promise<void> {
  const comments = await context.github.paginate(
    context.github.issues.listComments,
    context.issueParams({ per_page: 100 }),
  );
  if (comments.some((c) => context.isOwnComment(c) && c.body?.includes(marker))) return;
  await context.github.issues.createComment(context.issueParams({ body: `${marker}\n${body}` }));
}

/** Write a rule-owned commit status on the PR head. */
async function writeRuleCommitStatus(
  context: RuleContext,
  effect: Extract<Effect, { type: "commitStatus" }>,
): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  const sha = await context.target.headSha();
  if (!sha) return;
  await createCommitStatusWithRetry(context, {
    sha,
    state: effect.state,
    description: effect.description,
    context: effect.context,
    target_url: effect.targetUrl,
  });
}

/** Update the PR branch; surface API failures (conflicts, …) to the thread. */
async function updateBranchOrExplain(context: RuleContext): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  try {
    await context.github.pulls.updateBranch(context.pullParams());
  } catch (err) {
    const e = err as { response?: { data?: { message?: string } }; message?: string };
    const message = e.response?.data?.message || e.message || "Unknown error";
    await context.github.issues.createComment(
      context.issueParams({ body: `Failed to update branch: ${message}` }),
    );
    throw err;
  }
}

/** What one dispatch concluded: the emitted check outcomes and side effects. */
export interface DispatchResult {
  statuses: StatusSection[];
  effects: Effect[];
}

async function runMatchedRules(
  context: RuleContext,
  matched: Rule[],
  data: Record<string, unknown>,
): Promise<CollectedOutputs> {
  const settled = await Promise.allSettled(
    matched.map((rule) => {
      const handler = rule.events[context.eventType];
      if (!handler) return Promise.resolve(undefined);
      return (handler as (ctx: RuleContext, state: unknown) => Promise<RuleOutput | undefined>)(
        context,
        data[rule.name],
      );
    }),
  );

  const collected = newCollected({ ...data });
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      log.exception(outcome.reason, { rule: matched[i].name });
    } else if (outcome.value) {
      collectOutput(collected, outcome.value, matched[i].name);
    }
  }
  return collected;
}

export async function dispatch(context: RuleContext): Promise<DispatchResult> {
  const startedAt = Date.now();
  // Redundant on the webhook path (webhook.service stamps it), but callers
  // like the CLA re-evaluation reach dispatch without going through there.
  addLogContext(context.logContext);
  // GitHub rejects the bot's comments on a locked conversation, and without
  // its dashboard there is no merge gate to keep either. An open PR is
  // re-evaluated once unlocked (see webhook.service.ts).
  if (await context.target.locked()) {
    log.info("dispatch: skipped, item is locked");
    return { statuses: [], effects: [] };
  }
  const knownSectionIds = collectKnownStatusSectionIds(context);
  const dashboardEnabled = context.repoConfig.dashboard ?? false;
  const greeting = dashboardEnabled && context.eventType === EventType.PULL_REQUEST_OPENED;

  // The dispatch's single status-comment read. Greeting dispatches create the
  // placeholder up front so it is the PR's earliest comment; a fresh
  // placeholder starts from empty persisted state, skipping the parse.
  let comment = dashboardEnabled
    ? await locateStatusComment(context, { createIfMissing: greeting })
    : null;

  // First contact with a PR that predates the deploy or whose `opened` was
  // missed: a dashboard built from this event's rules alone would count every
  // other check as passing, so baseline it with a full evaluation first.
  if (
    dashboardEnabled &&
    !comment &&
    context.eventType !== EventType.ON_DEMAND &&
    context.target.kind === "pull_request" &&
    (await context.target.state()) === "open"
  ) {
    const { data: pr } = await context.github.pulls.get(context.pullParams());
    await dispatch(ruleContextFromPullRequest(context.env, context.registry, context.github, pr));
    addLogContext({ eventType: context.eventType }); // the nested dispatch relabeled it
    comment = await locateStatusComment(context, { createIfMissing: false });
  }
  let previous = comment ? (comment.fresh ? emptyRuleState() : parseState(comment.body)) : null;

  const ruleNames = new Set(context.repoConfig.rules.map((rule) => rule.name));
  const { data, swept } = pruneData(previous?.data ?? {}, ruleNames);

  const matched = matchRules(context);
  const output = await runMatchedRules(context, matched, data);
  output.dataChanged ||= swept;

  // Status rows only render on the dashboard
  if (!dashboardEnabled && output.statuses.size > 0) {
    log.warn("dispatch: dropping status rows — repo has no dashboard", {
      sections: [...output.statuses.keys()],
    });
  }

  // A dispatch that shows something for the first time creates the
  // placeholder late — find-or-create, since a concurrent dispatch may have
  // raced us — so the status comment still lands above any comment effects
  // this dispatch applies below. Clears or waiver changes alone never create
  // a status comment; there'd be nothing to act on.
  const showsAnything =
    output.statuses.size > 0 || [...output.blocks.values()].some((args) => args !== null);
  if (dashboardEnabled && !comment && showsAnything) {
    comment = await locateStatusComment(context, { createIfMissing: true });
    if (comment && !comment.fresh) previous = parseState(comment.body);
  }

  // Greeting dispatches sync unconditionally: the placeholder must become the
  // greeting dashboard even when no rule emitted anything.
  const syncNeeded =
    dashboardEnabled &&
    (greeting ||
      comment?.fresh ||
      output.statuses.size > 0 ||
      output.overrides.length > 0 ||
      output.blocks.size > 0 ||
      output.dataChanged);

  // The dashboard write and the side effects are independent — run them
  // concurrently. Neither may sink the other: applyEffects logs per-op
  // failures itself, dashboard failures are logged here.
  const [dashboard] = await Promise.all([
    syncNeeded
      ? syncDashboard(
          context,
          {
            sections: [...output.statuses.values()],
            overrides: output.overrides,
            blocks: output.blocks,
            data: output.data,
          },
          comment,
          previous,
          knownSectionIds,
        ).catch((err) => {
          log.warn("syncDashboard failed", { error: String(err) });
          return null;
        })
      : Promise.resolve(null),
    applyEffects(context, output.effects),
  ]);

  // The merge gate: one aggregate `ha-bot` commit status on the PR head,
  // deep-linking to the dashboard comment.
  if (dashboard?.commentUrl && context.target.kind === "pull_request") {
    try {
      await updateCommitStatus(context, dashboard.aggregate, dashboard.commentUrl);
    } catch (err) {
      log.warn("commit status update failed", { error: String(err) });
    }
  }

  // Without a dashboard write, the section state is whatever the located
  // comment already carried (minus rows no live rule claims).
  const sections =
    dashboard?.sections ?? (previous?.sections ?? []).filter((s) => knownSectionIds.has(s.id));

  // Failing checks ⇒ draft is an invariant reconciled on every dispatch, not
  // just when a rule re-reports the failure — so a missed webhook or a
  // once-failed draft call gets repaired by the next event of any kind
  // (going ready-for-review with failing checks is one more instance).
  // Waived failures don't count (`ignore` is the sanctioned way to keep a PR
  // ready over a failing row), and `pending` never drafts: pending checks
  // wait on someone other than the author (e.g. a code-owner review), and a
  // draft would hide the PR from the very people who can resolve them.
  if (
    context.target.kind === "pull_request" &&
    hasFailingSections(sections) &&
    (await context.target.state()) === "open"
  ) {
    await draftPRIfNotDraft(context);
  }

  const result: DispatchResult = {
    statuses: [...output.statuses.values()],
    effects: output.effects,
  };
  log.info("dispatch: done", {
    rules: matched.map((rule) => rule.name),
    statuses: result.statuses.length,
    effects: result.effects.length,
    durationMs: Date.now() - startedAt,
  });
  return result;
}

/** Why the invocation may not run, or undefined when it may. */
async function commandRejection(
  command: Command | undefined,
  context: CommandContext,
): Promise<string | undefined> {
  if (!context.command) return "unparseable invocation";
  if (!command) return `unknown command "${context.command.name}"`;
  if (context.command.malformed) return 'arguments must be wrapped in quotes: `"<argument>"`';
  if (command.args === "required" && context.command.args.length === 0) {
    return "missing argument";
  }

  const scope = command.scope ?? "both";
  if (scope === "pull_request" && context.target.kind !== "pull_request") {
    return "only available on pull requests";
  }
  if (scope === "issue" && context.target.kind !== "issue") return "only available on issues";

  switch (command.permission) {
    case "none":
      return undefined;
    case "code_owner": {
      if ((await context.senderIsMember()) || (await context.senderIsCodeOwner())) {
        return undefined;
      }
      return "sender is neither a code owner nor an org member";
    }
    case "author": {
      const isAuthor =
        context.sender.login.toLowerCase() === (await context.target.authorLogin()).toLowerCase();
      if (isAuthor || (await context.senderIsMember())) return undefined;
      return "sender is neither the author nor an org member";
    }
    case "author_or_code_owner": {
      const isAuthor =
        context.sender.login.toLowerCase() === (await context.target.authorLogin()).toLowerCase();
      if (isAuthor || (await context.senderIsMember()) || (await context.senderIsCodeOwner())) {
        return undefined;
      }
      return "sender is neither the author, a code owner, nor an org member";
    }
  }
}

async function react(context: CommandContext, content: "+1" | "-1"): Promise<void> {
  try {
    await context.github.reactions.createForIssueComment(
      context.repoParams({ comment_id: context.commentId, content }),
    );
  } catch (err) {
    log.warn("command reaction failed", { error: String(err) });
  }
}

/**
 * The command counterpart of dispatch(): validate each invocation in the
 * comment against its command's declared constraints, run the handlers in
 * order, and apply the collected outputs. A comment can carry several
 * commands (one per `@<slug>` line) mixed with prose; a repeated command
 * runs once. The invoking comment gets a 👍 when every invocation ran and a
 * 👎 when any was rejected or failed. Returns the applied outputs, undefined
 * when nothing ran.
 */
export async function dispatchCommand(
  context: CommandContext,
): Promise<DispatchResult | undefined> {
  if (context.senderIsBot) return undefined;

  if (context.invocations.length === 0) {
    log.info("command rejected", {
      sender: context.sender.login,
      reason: "unparseable invocation",
    });
    await react(context, "-1");
    return undefined;
  }

  const collected = newCollected({});
  let anyOutputs = false;
  let anyRan = false;
  let anyFailed = false;
  const seen = new Set<string>();

  for (const invocation of context.invocations) {
    const invocationContext = context.withInvocation(invocation);
    const command = context.repoConfig.commands.find((c) => c.name === invocation.name);
    const rejection = await commandRejection(command, invocationContext);
    if (rejection || !command) {
      log.info("command rejected", {
        command: invocation.name,
        sender: context.sender.login,
        reason: rejection,
      });
      anyFailed = true;
      continue;
    }

    // Repeats redo the work (`update` is a full re-evaluation); args only
    // matter for commands that require them.
    const key = JSON.stringify([command.name, command.args === "required" ? invocation.args : []]);
    if (seen.has(key)) continue;
    seen.add(key);

    log.info("command", { command: command.name, sender: context.sender.login });

    try {
      const output = await command.handle(invocationContext);
      if (output) {
        collectOutput(collected, output);
        anyOutputs = true;
      }
      anyRan = true;
    } catch (err) {
      if (err instanceof UsageError) {
        // The handler rejected the user's input — normal operation, like the
        // pre-run rejections above, not a fault.
        log.info("command rejected", {
          command: command.name,
          sender: context.sender.login,
          reason: err.message,
        });
      } else {
        log.error("command failed", { command: command.name, error: String(err) });
      }
      anyFailed = true;
    }
  }

  if (anyOutputs) {
    const knownSectionIds = collectKnownStatusSectionIds(context);
    const dashboardEnabled = context.repoConfig.dashboard ?? false;

    if (!dashboardEnabled && collected.statuses.size > 0) {
      log.warn("dispatchCommand: dropping status rows — repo has no dashboard", {
        sections: [...collected.statuses.keys()],
      });
    }

    // Commands never create the status comment — waiver changes alone have
    // nothing to act on. But the dashboard rewrite embeds the whole persisted
    // blob, so locate and parse it so the rule state data rides along.
    const comment = dashboardEnabled
      ? await locateStatusComment(context, { createIfMissing: false })
      : null;
    const previous = comment ? parseState(comment.body) : null;
    collected.data = previous?.data ?? {};

    const syncNeeded =
      dashboardEnabled &&
      (collected.statuses.size > 0 || collected.overrides.length > 0 || collected.blocks.size > 0);

    const [dashboard] = await Promise.all([
      syncNeeded
        ? syncDashboard(
            context,
            {
              sections: [...collected.statuses.values()],
              overrides: collected.overrides,
              blocks: collected.blocks,
              data: collected.data,
            },
            comment,
            previous,
            knownSectionIds,
          ).catch((err) => {
            log.warn("syncDashboard failed", { error: String(err) });
            return null;
          })
        : Promise.resolve(null),
      applyEffects(context, collected.effects),
    ]);

    if (dashboard?.commentUrl && context.target.kind === "pull_request") {
      try {
        await updateCommitStatus(context, dashboard.aggregate, dashboard.commentUrl);
      } catch (err) {
        log.warn("commit status update failed", { error: String(err) });
      }
    }

    // The same failing ⇒ draft reconciliation as dispatch(): a command
    // dispatch repairs a missed draft too.
    const sections =
      dashboard?.sections ?? (previous?.sections ?? []).filter((s) => knownSectionIds.has(s.id));
    if (
      context.target.kind === "pull_request" &&
      hasFailingSections(sections) &&
      (await context.target.state()) === "open"
    ) {
      await draftPRIfNotDraft(context);
    }
  }
  await react(context, anyFailed ? "-1" : "+1");
  return anyRan
    ? { statuses: [...collected.statuses.values()], effects: collected.effects }
    : undefined;
}
