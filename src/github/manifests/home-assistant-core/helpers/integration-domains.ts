import type { ListPullRequestFiles } from "../../../engine/model/pull-request.js";
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
