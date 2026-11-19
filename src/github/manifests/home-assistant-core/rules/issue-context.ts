import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { INTEGRATION_LABEL_PREFIX } from "../../../helpers/integration-domains.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_LABELED | EventType.ISSUES_ON_DEMAND;

/**
 * Per-label reporting guidance on the issue dashboard (keys are full label
 * names, e.g. `integration: zha`, `custom integration`). Generic advice
 * lives in the dashboard's issue intro; this rule only carries extras and
 * fills the `reporting-guidance` template block.
 */
export function issueContext(config: {
  labels: Record<string, string>;
  /** Integration domains the item is about — repo policy, injected by the manifest. */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
}): Rule {
  const { labels } = config;

  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    if ("label" in ctx.event && !(ctx.event.label in labels)) return;
    // Plain rule (blocks, not check()): guard closed issues itself.
    if ((await ctx.target.state()) !== "open") return;

    // Labels on the issue plus the integration labels it's about, so guidance
    // shows up on opened without waiting for set-integration.
    const derived = (await config.domains(ctx)).map((d) => `${INTEGRATION_LABEL_PREFIX}${d}`);
    const effective = new Set([...(await ctx.target.labels()), ...derived]);
    const paragraphs = [...effective].flatMap((label) => (labels[label] ? [labels[label]] : []));

    return {
      blocks: [
        {
          block: "reporting-guidance",
          args: paragraphs.length === 0 ? null : { paragraphs },
        },
      ],
    };
  }

  return {
    name: "issue-context",
    description: "Shows per-label reporting guidance on the issue dashboard",
    events: on(
      [EventType.ISSUES_OPENED, EventType.ISSUES_LABELED, EventType.ISSUES_ON_DEMAND],
      evaluate,
    ),
  };
}
