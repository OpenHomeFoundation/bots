import { describe, expect, it, vi } from "vitest";
import { dispatch } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import { renderStatus } from "../../../src/github/engine/status/render.js";
import type {
  RegistryConfig,
  Rule,
  RuleOutput,
  StatusSectionClaim,
} from "../../../src/github/engine/types.js";
import {
  BOT_LOGIN,
  createFakeGitHub,
  createMockContext,
  type FakeGitHub,
} from "../helpers/mock-context.js";

/**
 * Context defaults (mock-context.ts): PR #1 on
 * home-assistant/core, head sha abc123, node_id PR_1, not a draft.
 */

const REPO = { owner: "home-assistant", repo: "core" };

async function apply(
  output: RuleOutput,
  opts: {
    github?: FakeGitHub;
    payload?: Record<string, unknown>;
    statusSections?: readonly StatusSectionClaim[];
  } = {},
): Promise<FakeGitHub> {
  const github = opts.github ?? createFakeGitHub();
  const rule: Rule = {
    name: "emitter",
    description: "",
    statusSections: opts.statusSections,
    // synchronize, not opened: opened dispatches post the dashboard
    // placeholder up front, which would show up in every mapping test here.
    events: { [EventType.PULL_REQUEST_SYNCHRONIZE]: async () => output },
  };
  const config: RegistryConfig = {
    repositories: { "home-assistant/core": { rules: [rule], commands: [], dashboard: true } },
  };
  await dispatch(
    createMockContext({
      registry: config,
      github,
      payload: opts.payload,
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
    }),
  );
  return github;
}

