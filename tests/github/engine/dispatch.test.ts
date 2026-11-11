import { describe, expect, it, vi } from "vitest";
import { claCheck } from "../../../src/cla/rule.js";
import type { ClaStore } from "../../../src/cla/store.js";
import { dispatch, matchRules } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import { on } from "../../../src/github/engine/rule.js";
import {
  isStatusComment,
  parseState,
  placeholderBody,
  renderStatus,
} from "../../../src/github/engine/status/render.js";
import type { StatusSection } from "../../../src/github/engine/status/types.js";
import type { RegistryConfig, Rule, RuleOutput } from "../../../src/github/engine/types.js";
import { log } from "../../../src/log.js";
import { expectLoggedErrors } from "../../helpers/log-guard.js";
import {
  BOT_LOGIN,
  createFakeGitHub,
  createMockContext,
  type FakeGitHub,
} from "../helpers/mock-context.js";

const testRule: Rule = {
  name: "test-rule",
  description: "",
  events: { [EventType.PULL_REQUEST_OPENED]: async () => undefined },
};

const noBotRule: Rule = {
  name: "no-bot-rule",
  description: "",
  allowBots: false,
  events: { [EventType.PULL_REQUEST_OPENED]: async () => undefined },
};

describe("matchRules", () => {
  it("matches repo rule with correct event type", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [testRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("test-rule");
  });

  it("does not match rule with wrong event type", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [testRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_CLOSED,
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(0);
  });

  it("does not match rule for different repo", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/frontend": { rules: [testRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(0);
  });

  it("filters out bots when allowBots is false", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [noBotRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: { login: "dependabot[bot]", type: "Bot" } },
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(0);
  });

  it("allows bots by default", () => {
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [testRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: { login: "dependabot[bot]", type: "Bot" } },
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(1);
  });

  it("returns empty for unknown repo/org", () => {
    const config: RegistryConfig = {
      repositories: {},
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
    });
    const matched = matchRules(context);
    expect(matched).toHaveLength(0);
  });
});

