import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import { type ParsedPath, parseFiles } from "../helpers/parse-path.js";
import { isReleasePR } from "../helpers/release-pr.js";

const TEST_COVERAGE_RULE =
  "[config flow test coverage](https://developers.home-assistant.io/docs/core/integration-quality-scale/rules/config-flow-test-coverage)";

const LIST = new Intl.ListFormat("en", { type: "conjunction" });

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

function testPath(domain: string): string {
  return `tests/components/${domain}/test_config_flow.py`;
}

/** Domains whose `config_flow.py` this PR adds. */
function addedFlowDomains(parsed: ParsedPath[]): string[] {
  const domains = parsed.flatMap((p) =>
    p.type === "component" &&
    p.status === "added" &&
    p.filename === "config_flow.py" &&
    p.path === `homeassistant/components/${p.component}/config_flow.py`
      ? [p.component as string]
      : [],
  );
  return [...new Set(domains)].sort();
}

/**
 * Whether the integration has config flow tests: a `test_config_flow*.py`
 * the PR adds or changes, or a `test_config_flow.py` already at the head commit.
 */
async function hasFlowTests(
  ctx: RuleContext<HandledEvent>,
  parsed: ParsedPath[],
  domain: string,
): Promise<boolean> {
  const inPR = parsed.some(
    (p) =>
      p.type === "test" &&
      p.component === domain &&
      p.status !== "removed" &&
      p.path.startsWith(`tests/components/${domain}/test_config_flow`) &&
      p.path.endsWith(".py"),
  );
  if (inPR) return true;
  return (await ctx.repoFile(testPath(domain))) !== null;
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  if (await isReleasePR(ctx.target)) {
    return { status: "skip", message: "Not checked on release PRs." };
  }

  const parsed = await parseFiles(ctx, await ctx.target.files());
  const domains = addedFlowDomains(parsed);
  if (domains.length === 0) {
    return { status: "skip", message: "No config flow added." };
  }

  const missing: string[] = [];
  for (const domain of domains) {
    if (!(await hasFlowTests(ctx, parsed, domain))) missing.push(domain);
  }

  if (missing.length === 0) {
    return {
      status: "pass",
      message: `Config flow tests found for ${LIST.format(domains.map((d) => `\`${d}\``))}.`,
    };
  }
  return {
    status: "fail",
    message:
      `This PR adds a config flow without tests. Add ${LIST.format(missing.map((d) => `\`${testPath(d)}\``))} ` +
      `covering every step of the flow. See the ${TEST_COVERAGE_RULE} rule.`,
  };
}

export const configFlowTests = check({
  id: "config-flow-tests",
  title: "Config flow tests",
  waivableBy: "member",
  description: "Fails PRs that add a config flow without config flow tests",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
