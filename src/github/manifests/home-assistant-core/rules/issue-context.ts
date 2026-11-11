import { log } from "../../../../log.js";
import { neutraliseMentions } from "../../../../util/markdown.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { devComponentFile } from "../../../helpers/dev-file.js";
import { INTEGRATION_LABEL_PREFIX } from "../../../helpers/integration-domains.js";
import { itemIntegrationDomains } from "../helpers/integration-domains.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_LABELED | EventType.ISSUES_ON_DEMAND;

/** The file an integration keeps its reporting guidance in, inside core. */
export const ISSUE_CONTEXT_FILE = "issue_context.md";

/** Longer guidance is ignored; it belongs in the integration's docs. */
export const MAX_ISSUE_CONTEXT_LENGTH = 2000;

/**
 * An integration's guidance as text the dashboard can carry: no mentions that
 * notify, no HTML comment that would hide the rest of the dashboard or pose
 * as its state. Undefined when the file is empty or too long.
 */
export function issueContextText(raw: string, domain: string): string | undefined {
  const text = raw.trim();
  if (!text) return;
  if (text.length > MAX_ISSUE_CONTEXT_LENGTH) {
    log.warn("issueContext: file too long, ignored", { domain, length: text.length });
    return;
  }
  return neutraliseMentions(text).replaceAll("<!--", "&lt;!--");
}

const fetchIssueContext = devComponentFile(ISSUE_CONTEXT_FILE, async (res, domain) =>
  issueContextText(await res.text(), domain),
);

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
    const fromCore = new Map<string, string | undefined>(
      await Promise.all(
        domains.map(
          async (domain) =>
            [`${INTEGRATION_LABEL_PREFIX}${domain}`, await fetchIssueContext(domain)] as const,
        ),
      ),
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
