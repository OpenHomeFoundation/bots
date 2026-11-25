import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { title as titleRule } from "../../../../../src/github/manifests/home-assistant-core/rules/title.js";
import { createMockContext, mockPRFiles, runRule } from "../../../helpers/mock-context.js";

const OTHER_BODY = "- [ ] Dependency upgrade\n- [x] New integration (thank you!)\n";

function makeFile(filename: string, patch = "", status = "modified") {
  return { filename, status, additions: 1, deletions: 1, changes: 2, patch };
}

function component(path: string, patch = "", status = "modified") {
  return makeFile(`homeassistant/components/iometer/${path}`, patch, status);
}

async function run({
  eventType = EventType.PULL_REQUEST_OPENED,
  title,
  body = OTHER_BODY,
  author = "testuser",
  sender = author,
  base = "dev",
  files = [component("sensor.py")],
}: {
  eventType?: EventType;
  title: string;
  body?: string;
  author?: string;
  sender?: string;
  base?: string;
  files?: Record<string, unknown>[];
}) {
  const context = createMockContext({
    eventType,
    payload: {
      sender: { login: sender, type: sender.endsWith("[bot]") ? "Bot" : "User" },
      pull_request: { title, body, user: { login: author }, base: { ref: base } },
    },
  });
  mockPRFiles(context, files);
  const result = await runRule(titleRule, context);
  expect(result?.effects).toEqual([]);
  return result?.section;
}

describe("title", () => {
  it("fails style problems in other PRs", async () => {
    const section = await run({ title: "iometer: add a sensor" });
    expect(section?.status).toBe("fail");
    expect(section?.message).toContain("prefix");
  });

  it.each([
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ])("re-evaluates on %s", async (eventType) => {
    expect(await run({ eventType, title: "add a sensor" })).toMatchObject({ status: "fail" });
    expect(await run({ eventType, title: "Add a sensor" })).toMatchObject({ status: "pass" });
  });

  it("skips bot authors, whoever sends the event", async () => {
    const pr = { title: "chore: update", author: "renovate[bot]" };
    expect(await run(pr)).toMatchObject({ status: "skip" });
    expect(
      await run({ ...pr, sender: "maintainer", eventType: EventType.PULL_REQUEST_SYNCHRONIZE }),
    ).toMatchObject({ status: "skip" });
  });

  it("skips reverts", async () => {
    expect(await run({ title: 'Revert "Add flow visibility (#187515)"' })).toMatchObject({
      status: "skip",
    });
  });

  it("skips release PRs", async () => {
    expect(await run({ title: "2026.11.3", base: "master" })).toMatchObject({ status: "skip" });
  });
});