describe("effect → GitHub API mapping", () => {
  it("addLabels → issues.addLabels on the target", async () => {
    const github = await apply({
      effects: [{ type: "addLabels", labels: ["bugfix", "has-tests"] }],
    });

    expect(github.issues.addLabels).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      labels: ["bugfix", "has-tests"],
    });
  });

  it("removeLabels → one issues.removeLabel per label the target has", async () => {
    const github = await apply(
      { effects: [{ type: "removeLabels", labels: ["stale", "needs-rebase"] }] },
      {
        payload: { pull_request: { labels: [{ name: "stale" }, { name: "needs-rebase" }] } },
      },
    );

    expect(github.issues.removeLabel).toHaveBeenCalledTimes(2);
    expect(github.issues.removeLabel).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      name: "stale",
    });
    expect(github.issues.removeLabel).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      name: "needs-rebase",
    });
  });

  it("addAssignees → issues.addAssignees", async () => {
    const github = await apply({
      effects: [{ type: "addAssignees", assignees: ["balloob", "frenck"] }],
    });

    expect(github.issues.addAssignees).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      assignees: ["balloob", "frenck"],
    });
  });

  it("addAssignees drops logins GitHub can't assign and sends the rest in one call", async () => {
    const github = await apply(
      { effects: [{ type: "addAssignees", assignees: ["balloob", "vendor", "frenck"] }] },
      { github: createFakeGitHub({ unassignable: ["vendor"] }) },
    );

    expect(github.issues.addAssignees).toHaveBeenCalledTimes(1);
    expect(github.issues.addAssignees).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      assignees: ["balloob", "frenck"],
    });
  });

  it("addAssignees makes no call when nobody can be assigned", async () => {
    const github = await apply(
      { effects: [{ type: "addAssignees", assignees: ["vendor"] }] },
      { github: createFakeGitHub({ unassignable: ["vendor"] }) },
    );

    expect(github.issues.addAssignees).not.toHaveBeenCalled();
  });

  it("addAssignees fills the item up to GitHub's 10-assignee cap", async () => {
    const assigned = Array.from({ length: 8 }, (_, i) => ({ login: `owner${i}` }));
    const github = await apply(
      { effects: [{ type: "addAssignees", assignees: ["owner0", "a", "b", "c"] }] },
      { payload: { pull_request: { assignees: assigned } } },
    );

    expect(github.issues.checkUserCanBeAssignedToIssue).toHaveBeenCalledTimes(3);
    expect(github.issues.addAssignees).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      assignees: ["a", "b"],
    });
  });

  it("removeAssignees → issues.removeAssignees", async () => {
    const github = await apply({ effects: [{ type: "removeAssignees", assignees: ["balloob"] }] });

    expect(github.issues.removeAssignees).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      assignees: ["balloob"],
    });
  });

  it("comment → issues.createComment", async () => {
    const github = await apply({ effects: [{ type: "comment", body: "Hello there!" }] });

    expect(github.issues.createComment).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      body: "Hello there!",
    });
  });

  it("setTitle → issues.update", async () => {
    const github = await apply({ effects: [{ type: "setTitle", title: "Better title" }] });

    expect(github.issues.update).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      title: "Better title",
    });
  });

  it("setState → issues.update", async () => {
    const github = await apply({ effects: [{ type: "setState", state: "closed" }] });

    expect(github.issues.update).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      state: "closed",
    });
  });

  it("requestReviewers → pulls.requestReviewers", async () => {
    const github = await apply({ effects: [{ type: "requestReviewers", reviewers: ["frenck"] }] });

    expect(github.pulls.requestReviewers).toHaveBeenCalledWith({
      ...REPO,
      pull_number: 1,
      reviewers: ["frenck"],
    });
  });

  it("updateBranch → pulls.updateBranch", async () => {
    const github = await apply({ effects: [{ type: "updateBranch" }] });

    expect(github.pulls.updateBranch).toHaveBeenCalledWith({ ...REPO, pull_number: 1 });
  });

  it("convertToDraft → convertPullRequestToDraft mutation with the PR's node id", async () => {
    const github = await apply({ effects: [{ type: "convertToDraft" }] });

    expect(github.graphql).toHaveBeenCalledWith(
      expect.stringContaining("convertPullRequestToDraft"),
      {
        id: "PR_1",
      },
    );
  });

  it("convertToDraft is a no-op when the PR is already a draft", async () => {
    const github = await apply(
      { effects: [{ type: "convertToDraft" }] },
      {
        payload: { pull_request: { draft: true } },
      },
    );

    expect(github.graphql).not.toHaveBeenCalled();
  });

  it("commentOnce → issues.createComment with the marker prepended", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({ data: [] });
    await apply(
      { effects: [{ type: "commentOnce", marker: "<!-- my-marker -->", body: "Please sign." }] },
      { github },
    );

    expect(github.issues.createComment).toHaveBeenCalledWith({
      ...REPO,
      issue_number: 1,
      body: "<!-- my-marker -->\nPlease sign.",
    });
  });

  it("commentOnce is a no-op when a marker-tagged comment already exists", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [{ id: 7, body: "<!-- my-marker -->\nPlease sign.", user: { login: BOT_LOGIN } }],
    });
    await apply(
      { effects: [{ type: "commentOnce", marker: "<!-- my-marker -->", body: "Please sign." }] },
      { github },
    );

    expect(github.issues.createComment).not.toHaveBeenCalled();
  });

  it("commentOnce still posts when only someone else's comment carries the marker", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [{ id: 7, body: "<!-- my-marker -->", user: { login: "troll" } }],
    });
    await apply(
      { effects: [{ type: "commentOnce", marker: "<!-- my-marker -->", body: "Please sign." }] },
      { github },
    );

    expect(github.issues.createComment).toHaveBeenCalledTimes(1);
  });

  it("commitStatus → repos.createCommitStatus on the PR head with the rule's context", async () => {
    const github = await apply({
      effects: [
        {
          type: "commitStatus",
          context: "cla-bot",
          state: "failure",
          description: "At least one contributor needs to sign the CLA.",
          targetUrl: "https://example.com/sign",
        },
      ],
    });

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith({
      ...REPO,
      sha: "abc123",
      context: "cla-bot",
      state: "failure",
      description: "At least one contributor needs to sign the CLA.",
      target_url: "https://example.com/sign",
    });
  });

  it("rule-owned and ha-bot statuses retry while GitHub cannot see the head commit yet", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const github = createFakeGitHub();
    const seen = new Set<unknown>();
    github.repos.createCommitStatus.mockImplementation(async ({ context }) => {
      if (seen.has(context)) return { status: 201, data: {} };
      seen.add(context);
      throw { status: 422, message: "No commit found for SHA: abc123" };
    });

    const done = apply(
      {
        statuses: [{ id: "a", title: "Alpha check", status: "pass", message: "ok" }],
        effects: [
          { type: "commitStatus", context: "cla-bot", state: "success", description: "ok" },
        ],
      },
      { github },
    );
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();

    const contexts = github.repos.createCommitStatus.mock.calls.map(([p]) => p.context);
    expect(contexts).toEqual(["cla-bot", "cla-bot", "ha-bot", "ha-bot"]);
  });

  it("statuses → placeholder, dashboard body, and ha-bot commit status on the head sha", async () => {
    const github = createFakeGitHub();
    github.issues.createComment.mockResolvedValue({
      data: { id: 999, html_url: "https://github.com/ha/c/pull/1#issuecomment-999" },
    });
    await apply(
      { statuses: [{ id: "a", title: "Alpha check", status: "pass", message: "ok" }] },
      { github },
    );

    // The placeholder gets created first, then updated with the real body.
    expect(github.issues.createComment).toHaveBeenCalledTimes(1);
    const statusBody = github.issues.updateComment.mock.lastCall?.[0].body as string;
    expect(statusBody).toContain("Alpha check");
    expect(github.repos.createCommitStatus).toHaveBeenCalledWith({
      ...REPO,
      sha: "abc123",
      context: "ha-bot",
      state: "success",
      description: "All checks passed",
      target_url: "https://github.com/ha/c/pull/1#issuecomment-999",
    });
  });

  it("a block cleared with null args → issues.updateComment without the block", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 7,
          html_url: "https://github.com/ha/c/issues/1#issuecomment-7",
          user: { login: BOT_LOGIN },
          body: renderStatus(
            [{ id: "a", title: "Alpha check", status: "pass", message: "ok" }],
            "home-assistant/core",
            "issue",
            { blocks: { "reporting-guidance": { paragraphs: ["Some advice."] } } },
          ),
        },
      ],
    });
    await apply(
      { blocks: [{ block: "reporting-guidance", args: null }] },
      {
        github,
        statusSections: [{ id: "a", title: "Alpha check" }],
      },
    );

    expect(github.issues.updateComment).toHaveBeenCalledTimes(1);
    const body = github.issues.updateComment.mock.lastCall?.[0].body as string;
    expect(body).toContain("Alpha check");
    expect(body).not.toContain("Some advice.");
    // The cleared block is gone from the persisted state too.
    expect(body).not.toContain("reporting-guidance");
  });

  it("a null-args block update alone never creates a status comment", async () => {
    const github = await apply(
      { blocks: [{ block: "reporting-guidance", args: null }] },
      {
        statusSections: [],
      },
    );

    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.issues.updateComment).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });

  it("override → issues.updateComment waiving the section, status flips to success", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 7,
          html_url: "https://github.com/ha/c/pull/1#issuecomment-7",
          user: { login: BOT_LOGIN },
          body: renderStatus(
            [{ id: "a", title: "Alpha check", status: "fail", message: "broken" }],
            "home-assistant/core",
          ),
        },
      ],
    });
    await apply(
      { overrides: [{ id: "a", ignore: { reason: "by-design" } }] },
      {
        github,
        statusSections: [{ id: "a", title: "Alpha check" }],
      },
    );

    const body = github.issues.updateComment.mock.lastCall?.[0].body as string;
    expect(body).toContain("Ignored: by-design");
    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "success",
        description: "All checks passed (1 warning)",
      }),
    );
  });

  it("an override alone never creates a status comment", async () => {
    const github = await apply(
      { overrides: [{ id: "a", ignore: { reason: "r" } }] },
      {
        statusSections: [{ id: "a", title: "Alpha check" }],
      },
    );

    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.issues.updateComment).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });
});

