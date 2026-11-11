import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { itemIntegrationDomains } from "../../../src/github/manifests/home-assistant-core/helpers/integration-domains.js";
import { setIntegration } from "../../../src/github/rules/set-integration.js";
import { createMockContext, mockPRFiles, runRule } from "../helpers/mock-context.js";

const rule = setIntegration({ domains: itemIntegrationDomains });
const BOT = { login: "renovate[bot]", type: "Bot" };

// Integrations with a manifest on dev; every other domain 404s.
const ON_DEV = ["hue", "zha"];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const domain = String(input).match(/components\/([^/]+)\/manifest\.json/)?.[1];
      return domain && ON_DEV.includes(domain)
        ? ({ ok: true, status: 200, json: async () => ({ domain, name: domain }) } as Response)
        : ({ ok: false, status: 404, json: async () => ({}) } as Response);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

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

  it("skips directories that are not integrations", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/__init__.py"),
      makeFile("homeassistant/components/not_an_integration/README.md"),
    ]);

    const result = await runRule(rule, context);
    expect(result?.labels).toEqual(["integration: hue"]);
  });

  it("does not label a new integration, even with its manifest", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      makeFile("homeassistant/components/newdevice/manifest.json", { status: "added" }),
    ]);

    expect(await runRule(rule, context)).toBeUndefined();
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
