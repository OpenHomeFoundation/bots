import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { configFlowTests } from "../../../../../src/github/manifests/home-assistant-core/rules/config-flow-tests.js";
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

function prContext() {
  return createMockContext({
    eventType: EventType.ON_DEMAND,
    payload: { pull_request: { head: { sha: "abc123" }, labels: [] } },
  });
}

describe("config-flow-tests", () => {
  it("skips when the config flow is not touched", async () => {
    const context = prContext();
    mockPRFiles(context, [makeFile("homeassistant/components/hue/sensor.py", "modified")]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section).toMatchObject({ id: "config-flow-tests", status: "skip" });
  });

  it("passes when an added config flow comes with tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/config_flow.py"),
      makeFile("tests/components/mydevice/test_config_flow.py"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section).toMatchObject({ id: "config-flow-tests", status: "pass" });
  });

  it("fails when a config flow is added without tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/config_flow.py"),
      makeFile("tests/components/mydevice/test_init.py"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`mydevice`");
    expect(result?.section?.message).toContain("test_config_flow.py");
  });

  it("skips when an existing config flow is modified without tests", async () => {
    const context = prContext();
    mockPRFiles(context, [makeFile("homeassistant/components/hue/config_flow.py", "modified")]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section).toMatchObject({ id: "config-flow-tests", status: "skip" });
  });

  it("does not count another integration's config flow tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/config_flow.py"),
      makeFile("homeassistant/components/deconz/config_flow.py"),
      makeFile("tests/components/deconz/test_config_flow.py"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`hue`");
    expect(result?.section?.message).not.toContain("`deconz`");
  });

  it("skips when the config flow is removed", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/config_flow.py", "removed"),
      makeFile("tests/components/hue/test_config_flow.py", "removed"),
    ]);

    const result = await runRule(configFlowTests, context);
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
    mockPRFiles(context, [makeFile("homeassistant/components/hue/config_flow.py")]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section).toMatchObject({ id: "config-flow-tests", status: "skip" });
  });
});
