import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { forbiddenFiles } from "../../../src/github/rules/forbidden-files.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

const rule = forbiddenFiles({
  base: "dev",
  files: [
    { pattern: /^generated\//, reason: "generated files must not be committed." },
    { pattern: /\/legacy\.py$/, statuses: ["added"], reason: "no new legacy modules." },
  ],
});

function makeFile(filename: string, status = "added") {
  return {
    filename,
    status,
    additions: 10,
    deletions: 0,
    changes: 10,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

function prContext(files: ReturnType<typeof makeFile>[], baseRef = "dev") {
  const context = createMockContext({
    eventType: EventType.ON_DEMAND,
    payload: { pull_request: { base: { ref: baseRef }, head: { sha: "abc123" }, labels: [] } },
  });
  mockPRFiles(context, files);
  return context;
}

describe("forbidden-files", () => {
  it("passes when no forbidden file is changed", async () => {
    const result = await runRule(rule, prContext([makeFile("src/app.py", "modified")]));
    expect(result?.section).toMatchObject({ id: "forbidden-files", status: "pass" });
  });

  it.each(["added", "modified", "renamed"])("fails on a %s file by default", async (status) => {
    const result = await runRule(rule, prContext([makeFile("generated/a.json", status)]));
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toBe(
      "- `generated/a.json`: generated files must not be committed.",
    );
  });

  it("passes when forbidden files are only removed", async () => {
    const result = await runRule(rule, prContext([makeFile("generated/a.json", "removed")]));
    expect(result?.section?.status).toBe("pass");
  });

  it("only counts the statuses an entry names", async () => {
    const modified = await runRule(rule, prContext([makeFile("src/legacy.py", "modified")]));
    expect(modified?.section?.status).toBe("pass");

    const added = await runRule(rule, prContext([makeFile("src/legacy.py")]));
    expect(added?.section?.message).toBe("- `src/legacy.py`: no new legacy modules.");
  });

  it("lists each matching entry on its own line", async () => {
    const result = await runRule(
      rule,
      prContext([
        makeFile("src/legacy.py"),
        makeFile("generated/b.json"),
        makeFile("generated/a.json"),
      ]),
    );
    expect(result?.section?.message).toBe(
      "- `generated/a.json`, `generated/b.json`: generated files must not be committed.\n" +
        "- `src/legacy.py`: no new legacy modules.",
    );
  });

  it("truncates long path lists", async () => {
    const files = Array.from({ length: 7 }, (_, i) => makeFile(`generated/${i}.json`));
    const result = await runRule(rule, prContext(files));
    expect(result?.section?.message).toContain("`generated/4.json` and 2 more:");
    expect(result?.section?.message).not.toContain("`generated/5.json`");
  });

  it("skips PRs into another branch", async () => {
    const result = await runRule(rule, prContext([makeFile("generated/a.json")], "master"));
    expect(result?.section).toMatchObject({
      status: "skip",
      message: "Only checked on PRs into `dev`.",
    });
  });
});
