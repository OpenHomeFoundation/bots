import type { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { domainsFromIssueBody, domainsFromLabels } from "../../../helpers/integration-domains.js";

/**
 * Every integration domain the item is about: documentation links in the body
 * for issues, unioned with any `integration:` labels already present. Docs PRs
 * don't touch integration code, so theirs come from labels alone.
 * set-integration labels from it; other rules read it instead of waiting for
 * those labels.
 */
export async function itemIntegrationDomains(ctx: RuleContext<EventType>): Promise<string[]> {
  const labeled = domainsFromLabels(await ctx.target.labels());
  if (ctx.target.kind !== "issue") return labeled;
  return [...new Set([...labeled, ...(await domainsFromIssueBody(await ctx.target.body()))])];
}
