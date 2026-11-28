import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import {
  betaMilestone,
  betaReleaseMilestone,
  formSection,
} from "../../../src/github/rules/beta-milestone.js";
import { createFakeGitHub, createMockIssueContext, runRule } from "../helpers/mock-context.js";

const MILESTONES = [
  { number: 851, title: "2026.12.0" },
  { number: 848, title: "2026.12.1" },
];

/** An issue-form body as GitHub renders the Core bug template. */
function formBody(version: string): string {
  return [
    "### The problem",
    "",
    "Entities are re-added after the console restarts.",
    "",
    "### What version of Home Assistant Core has the issue?",
    "",
    version,
    "",
    "### What was the last working version of Home Assistant Core?",
    "",
    "2026.11.3",
    "",
  ].join("\n");
}

function context(issue: Record<string, unknown>, eventType = EventType.ISSUES_OPENED) {
  const github = createFakeGitHub({ milestones: MILESTONES });
  return { github, ctx: createMockIssueContext({ github, eventType, payload: { issue } }) };
}

describe("betaReleaseMilestone", () => {
  it.each([
    ["2026.12.0b2", "2026.12.0"],
    ["core-2026.12.0b2", "2026.12.0"],
    ["core-2026.12.0b2 (uiprotect 25.8.1)", "2026.12.0"],
    ["2027.1.0b0", "2027.1.0"],
    ["2027.01.0b0", "2027.1.0"],
  ])("maps %s to %s", (text, expected) => {
    expect(betaReleaseMilestone(text)).toBe(expected);
  });

  it.each(["2026.11.3", "core-2026.12.0", "2026.12.0.dev202611280300", "latest beta", ""])(
    "ignores %j",
    (text) => {
      expect(betaReleaseMilestone(text)).toBeUndefined();
    },
  );
});

describe("formSection", () => {
  it("returns the answer up to the next heading", () => {
    expect(
      formSection(formBody("2026.12.0b2"), "What version of Home Assistant Core has the issue?"),
    ).toBe("\n2026.12.0b2\n");
  });

  it("is undefined when the heading is missing", () => {
    expect(formSection("free-form text 2026.12.0b2", "What version?")).toBeUndefined();
  });
});

describe("beta-milestone", () => {
  const rule = betaMilestone();

  it("sets the release milestone for an issue reported against a beta", async () => {
    const { ctx } = context({ body: formBody("core-2026.12.0b2"), milestone: null });

    const result = await runRule(rule, ctx);

    expect(result?.effects).toEqual([{ type: "setMilestone", milestone: 851 }]);
  });

  it("also runs on demand", async () => {
    const { ctx } = context(
      { body: formBody("2026.12.0b1"), milestone: null },
      EventType.ISSUES_ON_DEMAND,
    );

    const result = await runRule(rule, ctx);

    expect(result?.effects).toEqual([{ type: "setMilestone", milestone: 851 }]);
  });

  it("leaves an issue that already has a milestone alone", async () => {
    const { ctx, github } = context({
      body: formBody("2026.12.0b2"),
      milestone: { number: 848, title: "2026.12.1" },
    });

    expect(await runRule(rule, ctx)).toBeUndefined();
    expect(github.issues.listMilestones).not.toHaveBeenCalled();
  });

  it("ignores a stable version", async () => {
    const { ctx, github } = context({ body: formBody("2026.11.3"), milestone: null });

    expect(await runRule(rule, ctx)).toBeUndefined();
    expect(github.issues.listMilestones).not.toHaveBeenCalled();
  });

  it("only reads the version field, not the rest of the body", async () => {
    const body = formBody("2026.11.3").replace(
      "Entities are re-added",
      "Since 2026.12.0b2 entities are re-added",
    );
    const { ctx } = context({ body, milestone: null });

    expect(await runRule(rule, ctx)).toBeUndefined();
  });

  it("does nothing when the release milestone isn't open", async () => {
    const { ctx } = context({ body: formBody("2027.1.0b0"), milestone: null });

    expect(await runRule(rule, ctx)).toBeUndefined();
  });

  it("ignores closed issues", async () => {
    const { ctx } = context({ body: formBody("2026.12.0b2"), milestone: null, state: "closed" });

    expect(await runRule(rule, ctx)).toBeUndefined();
  });

  it("hydrates the milestone when the payload lacks it", async () => {
    const github = createFakeGitHub({
      milestones: MILESTONES,
      issue: { number: 1, milestone: { number: 848, title: "2026.12.1" } },
    });
    const ctx = createMockIssueContext({
      github,
      payload: { issue: { body: formBody("2026.12.0b2") } },
    });

    expect(await runRule(rule, ctx)).toBeUndefined();
    expect(github.issues.get).toHaveBeenCalled();
  });
});
