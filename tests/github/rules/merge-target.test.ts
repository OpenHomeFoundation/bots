import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { mergeTarget as mergeTargetFactory } from "../../../src/github/rules/merge-target.js";
import { createFakeGitHub, createMockContext, runRule } from "../helpers/mock-context.js";

const mergeTarget = mergeTargetFactory({ base: "dev" });

function contextTargeting(baseRef: string, authorAssociation = "NONE", member = false) {
  return createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    github: createFakeGitHub({ members: member ? ["contributor"] : [] }),
    payload: {
      pull_request: {
        body: "",
        base: { ref: baseRef },
        head: { sha: "abc123" },
        user: { login: "contributor" },
        author_association: authorAssociation,
      },
    },
  });
}

describe("merge-target", () => {
  it("passes when the PR targets `dev`", async () => {
    const result = await runRule(mergeTarget, contextTargeting("dev"));
    expect(result?.section?.id).toBe("merge-target");
    expect(result?.section?.status).toBe("pass");
    expect(result?.section?.message).toContain("`dev`");
  });

  it("fails when a non-member targets `master`", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master", "NONE"));
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`master`");
    expect(result?.section?.message).toContain("`dev`");
  });

  it("fails when a non-member targets `rc`", async () => {
    const result = await runRule(mergeTarget, contextTargeting("rc", "CONTRIBUTOR"));
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`rc`");
  });

  it("fails when a non-member targets an arbitrary branch", async () => {
    const result = await runRule(mergeTarget, contextTargeting("some-feature-branch"));
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`some-feature-branch`");
  });

  it("downgrades to warn when an org member targets a non-dev branch", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master", "MEMBER", true));
    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toBe("This PR targets `master`, not `dev`.");
  });

  it("warns for a private org member the payload reports as a contributor", async () => {
    const result = await runRule(
      mergeTarget,
      contextTargeting("async_validate_actions_config", "CONTRIBUTOR", true),
    );
    expect(result?.section?.status).toBe("warn");
  });

  it("fails for an outside collaborator", async () => {
    const result = await runRule(mergeTarget, contextTargeting("rc", "COLLABORATOR"));
    expect(result?.section?.status).toBe("fail");
  });

  it("does not emit any labels", async () => {
    const result = await runRule(mergeTarget, contextTargeting("master"));
    expect(result?.labels).toBeUndefined();
  });
});