describe("dispatch", () => {
  it("adds labels from rule effects", async () => {
    const github = createFakeGitHub();
    const labelRule: Rule = {
      name: "labeler",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "addLabels", labels: ["bugfix", "has-tests"] }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [labelRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["bugfix", "has-tests"] }),
    );
  });

  it("removes labels from rule effects", async () => {
    const github = createFakeGitHub();
    const removerRule: Rule = {
      name: "remover",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "removeLabels", labels: ["needs-rebase"] }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [removerRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [{ name: "needs-rebase" }] } },
    });

    await dispatch(context);

    expect(github.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "needs-rebase" }),
    );
  });

  it("does not remove a label that was also added", async () => {
    expectLoggedErrors(); // the add/remove conflict warns by design
    const github = createFakeGitHub();
    const conflictRule: Rule = {
      name: "conflict",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [
            { type: "addLabels", labels: ["keep-me"] },
            { type: "removeLabels", labels: ["keep-me"] },
          ],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [conflictRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).toHaveBeenCalled();
    expect(github.issues.removeLabel).not.toHaveBeenCalled();
  });

  it("creates comments from rule effects", async () => {
    const github = createFakeGitHub();
    const commentRule: Rule = {
      name: "commenter",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "comment", body: "Hello from the bot!" }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [commentRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Hello from the bot!" }),
    );
  });

  it("adds assignees from rule effects", async () => {
    const github = createFakeGitHub();
    const assignRule: Rule = {
      name: "assigner",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "addAssignees", assignees: ["balloob", "frenck"] }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [assignRule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addAssignees).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ["balloob", "frenck"] }),
    );
  });

  it("continues processing when a rule throws", async () => {
    const github = createFakeGitHub();
    const logExceptionSpy = vi.spyOn(log, "exception").mockImplementation(() => {});

    const failingRule: Rule = {
      name: "failing",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => {
          throw new Error("Rule exploded");
        },
      },
    };
    const succeedingRule: Rule = {
      name: "succeeding",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "addLabels", labels: ["still-works"] }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: {
        "home-assistant/core": { rules: [failingRule, succeedingRule], commands: [] },
      },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(logExceptionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Rule exploded" }),
      expect.objectContaining({ rule: "failing" }),
    );
    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["still-works"] }),
    );

    logExceptionSpy.mockRestore();
  });

  it("stays silent on opened when the repo has no dashboard greeting", async () => {
    const github = createFakeGitHub();
    const config: RegistryConfig = {
      repositories: {},
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).not.toHaveBeenCalled();
    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });

  it("on a dashboard-less repo, drops status rows but still applies effects", async () => {
    const github = createFakeGitHub();
    const rule: Rule = {
      name: "status-and-label",
      description: "",
      statusSections: [{ id: "x", title: "x" }],
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          statuses: [{ id: "x", title: "x", status: "fail", message: "nope" }],
          effects: [{ type: "addLabels", labels: ["cla-needed"] }],
        }),
      },
    };
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [rule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["cla-needed"] }),
    );
    // The dashboard can never materialize: no comment, no aggregate commit
    // status, and no draft-on-failure (the failing row was dropped).
    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
    expect(github.graphql).not.toHaveBeenCalled();
    expectLoggedErrors(); // the drop warns by design — it flags a manifest bug
  });

  it("baselines the dashboard on opened for greeting repos, even with no matching rules", async () => {
    const github = createFakeGitHub();
    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [], commands: [], dashboard: true } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).not.toHaveBeenCalled();
    // Greeting dispatches create the placeholder up front and write the
    // aggregate commit status even with no matching rules.
    expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: "success" }),
    );
  });

  it("does nothing when no rules match on a non-opened event", async () => {
    const github = createFakeGitHub();
    const config: RegistryConfig = {
      repositories: {},
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_LABELED,
      github,
      payload: { action: "labeled", label: { name: "bugfix" } },
    });

    await dispatch(context);

    expect(github.issues.addLabels).not.toHaveBeenCalled();
    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });

  it("merges effects from multiple rules", async () => {
    const github = createFakeGitHub();
    const rule1: Rule = {
      name: "rule1",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "addLabels", labels: ["label-a"] }],
        }),
      },
    };
    const rule2: Rule = {
      name: "rule2",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "addLabels", labels: ["label-b"] }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [rule1, rule2], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: expect.arrayContaining(["label-a", "label-b"]) }),
    );
  });

  // The aggregate ha-bot status check written from dashboard sections is
  // covered per-effect in apply-effects.test.ts.

  describe("draft-on-failure", () => {
    function setupDraftHarness(
      sectionStatus: "fail" | "pass" | "pending",
      prData: { draft?: boolean; node_id?: string } = {},
    ) {
      const github = createFakeGitHub();
      github.issues.listComments.mockResolvedValue({ data: [] });
      github.issues.createComment.mockResolvedValue({
        data: { id: 999, html_url: "https://github.com/ha/c/pull/1#issuecomment-999" },
      });

      const rule: Rule = {
        name: "rule",
        description: "",
        statusSections: [{ id: "x", title: "x" }],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => ({
            statuses: [{ id: "x", title: "x", status: sectionStatus, message: "msg" }],
          }),
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": { rules: [rule], commands: [], dashboard: true } },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        payload: {
          pull_request: { draft: prData.draft ?? false, node_id: prData.node_id ?? "PR_NODE_1" },
        },
      });
      return { github, context };
    }

    it("converts the PR to draft when the aggregate is failing", async () => {
      const { github, context } = setupDraftHarness("fail");
      await dispatch(context);

      expect(github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("convertPullRequestToDraft"),
        expect.objectContaining({ id: "PR_NODE_1" }),
      );
    });

    it("does not draft when the PR is already a draft", async () => {
      const { github, context } = setupDraftHarness("fail", { draft: true });
      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("does not draft when the aggregate is passing", async () => {
      const { github, context } = setupDraftHarness("pass");
      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("does not draft when the aggregate is pending", async () => {
      const { github, context } = setupDraftHarness("pending");
      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    function dashboardComment(status: "fail" | "pending" | "pass") {
      const section = { id: "x", title: "x", status, message: "msg" };
      return {
        id: 1,
        user: { login: BOT_LOGIN },
        body: `<!-- ha-bot-dashboard -->\n<!-- section:x:${JSON.stringify(section)} -->`,
      };
    }

    // A rule that claims section "x" but handles no events: it never runs, so
    // the persisted section state stands — but its id counts as known.
    const claimsX: Rule = {
      name: "claims-x",
      description: "",
      statusSections: [{ id: "x", title: "x" }],
      events: {},
    };

    it("on ready_for_review with a still-failing claimed section, re-drafts", async () => {
      const github = createFakeGitHub();
      github.issues.listComments.mockResolvedValue({ data: [dashboardComment("fail")] });

      const config: RegistryConfig = {
        repositories: {
          "home-assistant/core": { rules: [claimsX], commands: [], dashboard: true },
        },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
        payload: { pull_request: { draft: false, node_id: "PR_NODE_READY" } },
      });

      await dispatch(context);

      expect(github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("convertPullRequestToDraft"),
        expect.objectContaining({ id: "PR_NODE_READY" }),
      );
    });

    it("on ready_for_review, a failing section no live rule claims does not re-draft", async () => {
      const github = createFakeGitHub();
      github.issues.listComments.mockResolvedValue({ data: [dashboardComment("fail")] });

      // No rule claims section "x" (e.g. a removed/renamed rule), so its stale
      // fail must not strand the PR in draft.
      const config: RegistryConfig = { repositories: {} };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
        payload: { pull_request: { draft: false, node_id: "PR_NODE_READY" } },
      });

      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("on ready_for_review with only a pending dashboard section, does not draft", async () => {
      const github = createFakeGitHub();
      github.issues.listComments.mockResolvedValue({ data: [dashboardComment("pending")] });

      const config: RegistryConfig = { repositories: {} };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
      });

      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("on ready_for_review with no dashboard comment yet, does not draft", async () => {
      const github = createFakeGitHub();
      github.issues.listComments.mockResolvedValue({ data: [] });

      const config: RegistryConfig = { repositories: {} };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
        github,
      });

      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });

    // Failing ⇒ draft is reconciled on every dispatch: a persisted failure
    // whose draft never landed (missed webhook, failed mutation) is repaired
    // by the next event of any kind, not only ready_for_review.
    it("re-drafts from persisted failing state on an unrelated event", async () => {
      const github = createFakeGitHub();
      github.issues.listComments.mockResolvedValue({ data: [dashboardComment("fail")] });

      const config: RegistryConfig = {
        repositories: {
          "home-assistant/core": { rules: [claimsX], commands: [], dashboard: true },
        },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_LABELED,
        github,
        payload: {
          action: "labeled",
          label: { name: "unrelated" },
          pull_request: { draft: false, node_id: "PR_NODE_LABELED" },
        },
      });

      await dispatch(context);

      expect(github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("convertPullRequestToDraft"),
        expect.objectContaining({ id: "PR_NODE_LABELED" }),
      );
    });

    it("never drafts a closed PR, even with persisted failing state", async () => {
      const github = createFakeGitHub();
      github.issues.listComments.mockResolvedValue({ data: [dashboardComment("fail")] });

      const config: RegistryConfig = {
        repositories: {
          "home-assistant/core": { rules: [claimsX], commands: [], dashboard: true },
        },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_LABELED,
        github,
        payload: {
          action: "labeled",
          label: { name: "unrelated" },
          pull_request: { draft: false, node_id: "PR_NODE_CLOSED", state: "closed" },
        },
      });

      await dispatch(context);

      expect(github.graphql).not.toHaveBeenCalled();
    });
  });

  describe("section waivers persisted in the status comment", () => {
    const waivedFailing = {
      id: "merge-conflict",
      title: "Merge conflicts",
      status: "fail",
      message: "Branch has merge conflicts.",
      ignored: { reason: "Will rebase before merge" },
    };

    function setupWaivedHarness(reEmit: { status: "fail" | "pass"; message: string } | null) {
      const github = createFakeGitHub();
      // Existing comment carries a waived failing section.
      github.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 555,
            html_url: "https://github.com/ha/c/pull/1#issuecomment-555",
            user: { login: BOT_LOGIN },
            body: [
              "<!-- ha-bot-dashboard -->",
              `<!-- section:merge-conflict:${JSON.stringify(waivedFailing)} -->`,
              `<!-- section:other:${JSON.stringify({
                id: "other",
                title: "Other",
                status: "pass",
                message: "ok",
              })} -->`,
            ].join("\n"),
          },
        ],
      });
      github.issues.updateComment.mockResolvedValue({
        data: { id: 555, html_url: "https://github.com/ha/c/pull/1#issuecomment-555" },
      });

      const rule: Rule = {
        name: "rule",
        description: "",
        statusSections: [
          { id: "merge-conflict", title: "Merge conflicts" },
          { id: "other", title: "Other" },
        ],
        events: {
          [EventType.PULL_REQUEST_SYNCHRONIZE]: async () => ({
            statuses: [
              ...(reEmit
                ? [
                    {
                      id: "merge-conflict",
                      title: "Merge conflicts",
                      status: reEmit.status,
                      message: reEmit.message,
                    },
                  ]
                : []),
              { id: "other", title: "Other", status: "pass" as const, message: "ok" },
            ],
          }),
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": { rules: [rule], commands: [], dashboard: true } },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
        github,
      });
      return { github, context };
    }

    it("keeps the waiver when the owning rule re-emits its failing section", async () => {
      const { github, context } = setupWaivedHarness({
        status: "fail",
        message: "Still conflicting.",
      });

      await dispatch(context);

      const writtenBody = github.issues.updateComment.mock.calls[0][0].body as string;
      // Fresh message and the waive reason are both visible; aggregate passes.
      expect(writtenBody).toContain("Still conflicting.");
      expect(writtenBody).toContain("Ignored: Will rebase before merge");
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "ha-bot",
          state: "success",
          description: "All checks passed (1 warning)",
        }),
      );
      // No draft: the waived failure doesn't count as failing.
      expect(github.graphql).not.toHaveBeenCalled();
    });

    it("keeps the waiver on sections preserved from the prior comment", async () => {
      const { github, context } = setupWaivedHarness(null);

      await dispatch(context);

      const writtenBody = github.issues.updateComment.mock.calls[0][0].body as string;
      expect(writtenBody).toContain("Ignored: Will rebase before merge");
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ context: "ha-bot", state: "success" }),
      );
    });

    it("carries the waiver along when the section turns passing", async () => {
      const { github, context } = setupWaivedHarness({
        status: "pass",
        message: "No conflicts.",
      });

      await dispatch(context);

      const writtenBody = github.issues.updateComment.mock.calls[0][0].body as string;
      // A passing section presents as passing — no waive note in the table
      // (the raw waiver only survives in the serialized section state).
      expect(writtenBody).toContain("No conflicts.");
      expect(writtenBody).not.toContain("Ignored: ");
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ context: "ha-bot", state: "success" }),
      );
    });
  });

  describe("stale-section sweep", () => {
    it("drops sections from the existing comment whose IDs no live rule claims", async () => {
      const github = createFakeGitHub();
      // Existing comment has both a known and a stale section
      github.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 555,
            html_url: "https://github.com/ha/c/pull/1#issuecomment-555",
            user: { login: BOT_LOGIN },
            body: [
              "<!-- ha-bot-dashboard -->",
              "<!-- section:still-live:" +
                JSON.stringify({
                  id: "still-live",
                  title: "Live",
                  status: "pass",
                  message: "ok",
                }) +
                " -->",
              "<!-- section:gone-rule:" +
                JSON.stringify({
                  id: "gone-rule",
                  title: "Stale",
                  status: "fail",
                  message: "should be swept",
                }) +
                " -->",
            ].join("\n"),
          },
        ],
      });
      github.issues.updateComment.mockResolvedValue({
        data: { id: 555, html_url: "https://github.com/ha/c/pull/1#issuecomment-555" },
      });

      const rule: Rule = {
        name: "live-rule",
        description: "",
        statusSections: [{ id: "still-live", title: "still-live" }],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => ({
            statuses: [{ id: "still-live", title: "Live", status: "pass", message: "ok" }],
          }),
        },
      };
      const config: RegistryConfig = {
        repositories: { "home-assistant/core": { rules: [rule], commands: [], dashboard: true } },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
      });

      await dispatch(context);

      // Comment was rewritten; new body must not contain the stale section.
      expect(github.issues.updateComment).toHaveBeenCalledTimes(1);
      const writtenBody = github.issues.updateComment.mock.calls[0][0].body as string;
      expect(writtenBody).toContain("still-live");
      expect(writtenBody).not.toContain("gone-rule");

      // ha-bot status reflects only the surviving sections (one pass) → success
      expect(github.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ context: "ha-bot", state: "success" }),
      );
    });
  });

  describe("other commit statuses", () => {
    it("leaves the bot's other statuses on the head alone", async () => {
      const github = createFakeGitHub();
      github.issues.listComments.mockResolvedValue({ data: [] });
      github.issues.createComment.mockResolvedValue({
        data: { id: 111, html_url: "https://github.com/ha/c/pull/1#issuecomment-111" },
      });
      // Legacy contexts written by the same app (testEnv's BOT_SLUG); rulesets may still require them.
      github.repos.listCommitStatusesForRef.mockResolvedValue({
        data: [
          { id: 1, context: "cla-bot", state: "failure", creator: { login: "ha-bot[bot]" } },
          { id: 2, context: "docs-missing", state: "failure", creator: { login: "ha-bot[bot]" } },
        ],
      });
      const rule: Rule = {
        name: "rule",
        description: "",
        statusSections: [{ id: "live", title: "live" }],
        events: {
          [EventType.PULL_REQUEST_OPENED]: async () => ({
            statuses: [{ id: "live", title: "Live", status: "pass", message: "ok" }],
          }),
        },
      };
      const context = createMockContext({
        registry: {
          repositories: { "home-assistant/core": { rules: [rule], commands: [], dashboard: true } },
        },
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
      });

      await dispatch(context);

      const contexts = github.repos.createCommitStatus.mock.calls.map(([p]) => p.context);
      expect(contexts).toEqual(["ha-bot"]);
    });
  });
});

