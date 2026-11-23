import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { followParent } from "../../../src/github/rules/follow-parent.js";
import { LINE, linkedContext, type OtherPR, testLinks } from "../helpers/linked-prs.js";
import { runRule } from "../helpers/mock-context.js";

const rule = followParent(testLinks);
const BACK = `${LINE} home-assistant/home-assistant.io#1`;
const PARENT = "home-assistant/core#123";
const seen = (state: "open" | "closed" | "merged") => ({ parents: { [PARENT]: state } });
const setState = expect.objectContaining({ type: "setState" });

/** The docs PR home-assistant/home-assistant.io#1, listing `body`. */
function docs(
  body: string,
  others: Record<string, OtherPR>,
  self: { state?: "open" | "closed"; merged?: boolean } = {},
) {
  const { context } = linkedContext(body, others, {
    repo: "home-assistant.io",
    type: EventType.ON_DEMAND,
    ...self,
  });
  return (state?: unknown) => runRule(rule, context, state);
}

describe("follow-parent", () => {
  it("labels a PR whose parent lists it back, and remembers the parent's state", async () => {
    const result = await docs(`${LINE} ${PARENT}`, { "core#123": { body: BACK } })();

    expect(result?.effects).toEqual([{ type: "addLabels", labels: ["has-parent"] }]);
    expect(result?.state).toEqual(seen("open"));
  });

  it.each([
    ["a parent that doesn't list it back", `${LINE} ${PARENT}`, { "core#123": { body: "" } }],
    ["a sibling follower", `${LINE} home-assistant/brands#5`, { "brands#5": { body: BACK } }],
  ])("does nothing for %s", async (_, body, others) => {
    expect(await docs(body, others)()).toBeUndefined();
  });

  it("does nothing on a code PR", async () => {
    const { context } = linkedContext(`${LINE} home-assistant/frontend#5`, {
      "frontend#5": { body: `${LINE} home-assistant/core#1` },
    });

    expect(await runRule(rule, context)).toBeUndefined();
  });

  it("labels parent-merged once the parent merges", async () => {
    const result = await docs(`${LINE} ${PARENT}`, {
      "core#123": { body: BACK, state: "closed", merged: true },
    })(seen("open"));

    expect(result?.labels).toEqual(["has-parent", "parent-merged"]);
    expect(result?.effects).not.toContainEqual(setState);
  });

  it.each([
    ["it was open before", seen("open")],
    ["the bot sees the pair for the first time", undefined],
  ])("closes when its parent closes and %s", async (_, state) => {
    const result = await docs(`${LINE} ${PARENT}`, {
      "core#123": { body: BACK, state: "closed" },
    })(state);

    expect(result?.effects).toContainEqual({ type: "setState", state: "closed" });
    expect(result?.state).toEqual(seen("closed"));
  });

  it("stays open after a maintainer reopened it under a closed parent", async () => {
    const result = await docs(`${LINE} ${PARENT}`, {
      "core#123": { body: BACK, state: "closed" },
    })(seen("closed"));

    expect(result?.effects).not.toContainEqual(setState);
  });

  it("reopens when its parent reopens", async () => {
    const result = await docs(
      `${LINE} ${PARENT}`,
      { "core#123": { body: BACK } },
      { state: "closed" },
    )(seen("closed"));

    expect(result?.effects).toContainEqual({ type: "setState", state: "open" });
  });

  it("doesn't reopen once merged", async () => {
    const result = await docs(
      `${LINE} ${PARENT}`,
      { "core#123": { body: BACK } },
      { state: "closed", merged: true },
    )(seen("closed"));

    expect(result?.effects).not.toContainEqual(setState);
  });

  it("doesn't follow either of two parents", async () => {
    const result = await docs(`${LINE} ${PARENT}, home-assistant/frontend#7`, {
      "core#123": { body: BACK, state: "closed" },
      "frontend#7": { body: BACK },
    })({ parents: { [PARENT]: "open", "home-assistant/frontend#7": "open" } });

    expect(result?.labels).toEqual(["has-parent"]);
    expect(result?.effects).not.toContainEqual(setState);
  });
});
