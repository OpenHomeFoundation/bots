import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Rule, RuleOutput } from "../engine/types.js";
import { linkedPRs, type PrLinks } from "./linked-prs.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_CLOSED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_REVIEW_SUBMITTED
  | EventType.PULL_REQUEST_REVIEW_DISMISSED;

/**
 * Pokes the PRs this one belongs together with on every change, so their own
 * rules see it. An edit also pokes the ones it dropped: they still list this
 * PR until they re-evaluate. A review only matters to siblings, which wait
 * for this PR's approval.
 */
export function pokeLinked(links: PrLinks): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput> {
    const bodies =
      ctx.event.type === EventType.PULL_REQUEST_EDITED && ctx.event.previousBody !== undefined
        ? [undefined, ctx.event.previousBody]
        : [undefined];
    const reviewed =
      ctx.event.type === EventType.PULL_REQUEST_REVIEW_SUBMITTED ||
      ctx.event.type === EventType.PULL_REQUEST_REVIEW_DISMISSED;
    const linked = (await Promise.all(bodies.map((body) => linkedPRs(ctx, links, body)))).flat();
    return {
      effects: linked
        .filter((l) => l.confirmed && (!reviewed || l.relation === "sibling"))
        .map((l) => ({ type: "evaluate", target: l.ref })),
    };
  }

  return {
    name: "poke-linked",
    description: "Pokes the PRs this one belongs together with, so they see its changes",
    events: on(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_EDITED,
        EventType.PULL_REQUEST_CLOSED,
        EventType.PULL_REQUEST_REOPENED,
        EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        EventType.PULL_REQUEST_REVIEW_DISMISSED,
      ],
      evaluate,
    ),
  };
}
