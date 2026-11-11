import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { docsTargetBranch } from "../../../../../src/github/manifests/home-assistant-io/rules/docs-target-branch.js";
import { createFakeGitHub, createMockContext, runRule } from "../../../helpers/mock-context.js";

const LINE = "- This PR belongs together with:";

/** A docs PR on home-assistant.io; `prs` are the listed numbers that are PRs (others 404, like issues). */
function docsContext(baseRef: string, body = "", prs: string[] = []) {
  const github = createFakeGitHub();
  github.pulls.get.mockImplementation(async (params: unknown) => {
    const { owner, repo, pull_number } = params as {
      owner: string;
      repo: string;
      pull_number: number;
    };
    if (!prs.includes(`${repo}#${pull_number}`)) throw { status: 404 };
    const base = { repo: { owner: { login: owner }, name: repo, full_name: `${owner}/${repo}` } };
    return { data: { number: pull_number, state: "open", merged: false, body: "", base } };
  });
  return createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    github,
    payload: {
      repository: {
        full_name: "home-assistant/home-assistant.io",
        name: "home-assistant.io",
        owner: { login: "home-assistant" },
      },
      pull_request: { base: { ref: baseRef }, body },
    },
  });
}

describe("docs-target-branch", () => {
  it("passes a standalone docs PR targeting current", async () => {
    const result = await runRule(docsTargetBranch, docsContext("current"));
    expect(result?.section?.status).toBe("pass");
  });

  it("warns a standalone docs PR targeting next", async () => {
    const result = await runRule(docsTargetBranch, docsContext("next"));
    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toContain("`current`");
  });

  it("passes a docs PR listing a code PR, targeting next", async () => {
    const result = await runRule(
      docsTargetBranch,
      docsContext("next", `${LINE} home-assistant/core#12345`, ["core#12345"]),
    );
    expect(result?.section?.status).toBe("pass");
  });

  it("warns a docs PR listing a code PR, targeting current", async () => {
    const result = await runRule(
      docsTargetBranch,
      docsContext(
        "current",
        "- Link to parent pull request in the codebase: https://github.com/home-assistant/frontend/pull/999",
        ["frontend#999"],
      ),
    );
    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toContain("`next`");
  });

  it.each([
    ["a code issue", `${LINE} home-assistant/core#7`, []],
    [
      "brands and docs PRs",
      `${LINE} home-assistant/brands#1 home-assistant/home-assistant.io#2`,
      ["brands#1", "home-assistant.io#2"],
    ],
    ["a code issue named in the description", "Fixes the issue in home-assistant/core#7", []],
    ["a PR of a repo io doesn't follow", "Parent: home-assistant/android#3", ["android#3"]],
  ])("has no parent in %s", async (_, body, prs) => {
    const result = await runRule(docsTargetBranch, docsContext("current", body, prs));
    expect(result?.section?.status).toBe("pass");
  });

  it.each([
    ["in prose", "This documents home-assistant/core#12345."],
    [
      "on a line without a space after the colon",
      "- Link to parent pull request in the codebase:https://github.com/home-assistant/core/pull/12345",
    ],
    ["on an indented line", "  - Parent: https://github.com/home-assistant/core/pull/12345"],
  ])("expects next for a code PR named %s", async (_, body) => {
    const result = await runRule(docsTargetBranch, docsContext("next", body, ["core#12345"]));
    expect(result?.section?.status).toBe("pass");
  });

  it("exempts the `new` branch", async () => {
    const result = await runRule(docsTargetBranch, docsContext("new"));
    expect(result?.section?.status).toBe("skip");
  });
});
