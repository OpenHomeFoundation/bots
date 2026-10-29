import { log } from "../../log.js";
import type { RuleContext } from "./model/rule-context.js";
import type { BlockUpdates } from "./status/blocks.js";
import { buildStatus, type StatusAggregate } from "./status/build.js";
import { isStatusComment, placeholderBody } from "./status/render.js";
import type { RuleState, SectionOverride, StatusSection } from "./status/types.js";

/**
 * The impure half of the status subsystem: locate the status comment, feed
 * the dispatch's status changes through the pure {@link buildStatus}, and
 * write the results back. Split in two so the dispatcher owns the decisions:
 * {@link syncDashboard} writes the comment and reports the aggregate;
 * {@link updateCommitStatus} writes the aggregate commit status. Drafting is
 * the dispatcher's call.
 */

export const STATUS_CHECK_CONTEXT = "ha-bot";

/** The located (or just-created) status comment. */
export interface StatusCommentRef {
  id: number;
  body: string;
  html_url: string;
  /** True when this call created the placeholder — persisted state is empty. */
  fresh: boolean;
}

export async function findStatusComment(
  context: RuleContext,
): Promise<{ id: number; body: string; html_url: string } | null> {
  const comments = await context.github.paginate(
    context.github.issues.listComments,
    context.issueParams({ per_page: 100 }),
  );

  for (const comment of comments) {
    if (context.isOwnComment(comment) && comment.body && isStatusComment(comment.body)) {
      return { id: comment.id, body: comment.body, html_url: comment.html_url };
    }
  }

  return null;
}

/**
 * The dispatch's single status-comment lookup. With `createIfMissing`, posts
 * the tiny placeholder when none exists — done up front so the status comment
 * sits above any other comment the same dispatch will create. A `fresh`
 * result carries no persisted state, so callers skip parsing entirely.
 */
export async function locateStatusComment(
  context: RuleContext,
  options: { createIfMissing: boolean },
): Promise<StatusCommentRef | null> {
  const existing = await findStatusComment(context);
  if (existing) return { ...existing, fresh: false };
  if (!options.createIfMissing) return null;

  const body = placeholderBody();
  const { data } = await context.github.issues.createComment(context.issueParams({ body }));
  return { id: data.id, body, html_url: data.html_url, fresh: true };
}

/** The status-domain outputs of one dispatch, bucketed by the dispatcher. */
export interface StatusChanges {
  sections: StatusSection[];
  overrides: SectionOverride[];
  /** Block updates: args replace the persisted state, `null` clears. */
  blocks: BlockUpdates;
  /** The merged rule-persisted data bag to embed (stale keys already swept). */
  data: Record<string, unknown>;
}

/** What one dashboard write concluded, for the dispatcher to act on. */
export interface DashboardResult {
  /** Post-merge, post-override section state (what the comment embeds). */
  sections: StatusSection[];
  aggregate: StatusAggregate;
  /** Deep link to the status comment; null when nothing was written. */
  commentUrl: string | null;
}

/**
 * Upsert the status comment from this dispatch's status changes. Pure
 * decision-making lives in {@link buildStatus}; this writes the body back and
 * hands the aggregate to the caller — it does not touch commit statuses or
 * the PR's draft state.
 */
export async function syncDashboard(
  context: RuleContext,
  changes: StatusChanges,
  existing: StatusCommentRef | null,
  previous: RuleState | null,
  knownSectionIds: ReadonlySet<string>,
): Promise<DashboardResult> {
  const params = context.issueParams();

  const result = buildStatus({
    target: {
      kind: context.target.kind,
      repoFullName: context.repo.fullName,
      author: await context.target.authorLogin(),
    },
    newSections: changes.sections,
    overrides: changes.overrides,
    blocks: changes.blocks,
    data: changes.data,
    previous,
    knownSectionIds,
    help: { commandSlug: context.env.COMMAND_SLUG, commands: context.repoConfig.commands },
  });
  if (result.body === null) {
    return { sections: result.sections, aggregate: result.aggregate, commentUrl: null };
  }

  // Re-evaluations (cron sweeps, `/… update`) usually rebuild the identical
  // body; rewriting it anyway would bump the comment's updated_at on every
  // pass.
  let commentUrl: string;
  if (existing) {
    if (existing.body !== result.body) {
      await context.github.issues.updateComment({
        owner: params.owner,
        repo: params.repo,
        comment_id: existing.id,
        body: result.body,
      });
    }
    commentUrl = existing.html_url;
  } else {
    const { data } = await context.github.issues.createComment({ ...params, body: result.body });
    commentUrl = data.html_url;
  }

  return { sections: result.sections, aggregate: result.aggregate, commentUrl };
}

/**
 * Write the single aggregate `ha-bot` commit status on the PR head, deep-
 * linking to the status comment.
 */
export async function updateCommitStatus(
  context: RuleContext,
  aggregate: StatusAggregate,
  commentUrl: string,
): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  const headSha = await context.target.headSha();
  if (!headSha) return;

  // Fail open: if the listing errors, write the status unconditionally.
  const statuses = await context.github.repos
    .listCommitStatusesForRef(context.repoParams({ ref: headSha, per_page: 100 }))
    .then((res) => res.data)
    .catch((err) => {
      log.warn("updateCommitStatus: listing commit statuses failed", { error: String(err) });
      return null;
    });

  // Statuses are append-only: same-context writes pile up as separate objects
  // and GitHub displays the newest one. The listing is newest-first, so `find`
  // yields the entry currently shown — the one worth comparing against.
  const latest = statuses?.find((s) => s.context === STATUS_CHECK_CONTEXT);
  const statusUnchanged =
    latest !== undefined &&
    latest.state === aggregate.state &&
    latest.description === aggregate.description &&
    latest.target_url === commentUrl;
  if (!statusUnchanged) {
    await context.github.repos.createCommitStatus(
      context.repoParams({
        sha: headSha,
        context: STATUS_CHECK_CONTEXT,
        state: aggregate.state,
        description: aggregate.description,
        target_url: commentUrl,
      }),
    );
  }
}
