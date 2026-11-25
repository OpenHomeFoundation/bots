import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Rule, RuleOutput } from "../engine/types.js";
import { linkedPRs, type PrLinks } from "./linked-prs.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_CLOSED
  | EventType.PULL_REQUEST_REOPENED;

/**
 * Pokes the PRs this one belongs together with when that changes something
 * for them, so their own rules see it. An edit of the description also pokes
 * the ones it dropped: they still list this PR until they re-evaluate. A
 * close or reopen only matters to the PRs that follow this one.
 */
export function pokeLinked(links: PrLinks): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    const edited = ctx.event.type === EventType.PULL_REQUEST_EDITED;
    if (edited && ctx.event.previousBody === undefined) return undefined;
    const bodies = edited ? [undefined, ctx.event.previousBody] : [undefined];
    const stateChanged =
      ctx.event.type === EventType.PULL_REQUEST_CLOSED ||
      ctx.event.type === EventType.PULL_REQUEST_REOPENED;
    const linked = (await Promise.all(bodies.map((body) => linkedPRs(ctx, links, body)))).flat();
    return {
      effects: linked
        .filter((l) => l.confirmed && (!stateChanged || l.relation === "child"))
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
      ],
      evaluate,
    ),
  };
}
