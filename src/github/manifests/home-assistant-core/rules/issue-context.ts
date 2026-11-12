import { log } from "../../../../log.js";
import { defuseHtmlComments, neutraliseMentions } from "../../../../util/markdown.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { devComponentFile } from "../../../helpers/dev-file.js";
import { INTEGRATION_LABEL_PREFIX } from "../../../helpers/integration-domains.js";
import { itemIntegrationDomains } from "../helpers/integration-domains.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_LABELED | EventType.ISSUES_ON_DEMAND;

// Longer guidance belongs in the integration's docs.
const MAX_LENGTH = 2000;

/**
 * An integration's guidance from core, as text the dashboard can carry: no
 * mentions that notify, no HTML comment that hides the rest or poses as the
 * dashboard's state. Undefined when empty or too long.
 */
const fetchIssueContext = devComponentFile("issue_context.md", async (res, domain) => {
  const text = (await res.text()).trim();
  if (text.length > MAX_LENGTH) {
    log.warn("issueContext: file too long, ignored", { domain, length: text.length });
    return;
  }
  return text ? defuseHtmlComments(neutraliseMentions(text)) : undefined;
});

/**
 * Reporting guidance on the issue dashboard. Integrations keep theirs in core
 * as `homeassistant/components/<domain>/issue_context.md`, read from dev;
 * `labels` holds guidance by full label name (e.g. `custom integration`),
 * and for integrations that have no file in core yet. Generic advice lives
 * in the dashboard's issue intro; this rule only carries extras and fills the
 * `reporting-guidance` template block.
 */
export function issueContext(labels: Record<string, string>): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    if (
      "label" in ctx.event &&
      !(ctx.event.label in labels) &&
      !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)
    )
      return;
    // Plain rule (blocks, not check()): guard closed issues itself.
    if ((await ctx.target.state()) !== "open") return;

    // Labels on the issue plus the integrations it's about, so guidance shows
    // up on opened without waiting for set-integration.
    const domains = await itemIntegrationDomains(ctx);
    const texts = await Promise.all(domains.map((domain) => fetchIssueContext(domain)));
    const fromCore = new Map(
      domains.map((domain, i) => [`${INTEGRATION_LABEL_PREFIX}${domain}`, texts[i]]),
    );
    const effective = new Set([...(await ctx.target.labels()), ...fromCore.keys()]);
    const paragraphs = [...effective].flatMap((label) => {
      const text = fromCore.get(label) ?? labels[label];
      return text ? [text] : [];
    });

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
    description:
      "Shows reporting guidance for the issue's labels and integrations on the dashboard",
    events: on(
      [EventType.ISSUES_OPENED, EventType.ISSUES_LABELED, EventType.ISSUES_ON_DEMAND],
      evaluate,
    ),
  };
}
