import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { configFlowTests } from "../../../../../src/github/manifests/home-assistant-core/rules/config-flow-tests.js";
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

function prContext(contents: Record<string, string> = {}, pr: Record<string, unknown> = {}) {
  return createMockContext({
    github: createFakeGitHub({ contents }),
    eventType: EventType.ON_DEMAND,
    payload: { pull_request: { head: { sha: "abc123" }, labels: [], ...pr } },
  });
}

describe("config-flow-tests", () => {
  it("skips when no config flow is added", async () => {
    const context = prContext();
    mockPRFiles(context, [makeFile("homeassistant/components/hue/config_flow.py", "modified")]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section).toMatchObject({ id: "config-flow-tests", status: "skip" });
  });

  it("passes when the PR adds config flow tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/config_flow.py"),
      makeFile("tests/components/hue/test_config_flow.py"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section).toMatchObject({ id: "config-flow-tests", status: "pass" });
    expect(result?.section?.message).toContain("`hue`");
  });

  it("passes when the PR modifies existing config flow tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/config_flow.py"),
      makeFile("tests/components/hue/test_config_flow_options.py", "modified"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("pass");
  });

  it("passes when config flow tests already exist at the head commit", async () => {
    const context = prContext({ "tests/components/hue/test_config_flow.py": "def test(): ..." });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/config_flow.py")]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("pass");
  });

  it("fails when a config flow is added without tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/config_flow.py"),
      makeFile("tests/components/hue/test_init.py"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`tests/components/hue/test_config_flow.py`");
  });

  it("fails for a new integration without config flow tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/mydevice/__init__.py"),
      makeFile("homeassistant/components/mydevice/config_flow.py"),
      makeFile("homeassistant/components/mydevice/sensor.py"),
      makeFile("tests/components/mydevice/test_sensor.py"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`tests/components/mydevice/test_config_flow.py`");
  });

  it("does not count another integration's config flow tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/config_flow.py"),
      makeFile("tests/components/zwave_js/test_config_flow.py", "modified"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`tests/components/hue/test_config_flow.py`");
    expect(result?.section?.message).not.toContain("zwave_js");
  });

  it("does not count removed config flow tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/config_flow.py"),
      makeFile("tests/components/hue/test_config_flow.py", "removed"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("fail");
  });

  it("lists only the integrations missing tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/config_flow.py"),
      makeFile("tests/components/hue/test_config_flow.py"),
      makeFile("homeassistant/components/zwave_js/config_flow.py"),
    ]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("`tests/components/zwave_js/test_config_flow.py`");
    expect(result?.section?.message).not.toContain("tests/components/hue/");
  });

  it("ignores a config_flow.py nested in a subpackage", async () => {
    const context = prContext();
    mockPRFiles(context, [makeFile("homeassistant/components/hue/v2/config_flow.py")]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section?.status).toBe("skip");
  });

  it("skips release PRs", async () => {
    const context = prContext({}, { head: { sha: "abc123", ref: "rc" }, base: { ref: "master" } });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/config_flow.py")]);

    const result = await runRule(configFlowTests, context);
    expect(result?.section).toMatchObject({ id: "config-flow-tests", status: "skip" });
  });
});
