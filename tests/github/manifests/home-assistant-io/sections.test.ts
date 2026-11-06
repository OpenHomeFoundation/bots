import { describe, expect, it } from "vitest";
import {
  isKnownSection,
  SECTIONS,
  sectionLabel,
  sectionOf,
  UNLABELED,
} from "../../../../src/github/manifests/home-assistant-io/sections.js";

describe("io sections", () => {
  it("takes the first segment, or the first two under /docs/", () => {
    expect(sectionOf("/installation/raspberrypi/")).toBe("installation");
    expect(sectionOf("/docs/energy/solar-panels/")).toBe("docs/energy");
    expect(sectionOf("/docs/")).toBe("docs");
    expect(sectionOf("/")).toBe("");
  });

  it("labels pages by their section", () => {
    expect(sectionLabel("/building-blocks/choose/")).toBe("section: automation");
    expect(sectionLabel("/docs/z-wave/controllers/")).toBe("section: z-wave");
    expect(sectionLabel("/integrations/hue/")).toBeUndefined();
  });

  it("lists every section once", () => {
    const all = [...Object.values(SECTIONS).flat(), ...UNLABELED];
    expect(all.filter((section, i) => all.indexOf(section) !== i)).toEqual([]);
  });

  it("knows labeled and deliberately unlabeled sections only", () => {
    expect(isKnownSection("docs/templating")).toBe(true);
    expect(isKnownSection("integrations")).toBe(true);
    expect(isKnownSection("")).toBe(true);
    expect(isKnownSection("docs/new-thing")).toBe(false);
  });
});
