import type { EventType } from "../engine/event.js";
import type { ListPullRequestFiles } from "../engine/model/pull-request.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { extractIntegrationDocumentationLinks } from "./ha-links.js";
import { fetchIntegrationManifest } from "./integration-manifest.js";

export const INTEGRATION_LABEL_PREFIX = "integration: ";

/**
 * Cap on how many integrations an item is treated as being "about". A PR
 * touching more than this many integrations is almost always a tree-wide
 * change, where per-integration handling is noise.
 */
export const MAX_INTEGRATION_LABELS = 5;

/**
 * Whether the event is a label event for a label other than `integration:`,
 * which can't change the item's integrations: rules that act on those skip.
 */
export function isNonIntegrationLabelEvent(ctx: RuleContext<EventType>): boolean {
  return "label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX);
}

/** Domains named by `integration: <domain>` labels currently on the item. */
export function domainsFromLabels(labels: readonly string[]): string[] {
  return labels
    .filter((l) => l.startsWith(INTEGRATION_LABEL_PREFIX))
    .map((l) => l.slice(INTEGRATION_LABEL_PREFIX.length));
}

/**
 * Integration domains an issue body names via documentation links
 * (`https://www.home-assistant.io/integrations/...`). Platform-page links
 * (`/integrations/binary_sensor.template`) name the integration in the
 * platform segment; plain pages in the integration one. A manifest fetch
 * doubles as validation, so typos and custom-integration links don't count.
 */
export async function domainsFromIssueBody(body: string | null): Promise<string[]> {
  const links = extractIntegrationDocumentationLinks(body);
  const candidates = [...new Set(links.map((l) => l.platform ?? l.integration))].slice(
    0,
    MAX_INTEGRATION_LABELS,
  );

  return domainsOnDev(candidates);
}

/**
 * Every integration domain an item is about, derived from the item itself:
 * for PRs what `fromFiles` reads off the changed files (integrations already
 * on dev only; none when they span more than MAX_INTEGRATION_LABELS
 * integrations, a tree-wide change), documentation links in the body for
 * issues — unioned with any `integration:` labels already present
 * (maintainer adds, earlier dispatches). Where a repo keeps an integration's
 * files is repo policy, so each manifest supplies `fromFiles`.
 */
export function integrationDomains(
  fromFiles: (files: ListPullRequestFiles) => string[],
): (ctx: RuleContext<EventType>) => Promise<string[]> {
  return async (ctx) => {
    const labeled = domainsFromLabels(await ctx.target.labels());

    let derived: string[];
    if (ctx.target.kind === "pull_request") {
      // Adding a label creates it, and any path is a candidate: a PR must not
      // mint labels.
      const candidates = fromFiles(await ctx.target.files());
      derived = candidates.length > MAX_INTEGRATION_LABELS ? [] : await domainsOnDev(candidates);
    } else {
      derived = await domainsFromIssueBody(await ctx.target.body());
    }

    return [...new Set([...labeled, ...derived])];
  };
}

/** The given domains that are integrations on core's dev branch. */
export async function domainsOnDev(candidates: string[]): Promise<string[]> {
  const domains: string[] = [];
  for (const domain of candidates) {
    if (await fetchIntegrationManifest(domain)) domains.push(domain);
  }
  return domains;
}
