import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import {
  bumpTitle,
  isBumpTitle,
  singleBump,
} from "../../../../../src/github/manifests/home-assistant-core/rules/bump-title.js";
import { createMockContext, mockPRFiles, runRule } from "../../../helpers/mock-context.js";

const DEPENDENCY_BODY =
  "## Type of change\n\n- [x] Dependency upgrade\n- [ ] Bugfix (non-breaking change which fixes an issue)\n";
const BUGFIX_BODY =
  "## Type of change\n\n- [ ] Dependency upgrade\n- [x] Bugfix (non-breaking change which fixes an issue)\n";

const IOMETER_PATCH =
  "@@ -1,3 +1,3 @@\n # homeassistant.components.iometer\n-iometer==1.0.2\n+iometer==1.0.3\n";

function makeFile(filename: string, patch?: string) {
  return { filename, status: "modified", additions: 1, deletions: 1, changes: 2, patch };
}

const IOMETER_FILES = [
  makeFile(
    "homeassistant/components/iometer/manifest.json",
    '-  "requirements": ["iometer==1.0.2"]\n+  "requirements": ["iometer==1.0.3"]',
  ),
  makeFile("requirements_all.txt", IOMETER_PATCH),
  makeFile("requirements_test_all.txt", IOMETER_PATCH),
];

async function run({
  title = "iometer dependency update to 1.0.3",
  body = DEPENDENCY_BODY,
  author = "testuser",
  files = IOMETER_FILES,
}: {
  title?: string;
  body?: string;
  author?: string;
  files?: Record<string, unknown>[];
} = {}) {
  const context = createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: { pull_request: { title, body, user: { login: author } } },
  });
  mockPRFiles(context, files);
  return (await runRule(bumpTitle, context))?.effects;
}

describe("bump-title", () => {
  it("renames a single-package bump", async () => {
    expect(await run()).toEqual([{ type: "setTitle", title: "Bump iometer to 1.0.3" }]);
  });

  it.each(["Bump iometer to 1.0.3", "bump iometer to v1.0.3", "Bump iometer from 1.0.2 to 1.0.3"])(
    "leaves a conforming title alone: %s",
    async (title) => {
      expect(await run({ title })).toBeUndefined();
    },
  );

  it("skips bot authors", async () => {
    expect(await run({ author: "renovate[bot]" })).toBeUndefined();
  });

  it("skips when Dependency upgrade is not checked", async () => {
    expect(await run({ body: BUGFIX_BODY })).toBeUndefined();
  });

  it("skips when the PR touches code", async () => {
    const files = [...IOMETER_FILES, makeFile("homeassistant/components/iometer/sensor.py", "")];
    expect(await run({ files })).toBeUndefined();
  });

  it("skips multi-package bumps", async () => {
    const files = [makeFile("requirements_all.txt", `${IOMETER_PATCH}-foo==1\n+foo==2\n`)];
    expect(await run({ files })).toBeUndefined();
  });
});

describe("singleBump", () => {
  it("handles extras and name normalization across files", () => {
    expect(
      singleBump(["-Py_Foo[cli]==1.0\n+Py_Foo[cli]==1.1", "-py-foo==1.0\n+py-foo==1.1"]),
    ).toEqual({ name: "Py_Foo", version: "1.1" });
  });

  it("rejects newly added requirements", () => {
    expect(singleBump(["+newlib==1.0"])).toBeUndefined();
  });

  it("rejects conflicting target versions", () => {
    expect(singleBump(["-foo==1\n+foo==2", "-foo==1\n+foo==3"])).toBeUndefined();
  });

  it("ignores diff headers", () => {
    expect(
      singleBump(["--- a/requirements_all.txt\n+++ b/requirements_all.txt\n-foo==1\n+foo==2"]),
    ).toEqual({ name: "foo", version: "2" });
  });
});

describe("isBumpTitle", () => {
  it("matches separators loosely", () => {
    expect(isBumpTitle("Bump py-foo to 1.1", { name: "Py_Foo", version: "1.1" })).toBe(true);
    expect(isBumpTitle("Bump pyfoo to 1.1", { name: "Py_Foo", version: "1.1" })).toBe(false);
  });
});
