import { describe, expect, it, vi } from "vitest";
import { claCheck } from "../../src/cla/rule.js";
import type { ClaStore } from "../../src/cla/store.js";
import { EventType } from "../../src/github/engine/event.js";
import { createFakeGitHub, createMockContext, runRule } from "../github/helpers/mock-context.js";

interface MockCommit {
  sha: string;
  author?: { login?: string; type?: string } | null;
  commit?: { author?: { email?: string } };
}

function fakeStore(signed: string[]): ClaStore {
  return {
    hasSigned: async (login) => signed.includes(login),
    recordPendingSigners: vi.fn(async () => {}),
    getPendingSigner: async () => undefined,
    deletePendingSigner: async () => {},
    recordSignature: async () => {},
  };
}

function claContext(opts: {
  commits: MockCommit[];
  eventType?: EventType;
  label?: string;
  repository?: string;
  /** Repo has a dashboard (modern mode). Defaults to true; false = legacy mode. */
  dashboard?: boolean;
}) {
  const github = createFakeGitHub();
  github.pulls.listCommits.mockResolvedValue({ data: opts.commits });
  const fullName = opts.repository ?? "home-assistant/core";
  return createMockContext({
    eventType: opts.eventType ?? EventType.PULL_REQUEST_OPENED,
    github,
    registry: {
      repositories: {
        [fullName]: { rules: [], commands: [], dashboard: opts.dashboard ?? true },
      },
    },
    payload: {
      action: opts.eventType === EventType.PULL_REQUEST_LABELED ? "labeled" : "opened",
      ...(opts.label ? { label: { name: opts.label } } : {}),
      repository: {
        full_name: fullName,
        name: fullName.split("/")[1],
        owner: { login: fullName.split("/")[0] },
      },
    },
  });
}

const userCommit = (sha: string, login: string): MockCommit => ({
  sha,
  author: { login, type: "User" },
  commit: { author: { email: `${login}@example.com` } },
});

describe("cla", () => {
  it("passes without a label and clears the failure labels when every author has signed", async () => {
    const rule = claCheck(() => fakeStore(["alice"]));
    const result = await runRule(rule, claContext({ commits: [userCommit("a1", "alice")] }));
    expect(result?.section?.status).toBe("pass");
    expect(result?.labels).toBeUndefined();
    expect(result?.removeLabels).toEqual(
      expect.arrayContaining(["cla-needed", "cla-error", "cla-signed"]),
    );
  });

  it("strips the legacy cla-signed label when a signature is missing", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(rule, claContext({ commits: [userCommit("b1", "bob")] }));
    expect(result?.labels).toEqual(["cla-needed"]);
    expect(result?.removeLabels).toEqual(["cla-signed"]);
  });

  it("fails, labels cla-needed, and records pending signers for unsigned authors", async () => {
    const store = fakeStore(["alice"]);
    const rule = claCheck(() => store);
    const result = await runRule(
      rule,
      claContext({ commits: [userCommit("a1", "alice"), userCommit("b1", "bob")] }),
    );
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("@bob");
    expect(result?.section?.message).toContain("cla_sign_start");
    expect(result?.labels).toEqual(["cla-needed"]);
    expect(store.recordPendingSigners).toHaveBeenCalledWith([
      { login: "bob", shas: ["b1"], pr: { owner: "home-assistant", repo: "core", number: 1 } },
    ]);
  });

  it("fails with cla-error when a commit has no linked GitHub account", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({
        commits: [{ sha: "deadbeef123", author: null, commit: { author: { email: "x@y.z" } } }],
      }),
    );
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("deadbee");
    expect(result?.labels).toEqual(["cla-error"]);
  });

  it("posts the unlinked-commits walkthrough comment alongside the dashboard row", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({
        commits: [{ sha: "deadbeef123", author: null, commit: { author: { email: "x@y.z" } } }],
      }),
    );

    const comment = result?.effects.find((e) => e.type === "commentOnce");
    expect(comment).toMatchObject({ marker: "<!-- cla-bot-unlinked-comment -->" });
    const body = (comment as { body: string }).body;
    expect(body).toContain("Hello @testuser");
    expect(body).toContain("deadbee");
    expect(body).toContain('git commit --amend --author="Author Name <email@address.com>"');
    expect(body).toContain("changing-author-info");
  });

  it("keeps a commit email from breaking out of its code span", async () => {
    const rule = claCheck(() => fakeStore([]));
    const email = "x@y.z` @home-assistant/core `";
    const result = await runRule(
      rule,
      claContext({
        commits: [{ sha: "deadbeef123", author: null, commit: { author: { email } } }],
      }),
    );

    expect(result?.section?.message).toContain("authored as `` x@y.z` @home-assistant/core ` ``");
    const comment = result?.effects.find((e) => e.type === "commentOnce") as { body: string };
    expect(comment.body).toContain("`` x@y.z` @home-assistant/core ` ``");
  });

  it("does not post the walkthrough for unsigned-author failures", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(rule, claContext({ commits: [userCommit("b1", "bob")] }));
    expect(result?.section?.status).toBe("fail");
    expect(result?.effects.find((e) => e.type === "commentOnce")).toBeUndefined();
  });

  it("passes without a label when all commits are from bots", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({ commits: [{ sha: "a1", author: { login: "dep-bot", type: "Bot" } }] }),
    );
    expect(result?.section?.status).toBe("pass");
    expect(result?.labels).toBeUndefined();
  });

  it("re-checks and strips the label on cla-recheck", async () => {
    const rule = claCheck(() => fakeStore(["alice"]));
    const result = await runRule(
      rule,
      claContext({
        commits: [userCommit("a1", "alice")],
        eventType: EventType.PULL_REQUEST_LABELED,
        label: "cla-recheck",
      }),
    );
    expect(result?.section?.status).toBe("pass");
    expect(result?.removeLabels).toEqual(expect.arrayContaining(["cla-recheck"]));
  });

  it("ignores label events other than cla-recheck", async () => {
    const rule = claCheck(() => fakeStore(["alice"]));
    const result = await runRule(
      rule,
      claContext({
        commits: [userCommit("a1", "alice")],
        eventType: EventType.PULL_REQUEST_LABELED,
        label: "bugfix",
      }),
    );
    expect(result).toBeUndefined();
  });

  it("skips repositories without code", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({ commits: [userCommit("a1", "alice")], repository: "home-assistant/brands" }),
    );
    expect(result).toBeUndefined();
  });

  it("does nothing when the store is not configured", async () => {
    const rule = claCheck(() => undefined);
    const result = await runRule(rule, claContext({ commits: [userCommit("a1", "alice")] }));
    expect(result).toBeUndefined();
  });
});

