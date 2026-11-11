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
    ["home-assistant/home-assistant.io", "home-assistant/core"],
    ["home-assistant/home-assistant.io", "home-assistant/frontend"],
    ["home-assistant/contributors.home-assistant.io", "home-assistant/supervisor"],
    ["home-assistant/contributors.home-assistant.io", "home-assistant/android"],
    ["home-assistant/companion.home-assistant", "home-assistant/iOS"],
    ["home-assistant/brands", "home-assistant/core"],
    ["Home-Assistant/Brands", "home-assistant/CORE"],
  ])("%s follows %s", (follower, code) => {
    expect(relation(follower, code)).toBe("parent");
    expect(relation(code, follower)).toBe("child");
  });

  it.each([
    ["two code repos", "home-assistant/core", "home-assistant/frontend"],
    ["two docs repos", "home-assistant/home-assistant.io", "home-assistant/brands"],
    [
      "docs and code it doesn't document",
      "home-assistant/companion.home-assistant",
      "home-assistant/core",
    ],
    ["brands and frontend", "home-assistant/brands", "home-assistant/frontend"],
    ["intents", "home-assistant/core", "OHF-Voice/intents"],
    ["a library", "home-assistant/core", "home-assistant-libs/python-supervisor-client"],
    ["ESPHome", "home-assistant/core", "esphome/esphome"],
  ])("doesn't pair %s", (_, self, other) => {
    expect(relation(self, other)).toBeNull();
    expect(relation(other, self)).toBeNull();
  });
});