describe("aggregate ha-bot status check from status sections", () => {
  function setupHarness(sections: { id: string; status: "pass" | "fail" | "pending" | "skip" }[]) {
    const github = createFakeGitHub();
    github.issues.createComment.mockResolvedValue({
      data: { id: 999, html_url: "https://github.com/ha/c/pull/1#issuecomment-999" },
    });
    const statuses = sections.map((s) => ({
      id: s.id,
      title: s.id,
      status: s.status,
      message: s.id,
    }));
    return { github, run: () => apply({ statuses }, { github }) };
  }

  it("writes a success ha-bot status when all sections pass", async () => {
    const { github, run } = setupHarness([{ id: "a", status: "pass" }]);
    await run();

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "success",
        target_url: expect.stringContaining("#issuecomment-999"),
      }),
    );
  });

  it("writes a failure ha-bot status when any section fails", async () => {
    const { github, run } = setupHarness([
      { id: "a", status: "pass" },
      { id: "b", status: "fail" },
    ]);
    await run();

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "failure",
        description: expect.stringContaining("1 check failing"),
      }),
    );
  });

  it("counts skipped sections as success and notes them in the description", async () => {
    const { github, run } = setupHarness([
      { id: "a", status: "pass" },
      { id: "b", status: "skip" },
      { id: "c", status: "skip" },
    ]);
    await run();

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "success",
        description: expect.stringContaining("2 skipped"),
      }),
    );
  });

  it("writes a failing ha-bot status when a section is pending", async () => {
    const { github, run } = setupHarness([
      { id: "a", status: "pass" },
      { id: "b", status: "pending" },
    ]);
    await run();

    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ha-bot",
        state: "failure",
        description: expect.stringContaining("1 check pending"),
      }),
    );
  });

  it("does not write a ha-bot status if no rule emitted a status section", async () => {
    const github = await apply({ effects: [{ type: "addLabels", labels: ["x"] }] });

    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });
});

