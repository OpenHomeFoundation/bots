import { z } from "zod";
import { log } from "../../log.js";
import { devComponentFile } from "./dev-file.js";

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

/**
 * The manifest as shipped on core's dev branch, or undefined if there is none
 * there. Cached across deliveries; concurrent readers share one fetch.
 */
export const fetchIntegrationManifest = devComponentFile("manifest.json", async (res, domain) =>
  parseIntegrationManifest(await res.json(), `dev:${domain}`),
);
