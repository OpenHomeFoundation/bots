import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { pokeLinked } from "../../../src/github/rules/poke-linked.js";
import { LINE, linkedContext, ref, testLinks } from "../helpers/linked-prs.js";
import { runRule } from "../helpers/mock-context.js";

const rule = pokeLinked(testLinks);
const BACK = `${LINE} home-assistant/core#1`;
const poke = (repo: string, number: number) => ({ type: "evaluate", target: ref(repo, number) });

// The PR is home-assistant/core#1; frontend PRs are its siblings, io PRs follow it.
describe("poke-linked", () => {
  it("pokes the PRs that list this one back, not the others", async () => {
    const { context } = linkedContext(
      `${LINE} home-assistant/frontend#5 home-assistant/home-assistant.io#9`,
      { "frontend#5": { body: BACK }, "home-assistant.io#9": { body: "" } },
      { type: EventType.PULL_REQUEST_OPENED },
    );

    expect((await runRule(rule, context))?.effects).toEqual([poke("frontend", 5)]);
  });

  it.each([
    ["closes", EventType.PULL_REQUEST_CLOSED, "closed" as const],
    ["reopens", EventType.PULL_REQUEST_REOPENED, "open" as const],
  ])("pokes only the PRs that follow this one when it %s", async (_, type, state) => {
    const { context } = linkedContext(
      `${LINE} home-assistant/frontend#5 home-assistant/home-assistant.io#9`,
      { "frontend#5": { body: BACK }, "home-assistant.io#9": { body: BACK } },
      { type, state },
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

  it("does nothing when an edit leaves the description alone", async () => {
    const { github, context } = linkedContext(`${LINE} home-assistant/frontend#5`, {
      "frontend#5": { body: BACK },
    });

    expect(await runRule(rule, context)).toBeUndefined();
    expect(github.pulls.get).not.toHaveBeenCalled();
  });

  it.each([
    EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    EventType.PULL_REQUEST_REVIEW_DISMISSED,
    EventType.ON_DEMAND,
  ])("doesn't run on %s", (type) => {
    expect(rule.events[type]).toBeUndefined();
  });
});
