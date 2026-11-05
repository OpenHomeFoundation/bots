import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Rule, RuleOutput } from "../engine/types.js";
import { domainsFromLabels, INTEGRATION_LABEL_PREFIX } from "../helpers/integration-domains.js";

type HandledEvent =
  | EventType.ISSUES_OPENED
  | EventType.ISSUES_ON_DEMAND
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

export function setIntegration(config: {
  /**
   * Integration domains the item is about — repo policy (file layout, doc
   * links), injected by the manifest.
   */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
}): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    const labeled = domainsFromLabels(await ctx.target.labels());
    const missing = (await config.domains(ctx)).filter((d) => !labeled.includes(d));
    if (missing.length === 0) return;

    return {
      effects: [
        { type: "addLabels", labels: missing.map((d) => `${INTEGRATION_LABEL_PREFIX}${d}`) },
      ],
    };
  }

  return {
    name: "set-integration",
    description:
      "Labels issues and PRs with `integration: <domain>` for the integrations they are about.",
    events: on(
      [
        EventType.ISSUES_OPENED,
        EventType.ISSUES_ON_DEMAND,
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_EDITED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.ON_DEMAND,
      ],
      evaluate,
    ),
  };
}
