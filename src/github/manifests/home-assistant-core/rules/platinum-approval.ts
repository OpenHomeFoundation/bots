import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { isNonIntegrationLabelEvent } from "../../../helpers/integration-domains.js";
import { fetchIntegrationManifest, QualityScale } from "../../../helpers/integration-manifest.js";
import { itemIntegrationDomains } from "../helpers/integration-domains.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_REVIEW_DISMISSED
  | EventType.ON_DEMAND;

const APPROVED_LABEL = "code-owner-approved";

/**
 * Who applied the approval label as a manual override, if anyone did. Org
 * members put the label on by hand to approve on a code owner's behalf (an
 * absent owner, a tree-wide cleanup). Only the latest `labeled` event counts,
 * and only when its actor is an org member other than the bot itself or the
 * PR author — authors can't approve their own PR by labeling it.
 */
async function memberLabelOverride(
  ctx: RuleContext<HandledEvent>,
  authorLogin: string,
): Promise<string | undefined> {
  if (!(await ctx.target.labels()).includes(APPROVED_LABEL)) return;
  const labeled = (await ctx.target.issueEvents()).filter(
    (e) => e.event === "labeled" && "label" in e && e.label?.name === APPROVED_LABEL,
  );
  const actor = labeled.at(-1)?.actor?.login;
  if (!actor) return;
  const login = actor.toLowerCase();
  if (login === ctx.botLogin.toLowerCase() || login === authorLogin) return;
  return (await ctx.hasMember(actor)) ? actor : undefined;
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  // Our own label is re-evaluated too: a member adding or removing it by hand
  // is how a code-owner approval is overridden or revoked.
  if (
    isNonIntegrationLabelEvent(ctx) &&
    !("label" in ctx.event && ctx.event.label === APPROVED_LABEL)
  ) {
    return;
  }

  // Everything is derived from the PR itself (files, manifest, CODEOWNERS
  // teams, reviews) — never from labels other rules maintain.
  const domains = await itemIntegrationDomains(ctx);
  if (domains.length !== 1) {
    return {
      status: "skip",
      message: "Touches zero or multiple integrations — code-owner approval not enforced.",
    };
  }

  const domain = domains[0];
  const manifest = await fetchIntegrationManifest(domain);
  if (manifest?.quality_scale !== QualityScale.PLATINUM) {
    return {
      status: "skip",
      message: "Not a platinum integration — no code-owner approval required.",
    };
  }
  if (!manifest.codeowners?.length) {
    return { status: "skip", message: `Integration \`${domain}\` has no code owners listed.` };
  }

  const expandedOwners = await ctx.expandTeams(manifest.codeowners);
  const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
  if (expandedOwners.includes(authorLogin)) {
    return { status: "pass", message: "Authored by a code owner." };
  }

  // A label the bot applied is never trusted on its own — an approval can be
  // dismissed or superseded, so the reviews are the source of truth and the
  // label follows (only a label an org member applied by hand overrides
  // them, see below). Only an owner's *latest* decisive review counts: an old
  // APPROVED is void once the same owner later requests changes or has the
  // approval dismissed. Reviews come back oldest-first, so the last write per
  // owner wins; COMMENTED/PENDING reviews don't change a standing decision.
  const reviews = await ctx.target.reviews();
  const latestByOwner = new Map<string, string>();
  for (const r of reviews) {
    const login = r.user?.login?.toLowerCase() ?? "";
    if (!expandedOwners.includes(login)) continue;
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") {
      latestByOwner.set(login, r.state);
    }
  }
  const approvedByOwner = [...latestByOwner.values()].some((state) => state === "APPROVED");

  if (approvedByOwner) {
    return {
      status: "pass",
      message: "Approved by a code owner.",
      effects: [{ type: "addLabels", labels: [APPROVED_LABEL] }],
    };
  }

  // A member applying the label by hand stands in for a code-owner approval.
  // Leave the label alone so the override survives later re-evaluations.
  const overrideBy = await memberLabelOverride(ctx, authorLogin);
  if (overrideBy) {
    return {
      status: "pass",
      message: `Approved on behalf of the code owners by ${overrideBy} (\`${APPROVED_LABEL}\` label).`,
    };
  }

  // Reviewer-actionable, not author-actionable: `pending` blocks the merge
  // without drafting the PR, which would hide it from the review queue and
  // make the approval it's waiting for impossible.
  return {
    status: "pending",
    message: "Platinum integration — needs approval from a code owner before merging.",
    ...((await ctx.target.labels()).includes(APPROVED_LABEL)
      ? { effects: [{ type: "removeLabels", labels: [APPROVED_LABEL] }] }
      : {}),
  };
}

export const platinumApproval = check({
  id: "code-owner-approval",
  title: "Code owner approval",
  waivableBy: "member",
  description: "Requires code owner approval for platinum quality scale integrations",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_REVIEW_DISMISSED,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
