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

function prContext(files: Record<string, unknown>[], body = NEW_INTEGRATION_BODY, state = "open") {
  const context = createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: { pull_request: { body, state } },
  });
  mockPRFiles(context, files);
  return context;
}

/** The suggestions the rule puts on the dashboard; `null` when it clears the block. */
async function suggestionsFor(
  files: Record<string, unknown>[],
  body?: string,
): Promise<string[] | null | undefined> {
  const result = await runRule(integrationDomainName, prContext(files, body));
  const update = result?.blocks.find((b) => b.block === "domain-name-suggestions");
  if (!update) return undefined;
  return update.args === null ? null : (update.args as { suggestions: string[] }).suggestions;
}

describe("integration-domain-name", () => {
  it.each([
    ["bluetooth", "_ble"],
    ["bluetooth_adapters", "_ble"],
    ["infrared", "_infrared"],
    ["radio_frequency", "_radio_frequency"],
    ["modbus", "_modbus"],
  ])("suggests the suffix for a %s dependency", async (dependency, suffix) => {
    const suggestions = await suggestionsFor([
      manifest("mydevice", { dependencies: [dependency] }),
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions?.[0]).toContain(`\`mydevice${suffix}\``);
  });

  it("reads after_dependencies too", async () => {
    const suggestions = await suggestionsFor([
      manifest("mydevice", { after_dependencies: ["bluetooth_adapters"] }),
    ]);
    expect(suggestions?.[0]).toContain("`mydevice_ble`");
  });

  it("clears the block for a domain already carrying the suffix", async () => {
    expect(
      await suggestionsFor([manifest("mydevice_ble", { dependencies: ["bluetooth_adapters"] })]),
    ).toBeNull();
  });

  it("offers every applicable suffix and accepts any of them", async () => {
    const both = { dependencies: ["modbus", "bluetooth_adapters"] };
    const suggestions = await suggestionsFor([manifest("mydevice", both)]);
    expect(suggestions?.[0]).toContain("`mydevice_ble` or `mydevice_modbus`");

    expect(await suggestionsFor([manifest("mydevice_modbus", both)])).toBeNull();
  });

  it.each(["mqtt", "usb"])(
    "suggests nothing for a %s dependency, which has no naming convention",
    async (dependency) => {
      expect(
        await suggestionsFor([manifest("mydevice", { dependencies: [dependency] })]),
      ).toBeNull();
    },
  );

  it("suggests nothing for an integration without transport dependencies", async () => {
    expect(await suggestionsFor([manifest("mydevice")])).toBeNull();
  });

  it("only looks at integrations whose manifest the PR adds", async () => {
    expect(
      await suggestionsFor([
        manifest("mydevice_ble", { dependencies: ["bluetooth_adapters"] }),
        {
          ...manifest("bluetooth", { dependencies: ["usb"] }),
          status: "modified",
          patch: undefined,
        },
      ]),
    ).toBeNull();
  });

  it("clears the block on PRs that aren't adding an integration", async () => {
    expect(
      await suggestionsFor(
        [{ ...manifest("mydevice", { dependencies: ["bluetooth"] }), status: "modified" }],
        "- [x] Bugfix (non-breaking change which fixes an issue)",
      ),
    ).toBeNull();
  });

  it("leaves closed PRs alone", async () => {
    const context = prContext(
      [manifest("mydevice", { dependencies: ["bluetooth"] })],
      NEW_INTEGRATION_BODY,
      "closed",
    );
    expect(await runRule(integrationDomainName, context)).toBeUndefined();
  });
});
