import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { singleNewIntegration } from "../../../../../src/github/manifests/home-assistant-core/rules/single-new-integration.js";
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

describe("single-new-integration", () => {
  it("skips when no integration is added", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/manifest.json", "modified"),
      makeFile("homeassistant/components/hue/sensor.py"),
    ]);

    const result = await runRule(singleNewIntegration, context);
    expect(result?.section).toMatchObject({ id: "single-new-integration", status: "skip" });
  });

  it("passes when a single integration is added", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/awesome/__init__.py"),
      makeFile("homeassistant/components/awesome/manifest.json"),
      makeFile("tests/components/awesome/__init__.py"),
    ]);

    const result = await runRule(singleNewIntegration, context);
    expect(result?.section).toMatchObject({ id: "single-new-integration", status: "pass" });
    expect(result?.section?.message).toContain("`awesome`");
  });

  it("warns when multiple virtual integrations are added", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/brand_a/manifest.json"),
      makeFile("homeassistant/components/brand_b/manifest.json"),
      makeFile("homeassistant/generated/integrations.json", "modified"),
    ]);

    const result = await runRule(singleNewIntegration, context);
    expect(result?.section?.status).toBe("warn");
    expect(result?.section?.message).toContain("2 new integrations");
    expect(result?.section?.message).toContain("`brand_a`");
    expect(result?.section?.message).toContain("`brand_b`");
  });

  it("warns when a regular and a virtual integration are added together", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/awesome/__init__.py"),
      makeFile("homeassistant/components/awesome/manifest.json"),
      makeFile("homeassistant/components/awesome_brand/manifest.json"),
    ]);

    const result = await runRule(singleNewIntegration, context);
    expect(result?.section?.status).toBe("warn");
  });

  it("ignores manifest fixtures in tests", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/awesome/manifest.json"),
      makeFile("tests/components/awesome/fixtures/manifest.json"),
      makeFile("tests/testing_config/custom_components/test/manifest.json"),
    ]);

    const result = await runRule(singleNewIntegration, context);
    expect(result?.section?.status).toBe("pass");
  });

  it("skips release PRs", async () => {
    const context = createMockContext({
      eventType: EventType.ON_DEMAND,
      payload: {
        pull_request: { head: { sha: "abc123", ref: "rc" }, base: { ref: "master" }, labels: [] },
      },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/brand_a/manifest.json"),
      makeFile("homeassistant/components/brand_b/manifest.json"),
    ]);

    const result = await runRule(singleNewIntegration, context);
    expect(result?.section).toMatchObject({ id: "single-new-integration", status: "skip" });
  });
});
