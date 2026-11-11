import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Effect, Rule, RuleOutput } from "../engine/types.js";
import { linkedPRs, nameOf, type PrLinks } from "./linked-prs.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.ON_DEMAND;

type ParentState = "open" | "closed" | "merged";
type ParentStates = Record<string, ParentState>;

/** The persisted slice is untrusted (comments are editable): keep only valid entries. */
function parseParents(state: unknown): ParentStates {
  const parents = (state as { parents?: unknown } | undefined)?.parents;
  if (!parents || typeof parents !== "object") return {};
  return Object.fromEntries(
    Object.entries(parents).filter(([, s]) => s === "open" || s === "closed" || s === "merged"),
  );
}

/**
 * A PR that follows code (docs, brands) gets `has-parent` from its confirmed
 * parents, `parent-merged` once one merges, and with a single parent follows
 * its close and reopen. Only changes since the last evaluation are mirrored,
 * so a maintainer reopening it under a closed parent isn't overruled.
 */
export function followParent(links: PrLinks): Rule {
  async function evaluate(
    ctx: RuleContext<HandledEvent>,
    state: unknown,
  ): Promise<RuleOutput | undefined> {
    const parents = await Promise.all(
      (await linkedPRs(ctx, links))
        .filter((l) => l.relation === "parent" && l.confirmed)
        .map(async (l) => ({
          name: nameOf(l.ref),
          state: ((await l.pr.merged()) ? "merged" : await l.pr.state()) as ParentState,
        })),
    );
    const seen = parseParents(state);
    if (parents.length === 0 && Object.keys(seen).length === 0) return undefined;

    const effects: Effect[] = [];
    if (parents.length > 0) effects.push({ type: "addLabels", labels: ["has-parent"] });
    if (parents.some((p) => p.state === "merged")) {
      effects.push({ type: "addLabels", labels: ["parent-merged"] });
    }

    if (parents.length === 1) {
      const [parent] = parents;
      // A pair the bot hasn't seen yet was formed while the parent was open.
      if ((seen[parent.name] ?? "open") !== parent.state) {
        const open = (await ctx.target.state()) === "open";
        if (parent.state === "closed" && open) effects.push({ type: "setState", state: "closed" });
        if (parent.state === "open" && !open && !(await ctx.target.merged())) {
          effects.push({ type: "setState", state: "open" });
        }
      }
    }

    const now = Object.fromEntries(parents.map((p) => [p.name, p.state]));
    return {
      effects,
      state: JSON.stringify(now) === JSON.stringify(seen) ? undefined : { parents: now },
    };
  }

  return {
    name: "follow-parent",
    description:
      "Labels docs and brands PRs from their parent code PR, and follows its close and reopen",
    events: on(
      [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_EDITED, EventType.ON_DEMAND],
      evaluate,
    ),
  };
}