describe("label independence", () => {
  it("applies a rule's label effects without re-dispatching label rules", async () => {
    const github = createFakeGitHub();
    const labelRuleRan = vi.fn();

    const labeler: Rule = {
      name: "labeler",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "addLabels", labels: ["X"] }],
        }),
      },
    };
    const reactor: Rule = {
      name: "reactor",
      description: "",
      events: {
        [EventType.PULL_REQUEST_LABELED]: async () => {
          labelRuleRan();
          return { effects: [{ type: "comment", body: "should never post" }] };
        },
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [labeler, reactor], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["X"] }),
    );
    expect(labelRuleRan).not.toHaveBeenCalled();
    const bodies = github.issues.createComment.mock.calls.map((c) => c[0].body as string);
    expect(bodies).not.toContain("should never post");
  });

  it("does not call GitHub for labels already present", async () => {
    const github = createFakeGitHub();
    const rule: Rule = {
      name: "labeler",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "addLabels", labels: ["cla-signed"] }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [rule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [{ name: "cla-signed" }] } },
    });

    await dispatch(context);

    expect(github.issues.addLabels).not.toHaveBeenCalled();
  });

  it("does not call GitHub when removing an absent label", async () => {
    const github = createFakeGitHub();
    const rule: Rule = {
      name: "remover",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "removeLabels", labels: ["stale"] }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [rule], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.removeLabel).not.toHaveBeenCalled();
  });

  it("removes present labels without re-dispatching unlabeled rules", async () => {
    const github = createFakeGitHub();

    const remover: Rule = {
      name: "remover",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => ({
          effects: [{ type: "removeLabels", labels: ["stale"] }],
        }),
      },
    };
    const reactor: Rule = {
      name: "reactor",
      description: "",
      events: {
        [EventType.PULL_REQUEST_UNLABELED]: async () => ({
          effects: [{ type: "comment", body: "bye" }],
        }),
      },
    };

    const config: RegistryConfig = {
      repositories: { "home-assistant/core": { rules: [remover, reactor], commands: [] } },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [{ name: "stale" }] } },
    });

    await dispatch(context);

    expect(github.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stale" }),
    );
    const bodies = github.issues.createComment.mock.calls.map((c) => c[0].body as string);
    expect(bodies).not.toContain("bye");
  });
});

