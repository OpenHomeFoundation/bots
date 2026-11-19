import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { isNonIntegrationLabelEvent } from "../../../helpers/integration-domains.js";
import { fetchIntegrationManifest, QualityScale } from "../../../helpers/integration-manifest.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.ON_DEMAND;

// Internal integrations need less documentation than the rest, so reviewers
// hold their pages to a smaller checklist.
const LABEL = "internal";

export function qualityScale(config: {
  /** Integration domains the item is about — repo policy, injected by the manifest. */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
}): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    if (isNonIntegrationLabelEvent(ctx)) return;

    const manifests = await Promise.all(
      (await config.domains(ctx)).map((d) => fetchIntegrationManifest(d)),
    );
    if (manifests.some((m) => m?.quality_scale === QualityScale.INTERNAL)) {
      return { effects: [{ type: "addLabels", labels: [LABEL] }] };
    }
    if ((await ctx.target.labels()).includes(LABEL)) {
      return { effects: [{ type: "removeLabels", labels: [LABEL] }] };
    }
  }

  return {
    name: "quality-scale",
    description:
      "Labels docs PRs `internal` when they document an internal integration, and removes " +
      "the label once they no longer do.",
    events: on(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_REOPENED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.PULL_REQUEST_LABELED,
        EventType.ON_DEMAND,
      ],
      evaluate,
    ),
  };
}
