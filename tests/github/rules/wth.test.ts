import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { wth } from "../../../src/github/rules/wth.js";
import { createMockContext, runRule } from "../helpers/mock-context.js";

describe("wth", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("labels WTH when forum link has matching category_id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ category_id: 56 }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "Fixes https://community.home-assistant.io/t/some-wth/12345",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toMatchObject({ labels: ["WTH"] });
  });

  it("labels WTH for alternative category_id 61", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ category_id: 61 }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "Fixes https://community.home-assistant.io/t/another-wth/99",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toMatchObject({ labels: ["WTH"] });
  });

  it("does not label when category_id does not match", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ category_id: 10 }),
    });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "See https://community.home-assistant.io/t/feature-request/100",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toBeUndefined();
  });

  it("does not label when no forum links in body", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "Just a regular PR",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("handles fetch errors gracefully", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "See https://community.home-assistant.io/t/topic/1",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toBeUndefined();
  });

  it("handles non-ok responses gracefully", async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_OPENED,
      payload: {
        pull_request: {
          body: "See https://community.home-assistant.io/t/topic/1",
          head: { sha: "abc123" },
        },
      },
    });

    const result = await runRule(wth, context);
    expect(result).toBeUndefined();
  });
});
