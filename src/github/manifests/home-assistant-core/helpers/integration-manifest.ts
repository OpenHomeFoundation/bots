import { log } from "../../../../log.js";
import type { EventType } from "../../../engine/event.js";
import type { PullRequest } from "../../../engine/model/pull-request.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import {
  type IntegrationManifest,
  parseIntegrationManifest,
} from "../../../helpers/integration-manifest.js";

/** Where an integration's manifest lives inside core. */
function manifestPath(domain: string): string {
  return `homeassistant/components/${domain}/manifest.json`;
}

/** The lines a patch adds, with the `+` marker stripped. */
function addedLines(patch: string): string {
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

/**
 * The manifest out of the PR's own diff, free of charge. Works only when the
 * PR adds the file whole, so its patch is the complete manifest; a partial
 * diff (or an omitted patch) yields undefined for the caller to fetch.
 */
async function manifestFromDiff(
  domain: string,
  target: PullRequest,
): Promise<IntegrationManifest | undefined> {
  const path = manifestPath(domain);
  const file = (await target.files()).find((f) => f.filename === path);
  if (!file?.patch) return;

  let raw: unknown;
  try {
    raw = JSON.parse(addedLines(file.patch));
  } catch {
    return;
  }
  return parseIntegrationManifest(raw, `diff:${domain}`);
}

/**
 * The whole manifest on the PR's head commit, however partial the diffs were.
 * Fork PRs' head commits are served from the base repo, so this is one read
 * against the repo the rules already talk to. Undefined when the head tree has
 * no such file, or what it has is not JSON.
 */
async function manifestAtHead(
  ctx: RuleContext<EventType>,
  domain: string,
): Promise<IntegrationManifest | undefined> {
  const path = manifestPath(domain);
  const content = await ctx.repoFile(path);
  if (content === null) return;

  try {
    return parseIntegrationManifest(JSON.parse(content), `head:${domain}`);
  } catch (err) {
    log.warn("manifestAtHead: manifest is not valid JSON", { domain, path, error: String(err) });
  }
}

/**
 * The manifest core would ship for `domain` once this PR lands: read from the
 * diff when the PR adds it whole (the new-integration case, and free),
 * otherwise fetched at the head commit. Undefined when the head tree has none.
 *
 * For what dev ships regardless of the PR, call `fetchIntegrationManifest` —
 * that read isn't PR-shaped and doesn't belong behind this.
 */
export async function fetchResultingIntegrationManifest(
  ctx: RuleContext<EventType>,
  domain: string,
): Promise<IntegrationManifest | undefined> {
  if (ctx.target.kind !== "pull_request") return;
  return (await manifestFromDiff(domain, ctx.target)) ?? (await manifestAtHead(ctx, domain));
}

/** Every integration `manifest` declares a dependency on, in either direction. */
export function manifestDependencies(manifest: IntegrationManifest): string[] {
  return [...manifest.dependencies, ...manifest.after_dependencies];
}
