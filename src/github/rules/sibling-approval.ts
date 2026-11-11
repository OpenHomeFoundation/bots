import { EventType } from "../engine/event.js";
import type { PullRequest } from "../engine/model/pull-request.js";
import { check } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";
import { linkedPRs, nameOf, type PrLinks } from "./linked-prs.js";

// Where a repo requires no reviews, their approval stands in for its maintainers'.
const WRITERS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * GitHub's own decision under the repo's branch protection; where the repo
 * requires no reviews, a writer's latest verdict, with no writer asking for
 * changes.
 */
async function approved(pr: PullRequest): Promise<boolean> {
  const decision = await pr.reviewDecision();
  if (decision !== null) return decision === "APPROVED";

  const latest = new Map<string, string>();
  for (const review of await pr.reviews()) {
    const login = review.user?.login;
    if (!login || !WRITERS.has(review.author_association)) continue;
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) {
      latest.set(login, review.state);
    }
  }
  const verdicts = [...latest.values()];
  return verdicts.includes("APPROVED") && !verdicts.includes("CHANGES_REQUESTED");
}

/**
 * Holds a PR while a sibling it has to be merged together with isn't
 * approved, so neither half lands alone. A hint, not a gate: removing the
 * link releases it. It learns of a sibling's approval only through a poke,
 * so it needs `pokeLinked` to poke siblings on reviews.
 */
export function siblingApproval(links: PrLinks): Rule {
  return check({
    id: "sibling-approval",
    title: "Linked approvals",
    description: "Holds a PR until the PRs it has to be merged together with are approved",
    events: [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_REOPENED,
      EventType.ON_DEMAND,
    ],
    async evaluate(ctx) {
      const siblings = (await linkedPRs(ctx, links)).filter(
        (l) => l.relation === "sibling" && l.confirmed,
      );
      if (siblings.length === 0) {
        return { status: "skip", message: "No pull requests to merge together with." };
      }

      const verdicts = await Promise.all(
        siblings.map(async (s) => {
          if (await s.pr.merged()) return "ready";
          if ((await s.pr.state()) === "closed") return "closed";
          return (await approved(s.pr)) ? "ready" : "waiting";
        }),
      );
      const named = (verdict: string) =>
        siblings.filter((_, i) => verdicts[i] === verdict).map((s) => nameOf(s.ref));
      const waiting = named("waiting");
      const closed = named("closed");
      if (waiting.length === 0 && closed.length === 0) {
        return {
          status: "pass",
          message: "The pull requests merged together with this one are approved.",
        };
      }

      const one = (list: string[], singular: string, plural: string) =>
        list.length === 1 ? singular : plural;
      return {
        status: "pending",
        message: [
          waiting.length > 0 &&
            `${waiting.join(", ")} ${one(waiting, "isn't", "aren't")} approved yet, and this PR is merged together with ${one(waiting, "it", "them")}.`,
          closed.length > 0 &&
            `${closed.join(", ")} ${one(closed, "was", "were")} closed without merging.`,
          `If this PR stands on its own, remove the link from "${links.label}".`,
        ]
          .filter(Boolean)
          .join(" "),
      };
    },
  });
}