describe("evaluate effect", () => {
  const target = { owner: "home-assistant", repo: "home-assistant.io", number: 9 };

  function setup(eventType: EventType) {
    const github = createFakeGitHub();
    const targetRule = vi.fn(async () => undefined);
    const config: RegistryConfig = {
      repositories: {
        "home-assistant/core": {
          rules: [
            {
              name: "poker",
              description: "",
              events: { [eventType]: async () => ({ effects: [{ type: "evaluate", target }] }) },
            },
          ],
          commands: [],
        },
        "home-assistant/home-assistant.io": {
          rules: [
            { name: "target", description: "", events: { [EventType.ON_DEMAND]: targetRule } },
          ],
          commands: [],
        },
      },
    };
    const run = () => dispatch(createMockContext({ registry: config, github, eventType }));
    return { github, targetRule, run };
  }

  it("runs the target PR's own rules on demand", async () => {
    const { github, targetRule, run } = setup(EventType.PULL_REQUEST_EDITED);
    await run();

    await vi.waitFor(() => expect(targetRule).toHaveBeenCalledTimes(1));
    expect(github.pulls.get).toHaveBeenCalledWith({
      owner: "home-assistant",
      repo: "home-assistant.io",
      pull_number: 9,
    });
    const [ctx] = targetRule.mock.calls[0] as unknown as [{ repo: { fullName: string } }];
    expect(ctx.repo.fullName).toBe("home-assistant/home-assistant.io");
  });

  it("is dropped from an on-demand dispatch", async () => {
    const { github, targetRule, run } = setup(EventType.ON_DEMAND);
    await run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(github.pulls.get).not.toHaveBeenCalled();
    expect(targetRule).not.toHaveBeenCalled();
  });
});
