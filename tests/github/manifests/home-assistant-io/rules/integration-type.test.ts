import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { domainsFromLabels } from "../../../../../src/github/helpers/integration-domains.js";
import { integrationType } from "../../../../../src/github/manifests/home-assistant-io/rules/integration-type.js";
import { createMockContext, runRule } from "../../../helpers/mock-context.js";

const rule = integrationType({
  domains: async (ctx) => domainsFromLabels(await ctx.target.labels()),
});

const MANIFESTS: Record<string, Record<string, unknown>> = {
  quadrafire: { domain: "quadrafire", name: "Quadra-Fire", integration_type: "virtual" },
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

describe("integration-type", () => {
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

  it("labels a PR about a virtual integration", async () => {
    const result = await runRule(rule, labeled(["quadrafire"]));
    expect(result?.labels).toEqual(["virtual"]);
  });

  it("labels a PR that also covers other integrations", async () => {
    const result = await runRule(rule, labeled(["hue", "quadrafire"]));
    expect(result?.labels).toEqual(["virtual"]);
  });

  it("removes the label once no integration is virtual", async () => {
    const result = await runRule(rule, labeled(["hue"], ["virtual"]));
    expect(result?.removeLabels).toEqual(["virtual"]);
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
