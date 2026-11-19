import { extractAllLinks } from "../../../../util/pr-body.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { linkedPRs } from "../../../rules/linked-prs.js";
import { homeAssistantPrLinks } from "../../home-assistant-org.js";

// Integration scaffolds live on `new` and follow neither current nor next.
const EXEMPT_BRANCHES = new Set(["new"]);

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.ON_DEMAND;

// Each named PR costs a read; a description names its parent near the top.
const MAX_NAMED = 3;

/**
 * Whether the PR documents a code PR: one listed on the template line, linked
 * back or not, or one named anywhere else in the description. An issue
 * doesn't count.
 */
async function documentsCodePR(ctx: RuleContext<HandledEvent>): Promise<boolean> {
  if ((await linkedPRs(ctx, homeAssistantPrLinks)).some((l) => l.relation === "parent"))
    return true;

  const self = { owner: ctx.repo.owner, repo: ctx.repo.name };
  const named = extractAllLinks(await ctx.target.body())
    .filter((ref) => homeAssistantPrLinks.relationOf(self, ref) === "parent")
    .slice(0, MAX_NAMED);
  for (const ref of named) {
    try {
      await ctx.pullRequest(ref).baseRepo();
      return true;
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
    }
  }
  return false;
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  const baseRef = await ctx.target.baseRef();
  if (EXEMPT_BRANCHES.has(baseRef)) {
    return { status: "skip", message: `PRs targeting \`${baseRef}\` are exempt.` };
  }

  // Documenting a code PR is documenting an upcoming release.
  const expected = (await documentsCodePR(ctx)) ? "next" : "current";
  if (baseRef === expected) {
    return { status: "pass", message: `This PR targets \`${expected}\`.` };
  }

  return {
    status: "warn",
    message:
      expected === "next"
        ? `This PR has a parent PR on one of our codebases, so its documentation is for an ` +
          `upcoming release and should target \`next\`. Please change the target branch to ` +
          `\`next\` and rebase if needed.`
        : `Documentation updates for the current stable release should target \`current\`. ` +
          `Please change the target branch to \`current\` and rebase if needed — or, if this ` +
          `documents a new feature, list that PR under "This PR belongs together with".`,
  };
}

export const docsTargetBranch = check({
  id: "merge-target",
  title: "Merge target",
  description:
    "Requires docs PRs with a parent code PR to target `next`, and standalone ones `current`.",
  events: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED, EventType.ON_DEMAND],
  evaluate,
});
