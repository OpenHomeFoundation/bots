import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { parseFiles } from "../helpers/parse-path.js";
import { isReleasePR } from "../helpers/release-pr.js";

const REVIEW_PROCESS_URL =
  "https://developers.home-assistant.io/docs/review-process/#home-assistant-core";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  if (await isReleasePR(ctx.target)) {
    return { status: "skip", message: "Not checked on release PRs." };
  }

  const parsed = await parseFiles(ctx, await ctx.target.files());

  // Every integration, virtual ones included, has a manifest.json, while a
  // virtual integration has no __init__.py: count added manifests.
  const added = [
    ...new Set(
      parsed
        .filter(
          (p) =>
            p.type === "component" &&
            p.status === "added" &&
            p.path === `homeassistant/components/${p.component}/manifest.json`,
        )
        .map((p) => `\`${p.component}\``),
    ),
  ].sort();

  if (added.length === 0) {
    return { status: "skip", message: "No new integrations added." };
  }
  if (added.length === 1) {
    return { status: "pass", message: `Adds a single new integration: ${added[0]}.` };
  }
  return {
    status: "warn",
    message:
      `This PR adds ${added.length} new integrations (${added.join(", ")}). ` +
      "Add one integration per PR, virtual integrations included, and split the " +
      `others into separate PRs. See the [review process](${REVIEW_PROCESS_URL}).`,
  };
}

export const singleNewIntegration = check({
  id: "single-new-integration",
  title: "Single new integration",
  description: "Warns on PRs that add more than one new integration, virtual ones included",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
