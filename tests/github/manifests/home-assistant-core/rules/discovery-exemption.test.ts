import { describe, expect, it } from "vitest";
import { EventType } from "../../../../../src/github/engine/event.js";
import { discoveryExemption } from "../../../../../src/github/manifests/home-assistant-core/rules/discovery-exemption.js";
import {
  createFakeGitHub,
  createMockContext,
  mockPRFiles,
  runRule,
} from "../../../helpers/mock-context.js";

const HEAD_SHA = "abc123";
const BASE_REF = "dev";

function file(filename: string, status = "modified") {
  return {
    filename,
    status,
    additions: 1,
    deletions: 0,
    changes: 1,
    sha: "abc",
    blob_url: "",
    raw_url: "",
    contents_url: "",
  };
}

function qualityScale(rules: Record<string, unknown>): string {
  const lines = ["rules:"];
  for (const [rule, value] of Object.entries(rules)) {
    if (typeof value === "string") {
      lines.push(`  ${rule}: ${value}`);
    } else {
      const { status, comment } = value as { status: string; comment?: string };
      lines.push(`  ${rule}:`, `    status: ${status}`);
      if (comment !== undefined) lines.push(`    comment: ${JSON.stringify(comment)}`);
    }
  }
  return lines.join("\n");
}

interface Scenario {
  domain?: string;
  /** quality_scale.yaml on the base branch; omitted means the file doesn't exist there. */
  base?: Record<string, unknown>;
  head?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
  extraFiles?: ReturnType<typeof file>[];
  prOverrides?: Record<string, unknown>;
}

async function run(scenario: Scenario) {
  const domain = scenario.domain ?? "mydevice";
  const qsPath = `homeassistant/components/${domain}/quality_scale.yaml`;
  const manifestPath = `homeassistant/components/${domain}/manifest.json`;

  const byRef: Record<string, Record<string, string>> = { [HEAD_SHA]: {}, [BASE_REF]: {} };
  if (scenario.base) byRef[BASE_REF][qsPath] = qualityScale(scenario.base);
  if (scenario.head) byRef[HEAD_SHA][qsPath] = qualityScale(scenario.head);
  if (scenario.manifest) {
    byRef[HEAD_SHA][manifestPath] = JSON.stringify({
      domain,
      name: domain,
      ...scenario.manifest,
    });
  }

  const github = createFakeGitHub();
  github.repos.getContent.mockImplementation(async (params: unknown) => {
    const { path, ref } = params as { path: string; ref: string };
    const body = byRef[ref]?.[path];
    if (body === undefined) throw { status: 404 };
    return { data: { content: Buffer.from(body).toString("base64"), encoding: "base64" } };
  });

  const context = createMockContext({
    eventType: EventType.ON_DEMAND,
    github,
    payload: {
      pull_request: {
        head: { sha: HEAD_SHA },
        base: { ref: BASE_REF },
        labels: [],
        ...scenario.prOverrides,
      },
    },
  });
  mockPRFiles(context, [
    file(qsPath, scenario.base ? "modified" : "added"),
    file(manifestPath, "modified"),
    ...(scenario.extraFiles ?? []),
  ]);

  const result = await runRule(discoveryExemption, context);
  return result?.section;
}

const LOCAL_DEVICE = { iot_class: "local_polling", integration_type: "device" };
const CLOUD_HUB = { iot_class: "cloud_push", integration_type: "hub" };

