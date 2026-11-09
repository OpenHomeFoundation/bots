import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { addedLines } from "../helpers/integration-manifest.js";
import { isNewIntegrationPR } from "../helpers/new-integration.js";
import { type ParsedPath, parseFiles } from "../helpers/parse-path.js";
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

/** Matches a module-level `async_migrate_entry` definition. */
const MIGRATE_ENTRY_PATTERN = /^\s*async\s+def\s+async_migrate_entry\b/m;

/**
 * Whether an integration `__init__.py` the PR adds defines `async_migrate_entry`.
 * The patch of an added file is the whole file; when GitHub omits it (large
 * files) the file is read at the head commit instead.
 */
async function definesMigrateEntry(
  ctx: RuleContext<HandledEvent>,
  parsed: ParsedPath[],
): Promise<boolean> {
  const inits = parsed.filter(
    (p) => p.type === "component" && p.filename === "__init__.py" && p.status === "added",
  );
  for (const init of inits) {
    const content = init.file.patch ? addedLines(init.file.patch) : await ctx.repoFile(init.path);
    if (content && MIGRATE_ENTRY_PATTERN.test(content)) return true;
  }
  return false;
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

  const hasDiagnostics = parsed.some(
    (p) => p.type === "component" && p.filename === "diagnostics.py",
  );
  if (hasDiagnostics) {
    issues.push(
      "Remove `diagnostics.py` — diagnostics should be added in a follow-up PR once the " +
        "integration is merged. See the " +
        "[review process](https://developers.home-assistant.io/docs/review-process/#home-assistant-core).",
    );
  }

  if (await definesMigrateEntry(ctx, parsed)) {
    issues.push(
      "Remove `async_migrate_entry` — a new integration has no existing config entries to " +
        "migrate, so it should start at config entry version 1. Migrations from a custom " +
        "integration are not supported by core.",
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
    "Validates new-integration PRs for platform count, brand folder placement, diagnostics and config entry migrations",
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
