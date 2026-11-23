import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { NEW_INTEGRATION_LABEL } from "../helpers/change-type.js";
import { addedLines } from "../helpers/integration-manifest.js";
import { isNewIntegrationPR } from "../helpers/new-integration.js";
import { type ParsedPath, parseFiles } from "../helpers/parse-path.js";
import { isReleasePR } from "../helpers/release-pr.js";

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

const REVIEW_PROCESS =
  "[review process](https://developers.home-assistant.io/docs/review-process/#home-assistant-core)";

const LIST = new Intl.ListFormat("en", { type: "conjunction" });

function isAddedInit(p: ParsedPath): boolean {
  return p.type === "component" && p.filename === "__init__.py" && p.status === "added";
}

/**
 * Whether an integration `__init__.py` the PR adds defines `async_migrate_entry`.
 * The patch of an added file is the whole file; when GitHub omits it (large
 * files) the file is read at the head commit instead.
 */
async function definesMigrateEntry(
  ctx: RuleContext<HandledEvent>,
  parsed: ParsedPath[],
): Promise<boolean> {
  for (const init of parsed.filter(isAddedInit)) {
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

  // Changes to existing integrations in the same PR are not the new one's.
  const added = new Set(parsed.filter(isAddedInit).map((p) => p.component));
  const own = parsed.filter((p) => added.has(p.component));

  const platforms = own.flatMap((p) => (p.type === "platform" ? [`\`${p.platform}\``] : []));
  if (platforms.length > 1) {
    issues.push(
      `A new integration starts with a single platform, but this PR adds ${LIST.format(platforms.sort())}. ` +
        `Move all but one to follow-up PRs. See the ${REVIEW_PROCESS}.`,
    );
  }

  if (own.some((p) => p.type === "component" && p.filename === "diagnostics.py")) {
    issues.push(
      "Remove `diagnostics.py` — diagnostics should be added in a follow-up PR once the " +
        `integration is merged. See the ${REVIEW_PROCESS}.`,
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
  return { status: "fail", message: issues.join("\n") };
}

export const newIntegrationValidation = check({
  id: "new-integration-validation",
  title: "New integration validation",
  description:
    "Validates new-integration PRs for platform count, diagnostics and config entry migrations",
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
