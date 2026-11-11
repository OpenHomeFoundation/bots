import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { parseSections, prTemplate } from "../../../src/github/rules/pr-template.js";
import { createMockContext, runRule } from "../helpers/mock-context.js";
import { loadPRTemplate, renderPRTemplate } from "../manifests/pr-template.js";

const CORE_TEMPLATE = loadPRTemplate("home-assistant-core");

const rule = prTemplate({
  sections: ["Proposed change", "Type of change", "Checklist"],
  requireContent: ["Proposed change"],
  skip: async (pr) =>
    (await pr.baseRef()) === "master" ? "Not checked on release PRs." : undefined,
});

function filledCoreBody(): string {
  return renderPRTemplate(CORE_TEMPLATE, {
    check: ["Bugfix (non-breaking change which fixes an issue)"],
    sections: { "Proposed change": "Fix the thing that was broken." },
  });
}

function run(pull_request: Record<string, unknown>) {
  const context = createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: { pull_request },
  });
  return runRule(rule, context);
}

describe("pr-template", () => {
  it("passes a filled-in core template", async () => {
    const result = await run({ body: filledCoreBody() });
    expect(result?.section).toMatchObject({ id: "pr-template", status: "pass" });
  });

  it("fails and names a deleted section", async () => {
    const body = filledCoreBody().replace("## Checklist", "");
    const result = await run({ body });
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("The **Checklist** section is missing.");
    expect(result?.section?.message).not.toContain("Type of change");
  });

  it("fails when Proposed change only holds the template comment", async () => {
    const result = await run({ body: CORE_TEMPLATE });
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("The **Proposed change** section is empty.");
  });

  it("lists every problem at once", async () => {
    const result = await run({ body: "Just a one-line description." });
    expect(result?.section?.status).toBe("fail");
    for (const heading of ["Proposed change", "Type of change", "Checklist"]) {
      expect(result?.section?.message).toContain(`The **${heading}** section is missing.`);
    }
  });

  it("fails on an empty body", async () => {
    const result = await run({ body: null });
    expect(result?.section?.status).toBe("fail");
  });

  it("does not require content in sections outside requireContent", async () => {
    const body = renderPRTemplate(CORE_TEMPLATE, {
      sections: { "Proposed change": "Something useful." },
    });
    const result = await run({ body });
    expect(result?.section?.status).toBe("pass");
  });

  it("skips release PRs through the repo's skip hook", async () => {
    const result = await run({ body: "Release notes", base: { ref: "master" } });
    expect(result?.section).toMatchObject({
      status: "skip",
      message: "Not checked on release PRs.",
    });
  });

  it("skips PRs authored by bots", async () => {
    const result = await run({ body: "Bumps foo from 1 to 2", user: { login: "dependabot[bot]" } });
    expect(result?.section?.status).toBe("skip");
  });

  it("does not run on bot-sent events", () => {
    expect(rule.allowBots).toBe(false);
  });
});

describe("parseSections", () => {
  it("matches headings regardless of case, level and trailing colon", () => {
    const sections = parseSections("# PROPOSED CHANGE:\nhello\n### checklist\n- [x] done");
    expect(sections.get("proposed change")).toBe("hello");
    expect(sections.get("checklist")).toBe("- [x] done");
  });

  it("ignores headings inside template comments", () => {
    const sections = parseSections("<!--\n## Hidden\n-->\n## Shown\ntext");
    expect(sections.has("hidden")).toBe(false);
    expect(sections.get("shown")).toBe("text");
  });

  it("ignores headings inside fenced code blocks", () => {
    const sections = parseSections("## Proposed change\n```yaml\n# Example config\n```");
    expect(sections.has("example config")).toBe(false);
    expect(sections.get("proposed change")).toContain("# Example config");
  });

  it("keeps the first section when a heading repeats", () => {
    const sections = parseSections("## Checklist\nfirst\n## Checklist\nsecond");
    expect(sections.get("checklist")).toBe("first");
  });
});
