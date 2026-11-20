import { afterEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { integrationTopRank } from "../../../../../src/github/manifests/home-assistant-core/rules/integration-top-rank.js";
import { createMockContext, mockPRFiles, runRule } from "../../../helpers/mock-context.js";

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

/** Serves install counts and `integrations.json`; every domain is a hub unless typed. */
function mockAnalytics(integrations: Record<string, number>, types: Record<string, string> = {}) {
  const details = Object.fromEntries(
    Object.keys(integrations).map((domain) => [
      domain,
      { integration_type: types[domain] ?? "hub" },
    ]),
  );
  globalThis.fetch = vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes("integrations.json") ? details : { integrations }),
  }));
}

describe("integration-top-rank", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("adds Top labels for a touched popular integration that isn't core or new", async () => {
    mockAnalytics({ hue: 100000 });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/sensor.py")]);

    const result = await runRule(integrationTopRank, context);
    expect(result?.labels).toContain("Top 50");
    expect(result?.labels).toContain("Top 100");
    expect(result?.labels).toContain("Top 200");
  });

  it("does not add Top labels for PRs touching core", async () => {
    mockAnalytics({ mqtt: 100000 });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/core.py")]);

    const result = await runRule(integrationTopRank, context);
    expect(result).toBeUndefined();
  });

  it("does not add Top labels when the PR adds a new integration", async () => {
    mockAnalytics({ newdevice: 100000 });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("homeassistant/components/newdevice/__init__.py", { status: "added" }),
      makeFile("homeassistant/components/newdevice/manifest.json", { status: "added" }),
    ]);

    const result = await runRule(integrationTopRank, context);
    expect(result).toBeUndefined();
  });

  it("adds no labels when the touched integration isn't popular enough", async () => {
    mockAnalytics({ hue: 100000 });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/obscure/sensor.py")]);

    const result = await runRule(integrationTopRank, context);
    expect(result).toBeUndefined();
  });

  it("ranks only the integration types the analytics page ranks", async () => {
    const installs = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`hub${i}`, 1000 - i] as const),
    );
    mockAnalytics({ automation: 100000, ...installs }, { automation: "system" });

    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/hub49/sensor.py")]);
    expect((await runRule(integrationTopRank, context))?.labels).toContain("Top 50");

    const automation = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(automation, [makeFile("homeassistant/components/automation/__init__.py")]);
    expect(await runRule(integrationTopRank, automation)).toBeUndefined();
  });
});
