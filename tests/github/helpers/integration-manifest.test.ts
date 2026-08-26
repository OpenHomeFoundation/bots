import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIntegrationManifest } from "../../../src/github/helpers/integration-manifest.js";

const HUE = { domain: "hue", name: "Philips Hue", quality_scale: "platinum" };

/** Counts calls; listed domains are served, everything else 404s. */
function mockFetch(byDomain: Record<string, unknown>) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    for (const [domain, body] of Object.entries(byDomain)) {
      if (url.includes(`components/${domain}/manifest.json`)) {
        return { ok: true, status: 200, json: async () => body } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("fetchIntegrationManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("parses the manifest off dev", async () => {
    mockFetch({ hue: HUE });
    expect(await fetchIntegrationManifest("hue")).toMatchObject({
      domain: "hue",
      quality_scale: "platinum",
    });
  });

  it("fetches a domain once however many rules ask for it", async () => {
    const fetch = mockFetch({ hue: HUE });

    await fetchIntegrationManifest("hue");
    await fetchIntegrationManifest("hue");

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent reads into one request", async () => {
    const fetch = mockFetch({ hue: HUE });

    await Promise.all([fetchIntegrationManifest("hue"), fetchIntegrationManifest("hue")]);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a hit for six hours and re-reads after", async () => {
    vi.useFakeTimers();
    const fetch = mockFetch({ hue: HUE });

    await fetchIntegrationManifest("hue");
    vi.advanceTimersByTime(6 * 60 * 60 * 1000 - 1000);
    await fetchIntegrationManifest("hue");
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    await fetchIntegrationManifest("hue");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("expires a miss quickly, so a freshly merged integration shows up", async () => {
    vi.useFakeTimers();
    const fetch = mockFetch({});

    expect(await fetchIntegrationManifest("newdevice")).toBeUndefined();
    await fetchIntegrationManifest("newdevice");
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    mockFetch({ newdevice: { domain: "newdevice", name: "New Device" } });
    expect(await fetchIntegrationManifest("newdevice")).toMatchObject({ domain: "newdevice" });
  });

  it("does not pin a miss when the fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await fetchIntegrationManifest("hue")).toBeUndefined();

    const fetch = mockFetch({ hue: HUE });
    expect(await fetchIntegrationManifest("hue")).toMatchObject({ domain: "hue" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
