import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { homeAssistantPrLinks } from "../../../src/github/manifests/home-assistant-org.js";
import { belongsTogether } from "../../../src/github/rules/belongs-together.js";
import { LINE, linkedContext } from "../helpers/linked-prs.js";
import { runRule } from "../helpers/mock-context.js";

const rule = belongsTogether(homeAssistantPrLinks);
const BACK = `${LINE} home-assistant/core#1`;

// The PR is home-assistant/core#1.
describe("belongs-together", () => {
  it("passes when every listed PR lists this one back", async () => {
    const { context } = linkedContext(`${LINE} home-assistant/frontend#5`, {
      "frontend#5": { body: BACK },
    });
    const result = await runRule(rule, context);

    expect(result?.section).toMatchObject({ id: "belongs-together", status: "pass" });
    expect(result?.effects).toEqual([]);
  });

  it("asks for the back-link where it is missing", async () => {
    const { context } = linkedContext(
      `${LINE} home-assistant/frontend#5, home-assistant/frontend#6`,
      {
        "frontend#5": { body: BACK },
        "frontend#6": { body: "" },
      },
    );
    const result = await runRule(rule, context);

    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toBe(
      'Add `home-assistant/core#1` to "This PR belongs together with" in the description of home-assistant/frontend#6, so the bot knows they belong together.',
    );
  });

  it("skips when nothing is listed", async () => {
    const { context } = linkedContext("Just a fix", {});

    expect((await runRule(rule, context))?.section?.status).toBe("skip");
  });

  it("shows nothing on a closed PR", async () => {
    const { context } = linkedContext(
      `${LINE} home-assistant/frontend#5`,
      { "frontend#5": { body: "" } },
      { type: EventType.ON_DEMAND, state: "closed" },
    );

    expect(await runRule(rule, context)).toBeUndefined();
  });
});
