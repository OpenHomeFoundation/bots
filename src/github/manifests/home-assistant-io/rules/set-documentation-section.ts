import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import {
  extractDocumentationLinks,
  extractIntegrationDocumentationLinks,
} from "../../../helpers/ha-links.js";
import { sectionLabel } from "../sections.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_ON_DEMAND;

// The feedback form's required URL field, prefilled with the page the reader
// came from.
const FORM_URL = /^### URL\s*\n\s*(\S+)/m;

/** The form's URL when it is a docs page, else every docs link in the body. */
function documentationLinks(body: string | null): string[] {
  const fromForm = extractDocumentationLinks(body?.match(FORM_URL)?.[1] ?? null);
  return fromForm.length > 0 ? fromForm : extractDocumentationLinks(body);
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
  const labels = new Set<string>();
  for (const link of documentationLinks(await ctx.target.body())) {
    // Integration pages are labeled by set-integration.
    if (extractIntegrationDocumentationLinks(link).length > 0) continue;
    const label = sectionLabel(new URL(link).pathname);
    if (label) labels.add(label);
  }

  if (labels.size === 0) return;
  return { effects: [{ type: "addLabels", labels: [...labels] }] };
}

export const setDocumentationSection: Rule = {
  name: "set-documentation-section",
  description:
    "Labels docs issues with the `section:` label of the part of the site they are " +
    "about, from the feedback form's URL or else the docs links in the body.",
  allowBots: false,
  events: on([EventType.ISSUES_OPENED, EventType.ISSUES_ON_DEMAND], evaluate),
};
