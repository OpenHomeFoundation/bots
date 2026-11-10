import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { isNewIntegrationPR } from "../helpers/new-integration.js";
import { parseFiles } from "../helpers/parse-path.js";
import { isReleasePR } from "../helpers/release-pr.js";
import { NEW_INTEGRATION_LABEL } from "./change-type.js";

const REVIEW_PROCESS_URL =
  "https://developers.home-assistant.io/docs/review-process/#home-assistant-core";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  // Only the new-integration label flips whether this check applies.
  if ("label" in ctx.event && ctx.event.label !== NEW_INTEGRATION_LABEL) return;
  if (await isReleasePR(ctx.target)) {
    return { status: "skip", message: "Not checked on release PRs." };
  }

  const parsed = await parseFiles(ctx, await ctx.target.files());

  // A new integration's platform count is enforced by new-integration-validation.
  if (await isNewIntegrationPR(ctx, parsed)) {
    return {
      status: "skip",
      message: "New-integration PRs are checked by new integration validation.",
    };
  }

  const added = [
    ...new Set(
      parsed
        .filter((p) => p.type === "platform" && p.status === "added")
        .map((p) => `\`${p.component}.${p.platform}\``),
    ),
  ].sort();

  if (added.length === 0) {
    return { status: "skip", message: "No new platforms added." };
  }
  if (added.length === 1) {
    return { status: "pass", message: `Adds a single new platform: ${added[0]}.` };
  }
  return {
    status: "fail",
    message:
      `This PR adds ${added.length} new platforms (${added.join(", ")}). ` +
      "Add one platform per PR and split the others into separate PRs. See the " +
      `[review process](${REVIEW_PROCESS_URL}).`,
  };
}

export const singleNewPlatform = check({
  id: "single-new-platform",
  title: "Single new platform",
  waivableBy: "member",
  description: "Fails PRs that add more than one new platform to existing integrations",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
