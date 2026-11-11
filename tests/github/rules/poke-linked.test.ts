import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { homeAssistantPrLinks } from "../../../src/github/manifests/home-assistant-org.js";
import { pokeLinked } from "../../../src/github/rules/poke-linked.js";
import { LINE, linkedContext, ref } from "../helpers/linked-prs.js";
import { runRule } from "../helpers/mock-context.js";

const rule = pokeLinked(homeAssistantPrLinks);
const BACK = `${LINE} home-assistant/core#1`;
const poke = (repo: string, number: number) => ({ type: "evaluate", target: ref(repo, number) });

// The PR is home-assistant/core#1.
describe("poke-linked", () => {
  it("pokes the PRs that list this one back, not the others", async () => {
    const { context } = linkedContext(
      `${LINE} home-assistant/frontend#5 home-assistant/home-assistant.io#9`,
      {
        "frontend#5": { body: BACK },
        "home-assistant.io#9": { body: "" },
      },
    );

    expect((await runRule(rule, context))?.effects).toEqual([poke("frontend", 5)]);
  });

  it("pokes when this PR closes", async () => {
    const { context } = linkedContext(
      `${LINE} home-assistant/home-assistant.io#9`,
      { "home-assistant.io#9": { body: BACK } },
      { type: EventType.PULL_REQUEST_CLOSED, state: "closed" },
    );

    expect((await runRule(rule, context))?.effects).toEqual([poke("home-assistant.io", 9)]);
  });

  it("pokes a PR the edit dropped, if it still lists this one", async () => {
    const { context } = linkedContext(
      `${LINE} home-assistant/frontend#5`,
      { "frontend#5": { body: BACK }, "frontend#6": { body: BACK }, "frontend#7": { body: "" } },
      {
        previousBody: `${LINE} home-assistant/frontend#5 home-assistant/frontend#6 home-assistant/frontend#7`,
      },
    );

    expect((await runRule(rule, context))?.effects).toEqual([
      poke("frontend", 5),
      poke("frontend", 5),
      poke("frontend", 6),
    ]);
  });

  it("doesn't run on demand, where pokes would be dropped", () => {
    expect(rule.events[EventType.ON_DEMAND]).toBeUndefined();
  });
});