describe("dashboard placeholder on opened", () => {
  it("posts the placeholder before any rule runs", async () => {
    const github = createFakeGitHub();
    const commentsWhenRuleRan = vi.fn();

    const observer: Rule = {
      name: "observer",
      description: "",
      events: {
        [EventType.PULL_REQUEST_OPENED]: async () => {
          commentsWhenRuleRan(github.issues.createComment.mock.calls.length);
          return undefined;
        },
      },
    };
    const context = createMockContext({
      registry: {
        repositories: {
          "home-assistant/core": { rules: [observer], commands: [], dashboard: true },
        },
      },
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(commentsWhenRuleRan).toHaveBeenCalledWith(1);
    const body = github.issues.createComment.mock.calls[0][0].body as string;
    expect(body).toContain("<!-- ha-bot-dashboard -->");
  });

  it("an empty opened dispatch upgrades the placeholder to the greeting dashboard", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [{ id: 7, body: placeholderBody(), user: { login: BOT_LOGIN } }],
    });

    const context = createMockContext({
      registry: {
        repositories: { "home-assistant/core": { rules: [], commands: [], dashboard: true } },
      },
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.updateComment).toHaveBeenCalledTimes(1);
    const body = github.issues.updateComment.mock.lastCall?.[0].body as string;
    expect(body).toContain("Thanks for contributing");
    expect(body).not.toContain("Evaluating rules");
  });

  it("never posts the placeholder on opened for non-greeting repos", async () => {
    const github = createFakeGitHub();

    const context = createMockContext({
      registry: { repositories: { "home-assistant/core": { rules: [testRule], commands: [] } } },
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
    });

    await dispatch(context);

    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.repos.createCommitStatus).not.toHaveBeenCalled();
  });
});

