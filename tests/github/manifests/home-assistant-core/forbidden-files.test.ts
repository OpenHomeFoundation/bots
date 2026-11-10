import { describe, expect, it } from "vitest";
import { EventType } from "../../../../src/github/engine/event.js";
import { coreForbiddenFiles } from "../../../../src/github/manifests/home-assistant-core/forbidden-files.js";
import { forbiddenFiles } from "../../../../src/github/rules/forbidden-files.js";
import { createMockContext, mockPRFiles, runRule } from "../../helpers/mock-context.js";

const rule = forbiddenFiles({ files: coreForbiddenFiles });

async function statusFor(filename: string, status: string) {
  const context = createMockContext({
    eventType: EventType.ON_DEMAND,
    payload: { pull_request: { head: { sha: "abc123" }, labels: [] } },
  });
  mockPRFiles(context, [
    {
      filename,
      status,
      additions: 10,
      deletions: 0,
      changes: 10,
      sha: "abc",
      blob_url: "",
      raw_url: "",
      contents_url: "",
    },
  ]);
  return (await runRule(rule, context))?.section?.status;
}

describe("core forbidden files", () => {
  it.each([
    ["homeassistant/components/hue/translations/en.json", "added"],
    ["homeassistant/components/hue/translations/de.json", "modified"],
    ["homeassistant/components/hue/device_trigger.py", "added"],
    ["homeassistant/components/hue/device_action.py", "added"],
    ["homeassistant/components/hue/device_condition.py", "added"],
  ])("forbids %s (%s)", async (filename, status) => {
    expect(await statusFor(filename, status)).toBe("fail");
  });

  it.each([
    ["homeassistant/components/hue/translations/en.json", "removed"],
    ["homeassistant/components/hue/strings.json", "modified"],
    ["homeassistant/components/hue/device_trigger.py", "modified"],
    ["homeassistant/components/hue/v1/device_trigger.py", "added"],
    ["tests/components/hue/test_device_trigger.py", "added"],
  ])("allows %s (%s)", async (filename, status) => {
    expect(await statusFor(filename, status)).toBe("pass");
  });
});
