import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import {
  isToolingFile,
  repoTooling,
} from "../../../../../src/github/manifests/home-assistant-core/rules/repo-tooling.js";
import { createMockContext, mockPRFiles, runRule } from "../../../helpers/mock-context.js";

function makeFile(filename: string) {
  return {
    filename,
    status: "modified",
    additions: 1,
    deletions: 0,
    changes: 1,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

describe("repo-tooling", () => {
  it.each([
    "packages/pylint-home-assistant/pylint_home_assistant/checkers/runtime_data_typed_entry.py",
    "packages/pylint-home-assistant/README.md",
    "tests/pylint/test_runtime_data_typed_entry.py",
    "mypy_plugins/enum_identity_compare.py",
    "tests/mypy_plugins/test_enum_identity_compare.py",
  ])("labels a PR that touches %s", async (filename) => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile("homeassistant/components/hue/light.py"), makeFile(filename)]);

    const result = await runRule(repoTooling, context);
    expect(result?.labels).toEqual(["workflow"]);
  });

  it("labels when files are pushed later", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_SYNCHRONIZE });
    mockPRFiles(context, [makeFile("tests/pylint/test_enforce_type_hints.py")]);

    const result = await runRule(repoTooling, context);
    expect(result?.labels).toEqual(["workflow"]);
  });

  it.each([
    "homeassistant/components/hue/light.py",
    "tests/components/hue/test_light.py",
    "homeassistant/helpers/entity.py",
    // Integration PRs routinely touch these, so `script/` and `.github/` don't count.
    "script/hassfest/quality_scale.py",
    "script/gen_requirements_all.py",
    ".github/workflows/ci.yaml",
    // Other packages in the repo aren't covered.
    "packages/hassfest/hassfest/model.py",
    "packages/pytest-homeassistant/pytest_homeassistant/common.py",
    // Lookalike prefixes.
    "tests/pylint_extra/test_x.py",
    "tests/components/pylint/test_init.py",
  ])("does not label a PR that only touches %s", async (filename) => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [makeFile(filename)]);

    const result = await runRule(repoTooling, context);
    expect(result).toBeUndefined();
  });

  it("does not label a frontend bump that regenerates the pylint MDI icons", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, [
      makeFile("homeassistant/components/frontend/manifest.json"),
      makeFile("homeassistant/package_constraints.txt"),
      makeFile("packages/pylint-home-assistant/pylint_home_assistant/generated/mdi_icons.py"),
      makeFile("requirements_all.txt"),
    ]);

    const result = await runRule(repoTooling, context);
    expect(result).toBeUndefined();
  });

  it("does not label when there are no files", async () => {
    const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
    mockPRFiles(context, []);

    const result = await runRule(repoTooling, context);
    expect(result).toBeUndefined();
  });

  it("never removes a workflow label applied by hand", async () => {
    const context = createMockContext({
      eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
      payload: {
        pull_request: {
          body: "",
          base: { ref: "dev" },
          head: { sha: "abc123" },
          labels: [{ name: "workflow" }],
        },
      },
    });
    mockPRFiles(context, [makeFile("script/hassfest/quality_scale.py")]);

    const result = await runRule(repoTooling, context);
    expect(result).toBeUndefined();
  });

  it.each([EventType.PULL_REQUEST_EDITED, EventType.PULL_REQUEST_LABELED])(
    "does not run on %s",
    async (eventType) => {
      const context = createMockContext({ eventType });
      mockPRFiles(context, [makeFile("tests/pylint/test_x.py")]);

      const result = await runRule(repoTooling, context);
      expect(result).toBeUndefined();
    },
  );

  describe("isToolingFile", () => {
    it("ignores generated files under the pylint plugin", () => {
      expect(
        isToolingFile(
          "packages/pylint-home-assistant/pylint_home_assistant/generated/mdi_icons.py",
        ),
      ).toBe(false);
      expect(
        isToolingFile("packages/pylint-home-assistant/pylint_home_assistant/checkers/mdi_icons.py"),
      ).toBe(true);
    });
  });
});