describe("cla legacy mode (repo without a dashboard)", () => {
  it("emits no status rows — the dashboard must never materialize", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({ commits: [userCommit("b1", "bob")], dashboard: false }),
    );
    expect(result?.sections).toEqual([]);
    expect(result?.output.blocks).toBeUndefined();
  });

  it("gates merging with a failing cla-bot commit status and explains in a one-time comment", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({ commits: [userCommit("b1", "bob")], dashboard: false }),
    );

    expect(result?.effects).toContainEqual({
      type: "commitStatus",
      context: "cla-bot",
      state: "failure",
      description: "At least one contributor needs to sign the CLA.",
      targetUrl: expect.stringContaining("cla_sign_start"),
    });
    const comment = result?.effects.find((e) => e.type === "commentOnce");
    expect(comment).toMatchObject({ marker: "<!-- cla-bot-comment -->" });
    expect((comment as { body: string }).body).toContain("@bob");
    expect(result?.labels).toEqual(["cla-needed"]);
  });

  it("reports unlinked commits with the walkthrough comment and a failing status", async () => {
    const rule = claCheck(() => fakeStore([]));
    const result = await runRule(
      rule,
      claContext({
        commits: [{ sha: "deadbeef123", author: null, commit: { author: { email: "x@y.z" } } }],
        dashboard: false,
      }),
    );

    expect(result?.effects).toContainEqual(
      expect.objectContaining({
        type: "commitStatus",
        state: "failure",
        description: "Commit(s) are missing a linked GitHub user.",
      }),
    );
    const comment = result?.effects.find((e) => e.type === "commentOnce");
    expect(comment).toMatchObject({ marker: "<!-- cla-bot-unlinked-comment -->" });
    expect((comment as { body: string }).body).toContain("Hello @testuser");
    expect(result?.labels).toEqual(["cla-error"]);
  });

  it("flips the cla-bot status to success without commenting when everyone signed", async () => {
    const rule = claCheck(() => fakeStore(["alice"]));
    const result = await runRule(
      rule,
      claContext({ commits: [userCommit("a1", "alice")], dashboard: false }),
    );

    expect(result?.effects).toContainEqual({
      type: "commitStatus",
      context: "cla-bot",
      state: "success",
      description: "Everyone involved has signed the CLA.",
      targetUrl: undefined,
    });
    expect(result?.effects.find((e) => e.type === "commentOnce")).toBeUndefined();
    expect(result?.labels).toBeUndefined();
  });
});
