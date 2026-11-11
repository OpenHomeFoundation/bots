import { describe, expect, it } from "vitest";
import { parseCodeOwners } from "../../../../../src/github/engine/model/codeowners.js";
import { addedActions } from "../../../../../src/github/manifests/home-assistant-core/helpers/actions.js";
import { ParsedPath } from "../../../../../src/github/manifests/home-assistant-core/helpers/parse-path.js";

function makeParsed(
  filename: string,
  status: ConstructorParameters<typeof ParsedPath>[0]["status"],
  patch?: string,
): ParsedPath {
  return new ParsedPath(
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
      patch,
    },
    new Set(["sensor", "light"]),
    parseCodeOwners(""),
  );
}

const SERVICES = "homeassistant/components/hue/services.yaml";

describe("addedActions", () => {
  it("lists the actions of an added services.yaml", () => {
    const patch = [
      "@@ -0,0 +1,9 @@",
      "+.common_fields: &common_fields",
      "+  transition:",
      "+set_scene:",
      "+  fields:",
      "+    <<: *common_fields",
      "+activate_scene:",
      "+  target:",
      "+    entity:",
      "+      domain: light",
    ].join("\n");
    expect(addedActions([makeParsed(SERVICES, "added", patch)])).toEqual([
      "`hue.activate_scene`",
      "`hue.set_scene`",
    ]);
  });

  it("lists only actions newly added to an existing services.yaml", () => {
    const patch = [
      "@@ -1,8 +1,12 @@",
      " set_scene:",
      "   fields:",
      "-    group_name:",
      "+    group:",
      "-activate_scene:",
      "+activate_scene: # moved",
      "   target:",
      "     entity:",
      "-      domain: light",
      "+      domain: [light, sensor]",
      "+hue_activate_scene:",
      "+  fields:",
    ].join("\n");
    expect(addedActions([makeParsed(SERVICES, "modified", patch)])).toEqual([
      "`hue.hue_activate_scene`",
    ]);
  });

  it("ignores services.yaml changes that add no action", () => {
    const patch = [
      "@@ -3,3 +3,3 @@",
      "     entity:",
      "-      domain: light",
      "+      domain: sensor",
    ].join("\n");
    expect(addedActions([makeParsed(SERVICES, "modified", patch)])).toEqual([]);
  });

  it("names an added services.yaml by its path when GitHub omits the patch", () => {
    expect(addedActions([makeParsed(SERVICES, "added")])).toEqual([`\`${SERVICES}\``]);
    expect(addedActions([makeParsed(SERVICES, "modified")])).toEqual([]);
  });

  it("ignores removed services.yaml files and other files", () => {
    expect(
      addedActions([
        makeParsed(SERVICES, "removed", "@@ -1 +0,0 @@\n-set_scene:"),
        makeParsed("homeassistant/components/hue/strings.json", "modified", "+set_scene:"),
        makeParsed("tests/components/hue/services.yaml", "added", "+set_scene:"),
      ]),
    ).toEqual([]);
  });
});
