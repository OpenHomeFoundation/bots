import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch } from "../../../../../src/github/engine/dispatch.js";
import { EventType } from "../../../../../src/github/engine/event.js";
import type { RegistryConfig } from "../../../../../src/github/engine/types.js";
import { itemIntegrationDomains } from "../../../../../src/github/manifests/home-assistant-core/helpers/integration-domains.js";
import { platinumApproval } from "../../../../../src/github/manifests/home-assistant-core/rules/platinum-approval.js";
import { qualityScale } from "../../../../../src/github/manifests/home-assistant-core/rules/quality-scale.js";
import { setIntegration } from "../../../../../src/github/rules/set-integration.js";
import {
  createFakeGitHub,
  createMockContext,
  type FakeGitHub,
  mockPRFiles,
  runRule,
} from "../../../helpers/mock-context.js";

/** Manifests served from dev: hue and zha are platinum, mqtt is gold. */
const MANIFESTS: Record<string, Record<string, unknown>> = {
  hue: { domain: "hue", name: "Hue", codeowners: ["@balloob"], quality_scale: "platinum" },
  zha: { domain: "zha", name: "ZHA", codeowners: ["@zhaowner"], quality_scale: "platinum" },
  mqtt: { domain: "mqtt", name: "MQTT", codeowners: ["@mqttowner"], quality_scale: "gold" },
};

function touching(...domains: string[]) {
  return domains.map((d) => ({ filename: `homeassistant/components/${d}/light.py` }));
}

const CODE_QUALITY = "- [x] Code quality improvements to existing code or addition of tests";

function review(login: string, state: string) {
  return { state, user: { login, type: "User" } };
}

