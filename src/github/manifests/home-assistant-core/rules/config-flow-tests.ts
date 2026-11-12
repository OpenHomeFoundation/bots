import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { parseFiles } from "../helpers/parse-path.js";
import { isReleasePR } from "../helpers/release-pr.js";

const CONFIG_FLOW_TESTS_URL =
  "https://developers.home-assistant.io/docs/config_entries_config_flow_handler#testing-your-config-flow";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  if (await isReleasePR(ctx.target)) {
    return { status: "skip", message: "Not checked on release PRs." };
  }

  const parsed = await parseFiles(ctx, await ctx.target.files());

  const flows = new Set<string>();
  const tested = new Set<string>();
  for (const p of parsed) {
    if (!p.component || p.status === "removed") continue;
    if (p.type === "component" && p.status === "added" && p.filename === "config_flow.py") {
      flows.add(p.component);
    } else if (p.type === "test" && p.filename === "test_config_flow.py") {
      tested.add(p.component);
    }
  }

  if (flows.size === 0) {
    return { status: "skip", message: "No new config flows added." };
  }

  const untested = [...flows].filter((domain) => !tested.has(domain)).sort();
  if (untested.length === 0) {
    return { status: "pass", message: "New config flows come with config flow tests." };
  }

  const list = untested.map((domain) => `\`${domain}\``).join(", ");
  return {
    status: "fail",
    message:
      `This PR adds a config flow to ${list} without adding ` +
      "`test_config_flow.py`. Config flows require full test coverage, so add " +
      `config flow tests. See the [testing docs](${CONFIG_FLOW_TESTS_URL}).`,
  };
}

export const configFlowTests = check({
  id: "config-flow-tests",
  title: "Config flow tests",
  waivableBy: "member",
  description: "Fails PRs that add a `config_flow.py` without a matching `test_config_flow.py`",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
