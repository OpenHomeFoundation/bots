import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { setDocumentationSection } from "../../../../../src/github/manifests/home-assistant-io/rules/set-documentation-section.js";
import {
  createFakeGitHub,
  createMockIssueContext,
  runRule,
} from "../../../helpers/mock-context.js";

function issueContext(body: string) {
  return createMockIssueContext({
    eventType: EventType.ISSUES_OPENED,
    github: createFakeGitHub(),
    payload: { issue: { body } },
  });
}

/** The issue the docs feedback form files, with the page's URL prefilled. */
function feedbackBody(url: string, feedback = "This page is outdated."): string {
  return `### Feedback\n\n${feedback}\n\n### URL\n\n${url}\n\n### Version\n\n2026.11.0\n`;
}

describe("set-documentation-section", () => {
  it("labels the section of the page the feedback form names", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext(feedbackBody("https://www.home-assistant.io/docs/energy/solar-panels/")),
    );
    expect(result?.labels).toEqual(["section: energy"]);
  });

  it("ignores other links when the form names a docs page", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext(
        feedbackBody(
          "https://www.home-assistant.io/changelogs/core-2026.3/",
          "The [release notes](https://www.home-assistant.io/blog/2026/03/04/release-202603/) link is broken.",
        ),
      ),
    );
    expect(result?.labels).toEqual(["section: release-notes"]);
  });

  it("falls back to every docs link without a form URL", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext(
        "Compare https://www.home-assistant.io/installation/raspberrypi, " +
          "https://www.home-assistant.io/dashboards/entities/ and https://www.home-assistant.io/faq.",
      ),
    );
    expect(result?.labels).toEqual([
      "section: installation",
      "section: dashboards",
      "section: faq",
    ]);
  });

  it("falls back to the body when the form URL is not a docs page", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext(
        feedbackBody(
          "https://github.com/home-assistant/apps/blob/master/letsencrypt/DOCS.md",
          "See https://www.home-assistant.io/common-tasks/os/",
        ),
      ),
    );
    expect(result?.labels).toEqual(["section: common-tasks"]);
  });

  it("leaves integration pages to set-integration", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext(feedbackBody("https://www.home-assistant.io/integrations/hue.light/")),
    );
    expect(result).toBeUndefined();
  });

  it("labels generic triggers as automation", async () => {
    const result = await runRule(
      setDocumentationSection,
      issueContext(feedbackBody("https://www.home-assistant.io/triggers/state/")),
    );
    expect(result?.labels).toEqual(["section: automation"]);
  });

  it("adds nothing for unlabeled and unknown sections", async () => {
    for (const url of [
      "https://www.home-assistant.io/",
      "https://www.home-assistant.io/docs/",
      "https://www.home-assistant.io/socials/",
      "https://www.home-assistant.io/not-a-section/",
    ]) {
      expect(
        await runRule(setDocumentationSection, issueContext(feedbackBody(url))),
      ).toBeUndefined();
    }
  });
});
