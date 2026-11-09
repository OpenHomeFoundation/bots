import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { singleNewPlatform } from "../../../../../src/github/manifests/home-assistant-core/rules/single-new-platform.js";
import { createMockContext, mockPRFiles, runRule } from "../../../helpers/mock-context.js";

function makeFile(filename: string, status = "added", patch?: string) {
  return {
    filename,
    status,
    patch,
    additions: 10,
    deletions: 0,
    changes: 10,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

function prContext(labels: string[] = []) {
  return createMockContext({
    eventType: EventType.ON_DEMAND,
    payload: {
      pull_request: { head: { sha: "abc123" }, labels: labels.map((name) => ({ name })) },
    },
  });
}

describe("single-new-platform", () => {
  it("skips when no platform is added", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py", "modified"),
      makeFile("homeassistant/components/hue/light.py", "modified"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section).toMatchObject({ id: "single-new-platform", status: "skip" });
  });

  it("passes when a single platform is added", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile("homeassistant/components/hue/light.py", "modified"),
      makeFile("tests/components/hue/test_sensor.py"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section).toMatchObject({ id: "single-new-platform", status: "pass" });
    expect(result?.section?.message).toContain("`hue.sensor`");
  });

  it("fails when multiple platforms are added to an existing integration", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile("homeassistant/components/hue/switch.py"),
      makeFile("tests/components/hue/test_sensor.py"),
      makeFile("tests/components/hue/test_switch.py"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("2 new platforms");
    expect(result?.section?.message).toContain("`hue.sensor`");
    expect(result?.section?.message).toContain("`hue.switch`");
  });

  it("fails when platforms are added across different integrations", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile("homeassistant/components/zwave_js/button.py"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section?.status).toBe("fail");
  });

  it("does not count platform tests as platforms", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile("tests/components/hue/test_light.py"),
      makeFile("tests/components/hue/test_switch.py"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section?.status).toBe("pass");
  });

  it("fails when actions are added alongside a new platform", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile(
        "homeassistant/components/hue/services.yaml",
        "modified",
        "@@ -1,2 +1,4 @@\n set_scene:\n   fields:\n+activate_scene:\n+  fields:",
      ),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("new actions (`hue.activate_scene`)");
    expect(result?.section?.message).not.toContain("new platforms");
  });

  it("reports both issues when multiple platforms and actions are added", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile("homeassistant/components/hue/switch.py"),
      makeFile("homeassistant/components/hue/services.yaml", "added", "+activate_scene:"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("2 new platforms");
    expect(result?.section?.message).toContain("`hue.activate_scene`");
  });

  it("passes a new platform that only extends existing actions", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile(
        "homeassistant/components/hue/services.yaml",
        "modified",
        "@@ -3,3 +3,3 @@\n     entity:\n-      domain: light\n+      domain: [light, sensor]",
      ),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section).toMatchObject({ id: "single-new-platform", status: "pass" });
  });

  it("skips actions added without a new platform", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/services.yaml", "modified", "+activate_scene:"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section).toMatchObject({ id: "single-new-platform", status: "skip" });
  });

  it("skips new-integration PRs", async () => {
    const context = prContext(["new-integration"]);
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section).toMatchObject({ id: "single-new-platform", status: "skip" });
  });

  it("skips new integrations detected from an added __init__.py", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("homeassistant/components/mydevice/light.py"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section?.status).toBe("skip");
  });

  it("skips release PRs", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: {
          head: { sha: "abc123", ref: "rc" },
          base: { ref: "master" },
          labels: [],
        },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile("homeassistant/components/hue/switch.py"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section).toMatchObject({ id: "single-new-platform", status: "skip" });
  });

  it("ignores labels other than new-integration", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: {
        label: { name: "bugfix" },
        pull_request: { head: { sha: "abc123" }, labels: [{ name: "bugfix" }] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile("homeassistant/components/hue/switch.py"),
    ]);

    const result = await runRule(singleNewPlatform, context);
    expect(result?.section).toBeUndefined();
  });
});
