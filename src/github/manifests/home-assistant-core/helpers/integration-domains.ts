import type { EventType } from "../../../engine/event.js";
import type { ListPullRequestFiles } from "../../../engine/model/pull-request.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import {
  domainsFromIssueBody,
  domainsFromLabels,
  MAX_INTEGRATION_LABELS,
} from "../../../helpers/integration-domains.js";
import { ParsedPath } from "./parse-path.js";

/** Unique integration domains derived from a PR's changed file paths. */
export function domainsFromFiles(files: ListPullRequestFiles): string[] {
  const domains = new Set<string>();
  // `.component` is derived purely from the path, so the entity-platform set and
  // CODEOWNERS entries aren't needed here — empty inputs suffice.
  const noPlatforms = new Set<string>();
  for (const file of files) {
    const parsed = new ParsedPath(file, noPlatforms, []);
    if (parsed.component) domains.add(parsed.component);
  }
  return [...domains];
}

/**
 * Every integration domain the item is about, derived from the item itself:
 * changed files for PRs (none when they span more than MAX_INTEGRATION_LABELS
 * integrations, a tree-wide change), documentation links in the body for
 * issues — unioned with any `integration:` labels already present (maintainer
 * adds, earlier dispatches). set-integration labels from it; other rules read
 * it instead of waiting for those labels.
 */
export async function itemIntegrationDomains(ctx: RuleContext<EventType>): Promise<string[]> {
  const labeled = domainsFromLabels(await ctx.target.labels());

  let derived: string[];
  if (ctx.target.kind === "pull_request") {
    const fromFiles = domainsFromFiles(await ctx.target.files());
    derived = fromFiles.length > MAX_INTEGRATION_LABELS ? [] : fromFiles;
  } else {
    derived = await domainsFromIssueBody(await ctx.target.body());
  }

  return [...new Set([...labeled, ...derived])];
}
