import { describe, expect, it, vi } from "vitest";
import { parseCodeOwners } from "../../../../../src/github/engine/model/codeowners.js";
import { ParsedPath } from "../../../../../src/github/manifests/home-assistant-core/helpers/parse-path.js";
import { log } from "../../../../../src/log.js";

const ENTITY_PLATFORMS = new Set([
  "light",
  "sensor",
  "binary_sensor",
  "switch",
  "climate",
  "cover",
]);
// mqtt is core-team owned; custom_thing/hue are not.
const CODEOWNERS_ENTRIES = parseCodeOwners(
  "/homeassistant/components/mqtt/ @home-assistant/core\n",
);

function makeParsed(
  filename: string,
  overrides: {
    status?: ConstructorParameters<typeof ParsedPath>[0]["status"];
    additions?: number;
  } = {},
): ParsedPath {
  return new ParsedPath(
    {
      filename,
      status: overrides.status ?? "modified",
      additions: overrides.additions ?? 10,
      deletions: 0,
      changes: overrides.additions ?? 10,
      sha: "abc",
      blob_url: "",
      raw_url: "",
      contents_url: "",
      patch: "",
    },
    ENTITY_PLATFORMS,
    CODEOWNERS_ENTRIES,
  );
}

describe("ParsedPath", () => {
  describe("component files", () => {
    it("detects a component __init__.py", () => {
      const p = makeParsed("homeassistant/components/hue/__init__.py");
      expect(p.type).toBe("component");
      expect(p.component).toBe("hue");
      expect(p.platform).toBeNull();
    });

    it("detects a component config_flow.py", () => {
      const p = makeParsed("homeassistant/components/hue/config_flow.py");
      expect(p.type).toBe("component");
      expect(p.component).toBe("hue");
    });
  });

  describe("platform files", () => {
    it("detects a platform file (light.py)", () => {
      const p = makeParsed("homeassistant/components/hue/light.py");
      expect(p.type).toBe("platform");
      expect(p.component).toBe("hue");
      expect(p.platform).toBe("light");
    });

    it("detects sensor platform", () => {
      const p = makeParsed("homeassistant/components/hue/sensor.py");
      expect(p.type).toBe("platform");
      expect(p.platform).toBe("sensor");
    });
  });

  describe("test files", () => {
    it("detects a test file", () => {
      const p = makeParsed("tests/components/hue/test_light.py");
      expect(p.type).toBe("test");
      expect(p.component).toBe("hue");
    });

    it("detects platform from test filename", () => {
      const p = makeParsed("tests/components/hue/test_sensor.py");
      expect(p.type).toBe("test");
      expect(p.platform).toBe("sensor");
    });

    it("does not set platform for non-entity test files", () => {
      const p = makeParsed("tests/components/hue/test_config_flow.py");
      expect(p.type).toBe("test");
      expect(p.platform).toBeNull();
    });
  });

  describe("core files", () => {
    it("detects core helper files", () => {
      const p = makeParsed("homeassistant/helpers/entity.py");
      expect(p.type).toBe("helpers");
      expect(p.core).toBe(true);
    });

    it("detects core .py files at subfolder level", () => {
      const p = makeParsed("homeassistant/core.py");
      expect(p.type).toBe("core");
      expect(p.core).toBe(true);
    });
  });

  describe("special file types", () => {
    it("detects brand files", () => {
      const p = makeParsed("homeassistant/components/hue/brand/icon.png");
      expect(p.type).toBe("brand");
      expect(p.component).toBe("hue");
    });

    it("detects services.yaml", () => {
      const p = makeParsed("homeassistant/components/hue/services.yaml");
      expect(p.type).toBe("services");
      expect(p.component).toBe("hue");
    });
  });

  describe("non-matching files", () => {
    it("returns null type for files outside homeassistant/tests", () => {
      const p = makeParsed("README.md");
      expect(p.type).toBeNull();
      expect(p.component).toBeNull();
      expect(p.core).toBe(false);
    });

    it.each([
      "tests/pylint/test_enforce_type_hints.py",
      "tests/mypy_plugins/test_enum_identity_compare.py",
    ])("returns null type for tooling tests without warning (%s)", (filename) => {
      // The log guard fails the test on an unexpected warning.
      const p = makeParsed(filename);
      expect(p.type).toBeNull();
      expect(p.component).toBeNull();
    });

    it("warns about an unrecognized top-level subfolder", () => {
      const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
      const p = makeParsed("homeassistant/brand_new_folder/thing.py");
      expect(p.type).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        "parse-path: unrecognized top-level subfolder; FileType set to null",
        expect.objectContaining({ subfolder: "brand_new_folder" }),
      );
      warn.mockRestore();
    });

    it("returns null type for shallow homeassistant paths", () => {
      const p = makeParsed("homeassistant/components/setup.py");
      // Only 2 parts after splitting, needs at least 2 for component detection
      expect(p.component).toBeNull();
    });
  });

  describe("core component detection", () => {
    it("marks core components (mqtt)", () => {
      const p = makeParsed("homeassistant/components/mqtt/__init__.py");
      expect(p.core).toBe(true);
    });

    it("does not mark non-core components", () => {
      const p = makeParsed("homeassistant/components/custom_thing/__init__.py");
      expect(p.core).toBe(false);
    });
  });

  describe("getters", () => {
    it("returns additions from file", () => {
      const p = makeParsed("homeassistant/components/hue/__init__.py", { additions: 42 });
      expect(p.additions).toBe(42);
    });

    it("returns status from file", () => {
      const p = makeParsed("homeassistant/components/hue/__init__.py", { status: "added" });
      expect(p.status).toBe("added");
    });

    it("returns full path", () => {
      const p = makeParsed("homeassistant/components/hue/__init__.py");
      expect(p.path).toBe("homeassistant/components/hue/__init__.py");
    });

    it("returns filename from path", () => {
      const p = makeParsed("homeassistant/components/hue/light.py");
      expect(p.filename).toBe("light.py");
    });
  });
});
