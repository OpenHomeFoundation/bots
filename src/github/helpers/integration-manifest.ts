import { z } from "zod";
import { log } from "../../log.js";
import { fetchWithTimeout } from "../../util/fetch.js";

export enum QualityScale {
  NO_SCORE = "No score",
  LEGACY = "legacy",
  BRONZE = "bronze",
  SILVER = "silver",
  GOLD = "gold",
  PLATINUM = "platinum",
  INTERNAL = "internal",
}

const IntegrationManifestSchema = z.object({
  codeowners: z.array(z.string()).optional(),
  domain: z.string(),
  name: z.string(),
  quality_scale: z.nativeEnum(QualityScale).optional(),
  config_flow: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  after_dependencies: z.array(z.string()).default([]),
  documentation: z.string().default(""),
  requirements: z.array(z.string()).default([]),
  iot_class: z.string().default(""),
});

export type IntegrationManifest = z.infer<typeof IntegrationManifestSchema>;

/**
 * Validate a decoded manifest.json — shared by every read path, so dev and PR
 * manifests are the same shape. `where` only names the source in the log.
 */
export function parseIntegrationManifest(
  raw: unknown,
  where: string,
): IntegrationManifest | undefined {
  const parsed = IntegrationManifestSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn("parseIntegrationManifest: schema mismatch", { where, issues: parsed.error.issues });
    return;
  }
  return parsed.data;
}

// Long: manifests change only by PR, and every reader re-evaluates on later
// events, so a stale read corrects itself.
const MANIFEST_TTL_MS = 6 * 60 * 60 * 1000;

// Short: a 404 means "not on dev *yet*", and an integration merged minutes ago
// must not stay invisible for six hours.
const MISS_TTL_MS = 5 * 60 * 1000;

// Core's domain grammar. Callers pass user input (command arguments, link
// segments, directory names), which otherwise ends up in the fetched URL.
const DOMAIN = /^[a-z0-9_]+$/;

/** Cross-event cache, one entry per domain (~1500 at most). */
const byDomain = new Map<string, { manifest?: IntegrationManifest; fetchedAt: number }>();
const inflight = new Map<string, Promise<IntegrationManifest | undefined>>();

async function fetchFromDev(domain: string): Promise<IntegrationManifest | undefined> {
  let manifest: IntegrationManifest | undefined;
  try {
    const res = await fetchWithTimeout(
      `https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/${domain}/manifest.json`,
    );
    if (res.ok) manifest = parseIntegrationManifest(await res.json(), `dev:${domain}`);
  } catch (err) {
    log.warn("fetchIntegrationManifest: fetch failed", { domain, error: String(err) });
    // Uncached: a transient failure must not pin a miss.
    return byDomain.get(domain)?.manifest;
  }
  byDomain.set(domain, { manifest, fetchedAt: Date.now() });
  return manifest;
}

/**
 * The manifest as shipped on core's dev branch, or undefined if there is none
 * there. Cached across deliveries; concurrent readers share one fetch.
 */
export function fetchIntegrationManifest(domain: string): Promise<IntegrationManifest | undefined> {
  if (!DOMAIN.test(domain)) return Promise.resolve(undefined);
  const cached = byDomain.get(domain);
  if (cached) {
    const ttl = cached.manifest ? MANIFEST_TTL_MS : MISS_TTL_MS;
    if (Date.now() - cached.fetchedAt < ttl) return Promise.resolve(cached.manifest);
  }

  let pending = inflight.get(domain);
  if (!pending) {
    pending = fetchFromDev(domain).finally(() => inflight.delete(domain));
    inflight.set(domain, pending);
  }
  return pending;
}

/** Test hook: drop the cache so a case sees the manifests it serves. */
export function resetIntegrationManifests(): void {
  byDomain.clear();
  inflight.clear();
}
