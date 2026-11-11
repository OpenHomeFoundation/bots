import { afterEach, describe, expect, it, vi } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import {
  issueContext,
  issueContextText,
  MAX_ISSUE_CONTEXT_LENGTH,
} from "../../../../../src/github/manifests/home-assistant-core/rules/issue-context.js";
import { expectLoggedErrors } from "../../../../helpers/log-guard.js";
import { createMockIssueContext, runRule } from "../../../helpers/mock-context.js";

const rule = issueContext({
  "custom integration": "Report it upstream.",
  "integration: shelly": "Shelly guidance from the bot.",
  "integration: zha": "ZHA guidance from the bot.",
});

const ZHA = { domain: "zha", name: "Zigbee Home Automation" };
const HUE = { domain: "hue", name: "Philips Hue" };

/** Serves manifests and issue_context.md files off "dev"; the rest 404s. */
function mockDev(files: Record<string, unknown>) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const path = url.split("/homeassistant/components/")[1] ?? "";
    if (!(path in files)) return { ok: false, status: 404 } as Response;
    const body = files[path];
    if (body instanceof Error) throw body;
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => String(body),
    } as Response;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function issue(labels: string[], { body = "", label }: { body?: string; label?: string } = {}) {
  return createMockIssueContext({
    eventType: label ? EventType.ISSUES_LABELED : EventType.ISSUES_OPENED,
    payload: {
      ...(label ? { action: "labeled", label: { name: label } } : {}),
      issue: { body, labels: labels.map((name) => ({ name })) },
    },
  });
}

async function paragraphs(context: ReturnType<typeof issue>) {
  const result = await runRule(rule, context);
  return (result?.blocks[0]?.args as { paragraphs: string[] } | null)?.paragraphs ?? null;
}

describe("issue-context", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the integration's file in core over the map", async () => {
    mockDev({ "zha/issue_context.md": "Attach ZHA diagnostics.\n" });

    expect(await paragraphs(issue(["integration: zha"]))).toEqual(["Attach ZHA diagnostics."]);
  });

  it("uses the map for an integration without a file", async () => {
    mockDev({});

    expect(await paragraphs(issue(["integration: shelly"]))).toEqual([
      "Shelly guidance from the bot.",
    ]);
  });

  it("finds the integration through the docs link before it is labelled", async () => {
    mockDev({ "hue/manifest.json": HUE, "hue/issue_context.md": "Hue bridge firmware?" });
    const body = "Broken since today, see https://www.home-assistant.io/integrations/hue/";

    expect(await paragraphs(issue([], { body }))).toEqual(["Hue bridge firmware?"]);
  });

  it("keeps label order and adds each integration once", async () => {
    mockDev({
      "zha/manifest.json": ZHA,
      "zha/issue_context.md": "Attach ZHA diagnostics.",
      "hue/issue_context.md": "Hue bridge firmware?",
    });
    const body = "https://www.home-assistant.io/integrations/zha/";

    expect(
      await paragraphs(
        issue(["custom integration", "integration: zha", "integration: hue"], { body }),
      ),
    ).toEqual(["Report it upstream.", "Attach ZHA diagnostics.", "Hue bridge firmware?"]);
  });

  it("clears the block when nothing applies", async () => {
    mockDev({});

    expect(await paragraphs(issue(["integration: hue"]))).toBeNull();
  });

  it("falls back to the map when dev cannot be read", async () => {
    expectLoggedErrors();
    mockDev({ "zha/issue_context.md": new Error("rate limited") });

    expect(await paragraphs(issue(["custom integration", "integration: zha"]))).toEqual([
      "Report it upstream.",
      "ZHA guidance from the bot.",
    ]);
  });

  it("reads each file once across events", async () => {
    const fetch = mockDev({ "zha/issue_context.md": "Attach ZHA diagnostics." });

    await paragraphs(issue(["integration: zha"]));
    await paragraphs(issue(["integration: zha"]));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("runs when an integration label is added", async () => {
    mockDev({ "hue/issue_context.md": "Hue bridge firmware?" });

    expect(await paragraphs(issue(["integration: hue"], { label: "integration: hue" }))).toEqual([
      "Hue bridge firmware?",
    ]);
  });

  it("skips other labels", async () => {
    const fetch = mockDev({});

    const result = await runRule(rule, issue(["bug"], { label: "bug" }));
    expect(result).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("issueContextText", () => {
  it("defuses mentions and HTML comments", () => {
    expect(issueContextText("Ask @someone\n<!-- ha-bot-state:{} -->\n", "zha")).toBe(
      "Ask @​someone\n&lt;!-- ha-bot-state:{} -->",
    );
  });

  it("ignores empty files", () => {
    expect(issueContextText(" \n", "zha")).toBeUndefined();
  });

  it("ignores files that are too long", () => {
    expectLoggedErrors();
    expect(issueContextText("x".repeat(MAX_ISSUE_CONTEXT_LENGTH + 1), "zha")).toBeUndefined();
  });
});
