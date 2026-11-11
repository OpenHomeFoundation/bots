import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

export function mergeTarget(config: { base: string }): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
    const baseRef = await ctx.target.baseRef();
    if (baseRef === config.base) {
      return { status: "pass", message: `This PR targets \`${config.base}\`.` };
    }

    // Members (release work, backports, stacked PRs) only get a warning. Asked
    // via the API: `author_association` hides private org memberships.
    const isMember = await ctx.hasMember(await ctx.target.authorLogin());
    return {
      status: isMember ? "warn" : "fail",
      message: isMember
        ? `This PR targets \`${baseRef}\`, not \`${config.base}\`.`
        : `This PR targets \`${baseRef}\`. Please retarget \`${config.base}\`.`,
    };
  }

  return check({
    id: "merge-target",
    title: "Merge target",
    description: `Requires PRs to target the \`${config.base}\` branch.`,
    events: [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.ON_DEMAND,
    ],
    evaluate,
  });
}
