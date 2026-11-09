import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { noDeviceAutomations } from "../../../../../src/github/manifests/home-assistant-core/rules/no-device-automations.js";
import { createMockContext, mockPRFiles, runRule } from "../../../helpers/mock-context.js";

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

function prContext(labels: string[] = []) {
  return createMockContext({
    eventType: EventType.ON_DEMAND,
    payload: {
      pull_request: { head: { sha: "abc123" }, labels: labels.map((name) => ({ name })) },
    },
  });
}

describe("no-device-automations", () => {
  it("passes when no device automation is added", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/sensor.py"),
      makeFile("homeassistant/components/hue/light.py", "modified"),
    ]);

    const result = await runRule(noDeviceAutomations, context);
    expect(result?.section).toMatchObject({ id: "no-device-automations", status: "pass" });
  });

  it.each(["device_trigger.py", "device_action.py", "device_condition.py"])(
    "fails when %s is added",
    async (filename) => {
      const context = prContext();
      mockPRFiles(context, [makeFile(`homeassistant/components/hue/${filename}`)]);

      const result = await runRule(noDeviceAutomations, context);
      expect(result?.section?.status).toBe("fail");
      expect(result?.section?.message).toContain(`\`homeassistant/components/hue/${filename}\``);
    },
  );

  it("lists every added device automation", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/device_trigger.py"),
      makeFile("homeassistant/components/zwave_js/device_action.py"),
    ]);

    const result = await runRule(noDeviceAutomations, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("hue/device_trigger.py");
    expect(result?.section?.message).toContain("zwave_js/device_action.py");
  });

  it("fails on new-integration PRs too", async () => {
    const context = prContext(["new-integration"]);
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/device_condition.py"),
    ]);

    const result = await runRule(noDeviceAutomations, context);
    expect(result?.section?.status).toBe("fail");
  });

  it("passes when existing device automations are modified or removed", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/device_trigger.py", "modified"),
      makeFile("homeassistant/components/hue/device_action.py", "removed"),
    ]);

    const result = await runRule(noDeviceAutomations, context);
    expect(result?.section?.status).toBe("pass");
  });

  it("ignores tests for device automations", async () => {
    const context = prContext();
    mockPRFiles(context, [makeFile("tests/components/hue/test_device_trigger.py")]);

    const result = await runRule(noDeviceAutomations, context);
    expect(result?.section?.status).toBe("pass");
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
    mockPRFiles(context, [makeFile("homeassistant/components/hue/device_trigger.py")]);

    const result = await runRule(noDeviceAutomations, context);
    expect(result?.section).toMatchObject({ id: "no-device-automations", status: "skip" });
  });
});
