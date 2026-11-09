import { describe, expect, it } from "vitest";
import { dispatch } from "../../../../../src/github/engine/dispatch.js";
import { EventType } from "../../../../../src/github/engine/event.js";
import type { RegistryConfig } from "../../../../../src/github/engine/types.js";
import { fileShape } from "../../../../../src/github/manifests/home-assistant-core/rules/file-shape.js";
import { newIntegrationValidation } from "../../../../../src/github/manifests/home-assistant-core/rules/new-integration-validation.js";
import {
  createFakeGitHub,
  createMockContext,
  mockPRFiles,
  runRule,
} from "../../../helpers/mock-context.js";

function makeFile(filename: string, status = "added") {
  return {
    filename,
    status,
    additions: 10,
    deletions: 0,
    changes: 10,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

describe("new-integration-validation", () => {
  it("skips when PR has no new-integration label", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "bugfix" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "bugfix" }] },
      },
    });

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section).toMatchObject({
      id: "new-integration-validation",
      status: "skip",
    });
  });

  it("passes when new-integration PR has a single platform", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/config_flow.py"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section).toMatchObject({
      id: "new-integration-validation",
      status: "pass",
    });
  });

  it("fails when multiple platforms added", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("single platform");
  });

  it("fails when brand folder is included", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/brand/icon.png"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("brand");
  });

  it("fails when diagnostics are included", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/diagnostics.py"),
      makeFile("tests/components/mydevice/test_diagnostics.py"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("diagnostics.py");
    expect(result?.section?.message).not.toContain("single platform");
  });

  it("does not flag diagnostics on PRs that don't add a new integration", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-feature" }] },
      },
    });
    mockPRFiles(context, [makeFile("homeassistant/components/mydevice/diagnostics.py")]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section).toMatchObject({ id: "new-integration-validation", status: "skip" });
  });

  it("fails when custom-integration files are in the integration folder", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/README.md"),
      makeFile("homeassistant/components/mydevice/hacs.json"),
      makeFile("homeassistant/components/mydevice/info.md"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`homeassistant/components/mydevice/README.md`");
    expect(result?.section?.message).toContain("`homeassistant/components/mydevice/hacs.json`");
    expect(result?.section?.message).toContain("`homeassistant/components/mydevice/info.md`");
    expect(result?.section?.message).not.toContain("Revert");
  });

  it("does not flag README files nested deeper than the integration folder", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("tests/components/mydevice/fixtures/README.md"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section?.status).toBe("pass");
  });

  it("fails when repository tooling or AI-agent files are changed", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile(".github/copilot-instructions.md", "modified"),
      makeFile("CLAUDE.md", "modified"),
      makeFile("AGENTS.md", "modified"),
      makeFile(".pre-commit-config.yaml", "modified"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section?.status).toBe("fail");
    const message = result?.section?.message;
    expect(message).toContain("`.github/copilot-instructions.md`");
    expect(message).toContain("`CLAUDE.md`");
    expect(message).toContain("`AGENTS.md`");
    expect(message).toContain("`.pre-commit-config.yaml`");
  });

  it("does not flag stray files on PRs that don't add a new integration", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-feature" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("AGENTS.md", "modified"),
      makeFile(".pre-commit-config.yaml", "modified"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section).toMatchObject({ id: "new-integration-validation", status: "skip" });
  });

  it("reports both issues when multiple platforms AND brand folder", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        label: { name: "new-integration" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
      makeFile("homeassistant/components/mydevice/brand/icon.png"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("single platform");
    expect(result?.section?.message).toContain("brand");
  });

  it("skips release PRs", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: {
          head: { sha: "abc123", ref: "rc" },
          base: { ref: "master" },
          labels: [{ name: "new-integration" }],
        },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
    ]);

    const result = await runRule(newIntegrationValidation, context);
    expect(result?.section).toMatchObject({ id: "new-integration-validation", status: "skip" });
  });

  it("listens to PR state and label events plus on_demand", () => {
    expect(Object.keys(newIntegrationValidation.events).sort()).toEqual(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_REOPENED,
        EventType.PULL_REQUEST_EDITED,
        EventType.PULL_REQUEST_LABELED,
        EventType.PULL_REQUEST_UNLABELED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.ON_DEMAND,
      ].sort(),
    );
  });

  it("fires on PR creation when the PR adds a new integration", async () => {
    const github = createFakeGitHub();

    // Payload has no labels; file-shape derives `new-integration` from the
    // added __init__.py and the loop re-dispatches this rule with it.
    const config: RegistryConfig = {
      repositories: {
        "home-assistant/core": {
          rules: [fileShape, newIntegrationValidation],
          commands: [],
          dashboard: true,
        },
      },
    };
    const context = createMockContext({
      registry: config,
      eventType: EventType.PULL_REQUEST_OPENED,
      github,
      payload: { pull_request: { labels: [] } },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
    ]);

    const result = await dispatch(context);

    expect(result.statuses).toContainEqual(
      expect.objectContaining({
        id: "new-integration-validation",
        status: "fail",
        message: expect.stringContaining("single platform"),
      }),
    );
  });
});
