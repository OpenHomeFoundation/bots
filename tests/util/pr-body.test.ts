import { describe, expect, it } from "vitest";
import { extractAllLinks, extractListedLinks, extractTasks } from "../../src/util/pr-body.js";
import { lastSegment } from "../github/helpers/mock-context.js";

describe("extractAllLinks", () => {
  it("extracts a single owner/repo#number shorthand reference", () => {
    const links = extractAllLinks("Docs PR: home-assistant/home-assistant.io#12345");
    expect(links).toEqual([{ owner: "home-assistant", repo: "home-assistant.io", number: 12345 }]);
  });

  it("extracts multiple shorthand references", () => {
    const links = extractAllLinks("Fixes home-assistant/core#100 and home-assistant/frontend#200");
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ owner: "home-assistant", repo: "core", number: 100 });
    expect(links[1]).toEqual({ owner: "home-assistant", repo: "frontend", number: 200 });
  });

  it("extracts a GitHub PR URL", () => {
    const links = extractAllLinks(
      "See https://github.com/home-assistant/home-assistant.io/pull/999",
    );
    expect(links).toEqual([{ owner: "home-assistant", repo: "home-assistant.io", number: 999 }]);
  });

  it("extracts multiple PR URLs", () => {
    const links = extractAllLinks(
      "https://github.com/home-assistant/core/pull/1 and https://github.com/esphome/esphome/pull/2",
    );
    expect(links).toHaveLength(2);
  });

  it("extracts a GitHub issue URL", () => {
    const links = extractAllLinks("Fixes https://github.com/home-assistant/core/issues/123");
    expect(links).toEqual([{ owner: "home-assistant", repo: "core", number: 123 }]);
  });

  it("deduplicates the same item referenced in different forms", () => {
    const links = extractAllLinks(
      "home-assistant/core#77 https://github.com/home-assistant/core/pull/77",
    );
    expect(links).toEqual([{ owner: "home-assistant", repo: "core", number: 77 }]);
  });

  it("returns empty for null body", () => {
    expect(extractAllLinks(null)).toEqual([]);
  });

  it("returns empty when no references found", () => {
    expect(extractAllLinks("just some text")).toEqual([]);
  });
});

describe("extractListedLinks", () => {
  const LABELS = ["This PR belongs together with", "Link to documentation pull request"];
  const repo = { owner: "home-assistant", repo: "core" };
  const ref = (r: string, number: number) => ({ owner: "home-assistant", repo: r, number });

  it("reads refs and URLs on a labelled line", () => {
    const body =
      "- This PR belongs together with: home-assistant/frontend#5, https://github.com/home-assistant/home-assistant.io/pull/6";
    expect(extractListedLinks(body, LABELS, repo)).toEqual([
      ref("frontend", 5),
      ref("home-assistant.io", 6),
    ]);
  });

  it("reads bullets indented under the line, up to the next item", () => {
    const body = [
      "- This PR belongs together with:",
      "  - home-assistant/frontend#5",
      "  * home-assistant/home-assistant.io#6",
      "- Link to frontend pull request: home-assistant/frontend#7",
    ].join("\r\n");
    expect(extractListedLinks(body, LABELS, repo)).toEqual([
      ref("frontend", 5),
      ref("home-assistant.io", 6),
    ]);
  });

  it("matches a label by its visible text", () => {
    const body =
      "- Link to [documentation][docs-repository] pull request: home-assistant/home-assistant.io#6";
    expect(extractListedLinks(body, LABELS, repo)).toEqual([ref("home-assistant.io", 6)]);
  });

  it("resolves a bare #number to the given repo", () => {
    expect(extractListedLinks("- This PR belongs together with: #12", LABELS, repo)).toEqual([
      ref("core", 12),
    ]);
  });

  it("counts a markdown link by where it points, not by its text", () => {
    const body = [
      "- This PR belongs together with: [#5](https://github.com/home-assistant/frontend/pull/5), [docs][d]",
      "",
      "[d]: https://github.com/home-assistant/home-assistant.io/pull/6",
    ].join("\n");
    expect(extractListedLinks(body, LABELS, repo)).toEqual([
      ref("frontend", 5),
      ref("home-assistant.io", 6),
    ]);
  });

  it("lowercases refs and skips HTML entities", () => {
    const body = "- This PR belongs together with: Home-Assistant/Frontend#5, it&#39;s";
    expect(extractListedLinks(body, LABELS, repo)).toEqual([ref("frontend", 5)]);
  });

  it("reads only the start of a very long line", () => {
    const body = `- This PR belongs together with: ${"x".repeat(1_000)} home-assistant/frontend#5`;
    expect(extractListedLinks(body, LABELS, repo)).toEqual([]);
  });

  it("parses a crafted 64 KiB body quickly", () => {
    const crafted = [
      `- ${"[".repeat(65_536)}: x`,
      `- This PR belongs together with: ${"a".repeat(65_536)}`,
      ...Array.from({ length: 64 }, () => `  - ${"a".repeat(1_000)}`),
    ].join("\n");
    const started = performance.now();
    extractListedLinks(crafted, LABELS, repo);
    extractAllLinks("a".repeat(65_536));
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("ignores refs anywhere else in the body", () => {
    const body = [
      "Builds on home-assistant/core#3 and #4.",
      "- This PR is related to issue: home-assistant/core#8",
      "- This PR belongs together with: ",
    ].join("\n");
    expect(extractListedLinks(body, LABELS, repo)).toEqual([]);
  });
});

describe("extractTasks", () => {
  it("extracts checked tasks", () => {
    const tasks = extractTasks("- [x] Bugfix\n- [ ] New feature");
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({ checked: true, description: "Bugfix" });
    expect(tasks[1]).toEqual({ checked: false, description: "New feature" });
  });

  it("handles various checkbox formats", () => {
    const tasks = extractTasks("- [X] Done\n- [ ] Not done");
    expect(tasks[0].checked).toBe(true);
    expect(tasks[1].checked).toBe(false);
  });

  it("returns empty for null body", () => {
    expect(extractTasks(null)).toEqual([]);
  });

  it("returns empty when no tasks found", () => {
    expect(extractTasks("just regular text")).toEqual([]);
  });

  it("ignores non-task list items", () => {
    expect(extractTasks("- regular list item")).toEqual([]);
  });
});

describe("lastSegment", () => {
  it("returns last path segment", () => {
    expect(lastSegment("a/b/c")).toBe("c");
  });

  it("returns the string itself if no separator", () => {
    expect(lastSegment("filename")).toBe("filename");
  });
});
