import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { fetchIntegrationManifest, QualityScale } from "../../../helpers/integration-manifest.js";
import { CODE_QUALITY_LABEL, pickedTypeLabels } from "../helpers/change-type.js";
import { domainsFromFiles } from "../helpers/integration-domains.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_REVIEW_DISMISSED
  | EventType.ON_DEMAND;

const APPROVED_LABEL = "code-owner-approved";

/**
 * Every platinum integration the diff touches, with its expanded code owners.
 * Uncapped and never from labels: touching a second integration, or a label
 * left over from an earlier push, must not switch the gate off.
 */
async function platinumOwners(
  ctx: RuleContext<HandledEvent>,
  domains: string[],
): Promise<Map<string, string[]>> {
  const manifests = await Promise.all(domains.map((d) => fetchIntegrationManifest(d)));
  const owners = new Map<string, string[]>();
  for (const [i, domain] of domains.entries()) {
    const manifest = manifests[i];
    if (manifest?.quality_scale !== QualityScale.PLATINUM || !manifest.codeowners?.length) continue;
    owners.set(domain, await ctx.expandTeams(manifest.codeowners));
  }
  return owners;
}

/**
 * Reviewers whose latest decisive review approves. The approval label is
 * never trusted on its own: an old APPROVED is void once the same reviewer
 * later requests changes or has it dismissed. Reviews come back oldest-first,
 * so the last write per reviewer wins; COMMENTED/PENDING don't change it.
 */
async function approvers(ctx: RuleContext<HandledEvent>): Promise<Set<string>> {
  const latest = new Map<string, string>();
  for (const r of await ctx.target.reviews()) {
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") {
      latest.set(r.user?.login?.toLowerCase() ?? "", r.state);
    }
  }
  return new Set([...latest].filter(([, state]) => state === "APPROVED").map(([login]) => login));
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  const domains = domainsFromFiles(await ctx.target.files());
  const owners = await platinumOwners(ctx, domains);
  if (owners.size === 0) {
    return {
      status: "skip",
      message: "Touches no platinum integration — no code-owner approval required.",
    };
  }

  const author = (await ctx.target.authorLogin()).toLowerCase();
  const needReview = [...owners].filter(([, logins]) => !logins.includes(author));
  if (needReview.length === 0) return { status: "pass", message: "Authored by a code owner." };

  const approved = await approvers(ctx);
  const missing = needReview
    .filter(([, logins]) => !logins.some((login) => approved.has(login)))
    .map(([domain]) => `\`${domain}\``);
  if (missing.length === 0) {
    return {
      status: "pass",
      message: "Approved by a code owner.",
      effects: [{ type: "addLabels", labels: [APPROVED_LABEL] }],
    };
  }

  // A member's code-quality change only warns. Otherwise reviewer-actionable,
  // not author-actionable: `pending` blocks the merge without drafting the PR,
  // which would hide it from the review queue and make the approval it's
  // waiting for impossible.
  const relaxed =
    pickedTypeLabels(await ctx.target.body()).includes(CODE_QUALITY_LABEL) &&
    (await ctx.hasMember(author));
  return {
    status: relaxed ? "warn" : "pending",
    message: `Platinum ${missing.join(", ")} — ${
      relaxed
        ? "no code-owner approval; not required for a member's code-quality change."
        : "needs approval from a code owner before merging."
    }`,
    ...((await ctx.target.labels()).includes(APPROVED_LABEL)
      ? { effects: [{ type: "removeLabels", labels: [APPROVED_LABEL] }] }
      : {}),
  };
}

export const platinumApproval = check({
  id: "code-owner-approval",
  title: "Code owner approval",
  waivableBy: "member",
  description: "Requires code owner approval for every platinum integration a PR touches",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_REVIEW_DISMISSED,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
