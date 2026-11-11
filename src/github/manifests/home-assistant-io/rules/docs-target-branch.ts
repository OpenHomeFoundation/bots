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

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  const baseRef = await ctx.target.baseRef();
  if (EXEMPT_BRANCHES.has(baseRef)) {
    return { status: "skip", message: `PRs targeting \`${baseRef}\` are exempt.` };
  }

  // Documenting a code PR, listed back or not, is documenting an upcoming release.
  const linked = await linkedPRs(ctx, homeAssistantPrLinks);
  const expected = linked.some((l) => l.relation === "parent") ? "next" : "current";
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
