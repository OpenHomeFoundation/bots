import { z } from "zod";
import { log } from "../../../../log.js";
import { fetchWithTimeout } from "../../../../util/fetch.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { MAX_INTEGRATION_LABELS } from "../../../helpers/integration-domains.js";
import { domainsFromFiles } from "../helpers/integration-domains.js";
import { type ParsedPath, parseFiles } from "../helpers/parse-path.js";
import { addsNewIntegration } from "./file-shape.js";

const ANALYTICS_URL = "https://analytics.home-assistant.io/current_data.json";
const INTEGRATIONS_URL = "https://www.home-assistant.io/integrations.json";
// The types the analytics integrations page ranks (`sortIntegrations` in
// analytics.home-assistant.io `site/.eleventy.js`), so the labels match it.
const RANKED_TYPES = new Set(["integration", "hub", "device", "helper", "service"]);
const TOP_COUNTS = [50, 100, 200];
const RANKING_TTL_MS = 12 * 60 * 60 * 1000;

const AnalyticsSchema = z.object({
  integrations: z.record(z.string(), z.number()),
});
const IntegrationsSchema = z.record(
  z.string(),
  z.object({ integration_type: z.string().optional() }),
);

let cache: { ranked: string[]; fetchedAt: number } | undefined;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`${url}: status ${res.status}`);
  return res.json();
}

/** Domains by install count, best first; last-good on failure. */
async function getRanking(): Promise<string[]> {
  if (cache && Date.now() - cache.fetchedAt < RANKING_TTL_MS) return cache.ranked;
  try {
    const [analytics, integrations] = await Promise.all([
      fetchJson(ANALYTICS_URL).then((data) => AnalyticsSchema.parse(data)),
      fetchJson(INTEGRATIONS_URL).then((data) => IntegrationsSchema.parse(data)),
    ]);
    const installs = analytics.integrations;
    const ranked = Object.keys(integrations)
      .filter((domain) => RANKED_TYPES.has(integrations[domain].integration_type ?? ""))
      .sort((a, b) => (installs[b] ?? 0) - (installs[a] ?? 0));
    if (ranked.length === 0) throw new Error("no ranked integrations");
    cache = { ranked, fetchedAt: Date.now() };
    return ranked;
  } catch (err) {
    log.warn("getTopLabels: analytics ranking failed", { error: String(err) });
    return cache?.ranked ?? [];
  }
}

/** Test hook: drop the cached ranking. */
export function resetTopRanking(): void {
  cache = undefined;
}

async function getTopLabels(parsed: ParsedPath[]): Promise<string[]> {
  const ranked = await getRanking();

  let bestRank = Number.POSITIVE_INFINITY;
  for (const file of parsed) {
    if (!file.component) continue;
    const rank = ranked.indexOf(file.component);
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank;
    }
  }

  return TOP_COUNTS.filter((count) => bestRank < count).map((count) => `Top ${count}`);
}

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
  const domains = domainsFromFiles(await ctx.target.files());
  if (domains.length === 0 || domains.length > MAX_INTEGRATION_LABELS) {
    return undefined;
  }

  // Skip Top N for PRs that touch core or add a brand-new integration —
  // analytics rank is meaningless in both cases.
  const files = await ctx.target.files();
  const parsed = await parseFiles(ctx, files);
  if (parsed.some((f) => f.core) || addsNewIntegration(parsed)) {
    return undefined;
  }

  const labels = await getTopLabels(parsed);
  return labels.length > 0 ? { effects: [{ type: "addLabels", labels }] } : undefined;
}

export const integrationTopRank: Rule = {
  name: "integration-top-rank",
  description:
    "Adds `Top 50/100/200` labels to PRs touching popular integrations, ranked from public analytics.",
  events: on(
    [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.ON_DEMAND,
    ],
    evaluate,
  ),
};
