import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { parseFiles } from "../helpers/parse-path.js";
import { isReleasePR } from "../helpers/release-pr.js";

/** Device automation modules that may no longer be added to integrations. */
export const DEVICE_AUTOMATION_FILES = new Set([
  "device_action.py",
  "device_condition.py",
  "device_trigger.py",
]);

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

  const added = parsed
    .filter(
      (p) =>
        p.type === "component" && p.status === "added" && DEVICE_AUTOMATION_FILES.has(p.filename),
    )
    .map((p) => `\`${p.path}\``)
    .sort();

  if (added.length === 0) {
    return { status: "pass", message: "No device automations added." };
  }
  return {
    status: "fail",
    message:
      `This PR adds device automations (${added.join(", ")}). ` +
      "New device triggers, actions and conditions are no longer accepted; " +
      "remove these files from the PR.",
  };
}

export const noDeviceAutomations = check({
  id: "no-device-automations",
  title: "No new device automations",
  waivableBy: "member",
  description: "Fails PRs that add device_trigger.py, device_action.py or device_condition.py",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
