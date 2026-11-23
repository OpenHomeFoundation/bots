import { EventType } from "../engine/event.js";
import { check } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";
import { linkedPRs, nameOf, type PrLinks } from "./linked-prs.js";

/** Asks for the other half of each one-way link: a link only counts once both PRs list each other. */
export function belongsTogether(links: PrLinks): Rule {
  return check({
    id: "belongs-together",
    title: "Belongs together",
    description: "Warns about listed PRs that don't list this one back",
    events: [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_REOPENED,
      EventType.ON_DEMAND,
    ],
    async evaluate(ctx) {
      const linked = await linkedPRs(ctx, links);
      const unconfirmed = linked.filter((l) => !l.confirmed).map((l) => nameOf(l.ref));
      if (unconfirmed.length > 0) {
        return {
          status: "warn",
          message:
            `Add \`${ctx.repo.fullName}#${ctx.number}\` to "${links.label}" in the description of ` +
            `${unconfirmed.join(", ")}, so the bot knows they belong together.`,
        };
      }
      if (linked.length > 0) {
        return {
          status: "pass",
          message: `Belongs together with ${linked.map((l) => nameOf(l.ref)).join(", ")}.`,
        };
      }
      return { status: "skip", message: "No pull requests listed." };
    },
  });
}