describe("locked items", () => {
  it.each([
    { eventType: EventType.PULL_REQUEST_OPENED, action: "opened" },
    { eventType: EventType.PULL_REQUEST_REOPENED, action: "reopened" },
  ])("on $action, runs no rule and writes nothing", async ({ eventType, action }) => {
    const github = createFakeGitHub();
    const handler = vi.fn(async () => ({
      effects: [{ type: "addLabels" as const, labels: ["nope"] }],
    }));
    const rule: Rule = {
      name: "any",
      description: "",
      events: on([EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_REOPENED], handler),
    };

    await dispatch(
      createMockContext({
        registry: {
          repositories: { "home-assistant/core": { rules: [rule], commands: [], dashboard: true } },
        },
        eventType,
        github,
        payload: { action, pull_request: { locked: true } },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(github.issues.listComments).not.toHaveBeenCalled();
    expect(github.issues.createComment).not.toHaveBeenCalled();
    expect(github.issues.addLabels).not.toHaveBeenCalled();
    expect(github.pulls.get).not.toHaveBeenCalled();
  });
});

describe("first contact with a PR that has no dashboard", () => {
  const unsignedStore: ClaStore = {
    hasSigned: async () => false,
    recordPendingSigners: async () => {},
    getPendingSigner: async () => undefined,
    deletePendingSigner: async () => {},
    recordSignature: async () => {},
  };

  // Stands in for the rules a review or an edit triggers; none of them is CLA.
  const reviewRule: Rule = {
    name: "review-rule",
    description: "",
    statusSections: [{ id: "review", title: "Review" }],
    events: on(
      [EventType.PULL_REQUEST_REVIEW_SUBMITTED, EventType.PULL_REQUEST_EDITED],
      async () => ({
        statuses: [{ id: "review", title: "Review", status: "skip", message: "n/a" }],
      }),
    ),
  };

  const config: RegistryConfig = {
    repositories: {
      "home-assistant/core": {
        rules: [claCheck(() => unsignedStore), reviewRule],
        commands: [],
        dashboard: true,
      },
    },
  };

  function setup() {
    const github = createFakeGitHub({
      pullRequest: {
        number: 1,
        node_id: "PR_1",
        head: { sha: "abc123" },
        user: { login: "testuser", type: "User" },
        labels: [],
        state: "open",
        draft: false,
      },
    });
    github.pulls.listCommits.mockResolvedValue({
      data: [
        {
          sha: "abc123",
          author: { login: "testuser", type: "User" },
          commit: { author: { email: "testuser@example.com" } },
        },
      ],
    });
    return github;
  }

  function dashboardRows(github: FakeGitHub): string[] {
    const dashboards = github.comments.filter((c) => isStatusComment(c.body));
    expect(dashboards).toHaveLength(1);
    return parseState(dashboards[0].body)
      .sections.map((s) => `${s.id}:${s.status}`)
      .sort();
  }

  it.each([
    {
      eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
      payload: { action: "submitted", review: { state: "commented", user: { login: "testuser" } } },
    },
    { eventType: EventType.PULL_REQUEST_EDITED, payload: { action: "edited" } },
  ])(
    "on $eventType, evaluates every rule so the unsigned CLA fails and drafts",
    async ({ eventType, payload }) => {
      const github = setup();

      await dispatch(createMockContext({ registry: config, eventType, github, payload }));

      expect(github.pulls.listCommits).toHaveBeenCalled();
      expect(dashboardRows(github)).toEqual(["cla:fail", "review:skip"]);
      const haBot = github.repos.createCommitStatus.mock.calls
        .map(([p]) => p)
        .filter((p) => p.context === "ha-bot");
      expect(haBot.length).toBeGreaterThan(0);
      expect(haBot.every((p) => p.state === "failure")).toBe(true);
      expect(github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("convertPullRequestToDraft"),
        expect.objectContaining({ id: "PR_1" }),
      );
    },
  );

  it("runs only the event's rules once the dashboard exists", async () => {
    const github = setup();
    github.comments.push({
      id: 1,
      body: placeholderBody(),
      html_url: "https://example.test/1",
      user: { login: BOT_LOGIN },
    });

    await dispatch(
      createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_EDITED,
        github,
        payload: { action: "edited" },
      }),
    );

    expect(github.pulls.listCommits).not.toHaveBeenCalled();
    expect(dashboardRows(github)).toEqual(["review:skip"]);
  });
});

describe("rule state persisted in the status comment", () => {
  /** A dashboard comment whose state blob carries the given data bag. */
  function commentWithData(data: Record<string, unknown>) {
    return {
      id: 555,
      html_url: "https://github.com/ha/c/pull/1#issuecomment-555",
      user: { login: BOT_LOGIN },
      body: renderStatus(
        [{ id: "x", title: "x", status: "pass", message: "ok" }],
        "home-assistant/core",
        "pull_request",
        { data },
      ),
    };
  }

  function statefulRule(
    handler: (state: unknown) => RuleOutput | undefined,
    name = "stateful",
  ): Rule {
    return {
      name,
      description: "",
      statusSections: [{ id: "x", title: "x" }],
      events: {
        [EventType.PULL_REQUEST_SYNCHRONIZE]: async (_ctx, state) => handler(state),
      },
    };
  }

  function makeContext(github: ReturnType<typeof createFakeGitHub>, rules: Rule[]) {
    return createMockContext({
      registry: {
        repositories: { "home-assistant/core": { rules, commands: [], dashboard: true } },
      },
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      github,
    });
  }

  /** The data bag embedded in the last-written comment body. */
  function writtenData(github: ReturnType<typeof createFakeGitHub>): Record<string, unknown> {
    const body = github.issues.updateComment.mock.lastCall?.[0].body as string;
    return parseState(body).data;
  }

  it("hands each rule its own persisted slice", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [commentWithData({ stateful: { count: 3 }, other: "not-yours" })],
    });
    const seen = vi.fn();
    const rule = statefulRule((state) => {
      seen(state);
      return undefined;
    });

    await dispatch(makeContext(github, [rule, { name: "other", description: "", events: {} }]));

    expect(seen).toHaveBeenCalledWith({ count: 3 });
  });

  it("persists a returned state slice under the rule's name", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({ data: [commentWithData({})] });
    const rule = statefulRule(() => ({
      statuses: [{ id: "x", title: "x", status: "pass", message: "ok" }],
      state: { count: 4 },
    }));

    await dispatch(makeContext(github, [rule]));

    expect(writtenData(github)).toEqual({ stateful: { count: 4 } });
  });

  it("a state-only update rewrites the comment, leaving other slices intact", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [commentWithData({ stateful: { count: 1 }, keeper: true })],
    });
    const rule = statefulRule(() => ({ state: { count: 2 } }));
    const keeper: Rule = { name: "keeper", description: "", events: {} };

    await dispatch(makeContext(github, [rule, keeper]));

    expect(writtenData(github)).toEqual({ stateful: { count: 2 }, keeper: true });
  });

  it("state: null clears the rule's slice; omitting state keeps it", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [commentWithData({ stateful: { count: 1 }, quiet: "kept" })],
    });
    const clearing = statefulRule(() => ({ state: null }));
    const quiet = statefulRule(
      () => ({ statuses: [{ id: "x", title: "x", status: "pass", message: "ok" }] }),
      "quiet",
    );

    await dispatch(makeContext(github, [clearing, quiet]));

    expect(writtenData(github)).toEqual({ quiet: "kept" });
  });

  it("sweeps state slices owned by no live rule", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [commentWithData({ "gone-rule": { stale: true }, stateful: "live" })],
    });
    const rule = statefulRule(() => undefined);

    await dispatch(makeContext(github, [rule]));

    expect(writtenData(github)).toEqual({ stateful: "live" });
  });
});

