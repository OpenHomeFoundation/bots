import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { isNonIntegrationLabelEvent } from "../../../helpers/integration-domains.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_LABELED | EventType.ISSUES_ON_DEMAND;

type Domains = (ctx: RuleContext<EventType>) => Promise<string[]>;

async function evaluate(
  ctx: RuleContext<HandledEvent>,
  domainsOf: Domains,
): Promise<RuleOutput | undefined> {
  if (isNonIntegrationLabelEvent(ctx)) return;
  // Plain rule (blocks, not check()): guard closed issues itself.
  if ((await ctx.target.state()) !== "open") return;

  const domains = await domainsOf(ctx);

  return {
    blocks: [
      {
        block: "integration-links",
        args:
          domains.length === 0
            ? null
            : {
                domains: domains.map((d) => ({
                  domain: d,
                  docs: `https://www.home-assistant.io/integrations/${d}`,
                  source: `https://github.com/${ctx.repo.fullName}/tree/dev/homeassistant/components/${d}`,
                  issues: `https://github.com/${ctx.repo.fullName}/issues?q=label%3A%22integration%3A%20${encodeURIComponent(d)}%22`,
                })),
              },
      },
    ],
  };
}

export function issueLinks(config: {
  /** Integration domains the item is about — repo policy, injected by the manifest. */
  domains: Domains;
}): Rule {
  return {
    name: "issue-links",
    description: "Shows documentation, source, and issue-search links for labeled integrations",
    events: on(
      [EventType.ISSUES_OPENED, EventType.ISSUES_LABELED, EventType.ISSUES_ON_DEMAND],
      (ctx) => evaluate(ctx, config.domains),
    ),
  };
}
