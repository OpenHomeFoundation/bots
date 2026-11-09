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

function makeFile(filename: string, status = "added", patch?: string) {
  return {
    filename,
    status,
    ...(patch === undefined ? {} : { patch }),
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

  describe("reauth and reconfigure flows", () => {
    const FLOW_HEADER = [
      "@@ -0,0 +1,20 @@",
      "+class MyDeviceConfigFlow(ConfigFlow, domain=DOMAIN):",
      "+    async def async_step_user(self, user_input=None):",
      "+        pass",
    ];

    function newIntegrationContext(github = createFakeGitHub()) {
      return createMockContext({
        eventType: EventType.ON_DEMAND,
        github,
        payload: {
          pull_request: { head: { sha: "abc123" }, labels: [{ name: "new-integration" }] },
        },
      });
    }

    it("fails when the config flow adds a reauth flow", async () => {
      const context = newIntegrationContext();
      mockPRFiles(context, [
        makeFile("homeassistant/components/mydevice/__init__.py"),
        makeFile(
          "homeassistant/components/mydevice/config_flow.py",
          "added",
          [
            ...FLOW_HEADER,
            "+    async def async_step_reauth(self, entry_data):",
            "+        return await self.async_step_reauth_confirm()",
            "+    async def async_step_reauth_confirm(self, user_input=None):",
            "+        pass",
          ].join("\n"),
        ),
      ]);

      const result = await runRule(newIntegrationValidation, context);
      expect(result?.section?.status).toBe("fail");
      expect(result?.section?.message).toContain("`reauth` flow");
      expect(result?.section?.message).not.toContain("reconfigure");
    });

    it("fails when the config flow adds a reconfigure flow", async () => {
      const context = newIntegrationContext();
      mockPRFiles(context, [
        makeFile("homeassistant/components/mydevice/__init__.py"),
        makeFile(
          "homeassistant/components/mydevice/config_flow.py",
          "added",
          [
            ...FLOW_HEADER,
            "+    async def async_step_reconfigure(self, user_input=None):",
            "+        pass",
          ].join("\n"),
        ),
      ]);

      const result = await runRule(newIntegrationValidation, context);
      expect(result?.section?.status).toBe("fail");
      expect(result?.section?.message).toContain("`reconfigure` flow");
    });

    it("names both flows when both are added", async () => {
      const context = newIntegrationContext();
      mockPRFiles(context, [
        makeFile("homeassistant/components/mydevice/__init__.py"),
        makeFile(
          "homeassistant/components/mydevice/config_flow.py",
          "added",
          [
            ...FLOW_HEADER,
            "+    async def async_step_reconfigure(self, user_input=None):",
            "+        pass",
            "+    async def async_step_reauth(self, entry_data):",
            "+        pass",
          ].join("\n"),
        ),
      ]);

      const result = await runRule(newIntegrationValidation, context);
      expect(result?.section?.status).toBe("fail");
      expect(result?.section?.message).toContain("`reauth` and `reconfigure` flows");
    });

    it("passes when the config flow only has a user step", async () => {
      const context = newIntegrationContext();
      mockPRFiles(context, [
        makeFile("homeassistant/components/mydevice/__init__.py"),
        makeFile(
          "homeassistant/components/mydevice/config_flow.py",
          "added",
          FLOW_HEADER.join("\n"),
        ),
      ]);

      const result = await runRule(newIntegrationValidation, context);
      expect(result?.section?.status).toBe("pass");
    });

    it("reads the file at the head commit when GitHub omits the patch", async () => {
      const github = createFakeGitHub({
        contents: {
          "homeassistant/components/mydevice/config_flow.py": [
            "class MyDeviceConfigFlow(ConfigFlow, domain=DOMAIN):",
            "    async def async_step_reauth(self, entry_data):",
            "        pass",
          ].join("\n"),
        },
      });
      const context = newIntegrationContext(github);
      mockPRFiles(context, [
        makeFile("homeassistant/components/mydevice/__init__.py"),
        makeFile("homeassistant/components/mydevice/config_flow.py"),
      ]);

      const result = await runRule(newIntegrationValidation, context);
      expect(result?.section?.status).toBe("fail");
      expect(result?.section?.message).toContain("`reauth` flow");
    });
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