describe("status comment ownership", () => {
  // Pre-existing PR with no bot dashboard yet; a third party planted the
  // sentinel and a state blob of their own.
  function forgedDashboard(section: StatusSection) {
    return {
      id: 77,
      user: { login: "troll" },
      html_url: "https://github.com/ha/c/pull/1#issuecomment-77",
      body: renderStatus([section], "home-assistant/core"),
    };
  }

  const claimsY: Rule = {
    name: "claims-y",
    description: "",
    statusSections: [{ id: "y", title: "y" }],
    events: {},
  };

  function emitsX(status: "pass" | "fail"): Rule {
    return {
      name: "emits-x",
      description: "",
      statusSections: [{ id: "x", title: "x" }],
      events: {
        [EventType.PULL_REQUEST_SYNCHRONIZE]: async () => ({
          statuses: [{ id: "x", title: "x", status, message: "msg" }],
        }),
      },
    };
  }

  function makeContext(github: FakeGitHub, rules: Rule[]) {
    return createMockContext({
      registry: {
        repositories: { "home-assistant/core": { rules, commands: [], dashboard: true } },
      },
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      github,
      payload: { action: "synchronize" },
    });
  }

  function haBotStates(github: FakeGitHub) {
    return github.repos.createCommitStatus.mock.calls
      .map(([p]) => p as { context: string; state: string })
      .filter((p) => p.context === "ha-bot")
      .map((p) => p.state);
  }

  it("creates its own dashboard instead of adopting someone else's", async () => {
    const github = createFakeGitHub();
    github.comments.push(forgedDashboard({ id: "y", title: "y", status: "fail", message: "x" }));

    await dispatch(makeContext(github, [emitsX("pass"), claimsY]));

    expect(github.issues.updateComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 77 }),
    );
    expect(github.issues.createComment).toHaveBeenCalledTimes(1);
    expect(haBotStates(github)).toEqual(["success"]);
    expect(github.graphql).not.toHaveBeenCalled();
  });

  it("does not carry over a waiver from someone else's comment", async () => {
    const github = createFakeGitHub();
    github.comments.push(
      forgedDashboard({
        id: "x",
        title: "x",
        status: "fail",
        message: "msg",
        ignored: { reason: "n/a" },
      }),
    );

    await dispatch(makeContext(github, [emitsX("fail")]));

    expect(haBotStates(github)).toEqual(["failure"]);
    expect(github.graphql).toHaveBeenCalledWith(
      expect.stringContaining("convertPullRequestToDraft"),
      expect.anything(),
    );
  });
});
