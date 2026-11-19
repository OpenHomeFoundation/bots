import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { domainsFromLabels } from "../../../../../src/github/helpers/integration-domains.js";
import { qualityScale } from "../../../../../src/github/manifests/home-assistant-io/rules/quality-scale.js";
import { createMockContext, runRule } from "../../../helpers/mock-context.js";

const rule = qualityScale({
  domains: async (ctx) => domainsFromLabels(await ctx.target.labels()),
});

const MANIFESTS: Record<string, Record<string, unknown>> = {
  sensor: {
    domain: "sensor",
    name: "Sensor",
    integration_type: "entity",
    quality_scale: "internal",
  },
  hue: { domain: "hue", name: "Philips Hue", integration_type: "hub", quality_scale: "platinum" },
};

/** A PR just labeled with `domains`' integration labels, already carrying `present`. */
function labeled(domains: string[], present: string[] = []) {
  const labels = [...domains.map((d) => `integration: ${d}`), ...present].map((name) => ({ name }));
  return createMockContext({
    eventType: EventType.PULL_REQUEST_LABELED,
    payload: { label: labels[0], pull_request: { labels } },
  });
}

describe("quality-scale", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (url: string) => {
      const domain = url.match(/components\/(\w+)\/manifest\.json/)?.[1] ?? "";
      const manifest = MANIFESTS[domain];
      return manifest
        ? { ok: true, status: 200, json: async () => manifest }
        : { ok: false, status: 404 };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("labels a PR about an internal integration", async () => {
    const result = await runRule(rule, labeled(["sensor"]));
    expect(result?.labels).toEqual(["internal"]);
  });

  it("labels a PR that also covers other integrations", async () => {
    const result = await runRule(rule, labeled(["hue", "sensor"]));
    expect(result?.labels).toEqual(["internal"]);
  });

  it("removes the label once no integration is internal", async () => {
    const result = await runRule(rule, labeled(["hue"], ["internal"]));
    expect(result?.removeLabels).toEqual(["internal"]);
  });

  it("does nothing for other integrations without the label", async () => {
    expect(await runRule(rule, labeled(["hue"]))).toBeUndefined();
  });

  it("ignores labels other than integration labels", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_LABELED,
      payload: { label: { name: "current" }, pull_request: { labels: [] } },
    });
    expect(await runRule(rule, context)).toBeUndefined();
  });
});
