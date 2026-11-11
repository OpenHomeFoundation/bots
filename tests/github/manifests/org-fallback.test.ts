import { describe, expect, it, vi } from "vitest";
import { CLA_COMMENT_MARKER, CLA_STATUS_CONTEXT } from "../../../src/cla/rule.js";
import type { ClaStore } from "../../../src/cla/store.js";
import { isStatusComment } from "../../../src/github/engine/status/render.js";
import { STATUS_CHECK_CONTEXT } from "../../../src/github/engine/status-sync.js";
import { homeAssistantOrgRules } from "../../../src/github/manifests/home-assistant-org.js";
import { registryConfig } from "../../../src/github/manifests/index.js";
import { DRAFT_ON_CHANGES_REQUESTED_MARKER } from "../../../src/github/rules/draft-on-changes-requested.js";
import { createE2EHarness, prOpenedPayload } from "../helpers/e2e.js";
import { createMockContext } from "../helpers/mock-context.js";

// The production store reads Postgres; here nobody has signed.
vi.mock("../../../src/cla/store.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postgresClaStore: (): ClaStore => ({
    hasSigned: async () => false,
    recordPendingSigners: async () => {},
    getPendingSigner: async () => undefined,
    deletePendingSigner: async () => {},
    recordSignature: async () => {},
  }),
}));

function repository(fullName: string) {
  const [owner, name] = fullName.split("/");
  return { full_name: fullName, name, owner: { login: owner } };
}

function contextFor(fullName: string) {
  return createMockContext({
    registry: registryConfig,
    payload: { repository: repository(fullName) },
  });
}

const names = (items: readonly { name: string }[]) => items.map((item) => item.name);

describe("org fallback", () => {
  it.each([
    "home-assistant/apps",
    "home-assistant/installer",
    "home-assistant/os-agent",
    "home-assistant/cli",
    "home-assistant/contributors.home-assistant.io",
  ])("runs the home-assistant org rules on %s, without a dashboard", (repo) => {
    const { repoConfig } = contextFor(repo);

    expect(names(repoConfig.rules)).toEqual(names(homeAssistantOrgRules));
    expect(names(repoConfig.commands)).toEqual(["update"]);
    expect(repoConfig.dashboard).toBeUndefined();
  });

  it.each(["esphome/esphome", "esphome/esphome.io", "esphome/devices.esphome.io"])(
    "runs the esphome org rules on %s, without a dashboard",
    (repo) => {
      const { repoConfig } = contextFor(repo);

      expect(names(repoConfig.rules)).toEqual(["draft-on-changes-requested", "ready-for-review"]);
      expect(names(repoConfig.commands)).toEqual(["update"]);
      expect(repoConfig.dashboard).toBeUndefined();
    },
  );

  it("prefers a repo's own manifest over its org's", () => {
    const { repoConfig } = contextFor("home-assistant/frontend");

    expect(repoConfig).toBe(registryConfig.repositories["home-assistant/frontend"]);
    expect(names(repoConfig.commands)).toEqual(["update", "ignore", "unignore"]);
  });

  it("runs nothing in other orgs", () => {
    const { repoConfig } = contextFor("OHF-Voice/intents");

    expect(repoConfig.rules).toEqual([]);
    expect(repoConfig.commands).toEqual([]);
  });

  it("gates an unsigned contributor's PR with the cla-bot status, never a dashboard", async () => {
    const harness = createE2EHarness({ config: registryConfig });
    harness.github.pulls.listCommits.mockResolvedValue({
      data: [
        {
          sha: "abc123",
          author: { login: "never-signed", type: "User" },
          commit: { author: { email: "never-signed@example.com" } },
        },
      ],
    });

    const res = await harness.deliver(
      "pull_request",
      prOpenedPayload({
        repository: repository("home-assistant/apps"),
        sender: { login: "never-signed", type: "User" },
        pull_request: {
          number: 1,
          node_id: "PR_1",
          state: "open",
          head: { sha: "abc123" },
          base: { ref: "main" },
          labels: [],
          body: "",
          user: { login: "never-signed" },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(harness.github.repos.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ context: CLA_STATUS_CONTEXT, state: "failure" }),
    );
    expect(harness.github.repos.createCommitStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ context: STATUS_CHECK_CONTEXT }),
    );
    expect(harness.github.comments.map((c) => c.body)).toEqual([
      expect.stringContaining(CLA_COMMENT_MARKER),
    ]);
    expect(harness.github.comments.some((c) => isStatusComment(c.body))).toBe(false);
  });

  it("drafts an esphome.io PR on a member's changes-requested review", async () => {
    const harness = createE2EHarness({ config: registryConfig });
    harness.github.world.members = ["reviewer"];

    const res = await harness.deliver("pull_request_review", {
      action: "submitted",
      sender: { login: "reviewer", type: "User" },
      repository: repository("esphome/esphome.io"),
      review: { state: "changes_requested", user: { login: "reviewer", type: "User" } },
      pull_request: {
        number: 5,
        node_id: "PR_5",
        state: "open",
        draft: false,
        head: { sha: "def456" },
        base: { ref: "current" },
        labels: [],
        body: "",
        user: { login: "contributor" },
      },
    });

    expect(res.status).toBe(200);
    expect(harness.github.graphql).toHaveBeenCalledWith(
      expect.stringContaining("convertPullRequestToDraft"),
      expect.anything(),
    );
    expect(harness.github.comments.map((c) => c.body)).toEqual([
      expect.stringContaining(DRAFT_ON_CHANGES_REQUESTED_MARKER),
    ]);
    expect(harness.github.comments[0]?.body).toContain("https://esphome.io/guides/contributing");
  });
});