describe("discovery-exemption", () => {
  it("skips PRs that don't touch quality_scale.yaml", async () => {
    const context = createMockContext({ eventType: EventType.ON_DEMAND });
    mockPRFiles(context, [file("homeassistant/components/hue/light.py")]);

    const result = await runRule(discoveryExemption, context);
    expect(result?.section).toMatchObject({ id: "discovery-exemption", status: "skip" });
  });

  it("skips when the discovery exemption is untouched", async () => {
    const exempt = { status: "exempt", comment: "Device not discoverable." };
    const section = await run({
      base: { discovery: exempt, "test-coverage": "todo" },
      head: { discovery: exempt, "test-coverage": "done" },
      manifest: LOCAL_DEVICE,
    });
    expect(section?.status).toBe("skip");
  });

  it("skips when discovery is done", async () => {
    const section = await run({ head: { discovery: "done" }, manifest: LOCAL_DEVICE });
    expect(section?.status).toBe("skip");
  });

  it("warns on a new local integration exempting discovery without evidence", async () => {
    const section = await run({
      head: { discovery: { status: "exempt", comment: "Device not discoverable." } },
      manifest: LOCAL_DEVICE,
    });
    expect(section?.status).toBe("warn");
    expect(section?.message).toContain("`mydevice` `discovery`");
    expect(section?.message).toContain("Device not discoverable.");
    expect(section?.message).toContain("mDNS/zeroconf");
  });

  it("warns on a cloud hub, since its devices can still be on the network", async () => {
    const section = await run({
      head: { discovery: { status: "exempt", comment: "This is a cloud service." } },
      manifest: CLOUD_HUB,
    });
    expect(section?.status).toBe("warn");
  });

  it("warns when an existing exemption reason is rewritten without evidence", async () => {
    const section = await run({
      base: { discovery: { status: "exempt", comment: "No discovery." } },
      head: { discovery: { status: "exempt", comment: "Not possible to discover." } },
      manifest: LOCAL_DEVICE,
    });
    expect(section?.status).toBe("warn");
  });

  it("warns when the rule flips from todo to exempt", async () => {
    const section = await run({
      base: { discovery: "todo" },
      head: { discovery: { status: "exempt", comment: "No discovery." } },
      manifest: LOCAL_DEVICE,
    });
    expect(section?.status).toBe("warn");
  });

  it.each([
    "The device does not advertise over mDNS.",
    "Checked zeroconf, nothing is announced.",
    "The DHCP hostname is a generic ESP-XXXX.",
    "The MAC address uses a generic Espressif OUI.",
    "No SSDP or UPnP responses either.",
  ])("passes when the reason gives evidence: %s", async (comment) => {
    const section = await run({
      head: { discovery: { status: "exempt", comment } },
      manifest: LOCAL_DEVICE,
    });
    expect(section?.status).toBe("pass");
  });

  it("passes when the device never joins the user's network", async () => {
    const section = await run({
      head: {
        discovery: { status: "exempt", comment: "Chargers connect over mobile data (LTE-M)." },
      },
      manifest: CLOUD_HUB,
    });
    expect(section?.status).toBe("pass");
  });

  it.each(["service", "helper", "virtual"])(
    "passes for integration_type %s",
    async (integration_type) => {
      const section = await run({
        head: { discovery: { status: "exempt", comment: "No discovery." } },
        manifest: { iot_class: "cloud_polling", integration_type },
      });
      expect(section?.status).toBe("pass");
    },
  );

  it("passes for calculated integrations", async () => {
    const section = await run({
      head: { discovery: { status: "exempt", comment: "No discovery." } },
      manifest: { iot_class: "calculated", integration_type: "hub" },
    });
    expect(section?.status).toBe("pass");
  });

  it.each(["infrared", "usb", "bluetooth_adapters"])(
    "passes for devices off the IP network (%s)",
    async (dep) => {
      const section = await run({
        head: { discovery: { status: "exempt", comment: "No discovery." } },
        manifest: { ...LOCAL_DEVICE, dependencies: [dep] },
      });
      expect(section?.status).toBe("pass");
    },
  );

  it("fails when discovery is exempt but the manifest registers network discovery", async () => {
    const section = await run({
      head: { discovery: { status: "exempt", comment: "No discovery." } },
      manifest: { ...LOCAL_DEVICE, dhcp: [{ macaddress: "AABBCC*" }] },
    });
    expect(section?.status).toBe("fail");
    expect(section?.message).toContain("`dhcp`");
  });

  it("passes a manifest with discovery matchers when the reason explains them", async () => {
    const section = await run({
      head: {
        discovery: {
          status: "exempt",
          comment: "DHCP is only used to refresh the IP of configured devices.",
        },
      },
      manifest: { ...LOCAL_DEVICE, dhcp: [{ macaddress: "AABBCC*" }] },
    });
    expect(section?.status).toBe("pass");
  });

  it("passes a cloud integration exempting discovery-update-info", async () => {
    const section = await run({
      head: {
        discovery: "done",
        "discovery-update-info": {
          status: "exempt",
          comment: "DHCP discovery only starts the flow.",
        },
      },
      manifest: { ...CLOUD_HUB, dhcp: [{ macaddress: "AABBCC*" }] },
    });
    expect(section?.status).toBe("pass");
  });

  it("warns on a local integration exempting discovery-update-info without evidence", async () => {
    const section = await run({
      head: { "discovery-update-info": { status: "exempt", comment: "No discovery." } },
      manifest: LOCAL_DEVICE,
    });
    expect(section?.status).toBe("warn");
    expect(section?.message).toContain("`discovery-update-info`");
  });

  it("reports only the offending entries when some pass", async () => {
    const section = await run({
      head: {
        discovery: { status: "exempt", comment: "No discovery." },
        "discovery-update-info": { status: "exempt", comment: "No DHCP or mDNS." },
      },
      manifest: LOCAL_DEVICE,
    });
    expect(section?.status).toBe("warn");
    expect(section?.message).toContain("`discovery`");
    expect(section?.message).not.toContain("`discovery-update-info`");
  });

  it("skips release PRs", async () => {
    const section = await run({
      head: { discovery: { status: "exempt", comment: "No discovery." } },
      manifest: LOCAL_DEVICE,
      prOverrides: { head: { sha: HEAD_SHA, ref: "rc" }, base: { ref: "master" } },
    });
    expect(section?.status).toBe("skip");
  });
});
