import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { betaIssueNotify } from "../../../src/github/rules/beta-issue-notify.js";
import { createFakeGitHub, createMockIssueContext, runRule } from "../helpers/mock-context.js";

const BETA = [{ tag_name: "2026.12.0b2", prerelease: true }];
const STABLE = [{ tag_name: "2026.11.3", prerelease: false }];
const MILESTONE = { number: 851, title: "2026.12.0", state: "open" };

function context(
  opts: {
    releases?: { tag_name: string; prerelease: boolean }[];
    milestone?: Record<string, unknown>;
    issue?: Record<string, unknown>;
  } = {},
) {
  const github = createFakeGitHub({ releases: opts.releases ?? BETA });
  const ctx = createMockIssueContext({
    github,
    eventType: EventType.ISSUES_MILESTONED,
    payload: {
      action: "milestoned",
      milestone: opts.milestone ?? MILESTONE,
      issue: {
        number: 195162,
        title: "UniFi Protect: entities re-added after the console restarts",
        user: { login: "reporter" },
        ...opts.issue,
      },
    },
  });
  return { github, ctx };
}

describe("beta-issue-notify", () => {
  const rule = betaIssueNotify();

  it("announces an issue put on the milestone of the release in beta", async () => {
    const { ctx, github } = context();

    const result = await runRule(rule, ctx);

    expect(result?.effects).toEqual([
      {
        type: "notify",
        notification: {
          topic: "beta-issue",
          repository: "home-assistant/core",
          number: 195162,
          title: "UniFi Protect: entities re-added after the console restarts",
          url: "https://github.com/home-assistant/core/issues/195162",
          author: "reporter",
          milestone: "2026.12.0",
        },
      },
    ]);
    expect(github.repos.listReleases).toHaveBeenCalledWith({
      owner: "home-assistant",
      repo: "core",
      per_page: 1,
    });
  });

  it("reads the beta from the configured source repo", async () => {
    const { ctx, github } = context();

    await runRule(betaIssueNotify({ betaSource: { owner: "acme", name: "app" } }), ctx);

    expect(github.repos.listReleases).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      per_page: 1,
    });
  });

  it("stays quiet when no beta is running", async () => {
    const { ctx } = context({ releases: STABLE });

    expect(await runRule(rule, ctx)).toBeUndefined();
  });

  it("stays quiet when the source repo has no releases", async () => {
    const { ctx } = context({ releases: [] });

    expect(await runRule(rule, ctx)).toBeUndefined();
  });

  it("stays quiet for a milestone other than the beta's", async () => {
    const { ctx } = context({ milestone: { number: 848, title: "2026.12.1", state: "open" } });

    expect(await runRule(rule, ctx)).toBeUndefined();
  });

  it("stays quiet for a closed milestone", async () => {
    const { ctx, github } = context({ milestone: { ...MILESTONE, state: "closed" } });

    expect(await runRule(rule, ctx)).toBeUndefined();
    expect(github.repos.listReleases).not.toHaveBeenCalled();
  });

  it("stays quiet for a closed issue", async () => {
    const { ctx } = context({ issue: { state: "closed" } });

    expect(await runRule(rule, ctx)).toBeUndefined();
  });
});
