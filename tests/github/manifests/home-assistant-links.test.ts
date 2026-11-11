import { describe, expect, it } from "vitest";
import { homeAssistantPrLinks } from "../../../src/github/manifests/home-assistant-org.js";

const repo = (slug: string) => {
  const [owner, name] = slug.split("/");
  return { owner, repo: name };
};
const relation = (self: string, other: string) =>
  homeAssistantPrLinks.relationOf(repo(self), repo(other));

describe("homeAssistantPrLinks.relationOf", () => {
  it.each([
    ["home-assistant/core", "home-assistant/frontend", "sibling"],
    ["home-assistant/core", "OHF-Voice/intents", "sibling"],
    ["home-assistant/core", "home-assistant/home-assistant.io", "child"],
    ["home-assistant/frontend", "home-assistant/my.home-assistant.io", "child"],
    ["home-assistant/home-assistant.io", "home-assistant/core", "parent"],
    ["home-assistant/brands", "home-assistant/core", "parent"],
    ["home-assistant/home-assistant.io", "home-assistant/brands", "sibling"],
    ["home-assistant/my.home-assistant.io", "home-assistant/frontend", "parent"],
    ["Home-Assistant/Core", "home-assistant/IOS", "sibling"],
  ])("%s → %s is %s", (self, other, expected) => {
    expect(relation(self, other)).toBe(expected);
  });

  it.each([
    [
      "a library in another org",
      "home-assistant/core",
      "home-assistant-libs/python-supervisor-client",
    ],
    ["ESPHome", "home-assistant/core", "esphome/esphome"],
    [
      "a library in the org",
      "home-assistant/frontend",
      "home-assistant/home-assistant-js-websocket",
    ],
    [
      "docs and a My Home Assistant link",
      "home-assistant/home-assistant.io",
      "home-assistant/my.home-assistant.io",
    ],
  ])("doesn't pair %s", (_, self, other) => {
    expect(relation(self, other)).toBeNull();
  });
});
