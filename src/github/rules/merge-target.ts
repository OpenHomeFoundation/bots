import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

/** How many pull requests deep a stack is followed before giving up. */
const MAX_STACK_DEPTH = 10;

/**
 * The open PR whose branch this PR targets, when following the stack from
 * there ends at `base`; null when the target isn't such a branch. An open PR
 * from a long-lived branch (`rc` into `master`) doesn't end at `base`, so a
 * backport isn't mistaken for a stacked PR.
 */
async function stackParent(
  ctx: RuleContext<HandledEvent>,
  baseRef: string,
  base: string,
): Promise<number | null> {
  let parent: number | null = null;
  let ref = baseRef;
  const seen = new Set<string>();
  for (let depth = 0; depth < MAX_STACK_DEPTH && !seen.has(ref); depth++) {
    seen.add(ref);
    const below = await ctx.openPullRequestsFrom(ref);
    const next = below.find((pr) => pr.baseRef === base) ?? below[0];
    if (!next) return null;
    parent ??= next.number;
    if (next.baseRef === base) return parent;
    ref = next.baseRef;
  }
  return null;
}

export function mergeTarget(config: { base: string }): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
    const baseRef = await ctx.target.baseRef();
    if (baseRef === config.base) {
      return { status: "pass", message: `This PR targets \`${config.base}\`.` };
    }

    // Asked via the API: `author_association` hides private org memberships.
    const isMember = await ctx.hasMember(await ctx.target.authorLogin());
    if (!isMember) {
      return {
        status: "fail",
        message: `This PR targets \`${baseRef}\`. Please retarget \`${config.base}\`.`,
      };
    }

    // A stacked PR can't merge before the one below it, and GitHub retargets
    // it when that one merges, so there is nothing for the author to act on.
    const parent = await stackParent(ctx, baseRef, config.base);
    if (parent !== null) {
      return { status: "pass", message: `This PR is stacked on #${parent}.` };
    }

    // Other member work off the base branch (releases, backports) gets a warning.
    return { status: "warn", message: `This PR targets \`${baseRef}\`, not \`${config.base}\`.` };
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
