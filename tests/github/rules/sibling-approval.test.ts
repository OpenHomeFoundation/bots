import { describe, expect, it } from "vitest";
import { siblingApproval } from "../../../src/github/rules/sibling-approval.js";
import { LINE, linkedContext, type OtherPR, testLinks } from "../helpers/linked-prs.js";
import { runRule } from "../helpers/mock-context.js";

const rule = siblingApproval(testLinks);
const BACK = `${LINE} home-assistant/core#1`;
const sibling = (pr: Partial<OtherPR> = {}) => ({ "frontend#5": { body: BACK, ...pr } });
const member = (state: string, login = "maintainer") => ({ login, state, association: "MEMBER" });

/** The PR under test is home-assistant/core#1; `others` default to its sibling frontend#5. */
async function section(
  others: Record<string, OtherPR>,
  body = `${LINE} home-assistant/frontend#5`,
) {
  const { context } = linkedContext(body, others);
  return (await runRule(rule, context))?.section;
}

describe("sibling-approval", () => {
  it("holds the PR while a sibling waits for approval", async () => {
    const result = await section(sibling({ decision: "REVIEW_REQUIRED" }));

    expect(result?.status).toBe("pending");
    expect(result?.message).toBe(
      'home-assistant/frontend#5 isn\'t approved yet, and this PR is merged together with it. If this PR stands on its own, remove the link from "This PR belongs together with".',
    );
  });

  it.each([
    ["GitHub approves it", { decision: "APPROVED" }],
    ["it is merged", { decision: "REVIEW_REQUIRED", state: "closed" as const, merged: true }],
    ["a member approves it where no review is required", { reviews: [member("APPROVED")] }],
  ])("passes once %s", async (_, pr) => {
    expect((await section(sibling(pr)))?.status).toBe("pass");
  });

  it.each([
    ["GitHub wants changes", { decision: "CHANGES_REQUESTED" }],
    [
      "only a contributor approved",
      { reviews: [{ login: "someone", state: "APPROVED", association: "CONTRIBUTOR" }] },
    ],
    [
      "another member wants changes",
      { reviews: [member("APPROVED"), member("CHANGES_REQUESTED", "other")] },
    ],
    ["the approval was dismissed", { reviews: [member("APPROVED"), member("DISMISSED")] }],
  ])("holds the PR while %s", async (_, pr) => {
    expect((await section(sibling(pr)))?.status).toBe("pending");
  });

  it("keeps holding when a sibling closes without merging", async () => {
    const result = await section(sibling({ state: "closed" }));

    expect(result?.status).toBe("pending");
    expect(result?.message).toContain("home-assistant/frontend#5 was closed without merging.");
    expect(result?.message).toContain("If this PR stands on its own, remove the link");
  });

  it.each([
    ["an unconfirmed sibling", sibling({ body: "" })],
    ["a child", { "home-assistant.io#9": { body: BACK } }],
  ])("doesn't wait for %s", async (_, others) => {
    const body = `${LINE} home-assistant/frontend#5 home-assistant/home-assistant.io#9`;
    expect((await section(others, body))?.status).toBe("skip");
  });
});