describe("platinum-approval", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const domain = String(input).match(/components\/([^/]+)\/manifest\.json/)?.[1] ?? "";
      const manifest = MANIFESTS[domain];
      return manifest ? { ok: true, json: async () => manifest } : { ok: false, status: 404 };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function setup(opts: {
    files: Record<string, unknown>[];
    reviews?: Record<string, unknown>[];
    author?: string;
    association?: string;
    labels?: string[];
    eventType?: EventType;
    member?: boolean;
    body?: string;
  }) {
    const github: FakeGitHub = createFakeGitHub();
    if (opts.member) github.orgs.checkMembershipForUser.mockResolvedValue({ status: 204 });
    github.pulls.listReviews.mockResolvedValue({ data: opts.reviews ?? [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });
    const context = createMockContext({
      eventType: opts.eventType ?? EventType.ON_DEMAND,
      github,
      payload: {
        pull_request: {
          labels: (opts.labels ?? []).map((name) => ({ name })),
          body: opts.body ?? "",
          user: { login: opts.author ?? "contributor" },
          author_association: opts.association ?? "NONE",
          head: { sha: "abc123" },
        },
      },
    });
    mockPRFiles(context, opts.files);
    return runRule(platinumApproval, context);
  }

  it("skips when no touched integration is platinum", async () => {
    const result = await setup({ files: touching("mqtt") });
    expect(result?.section?.status).toBe("skip");
  });

  it("is pending when a platinum integration has no code owner approval", async () => {
    const result = await setup({ files: touching("hue") });
    expect(result?.section?.status).toBe("pending");
    expect(result?.section?.message).toBe(
      "Platinum `hue` — needs approval from a code owner before merging.",
    );
  });

  it("is pending for a PR by an org member too", async () => {
    const result = await setup({ files: touching("hue"), association: "MEMBER" });
    expect(result?.section?.status).toBe("pending");
  });

  it("succeeds when a code owner has approved", async () => {
    const result = await setup({
      files: touching("hue"),
      reviews: [review("balloob", "APPROVED")],
    });
    expect(result?.section?.status).toBe("pass");
    expect(result?.labels).toContain("code-owner-approved");
  });

  it("removes the approval label when the owner approval was dismissed", async () => {
    const result = await setup({
      eventType: EventType.PULL_REQUEST_REVIEW_DISMISSED,
      files: touching("hue"),
      reviews: [review("balloob", "APPROVED"), review("balloob", "DISMISSED")],
      labels: ["code-owner-approved"],
    });
    expect(result?.section?.status).toBe("pending");
    expect(result?.removeLabels).toContain("code-owner-approved");
  });

  it("succeeds when the author is a code owner", async () => {
    const result = await setup({ files: touching("hue"), author: "balloob" });
    expect(result?.section?.status).toBe("pass");
    expect(result?.section?.message).toContain("Authored by a code owner");
  });

  it("still requires approval when a second integration is touched", async () => {
    const result = await setup({ files: touching("hue", "mqtt") });
    expect(result?.section?.status).toBe("pending");
    expect(result?.section?.message).toContain("`hue`");
  });

  it("requires an approval for every platinum integration touched", async () => {
    const result = await setup({
      files: touching("hue", "zha"),
      reviews: [review("balloob", "APPROVED")],
    });
    expect(result?.section?.status).toBe("pending");
    expect(result?.section?.message).toBe(
      "Platinum `zha` — needs approval from a code owner before merging.",
    );
  });

  it("passes once each platinum integration is covered by authorship or approval", async () => {
    const result = await setup({
      files: touching("hue", "zha"),
      author: "balloob",
      reviews: [review("zhaowner", "APPROVED")],
    });
    expect(result?.section?.status).toBe("pass");
  });

  it("enforces on a non-member's code-quality change", async () => {
    const result = await setup({ files: touching("hue"), body: CODE_QUALITY });
    expect(result?.section?.status).toBe("pending");
  });

  it("only warns on a member's code-quality change", async () => {
    const result = await setup({
      files: touching("hue"),
      member: true,
      body: CODE_QUALITY,
      labels: ["code-owner-approved"],
    });
    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toBe(
      "Platinum `hue` — no code-owner approval; not required for a member's code-quality change.",
    );
    expect(result?.removeLabels).toContain("code-owner-approved");
  });

  it("enforces on a member's change not marked as code quality", async () => {
    const result = await setup({
      files: touching("hue"),
      member: true,
      body: "- [x] New feature (which adds functionality to an existing integration)",
    });
    expect(result?.section?.status).toBe("pending");
  });

  it("ignores integration labels the diff no longer backs", async () => {
    const result = await setup({
      files: touching("hue"),
      labels: ["integration: hue", "integration: mqtt", "integration: zwave_js"],
    });
    expect(result?.section?.status).toBe("pending");
  });

  it("skips a platinum integration without code owners", async () => {
    MANIFESTS.nobody = { domain: "nobody", name: "Nobody", quality_scale: "platinum" };
    try {
      const result = await setup({ files: touching("nobody") });
      expect(result?.section?.status).toBe("skip");
    } finally {
      delete MANIFESTS.nobody;
    }
  });

  it("listens to PR state, edit and review events plus on_demand", () => {
    expect(Object.keys(platinumApproval.events).sort()).toEqual(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_REOPENED,
        EventType.PULL_REQUEST_EDITED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.PULL_REQUEST_REVIEW_SUBMITTED,
        EventType.PULL_REQUEST_REVIEW_DISMISSED,
        EventType.ON_DEMAND,
      ].sort(),
    );
  });

  it("fires on PR creation, deriving everything from the PR itself", async () => {
    const github = createFakeGitHub();
    github.pulls.listReviews.mockResolvedValue({ data: [] });
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

    // No platinum-relevant labels on the payload — the rule derives the
    // domain from the changed files and the scale from the manifest itself.
    const config: RegistryConfig = {
      repositories: {
        "home-assistant/core": {
          rules: [
            setIntegration({ domains: itemIntegrationDomains }),
            qualityScale,
            platinumApproval,
          ],
          commands: [],
          dashboard: true,
        },
      },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [], author_association: "NONE" } },
    });
    mockPRFiles(context, [
      { filename: "homeassistant/components/hue/light.py", status: "modified" },
    ]);

    const result = await dispatch(context);

    expect(result.statuses).toContainEqual(
      expect.objectContaining({ id: "code-owner-approval", status: "pending" }),
    );
    expect(github.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: expect.arrayContaining(["integration: hue", "Quality Scale: platinum"]),
      }),
    );
  });
});
