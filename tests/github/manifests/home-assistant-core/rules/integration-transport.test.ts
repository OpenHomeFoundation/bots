import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { integrationTransport } from "../../../../../src/github/manifests/home-assistant-core/rules/integration-transport.js";
import {
  createFakeGitHub,
  createMockContext,
  mockPRFiles,
  runRule,
} from "../../../helpers/mock-context.js";

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

function manifest(domain: string, fields: Record<string, unknown>) {
  return added(
    `homeassistant/components/${domain}/manifest.json`,
    JSON.stringify({ domain, name: domain, codeowners: ["@someone"], ...fields }, null, 2),
  );
}

/** A new-integration PR (by body checkbox) whose diff is `files`. */
function newIntegrationPR(files: Record<string, unknown>[]) {
  const context = createMockContext({
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: { pull_request: { body: NEW_INTEGRATION_BODY } },
  });
  mockPRFiles(context, files);
  return context;
}

async function transportsFor(files: Record<string, unknown>[]): Promise<string[]> {
  const result = await runRule(integrationTransport, newIntegrationPR(files));
  return result?.labels ?? [];
}

describe("integration-transport", () => {
  describe("transports", () => {
    it("labels a usb dependency as serial", async () => {
      expect(await transportsFor([manifest("mydevice", { dependencies: ["usb"] })])).toEqual([
        "transport: serial",
      ]);
    });

    it("labels a homeassistant_hardware dependency as serial", async () => {
      expect(
        await transportsFor([manifest("mydevice", { dependencies: ["homeassistant_hardware"] })]),
      ).toEqual(["transport: serial"]);
    });

    it("labels a modbus dependency", async () => {
      expect(await transportsFor([manifest("mydevice", { dependencies: ["modbus"] })])).toEqual([
        "transport: modbus",
      ]);
    });

    it("labels an mqtt dependency", async () => {
      expect(await transportsFor([manifest("mydevice", { dependencies: ["mqtt"] })])).toEqual([
        "transport: mqtt",
      ]);
    });

    it("labels both bluetooth seams the same way", async () => {
      expect(
        await transportsFor([manifest("mydevice", { dependencies: ["bluetooth_adapters"] })]),
      ).toEqual(["transport: bluetooth"]);
      expect(await transportsFor([manifest("other", { dependencies: ["bluetooth"] })])).toEqual([
        "transport: bluetooth",
      ]);
    });

    it("labels infrared and radio_frequency dependencies", async () => {
      expect(await transportsFor([manifest("mydevice", { dependencies: ["infrared"] })])).toEqual([
        "transport: ir",
      ]);
      expect(
        await transportsFor([manifest("other", { dependencies: ["radio_frequency"] })]),
      ).toEqual(["transport: rf"]);
    });

    it("reads after_dependencies too", async () => {
      expect(await transportsFor([manifest("mydevice", { after_dependencies: ["mqtt"] })])).toEqual(
        ["transport: mqtt"],
      );
    });

    it("labels every protocol the integration depends on", async () => {
      const labels = await transportsFor([
        manifest("mydevice", { dependencies: ["mqtt", "infrared"] }),
      ]);
      expect(labels).toEqual(["transport: mqtt", "transport: ir"]);
    });
  });

  describe("serial as a carrier", () => {
    it("classifies Modbus over a serial proxy as modbus", async () => {
      expect(
        await transportsFor([manifest("mydevice", { dependencies: ["usb", "modbus"] })]),
      ).toEqual(["transport: modbus"]);
    });

    it("suppresses serial under any protocol, not just modbus", async () => {
      expect(
        await transportsFor([manifest("mydevice", { dependencies: ["usb", "infrared"] })]),
      ).toEqual(["transport: ir"]);
      expect(
        await transportsFor([manifest("other", { dependencies: ["usb", "bluetooth_adapters"] })]),
      ).toEqual(["transport: bluetooth"]);
    });

    it("keeps serial when the protocol above it has no label of its own", async () => {
      // zha and zwave_js: a radio on a serial dongle, with no transport of
      // ours to classify it as.
      expect(
        await transportsFor([
          manifest("myradio", { dependencies: ["usb", "homeassistant_hardware"] }),
        ]),
      ).toEqual(["transport: serial"]);
    });

    it("ignores dependencies that are not transports", async () => {
      expect(
        await transportsFor([manifest("mydevice", { dependencies: ["http", "recorder"] })]),
      ).toEqual([]);
    });

    it("does not label an integration that brings its own protocol library", async () => {
      const labels = await transportsFor([
        manifest("mydevice", { requirements: ["pymodbus==3.11.3"] }),
        added(
          "homeassistant/components/mydevice/hub.py",
          "from pymodbus.client import AsyncModbusSerialClient",
        ),
      ]);
      expect(labels).toEqual([]);
    });
  });

  describe("resulting manifest", () => {
    /** A PR whose head tree serves `contents`, keyed by repo path. */
    function prWithHead(files: Record<string, unknown>[], contents: Record<string, string>) {
      const github = createFakeGitHub({ contents });
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_OPENED,
        payload: { pull_request: { body: NEW_INTEGRATION_BODY } },
        github,
      });
      mockPRFiles(context, files);
      return { context, github };
    }

    it("reads a wholly-added manifest out of the diff, without fetching it", async () => {
      const path = "homeassistant/components/mydevice/manifest.json";
      const { context, github } = prWithHead([manifest("mydevice", { dependencies: ["usb"] })], {
        [path]: "unused",
      });

      const result = await runRule(integrationTransport, context);
      expect(result?.labels).toEqual(["transport: serial"]);
      expect(github.repos.getContent).not.toHaveBeenCalledWith(expect.objectContaining({ path }));
    });

    it("fetches the whole manifest at the PR head when the diff is partial", async () => {
      const path = "homeassistant/components/mydevice/manifest.json";
      const { context, github } = prWithHead(
        [
          // A hunk, not the whole file: not parseable as JSON.
          {
            ...added("homeassistant/components/mydevice/__init__.py"),
            status: "modified",
          },
          {
            filename: path,
            status: "modified",
            additions: 1,
            deletions: 0,
            patch: '@@ -3,6 +3,7 @@\n   "name": "mydevice",\n+  "dependencies": ["modbus"],',
          },
        ],
        {
          [path]: JSON.stringify({
            domain: "mydevice",
            name: "mydevice",
            dependencies: ["modbus"],
          }),
        },
      );

      const result = await runRule(integrationTransport, context);
      expect(result?.labels).toEqual(["transport: modbus"]);
      expect(github.repos.getContent).toHaveBeenCalledWith(
        expect.objectContaining({ path, ref: "abc123" }),
      );
    });

    it("fetches at the head when the PR does not touch the manifest at all", async () => {
      const path = "homeassistant/components/mydevice/manifest.json";
      const { context } = prWithHead(
        [added("homeassistant/components/mydevice/__init__.py", "async def async_setup_entry():")],
        {
          [path]: JSON.stringify({
            domain: "mydevice",
            name: "mydevice",
            dependencies: ["mqtt"],
          }),
        },
      );

      expect((await runRule(integrationTransport, context))?.labels).toEqual(["transport: mqtt"]);
    });

    it("emits nothing when the head tree has no manifest for the domain", async () => {
      const { context } = prWithHead(
        [added("homeassistant/components/mydevice/__init__.py", "async def async_setup_entry():")],
        {},
      );

      expect(await runRule(integrationTransport, context)).toBeUndefined();
    });
  });

  describe("scope", () => {
    it("ignores PRs that are not adding an integration", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_OPENED });
      mockPRFiles(context, [
        { filename: "homeassistant/components/hue/light.py", status: "modified" },
      ]);

      expect(await runRule(integrationTransport, context)).toBeUndefined();
    });

    it("runs on a PR whose file shape adds an integration", async () => {
      const context = createMockContext({ eventType: EventType.PULL_REQUEST_SYNCHRONIZE });
      mockPRFiles(context, [
        added("homeassistant/components/mydevice/__init__.py"),
        manifest("mydevice", { dependencies: ["usb"] }),
      ]);

      const result = await runRule(integrationTransport, context);
      expect(result?.labels).toEqual(["transport: serial"]);
    });

    it("ignores label events for other labels", async () => {
      const context = createMockContext({
        eventType: EventType.PULL_REQUEST_LABELED,
        payload: {
          label: { name: "bugfix" },
          pull_request: { body: NEW_INTEGRATION_BODY, labels: [{ name: "bugfix" }] },
        },
      });
      mockPRFiles(context, [manifest("mydevice", { dependencies: ["usb"] })]);

      expect(await runRule(integrationTransport, context)).toBeUndefined();
    });

    it("emits nothing when no transport is used", async () => {
      const context = newIntegrationPR([manifest("mydevice", { requirements: ["aiomydevice"] })]);
      expect(await runRule(integrationTransport, context)).toBeUndefined();
    });
  });
});
