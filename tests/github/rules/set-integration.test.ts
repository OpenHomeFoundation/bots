import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { itemIntegrationDomains } from "../../../src/github/manifests/home-assistant-core/helpers/integration-domains.js";
import { setIntegration } from "../../../src/github/rules/set-integration.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

const rule = setIntegration({ domains: itemIntegrationDomains });
const BOT = { login: "renovate[bot]", type: "Bot" };

function makeFile(filename: string, overrides: { status?: string; additions?: number } = {}) {
  return {
    filename,
    status: overrides.status ?? "modified",
    additions: overrides.additions ?? 10,
    deletions: 0,
    changes: overrides.additions ?? 10,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

describe("set-integration", () => {
  it("adds integration label for component files", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/__init__.py")]);

    const result = await runRule(rule, context);
    expect(result?.labels).toContain("integration: hue");
  });

  it("caps integration labels at 5", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("homeassistant/components/a/__init__.py"),
      makeFile("homeassistant/components/b/__init__.py"),
      makeFile("homeassistant/components/c/__init__.py"),
      makeFile("homeassistant/components/d/__init__.py"),
      makeFile("homeassistant/components/e/__init__.py"),
      makeFile("homeassistant/components/f/__init__.py"),
    ]);

    const result = await runRule(rule, context);
    expect(result?.labels).toBeUndefined();
  });

  it("returns nothing for an empty file list", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, []);

    const result = await runRule(rule, context);
    expect(result).toBeUndefined();
  });

  it("adds only the labels the item doesn't have yet", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      payload: { pull_request: { labels: [{ name: "integration: hue" }] } },
    });
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/light.py"),
      makeFile("homeassistant/components/zha/light.py"),
    ]);

    const result = await runRule(rule, context);
    expect(result?.labels).toEqual(["integration: zha"]);
  });

  it("labels bot PRs", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: { sender: BOT },
    });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/manifest.json")]);

    const result = await runRule(rule, context);
    expect(result?.labels).toEqual(["integration: hue"]);
  });
});
