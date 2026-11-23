import { describe, expect, it } from "vitest";
import { registryConfig } from "../../../src/github/manifests/index.js";

const names = (items: readonly { name: string }[]) => items.map((item) => item.name);

describe("home-assistant/contributors.home-assistant.io", () => {
  it("runs a dashboard and the rules for PRs that belong together", () => {
    const config = registryConfig.repositories["home-assistant/contributors.home-assistant.io"];

    expect(config.dashboard).toBe(true);
    expect(names(config.rules)).toEqual(
      expect.arrayContaining(["belongs-together", "poke-linked", "follow-parent"]),
    );
    expect(names(config.commands)).toEqual(["update", "ignore", "unignore"]);
  });
});
