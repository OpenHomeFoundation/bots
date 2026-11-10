import { describe, expect, it } from "vitest";
import { dispatch } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import type { RegistryConfig } from "../../../src/github/engine/types.js";
import { itemIntegrationDomains } from "../../../src/github/manifests/home-assistant-core/helpers/integration-domains.js";
import { MENTION_MARKER, mentionCodeOwners } from "../../../src/github/rules/code-owner-mention.js";
import { setIntegration } from "../../../src/github/rules/set-integration.js";
import {
  BOT_LOGIN,
  createFakeGitHub,
  createMockContext,
  createMockIssueContext,
  mockPRFiles,
  runRule,
} from "../helpers/mock-context.js";

const rule = mentionCodeOwners({
  domains: itemIntegrationDomains,
  pathPattern: (name) => `homeassistant/components/${name}/*`,
});

describe("mention-code-owners", () => {
  it("returns undefined for non-integration labels", async () => {
    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      payload: {
        label: { name: "bugfix" },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("assigns code owners and comments when integration is found", async () => {
    const github = createFakeGitHub();
    const codeowners = `homeassistant/components/hue/* @balloob @frenck`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.assignees).toContain("balloob");
    expect(result?.assignees).toContain("frenck");
    expect(result?.comment).toContain("@balloob");
    expect(result?.comment).toContain("@frenck");
    expect(result?.comment).toContain("code owner");
  });

  it("posts one comment listing every integration's owners", async () => {
    const github = createFakeGitHub();
    const codeowners = [
      "homeassistant/components/hue/* @balloob @frenck",
      "homeassistant/components/lifx/* @djelibeybi",
      "homeassistant/components/shelly/* @frenck",
    ].join("\n");

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: shelly" },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [
            { name: "integration: hue" },
            { name: "integration: lifx" },
            { name: "integration: shelly" },
          ],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.comments).toHaveLength(1);
    expect(result?.assignees).toEqual(["balloob", "frenck", "djelibeybi"]);
    expect(result?.comment).toContain(
      "- `hue` ([owners](https://github.com/home-assistant/core/blob/HEAD/CODEOWNERS#L1)): @balloob, @frenck",
    );
    expect(result?.comment).toContain(
      "- `lifx` ([owners](https://github.com/home-assistant/core/blob/HEAD/CODEOWNERS#L2)): @djelibeybi",
    );
    expect(result?.comment).toContain(
      "- `shelly` ([owners](https://github.com/home-assistant/core/blob/HEAD/CODEOWNERS#L3)): @frenck",
    );
    expect(result?.comment).toContain("you are listed as a [code owner](");
  });

  it("does not mention owners already assigned", async () => {
    const github = createFakeGitHub();
    const codeowners = `homeassistant/components/hue/* @balloob`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          assignees: [{ login: "balloob" }],
          body: "",
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.assignees).toContain("balloob");
    // Comment should be undefined since the only owner is already assigned
    expect(result?.comment).toBeUndefined();
  });

  it("does not post again when a mention comment already exists", async () => {
    const github = createFakeGitHub();
    const codeowners = `homeassistant/components/hue/* @balloob`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({
      data: [
        {
          user: { login: BOT_LOGIN },
          body: `${MENTION_MARKER}\n\nHey there @someone-else, mind taking a look?`,
        },
      ],
    });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("still mentions owners when only someone else's comment carries the marker", async () => {
    const github = createFakeGitHub();
    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(`homeassistant/components/hue/* @balloob`) },
    });
    github.issues.listComments.mockResolvedValue({
      data: [{ user: { login: "troll" }, body: MENTION_MARKER }],
    });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: { labels: [{ name: "integration: hue" }] },
      },
    });

    const result = await runRule(rule, context);
    expect(result?.comment).toContain("@balloob");
  });

  it("does not post again when the legacy bot already mentioned owners", async () => {
    const github = createFakeGitHub();
    const codeowners = `homeassistant/components/hue/* @balloob`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    // Verbatim shape of the legacy CodeOwnersMention comment: template prose
    // only, no marker (the legacy bot never stamped one). Same GitHub App.
    github.issues.listComments.mockResolvedValue({
      data: [
        {
          user: { login: BOT_LOGIN },
          body:
            "\nHey there @balloob, mind taking a look at this pull request as it has been " +
            "labeled with an integration (`hue`) you are listed as a " +
            "[code owner](https://github.com/home-assistant/core/blob/8b1e4d2/CODEOWNERS#L742) " +
            "for? Thanks!\n\n<details>\n<summary>Code owner commands</summary>\n\n\n" +
            "Code owners of `hue` can trigger bot actions by commenting:\n\n" +
            "- `@home-assistant close` Closes the issue.\n\n</details>\n\n",
        },
      ],
    });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("does not mention or assign the PR author", async () => {
    const github = createFakeGitHub();
    const codeowners = `homeassistant/components/hue/* @reporter`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("raises when CODEOWNERS file is not found", async () => {
    const github = createFakeGitHub();
    github.repos.getContent.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: { labels: [{ name: "integration: hue" }] },
      },
    });

    await expect(runRule(rule, context)).rejects.toThrow("No CODEOWNERS file");
  });

  it("returns undefined when integration is not in CODEOWNERS", async () => {
    const github = createFakeGitHub();
    const codeowners = `homeassistant/components/zwave/* @MartinHjelmare`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        issue: { labels: [{ name: "integration: hue" }] },
      },
    });

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("works for PR labeled events too", async () => {
    expect(Object.keys(rule.events)).toContain(EventType.PULL_REQUEST_LABELED);
  });

  it("listens to both issues.labeled and pull_request.labeled", () => {
    expect(Object.keys(rule.events)).toContain(EventType.ISSUES_LABELED);
    expect(Object.keys(rule.events)).toContain(EventType.PULL_REQUEST_LABELED);
  });

  describe("PR creation", () => {
    it("pings owners on pull_request.opened from the PR's own files", async () => {
      const github = createFakeGitHub();
      const codeowners = `homeassistant/components/hue/* @balloob @frenck`;
      github.repos.getContent.mockResolvedValue({ data: { content: btoa(codeowners) } });
      github.issues.listComments.mockResolvedValue({ data: [] });
      github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

      const config: RegistryConfig = {
        repositories: {
          "home-assistant/core": {
            rules: [setIntegration({ domains: itemIntegrationDomains }), rule],
            commands: [],
          },
        },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        payload: {
          pull_request: {
            user: { login: "contributor" },
            assignees: [],
            body: "",
            labels: [],
          },
        },
      });
      mockPRFiles(context, [
        { filename: "homeassistant/components/hue/light.py", status: "modified" },
      ]);

      await dispatch(context);

      expect(github.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ["integration: hue"] }),
      );
      expect(github.issues.addAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: expect.arrayContaining(["balloob", "frenck"]) }),
      );
      expect(github.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining("@balloob") }),
      );
    });

    it("does nothing on opened when the PR touches no integration files", async () => {
      const github = createFakeGitHub();
      github.repos.getContent.mockResolvedValue({ data: { content: btoa("") } });

      const config: RegistryConfig = {
        repositories: {
          "home-assistant/core": {
            rules: [setIntegration({ domains: itemIntegrationDomains }), rule],
            commands: [],
          },
        },
      };
      const context = createMockContext({
        registry: config,
        eventType: EventType.PULL_REQUEST_OPENED,
        github,
        payload: { pull_request: { user: { login: "contributor" }, labels: [] } },
      });
      mockPRFiles(context, [{ filename: "docs/README.md", status: "modified" }]);

      await dispatch(context);

      expect(github.issues.addAssignees).not.toHaveBeenCalled();
      // Only the dashboard placeholder may be posted on opened — no mention.
      const bodies = github.issues.createComment.mock.calls.map((c) => c[0].body as string);
      expect(bodies.some((b) => b.includes(MENTION_MARKER))).toBe(false);
    });

    it("subscribes to creation, change, and label events plus on_demand", () => {
      expect(Object.keys(rule.events).sort()).toEqual(
        [
          EventType.PULL_REQUEST_OPENED,
          EventType.PULL_REQUEST_EDITED,
          EventType.PULL_REQUEST_SYNCHRONIZE,
          EventType.ISSUES_OPENED,
          EventType.ISSUES_LABELED,
          EventType.ISSUES_ON_DEMAND,
          EventType.PULL_REQUEST_LABELED,
          EventType.ON_DEMAND,
        ].sort(),
      );
    });
  });

  it("uses custom itemLabel in comment", async () => {
    const docsRule = mentionCodeOwners({
      domains: itemIntegrationDomains,
      pathPattern: (name) => `source/_integrations/${name}.markdown`,
      itemLabel: "feedback",
    });

    const github = createFakeGitHub();
    const codeowners = `source/_integrations/hue.markdown @balloob`;

    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(codeowners) },
    });
    github.issues.listComments.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    const context = createMockIssueContext({
      eventType: EventType.ISSUES_LABELED,
      github,
      payload: {
        label: { name: "integration: hue" },
        repository: {
          full_name: "home-assistant/home-assistant.io",
          name: "home-assistant.io",
          owner: { login: "home-assistant" },
        },
        issue: {
          user: { login: "reporter" },
          assignees: [],
          body: "",
          labels: [{ name: "integration: hue" }],
        },
      },
    });

    const result = await runRule(docsRule, context);
    expect(result?.comment).toContain("feedback");
  });
});
