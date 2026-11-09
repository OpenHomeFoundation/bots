import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { noTranslations } from "../../../../../src/github/manifests/home-assistant-core/rules/no-translations.js";
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

describe("no-translations", () => {
  it("passes when no translation files are included", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/strings.json", "modified"),
      makeFile("homeassistant/components/hue/sensor.py", "modified"),
    ]);

    const result = await runRule(noTranslations, context);
    expect(result?.section).toMatchObject({ id: "no-translations", status: "pass" });
  });

  it("fails when a translation file is added", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/strings.json", "modified"),
      makeFile("homeassistant/components/hue/translations/en.json"),
    ]);

    const result = await runRule(noTranslations, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain(
      "`homeassistant/components/hue/translations/en.json`",
    );
  });

  it("fails when a translation file is modified", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/translations/nl.json", "modified"),
    ]);

    const result = await runRule(noTranslations, context);
    expect(result?.section?.status).toBe("fail");
  });

  it("passes when translation files are only removed", async () => {
    const context = prContext();
    mockPRFiles(context, [
      makeFile("homeassistant/components/hue/translations/en.json", "removed"),
    ]);

    const result = await runRule(noTranslations, context);
    expect(result?.section?.status).toBe("pass");
  });

  it("truncates long file lists", async () => {
    const context = prContext();
    mockPRFiles(
      context,
      ["de", "en", "fr", "nl", "pl", "pt", "sv"].map((lang) =>
        makeFile(`homeassistant/components/hue/translations/${lang}.json`),
      ),
    );

    const result = await runRule(noTranslations, context);
    expect(result?.section?.status).toBe("fail");
    expect(result?.section?.message).toContain("and 2 more");
  });

  it("ignores translations folders outside integrations", async () => {
    const context = prContext();
    mockPRFiles(context, [makeFile("tests/components/hue/translations/en.json")]);

    const result = await runRule(noTranslations, context);
    expect(result?.section?.status).toBe("pass");
  });
});
