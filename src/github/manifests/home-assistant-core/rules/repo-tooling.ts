import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";

export const WORKFLOW_LABEL = "workflow";

/**
 * Path prefixes of the repo's own tooling: the pylint plugin, the mypy plugins
 * and their tests. These are the PRs maintainers label `workflow` by hand.
 *
 * `script/` and `.github/` are left out on purpose: integration PRs routinely
 * touch `script/hassfest/quality_scale.py` and `script/gen_requirements_all.py`,
 * and GitHub Actions bumps are already labeled `github_actions`.
 */
const TOOLING_PREFIXES = [
  "packages/pylint-home-assistant/",
  "tests/pylint/",
  "mypy_plugins/",
  "tests/mypy_plugins/",
];

/**
 * Generated files inside the tooling paths. Frontend bumps regenerate the MDI
 * icon list here, and that alone doesn't make a PR a tooling change.
 */
const GENERATED_PREFIXES = ["packages/pylint-home-assistant/pylint_home_assistant/generated/"];

export function isToolingFile(filename: string): boolean {
  return (
    TOOLING_PREFIXES.some((prefix) => filename.startsWith(prefix)) &&
    !GENERATED_PREFIXES.some((prefix) => filename.startsWith(prefix))
  );
}

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
  const files = await ctx.target.files();
  if (!files.some((f) => isToolingFile(f.filename))) return;
  return { effects: [{ type: "addLabels", labels: [WORKFLOW_LABEL] }] };
}

/**
 * Add-only: maintainers also apply `workflow` by hand to PRs outside these
 * paths, so the rule never removes it.
 */
export const repoTooling: Rule = {
  name: "repo-tooling",
  description:
    "Labels PRs that change the repo's own tooling (the pylint plugin, the mypy " +
    "plugins and their tests) with `workflow`.",
  events: on(
    [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_SYNCHRONIZE, EventType.ON_DEMAND],
    evaluate,
  ),
};
