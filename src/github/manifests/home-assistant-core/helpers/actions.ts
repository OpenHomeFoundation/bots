import type { ParsedPath } from "./parse-path.js";

/** A top-level services.yaml key, i.e. an action. YAML anchors (`.fields: &fields`) don't match. */
const ACTION_KEY = /^([a-z][a-z0-9_]*):/;

/**
 * The actions a PR adds, as sorted `` `domain.action` `` names, read from the
 * integrations' services.yaml diffs: a top-level key on an added line that no
 * removed line carries, so an action that only moves or changes isn't new.
 * GitHub leaves out the patch of very large diffs; an added services.yaml
 * without one still adds actions, so it is listed by its path instead.
 */
export function addedActions(parsed: ParsedPath[]): string[] {
  const actions = new Set<string>();
  for (const p of parsed) {
    if (p.type !== "services" || p.status === "removed") continue;
    const patch = p.file.patch;
    if (!patch) {
      if (p.status === "added") actions.add(`\`${p.path}\``);
      continue;
    }
    const added = new Set<string>();
    const removed = new Set<string>();
    for (const line of patch.split("\n")) {
      const key = ACTION_KEY.exec(line.slice(1))?.[1];
      if (key === undefined) continue;
      if (line.startsWith("+")) added.add(key);
      else if (line.startsWith("-")) removed.add(key);
    }
    for (const key of added) {
      if (!removed.has(key)) actions.add(`\`${p.component}.${key}\``);
    }
  }
  return [...actions].sort();
}
