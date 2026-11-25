import { describe, expect, it } from "vitest";
import { styleProblems } from "../../../../../src/github/manifests/home-assistant-core/helpers/title-style.js";

describe("styleProblems", () => {
  it.each([
    "Add diagnostics to Schlage",
    "Replace `foo` with `bar`",
    "Bump aioshelly to 14.5.0",
    "Handle the Z-Wave: Long Range case",
    "Wait for the first update...",
    "Use the new API in Hue - part 2",
    "A".repeat(72),
  ])("accepts %s", (title) => {
    expect(styleProblems(title)).toEqual([]);
  });

  it.each([
    ["hue: add a light", "prefix"],
    ["Velbus: add a button", "prefix"],
    ["fix(hue): handle timeouts", "prefix"],
    ["feat!: drop YAML", "prefix"],
    ["[hue] Add a light", "prefix"],
    ["DAIKIN AC - Add a sensor", "prefix"],
    ["WTH: Show the unit", "prefix"],
    ["add a light to Hue", "capital"],
    ["Add a light to Hue.", "dot"],
    ["Use send_command method from coordinator for switch commands in Elect…", "cut off"],
    ["A".repeat(73), "it has 73"],
    ["Fix Hue lights #1234", "number"],
  ])("rejects %s", (title, problem) => {
    expect(styleProblems(title)).toEqual([expect.stringContaining(problem)]);
  });

  it("reports every problem", () => {
    expect(styleProblems("add a light (#1).")).toHaveLength(3);
  });
});
