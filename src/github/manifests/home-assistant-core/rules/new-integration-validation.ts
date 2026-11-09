import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { isNewIntegrationPR } from "../helpers/new-integration.js";
import { type ParsedPath, parseFiles } from "../helpers/parse-path.js";
import { addedLines } from "../helpers/patch.js";
import { isReleasePR } from "../helpers/release-pr.js";
import { NEW_INTEGRATION_LABEL } from "./change-type.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

/** A config flow step that belongs in a follow-up PR, not the initial one. */
const DEFERRED_FLOW_STEP = /^\s*(?:async\s+)?def\s+async_step_(reauth|reconfigure)\w*\s*\(/gm;

/**
 * The reauth/reconfigure flows the PR's config flows add. Reads the added
 * lines of the diff; when GitHub omits the patch (large files), falls back to
 * the file at the PR's head commit.
 */
async function deferredFlows(
  ctx: RuleContext<HandledEvent>,
  parsed: ParsedPath[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const p of parsed) {
    if (p.type !== "component" || p.filename !== "config_flow.py" || p.status === "removed") {
      continue;
    }
    const source = p.file.patch ? addedLines(p.file.patch) : await ctx.repoFile(p.path);
    if (!source) continue;
    for (const match of source.matchAll(DEFERRED_FLOW_STEP)) found.add(match[1]);
  }
  return found;
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  if ("label" in ctx.event && ctx.event.label !== NEW_INTEGRATION_LABEL) return;
  if (await isReleasePR(ctx.target)) {
    return { status: "skip", message: "Not checked on release PRs." };
  }

  const files = await ctx.target.files();
  const parsed = await parseFiles(ctx, files);

  if (!(await isNewIntegrationPR(ctx, parsed))) {
    return { status: "skip", message: "Not a new-integration PR." };
  }

  const issues: string[] = [];

  const hasMultiplePlatforms = parsed.filter((p) => p.type === "platform").length > 1;
  if (hasMultiplePlatforms) {
    issues.push(
      "Limit included platforms to a single platform. See the " +
        "[review process](https://developers.home-assistant.io/docs/review-process/#home-assistant-core).",
    );
  }

  const hasBrandFolder = parsed.some((p) => p.type === "brand");
  if (hasBrandFolder) {
    issues.push(
      "Remove the `brand` folder — brand assets don't belong in core. See the " +
        "[brand images docs](https://developers.home-assistant.io/docs/core/integration/brand_images).",
    );
  }

  const flows = await deferredFlows(ctx, parsed);
  if (flows.size > 0) {
    const names = [...flows]
      .sort()
      .map((f) => `\`${f}\``)
      .join(" and ");
    issues.push(
      `Remove the ${names} flow${flows.size > 1 ? "s" : ""} — keep the initial PR minimal ` +
        "and add these in a follow-up PR. See the " +
        "[review process](https://developers.home-assistant.io/docs/review-process/#home-assistant-core).",
    );
  }

  if (issues.length === 0) {
    return { status: "pass", message: "Validation passed." };
  }
  return { status: "fail", message: issues.map((i) => `- ${i}`).join("\n") };
}

export const newIntegrationValidation = check({
  id: "new-integration-validation",
  title: "New integration validation",
  description:
    "Validates new-integration PRs for platform count, brand folder placement, " +
    "and reauth/reconfigure flows (which belong in follow-up PRs)",
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
