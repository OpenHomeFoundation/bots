import { describe, expect, it } from "vitest";
import { linkedPRs } from "../../../src/github/rules/linked-prs.js";
import { LINE, linkedContext, type OtherPR, ref, testLinks } from "../helpers/linked-prs.js";

async function linked(
  body: string,
  others: Record<string, OtherPR | Error>,
  self: { repo?: string } = {},
) {
  const { context } = linkedContext(body, others, self);
  const result = await linkedPRs(context, testLinks);
  return result.map(({ ref, relation, confirmed }) => ({ ref, relation, confirmed }));
}

// The PR is home-assistant/core#1 unless a test says otherwise.
const BACK = `${LINE} home-assistant/core#1`;

describe("linkedPRs", () => {
  it("names the relation and whether the other PR lists this one back", async () => {
    expect(
      await linked(`${LINE} home-assistant/frontend#5 home-assistant/home-assistant.io#9 #2`, {
        "frontend#5": { body: BACK },
        "home-assistant.io#9": { body: "" },
        "core#2": { body: `${LINE} #1` },
      }),
    ).toEqual([
      { ref: ref("frontend", 5), relation: "sibling", confirmed: true },
      { ref: ref("home-assistant.io", 9), relation: "child", confirmed: false },
      { ref: ref("core", 2), relation: "sibling", confirmed: true },
    ]);
  });

  it.each([
    ["a code PR", "home-assistant/core#123", "parent"],
    ["another follower", "home-assistant/brands#5", "sibling"],
  ])("relates a follower PR to %s", async (_, listed, relation) => {
    const [repo, number] = listed.replace("home-assistant/", "").split("#");
    expect(
      await linked(
        `${LINE} ${listed}`,
        { [`${repo}#${number}`]: { body: `${LINE} home-assistant/home-assistant.io#1` } },
        { repo: "home-assistant.io" },
      ),
    ).toEqual([{ ref: ref(repo, Number(number)), relation, confirmed: true }]);
  });

  it("pairs through the lines of the current templates", async () => {
    expect(
      await linked("- Link to documentation pull request: home-assistant/home-assistant.io#9", {
        "home-assistant.io#9": {
          body: "- Link to parent pull request in the codebase: https://github.com/home-assistant/core/pull/1",
        },
      }),
    ).toEqual([{ ref: ref("home-assistant.io", 9), relation: "child", confirmed: true }]);
  });

  it("names a PR once, as GitHub does, however it is spelled", async () => {
    expect(
      await linked(`${LINE} home-assistant/Frontend#5 home-assistant/home-assistant-polymer#5`, {
        "frontend#5": { body: BACK },
        "home-assistant-polymer#5": { body: BACK, canonical: "frontend" },
      }),
    ).toEqual([{ ref: ref("frontend", 5), relation: "sibling", confirmed: true }]);
  });

  it("doesn't count a back-link outside the line", async () => {
    expect(
      await linked(`${LINE} home-assistant/frontend#5`, {
        "frontend#5": { body: "Parent: home-assistant/core#1" },
      }),
    ).toEqual([{ ref: ref("frontend", 5), relation: "sibling", confirmed: false }]);
  });

  it.each([
    ["an issue", `${LINE} home-assistant/frontend#5`, {}],
    [
      "another name for this PR",
      `${LINE} home-assistant/home-assistant#1`,
      { "home-assistant#1": { body: BACK, canonical: "core" } },
    ],
  ])("drops %s", async (_, body, others) => {
    expect(await linked(body, others)).toEqual([]);
  });

  it.each([
    ["no line", "Docs: home-assistant/home-assistant.io#9"],
    [
      "a library PR",
      "- Link to client library pull request: home-assistant-libs/python-supervisor-client#3",
    ],
    ["only itself", `${LINE} #1 home-assistant/Core#1`],
  ])("reads nothing for %s", async (_, body) => {
    const { github, context } = linkedContext(body, {});
    expect(await linkedPRs(context, testLinks)).toEqual([]);
    expect(github.pulls.get).not.toHaveBeenCalled();
  });

  it("fails on errors other than a missing PR", async () => {
    const { context } = linkedContext(`${LINE} home-assistant/frontend#5`, {
      "frontend#5": Object.assign(new Error("boom"), { status: 403 }),
    });
    await expect(linkedPRs(context, testLinks)).rejects.toThrow();
  });
});
