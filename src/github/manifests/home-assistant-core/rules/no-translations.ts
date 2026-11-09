import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";

const TRANSLATIONS_PATH = /^homeassistant\/components\/[^/]+\/translations\//;

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
  // Removing stale translation files is fine; only adding or changing them is not.
  const offending = (await ctx.target.files())
    .filter((f) => f.status !== "removed" && TRANSLATIONS_PATH.test(f.filename))
    .map((f) => f.filename)
    .sort();

  if (offending.length === 0) {
    return { status: "pass", message: "No generated translation files included." };
  }

  const shown = offending
    .slice(0, 5)
    .map((f) => `\`${f}\``)
    .join(", ");
  const more = offending.length > 5 ? ` and ${offending.length - 5} more` : "";
  return {
    status: "fail",
    message:
      `This PR includes generated translation files (${shown}${more}). ` +
      "The `translations` folder is generated from `strings.json` and must not be committed; " +
      "remove these files from the PR and only edit `strings.json`.",
  };
}

export const noTranslations = check({
  id: "no-translations",
  title: "No generated translations",
  waivableBy: "member",
  description:
    "Fails PRs that add or modify files in an integration's generated `translations` folder",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
