import type { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { NEW_INTEGRATION_LABEL, pickedTypeLabels } from "../rules/change-type.js";
import { addsNewIntegration } from "../rules/file-shape.js";
import type { ParsedPath } from "./parse-path.js";

/** Whether a PR is adding a new integration */
export async function isNewIntegrationPR(
  ctx: RuleContext<EventType>,
  parsed: ParsedPath[],
): Promise<boolean> {
  return (
    (await ctx.target.labels()).includes(NEW_INTEGRATION_LABEL) ||
    pickedTypeLabels(await ctx.target.body()).includes(NEW_INTEGRATION_LABEL) ||
    addsNewIntegration(parsed)
  );
}
