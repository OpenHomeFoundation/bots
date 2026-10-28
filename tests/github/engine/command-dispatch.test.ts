import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeLabel } from "../../../src/github/commands/label-remove.js";
import { unassign } from "../../../src/github/commands/unassign.js";
import { dispatchCommand } from "../../../src/github/engine/dispatch.js";
import { EventType } from "../../../src/github/engine/event.js";
import { isBotCommand, parseCommands } from "../../../src/github/engine/model/command-context.js";
import type { Command, Rule } from "../../../src/github/engine/types.js";
import { UsageError } from "../../../src/github/engine/usage-error.js";
import { log } from "../../../src/log.js";
import {
  expectReaction,
  makeCommandContext as makeContext,
  registryWith,
} from "../helpers/command.js";
import { createFakeGitHub } from "../helpers/mock-context.js";

const noopCommand = (overrides: Partial<Command> = {}): Command => ({
  name: "ping",
  description: "",
  permission: "none",
  handle: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("parseCommands", () => {
  it("extracts the name and lowercases it", () => {
    expect(parseCommands("@home-assistant UPDATE", "home-assistant")).toEqual([
      { name: "update", args: [] },
    ]);
  });

  it("extracts quoted arguments without their quotes", () => {
    expect(parseCommands('@home-assistant rename "Awesome new title"', "home-assistant")).toEqual([
      { name: "rename", args: ["Awesome new title"] },
    ]);
    expect(
      parseCommands(
        '@home-assistant ignore "Merge conflicts" "Broken rule, no conflicts"',
        "home-assistant",
      ),
    ).toEqual([{ name: "ignore", args: ["Merge conflicts", "Broken rule, no conflicts"] }]);
  });

  it("flags unquoted argument text as malformed", () => {
    expect(parseCommands("@home-assistant rename Awesome new title", "home-assistant")).toEqual([
      { name: "rename", args: [], malformed: true },
    ]);
    expect(
      parseCommands('@home-assistant ignore "Merge conflicts" trailing', "home-assistant"),
    ).toEqual([{ name: "ignore", args: ["Merge conflicts"], malformed: true }]);
  });

  it("matches on any line of the comment but not mid-line", () => {
    expect(parseCommands("thanks!\n@home-assistant close", "home-assistant")).toEqual([
      { name: "close", args: [] },
    ]);
    expect(parseCommands("see @home-assistant close", "home-assistant")).toEqual([]);
  });

  it("does not swallow following lines into the argument", () => {
    expect(
      parseCommands('@home-assistant rename "New title"\nmore text', "home-assistant"),
    ).toEqual([{ name: "rename", args: ["New title"] }]);
  });

  it("parses several commands from one comment, in order, with prose between", () => {
    expect(
      parseCommands(
        'looks good!\n@home-assistant rename "New title"\nsome explanation\n@home-assistant close',
        "home-assistant",
      ),
    ).toEqual([
      { name: "rename", args: ["New title"] },
      { name: "close", args: [] },
    ]);
  });

  it("returns an empty list without a command name", () => {
    expect(parseCommands("@home-assistant", "home-assistant")).toEqual([]);
    expect(parseCommands("hello world", "home-assistant")).toEqual([]);
  });

  it("requires whitespace or the line end after the command name", () => {
    expect(parseCommands("@home-assistant close!", "home-assistant")).toEqual([]);
    expect(parseCommands('@home-assistant rename"New title"', "home-assistant")).toEqual([]);
    expect(parseCommands("@home-assistant\tclose\t", "home-assistant")).toEqual([
      { name: "close", args: [] },
    ]);
  });

  it("ignores trailing whitespace and CRLF line ends", () => {
    expect(
      parseCommands(
        '@home-assistant rename \t"New title"  \r\n@home-assistant close  \r\nthanks',
        "home-assistant",
      ),
    ).toEqual([
      { name: "rename", args: ["New title"] },
      { name: "close", args: [] },
    ]);
    expect(parseCommands("@home-assistant rename   Awesome  ", "home-assistant")).toEqual([
      { name: "rename", args: [], malformed: true },
    ]);
  });

  it("parses a line with a huge whitespace run in linear time", () => {
    const body = `@home-assistant x a${" ".repeat(65_000)}b`;
    const startedAt = performance.now();
    expect(parseCommands(body, "home-assistant")).toEqual([
      { name: "x", args: [], malformed: true },
    ]);
    // Quadratic backtracking takes seconds on this input.
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});

describe("isBotCommand", () => {
  it("matches only line-leading mentions", () => {
    expect(isBotCommand("@home-assistant update", "home-assistant")).toBe(true);
    expect(isBotCommand("see @home-assistant below", "home-assistant")).toBe(false);
    expect(isBotCommand("/home-assistant update", "home-assistant")).toBe(false);
    expect(isBotCommand("@ha-bot update", "home-assistant")).toBe(false);
  });
});

describe("dispatchCommand", () => {
  it("applies the command's effects and reacts +1", async () => {
    const command = noopCommand({
      handle: vi.fn().mockResolvedValue({ effects: [{ type: "setState", state: "closed" }] }),
    });
    const { context, github } = makeContext("@home-assistant ping", {
      registry: registryWith(command),
    });

    await dispatchCommand(context);

    expect(github.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, state: "closed" }),
    );
    expectReaction(github, "+1");
  });

  it("reacts -1 for an unknown command", async () => {
    const { context, github } = makeContext("@home-assistant bogus", {
      registry: registryWith(noopCommand()),
    });

    await dispatchCommand(context);
    expectReaction(github, "-1");
  });

  it("reacts -1 when a required argument is missing", async () => {
    const command = noopCommand({ args: "required" });
    const { context, github } = makeContext("@home-assistant ping", {
      registry: registryWith(command),
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("reacts -1 when a PR-only command targets an issue", async () => {
    const command = noopCommand({ scope: "pull_request" });
    const { context, github } = makeContext("@home-assistant ping", {
      registry: registryWith(command),
      issue: { pull_request: undefined },
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("gates author commands on authorship or org membership", async () => {
    const command = noopCommand({ permission: "author" });
    const github = createFakeGitHub();
    github.orgs.checkMembershipForUser.mockRejectedValue({ status: 404 });
    const { context } = makeContext("@home-assistant ping", {
      github,
      registry: registryWith(command),
      sender: { login: "stranger", type: "User" },
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("allows author commands for the non-member author", async () => {
    const command = noopCommand({ permission: "author" });
    const github = createFakeGitHub();
    github.orgs.checkMembershipForUser.mockRejectedValue({ status: 404 });
    const { context } = makeContext("@home-assistant ping", {
      github,
      registry: registryWith(command),
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("allows author commands for org members who are not the author", async () => {
    const command = noopCommand({ permission: "author" });
    const { context, github } = makeContext("@home-assistant ping", {
      github: createFakeGitHub({ members: ["someoneelse"] }),
      registry: registryWith(command),
      sender: { login: "someoneelse", type: "User" },
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("reacts -1 when the handler throws and logs the failure", async () => {
    const logErrorSpy = vi.spyOn(log, "error").mockImplementation(() => {});
    const command = noopCommand({ handle: vi.fn().mockRejectedValue(new Error("boom")) });
    const { context, github } = makeContext("@home-assistant ping", {
      registry: registryWith(command),
    });

    await dispatchCommand(context);
    expectReaction(github, "-1");

    expect(logErrorSpy).toHaveBeenCalledWith(
      "command failed",
      expect.objectContaining({ command: "ping", error: "Error: boom" }),
    );
    logErrorSpy.mockRestore();
  });

  it("treats a UsageError as a rejection, not a failure", async () => {
    const logInfoSpy = vi.spyOn(log, "info").mockImplementation(() => {});
    const command = noopCommand({
      handle: vi.fn().mockRejectedValue(new UsageError('usage: ping "<arg>"')),
    });
    const { context, github } = makeContext("@home-assistant ping", {
      registry: registryWith(command),
    });

    await dispatchCommand(context);
    expectReaction(github, "-1");

    // Info-level "command rejected", like the pre-run rejections; the global
    // log guard fails this test if "command failed" fires at error level.
    expect(logInfoSpy).toHaveBeenCalledWith(
      "command rejected",
      expect.objectContaining({ command: "ping", reason: 'usage: ping "<arg>"' }),
    );
    logInfoSpy.mockRestore();
  });

  it("ignores bot senders entirely", async () => {
    const command = noopCommand();
    const { context, github } = makeContext("@home-assistant ping", {
      registry: registryWith(command),
      sender: { login: "otherbot[bot]", type: "Bot" },
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expect(github.reactions.createForIssueComment).not.toHaveBeenCalled();
  });

  it("applies a command's label effects without re-dispatching label rules", async () => {
    const onLabeled: Rule = {
      name: "on-labeled",
      description: "",
      events: {
        [EventType.PULL_REQUEST_LABELED]: async (ctx) =>
          ctx.event.label === "foo"
            ? { effects: [{ type: "comment", body: "saw foo" }] }
            : undefined,
      },
    };
    const command = noopCommand({
      handle: vi.fn().mockResolvedValue({ effects: [{ type: "addLabels", labels: ["foo"] }] }),
    });
    const { context, github } = makeContext("@home-assistant ping", {
      registry: registryWith(command, [onLabeled]),
    });

    await dispatchCommand(context);

    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 1, labels: ["foo"] }),
    );
    // Rules never run on command-set labels — they derive their own inputs.
    expect(github.issues.createComment).not.toHaveBeenCalled();
    expectReaction(github, "+1");
  });
});

describe("code_owner permission and commands", () => {
  const originalFetch = globalThis.fetch;

  // The unassign handler still reads the integration manifest.
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        domain: "awesome",
        name: "Awesome",
        codeowners: ["@testuser"],
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** A mock GitHub whose CODEOWNERS makes `owner` own `awesome`, membership 404s. */
  function nonMemberGitHub(owner = "@testuser") {
    const github = createFakeGitHub();
    github.orgs.checkMembershipForUser.mockRejectedValue({ status: 404 });
    github.repos.getContent.mockResolvedValue({
      data: { content: btoa(`/homeassistant/components/awesome/ ${owner}\n`) },
      headers: {},
    });
    return github;
  }

  it("allows a non-member CODEOWNERS owner of the single labeled integration", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const github = nonMemberGitHub();
    const { context } = makeContext("@home-assistant ping", {
      github,
      registry: registryWith(command),
      issue: { labels: [{ name: "integration: awesome" }] },
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("allows org members who are not code owners", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const { context, github } = makeContext("@home-assistant ping", {
      github: createFakeGitHub({ members: ["stranger"] }),
      registry: registryWith(command),
      sender: { login: "stranger", type: "User" },
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("answers membership from the comment's MEMBER association without an API call", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const github = createFakeGitHub();
    github.orgs.checkMembershipForUser.mockRejectedValue(new Error("must not be called"));
    const { context } = makeContext("@home-assistant ping", {
      github,
      registry: registryWith(command),
      senderAssociation: "MEMBER",
    });

    await dispatchCommand(context);
    expect(command.handle).toHaveBeenCalled();
    expect(github.orgs.checkMembershipForUser).not.toHaveBeenCalled();
    expectReaction(github, "+1");
  });

  it("does not trust an OWNER association (personal repos); the API decides", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const github = nonMemberGitHub("@balloob");
    const { context } = makeContext("@home-assistant ping", {
      github,
      registry: registryWith(command),
      issue: { labels: [{ name: "integration: awesome" }] },
      senderAssociation: "OWNER",
    });

    await dispatchCommand(context);
    expect(command.handle).not.toHaveBeenCalled();
    expectReaction(github, "-1");
  });

  it("denies non-member non-code-owners and unlabeled items", async () => {
    const command = noopCommand({ permission: "code_owner" });
    const g1 = nonMemberGitHub();
    const { context: noLabel } = makeContext("@home-assistant ping", {
      github: g1,
      registry: registryWith(command),
    });
    await dispatchCommand(noLabel);
    expectReaction(g1, "-1");

    const g2 = nonMemberGitHub("@balloob");
    const { context: wrongUser } = makeContext("@home-assistant ping", {
      github: g2,
      registry: registryWith(command),
      issue: { labels: [{ name: "integration: awesome" }] },
      sender: { login: "stranger", type: "User" },
    });
    await dispatchCommand(wrongUser);
    expectReaction(g2, "-1");
  });

  it("unassign removes the integration label and its code-owner assignees", async () => {
    const { context, github } = makeContext('@home-assistant unassign "awesome"', {
      registry: registryWith(unassign),
      issue: {
        labels: [{ name: "integration: awesome" }],
        assignees: [{ login: "testuser" }, { login: "someoneelse" }],
      },
    });

    await dispatchCommand(context);

    expect(github.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "integration: awesome" }),
    );
    expect(github.issues.removeAssignees).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ["testuser"] }),
    );
    expectReaction(github, "+1");
  });

  it("remove-label rejects labels that are not set", async () => {
    const command = removeLabel(["needs-more-information"]);
    const { context, github } = makeContext(
      '@home-assistant remove-label "needs-more-information"',
      {
        registry: registryWith(command),
        issue: { labels: [{ name: "integration: awesome" }] },
      },
    );

    await dispatchCommand(context);
    expectReaction(github, "-1");
  });
});
