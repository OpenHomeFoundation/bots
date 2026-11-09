import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { integrationDomainName } from "../../../../../src/github/manifests/home-assistant-core/rules/integration-domain-name.js";
import { createMockContext, mockPRFiles, runRule } from "../../../helpers/mock-context.js";

const NEW_INTEGRATION_BODY = "- [x] New integration (thank you!)";

/** A wholly-added file's patch: every line a `+`. */
function added(filename: string, body = "") {
  const lines = body.split("\n");
  return {
    filename,
    status: "added",
    additions: lines.length,
    deletions: 0,
    changes: lines.length,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
    patch: [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join("\n"),
  };
}

function manifest(domain: string, fields: Record<string, unknown> = {}) {
  return added(
    `homeassistant/components/${domain}/manifest.json`,
    JSON.stringify({ domain, name: domain, codeowners: ["@someone"], ...fields }, null, 2),
  );
}

function prContext(files: Record<string, unknown>[], body = NEW_INTEGRATION_BODY) {
  const context = createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: { pull_request: { body } },
  });
  mockPRFiles(context, files);
  return context;
}

async function sectionFor(files: Record<string, unknown>[], body?: string) {
  return (await runRule(integrationDomainName, prContext(files, body)))?.section;
}

describe("integration-domain-name", () => {
  it.each([
    ["bluetooth", "_ble"],
    ["bluetooth_adapters", "_ble"],
    ["infrared", "_infrared"],
    ["modbus", "_modbus"],
  ])("suggests the suffix for a %s dependency", async (dependency, suffix) => {
    const section = await sectionFor([manifest("mydevice", { dependencies: [dependency] })]);
    expect(section).toMatchObject({ id: "integration-domain-name", status: "warn" });
    expect(section?.message).toContain(`\`mydevice${suffix}\``);
  });

  it("reads after_dependencies too", async () => {
    const section = await sectionFor([
      manifest("mydevice", { after_dependencies: ["bluetooth_adapters"] }),
    ]);
    expect(section?.status).toBe("warn");
    expect(section?.message).toContain("`mydevice_ble`");
  });

  it("passes a domain already carrying the suffix", async () => {
    const section = await sectionFor([
      manifest("mydevice_ble", { dependencies: ["bluetooth_adapters"] }),
    ]);
    expect(section).toMatchObject({ status: "pass" });
    expect(section?.message).toContain("`mydevice_ble`");
  });

  it("offers every applicable suffix and passes on any of them", async () => {
    const both = { dependencies: ["modbus", "bluetooth_adapters"] };
    const warned = await sectionFor([manifest("mydevice", both)]);
    expect(warned?.status).toBe("warn");
    expect(warned?.message).toContain("`mydevice_ble` or `mydevice_modbus`");

    expect((await sectionFor([manifest("mydevice_modbus", both)]))?.status).toBe("pass");
  });

  it.each(["mqtt", "usb", "radio_frequency"])(
    "skips a %s dependency, which has no naming convention",
    async (dependency) => {
      const section = await sectionFor([manifest("mydevice", { dependencies: [dependency] })]);
      expect(section?.status).toBe("skip");
    },
  );

  it("skips an integration without transport dependencies", async () => {
    expect((await sectionFor([manifest("mydevice")]))?.status).toBe("skip");
  });

  it("only looks at integrations whose manifest the PR adds", async () => {
    const section = await sectionFor([
      manifest("mydevice_ble", { dependencies: ["bluetooth_adapters"] }),
      {
        ...manifest("bluetooth", { dependencies: ["usb"] }),
        status: "modified",
        patch: undefined,
      },
    ]);
    expect(section?.status).toBe("pass");
  });

  it("skips PRs that aren't adding an integration", async () => {
    const section = await sectionFor(
      [
        {
          ...manifest("mydevice", { dependencies: ["bluetooth"] }),
          status: "modified",
        },
      ],
      "- [x] Bugfix (non-breaking change which fixes an issue)",
    );
    expect(section).toMatchObject({ status: "skip", message: "Not a new-integration PR." });
  });
});
