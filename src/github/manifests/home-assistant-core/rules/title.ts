import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { isReleasePR } from "../helpers/release-pr.js";
import { styleProblems } from "../helpers/title-style.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
  const pr = ctx.target;
  if (await isReleasePR(pr)) {
    return { status: "skip", message: "Not checked on release PRs." };
  }
  // Not `allowBots: false`: that looks at who sent the event, and a maintainer
  // pushing to or editing a bot's PR must not subject it to this check.
  if ((await pr.authorLogin()).endsWith("[bot]")) {
    return { status: "skip", message: "Not checked on bot PRs." };
  }

  const title = (await pr.title()).trim();
  if (/^revert\b/i.test(title)) return { status: "skip", message: "Not checked on reverts." };

  const problems = styleProblems(title);
  return problems.length > 0
    ? { status: "fail", message: problems.join("\n") }
    : { status: "pass", message: "The title is clear." };
}

export const title = check({
  id: "title",
  title: "PR title",
  description:
    "Fails titles with a prefix, a lowercase first letter, a trailing dot, an issue number or more than 72 characters.",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
