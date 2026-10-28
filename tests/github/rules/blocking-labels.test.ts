import { describe, expect, it } from "vitest";
import { dispatch } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import { blockingLabels } from "../../../src/github/rules/blocking-labels.js";
import { createFakeGitHub, createMockContext, runRule } from "../helpers/mock-context.js";

const rule = blockingLabels({
  "awaiting-frontend": { message: "This PR is awaiting changes to the frontend" },
  "other-block": { message: "Another blocker" },
});

describe("blocking-labels handler", () => {
  it("emits a pending status when a configured label is added", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        action: "labeled",
        label: { name: "awaiting-frontend" },
        pull_request: {
          labels: [{ name: "awaiting-frontend" }],
          head: { sha: "abc123" },
          number: 1,
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.sections).toEqual([
      expect.objectContaining({ id: "blocking-label-awaiting-frontend", status: "pending" }),
    ]);
  });

  it("emits a skip status when a configured label is removed", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_UNLABELED,
      payload: {
        action: "unlabeled",
        label: { name: "awaiting-frontend" },
        pull_request: {
          labels: [],
          head: { sha: "abc123" },
          number: 1,
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.sections).toEqual([
      expect.objectContaining({ id: "blocking-label-awaiting-frontend", status: "skip" }),
    ]);
  });

  it("emits no status when a non-blocking label is added/removed", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        action: "labeled",
        label: { name: "unrelated" },
        pull_request: {
          labels: [{ name: "unrelated" }],
          head: { sha: "abc123" },
          number: 1,
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("emits a status for every configured label on synchronize", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      payload: {
        action: "synchronize",
        pull_request: {
          labels: [{ name: "awaiting-frontend" }],
          head: { sha: "abc123" },
          number: 1,
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.sections.map((s) => s.status)).toEqual(["pending", "skip"]);
  });

  // The author can't lift a maintainer's hold, so it must not draft the PR.
  it("blocks the merge gate without drafting the PR", async () => {
    const github = createFakeGitHub();
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      github,
      registry: {
        repositories: { "home-assistant/core": { rules: [rule], commands: [], dashboard: true } },
      },
      payload: {
        action: "labeled",
        label: { name: "awaiting-frontend" },
        pull_request: { labels: [{ name: "awaiting-frontend" }] },
      },
    });

    await dispatch(context);

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ context: "ha-bot", state: "failure" }),
    );
    expect(github.graphql).not.toHaveBeenCalledWith(
      expect.stringContaining("convertPullRequestToDraft"),
      expect.anything(),
    );
  });

  it("includes description", () => {
    expect(rule.description).toContain("awaiting-frontend");
  });
});
