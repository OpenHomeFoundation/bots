import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { pickedTypeLabels } from "./change-type.js";

/** Files a pure dependency bump may touch. */
const BUMP_FILES = new Set([
  "manifest.json",
  "package_constraints.txt",
  "pyproject.toml",
  "requirements.txt",
  "requirements_all.txt",
  "requirements_docs.txt",
  "requirements_test.txt",
  "requirements_test_all.txt",
]);

/** Requirement files whose diff carries the `pkg==version` pins. */
const REQUIREMENT_FILES = new Set([
  "package_constraints.txt",
  "requirements.txt",
  "requirements_all.txt",
  "requirements_docs.txt",
  "requirements_test.txt",
  "requirements_test_all.txt",
]);

const PIN = /^([+-])([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?==([^\s;#]+)\s*$/;

/** PEP 503 name normalization. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Bump {
  name: string;
  version: string;
}

/**
 * The single package whose pin the patches move from one version to another,
 * or undefined when the diffs add/remove packages or bump several.
 */
export function singleBump(patches: string[]): Bump | undefined {
  const added = new Map<string, Bump>();
  const removed = new Map<string, Set<string>>();
  for (const patch of patches) {
    for (const line of patch.split("\n")) {
      const match = PIN.exec(line);
      if (!match) continue;
      const [, sign, name, version] = match;
      const key = normalize(name);
      if (sign === "+") {
        const prior = added.get(key);
        if (prior && prior.version !== version) return undefined;
        if (!prior) added.set(key, { name, version });
      } else {
        const versions = removed.get(key) ?? new Set<string>();
        versions.add(version);
        removed.set(key, versions);
      }
    }
  }
  if (added.size !== 1 || removed.size !== 1) return undefined;
  const [[key, bump]] = added;
  const old = removed.get(key);
  if (!old || old.has(bump.version)) return undefined;
  return bump;
}

/** `Bump <pkg> to <version>`, optionally `from <old>`, `v`-prefixed or not. */
export function isBumpTitle(title: string, bump: Bump): boolean {
  const name = escapeRegExp(bump.name).replace(/\\?[-_.]/g, "[-_.]");
  const version = escapeRegExp(bump.version);
  return new RegExp(`^bump ${name} (?:from \\S+ )?to v?${version}$`, "i").test(title.trim());
}

type HandledEvent = EventType.PULL_REQUEST_OPENED;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
  const pr = ctx.target;
  if ((await pr.authorLogin()).endsWith("[bot]")) return;
  if (!pickedTypeLabels(await pr.body()).includes("dependency")) return;

  const files = await pr.files();
  const basename = (path: string) => path.split("/").pop() ?? "";
  if (files.length === 0 || !files.every((f) => BUMP_FILES.has(basename(f.filename)))) return;

  const bump = singleBump(
    files.filter((f) => REQUIREMENT_FILES.has(basename(f.filename))).map((f) => f.patch ?? ""),
  );
  if (!bump) return;

  if (isBumpTitle(await pr.title(), bump)) return;
  return { effects: [{ type: "setTitle", title: `Bump ${bump.name} to ${bump.version}` }] };
}

export const bumpTitle: Rule = {
  name: "bump-title",
  description:
    "Renames human-authored dependency-upgrade PRs that bump exactly one package " +
    "to `Bump <package> to <version>`.",
  allowBots: false,
  events: on([EventType.PULL_REQUEST_OPENED], evaluate),
};
