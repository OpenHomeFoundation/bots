import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { isNonIntegrationLabelEvent } from "../../../helpers/integration-domains.js";
import { fetchIntegrationManifest } from "../../../helpers/integration-manifest.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.ON_DEMAND;

// A virtual integration is a brand pointing at the integration that supports
// it, so its page needs far less documentation than the rest.
const VIRTUAL = "virtual";

export function integrationType(config: {
  /** Integration domains the item is about — repo policy, injected by the manifest. */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
}): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    if (isNonIntegrationLabelEvent(ctx)) return;

    const manifests = await Promise.all(
      (await config.domains(ctx)).map((d) => fetchIntegrationManifest(d)),
    );
    if (manifests.some((m) => m?.integration_type === VIRTUAL)) {
      return { effects: [{ type: "addLabels", labels: [VIRTUAL] }] };
    }
    if ((await ctx.target.labels()).includes(VIRTUAL)) {
      return { effects: [{ type: "removeLabels", labels: [VIRTUAL] }] };
    }
  }

  return {
    name: "integration-type",
    description:
      "Labels docs PRs `virtual` when they document a virtual integration, and removes the " +
      "label once they no longer do.",
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
