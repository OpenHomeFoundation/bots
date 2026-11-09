import { parse as parseYaml } from "yaml";
import { log } from "../../../../log.js";
import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import type { SectionStatus } from "../../../engine/status/types.js";
import type { IntegrationManifest } from "../../../helpers/integration-manifest.js";
import {
  fetchResultingIntegrationManifest,
  manifestDependencies,
} from "../helpers/integration-manifest.js";
import { isReleasePR } from "../helpers/release-pr.js";

const DISCOVERY_RULES_URL =
  "https://developers.home-assistant.io/docs/core/integration-quality-scale/rules/discovery";

type DiscoveryRule = "discovery" | "discovery-update-info";
const DISCOVERY_RULES: readonly DiscoveryRule[] = ["discovery", "discovery-update-info"];

/** Integration types with no physical device behind them to discover. */
const DEVICELESS_TYPES = new Set(["service", "helper", "virtual", "entity", "system", "hardware"]);

/**
 * Dependencies that put the device off the IP network (IR/RF emitters, serial
 * and BLE). Their discovery, if any, isn't what the evidence questions ask about.
 */
const NON_IP_TRANSPORT_DOMAINS = new Set([
  "infrared",
  "radio_frequency",
  "usb",
  "homeassistant_hardware",
  "bluetooth",
  "bluetooth_adapters",
]);

/** Manifest keys that register network discovery. */
const IP_DISCOVERY_KEYS = ["zeroconf", "dhcp", "ssdp", "homekit"] as const;

/** The reason says which network discovery methods were checked. */
const CHECKED_EVIDENCE =
  /\b(mdns|zeroconf|dns-sd|dhcp|mac(?:[ -]?address(?:es)?)?|oui|hostnames?|ssdp|upnp)\b/i;

/** The reason says the device never joins the user's network. */
const OFF_NETWORK_EVIDENCE =
  /\b(cellular|mobile data|mobile network|lte(?:-m)?|nb-iot|gsm|sim(?: card)?|[2345]g)\b/i;

interface RuleEntry {
  status: string;
  comment: string;
}

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

const QUALITY_SCALE_FILE = /^homeassistant\/components\/([^/]+)\/quality_scale\.yaml$/;

function qualityScalePath(domain: string): string {
  return `homeassistant/components/${domain}/quality_scale.yaml`;
}

/** The discovery entries of a quality_scale.yaml; empty when absent or unparsable. */
function discoveryEntries(
  content: string | null,
  where: string,
): Partial<Record<DiscoveryRule, RuleEntry>> {
  if (content === null) return {};
  let doc: unknown;
  try {
    doc = parseYaml(content);
  } catch (err) {
    log.warn("discovery-exemption: quality_scale.yaml is not valid YAML", {
      where,
      error: String(err),
    });
    return {};
  }
  const rules = (doc as { rules?: unknown } | null)?.rules;
  if (!rules || typeof rules !== "object") return {};

  const entries: Partial<Record<DiscoveryRule, RuleEntry>> = {};
  for (const rule of DISCOVERY_RULES) {
    const raw = (rules as Record<string, unknown>)[rule];
    if (typeof raw === "string") {
      entries[rule] = { status: raw, comment: "" };
    } else if (raw && typeof raw === "object") {
      const { status, comment } = raw as { status?: unknown; comment?: unknown };
      entries[rule] = {
        status: typeof status === "string" ? status : "",
        comment: typeof comment === "string" ? comment.trim() : "",
      };
    }
  }
  return entries;
}

/** The discovery rules this PR newly marks exempt or whose exemption reason it rewrites. */
function changedExemptions(
  base: Partial<Record<DiscoveryRule, RuleEntry>>,
  head: Partial<Record<DiscoveryRule, RuleEntry>>,
): { rule: DiscoveryRule; comment: string }[] {
  return DISCOVERY_RULES.flatMap((rule) => {
    const now = head[rule];
    if (now?.status !== "exempt") return [];
    const before = base[rule];
    if (before?.status === "exempt" && before.comment === now.comment) return [];
    return [{ rule, comment: now.comment }];
  });
}

interface Verdict {
  status: SectionStatus;
  message: string;
}

function judge(
  domain: string,
  rule: DiscoveryRule,
  comment: string,
  manifest: IntegrationManifest,
): Verdict {
  const label = `\`${domain}\` \`${rule}\``;

  if (DEVICELESS_TYPES.has(manifest.integration_type) || manifest.iot_class === "calculated") {
    return { status: "pass", message: `${label}: no physical device to discover.` };
  }
  if (manifestDependencies(manifest).some((dep) => NON_IP_TRANSPORT_DOMAINS.has(dep))) {
    return { status: "pass", message: `${label}: the device isn't on the IP network.` };
  }

  const hasEvidence = CHECKED_EVIDENCE.test(comment) || OFF_NETWORK_EVIDENCE.test(comment);

  // An exemption that explains how the registered matchers are used (e.g. DHCP
  // only to refresh the IP of configured devices) isn't a contradiction.
  const declared = IP_DISCOVERY_KEYS.filter((key) => manifest[key] !== undefined);
  if (rule === "discovery" && declared.length > 0 && !hasEvidence) {
    return {
      status: "fail",
      message:
        `${label} is marked exempt, but \`manifest.json\` registers ` +
        `${declared.map((k) => `\`${k}\``).join(", ")} discovery. ` +
        "Mark the rule `done`, or remove the matchers if they're unused.",
    };
  }

  // Cloud integrations discovered over DHCP usually store no host to keep
  // current, so only local ones are asked to justify skipping the update.
  if (rule === "discovery-update-info" && !manifest.iot_class.startsWith("local")) {
    return { status: "pass", message: `${label}: no local connection info to update.` };
  }

  if (hasEvidence) {
    return { status: "pass", message: `${label}: the exemption reason explains what was checked.` };
  }

  const reason = comment ? `"${comment.replace(/\s+/g, " ")}"` : "no reason given";
  return {
    status: "warn",
    message:
      `${label} is marked exempt (${reason}), but this integration talks to physical devices. ` +
      "Even when the data comes from the cloud, the device may still be discoverable on the " +
      "user's network. Please check and note in the exemption reason:\n" +
      "  - Does the device advertise itself over mDNS/zeroconf?\n" +
      "  - Does its DHCP request contain a recognisable hostname?\n" +
      "  - Does its MAC address have a vendor-specific OUI?\n" +
      "  - Does it respond to SSDP/UPnP?\n\n" +
      "  If the device never joins the user's network (e.g. it connects over mobile data), " +
      `say that instead. See the [discovery rule](${DISCOVERY_RULES_URL}).`,
  };
}

const SEVERITY: Record<SectionStatus, number> = { skip: 0, pass: 1, pending: 2, warn: 3, fail: 4 };

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  if (ctx.target.kind !== "pull_request") return;
  if (await isReleasePR(ctx.target)) {
    return { status: "skip", message: "Not checked on release PRs." };
  }

  const files = await ctx.target.files();
  const touched = files
    .map((f) => QUALITY_SCALE_FILE.exec(f.filename)?.[1])
    .filter((domain): domain is string => domain !== undefined)
    .sort();
  if (touched.length === 0) {
    return { status: "skip", message: "No quality_scale.yaml changed." };
  }

  const baseRef = await ctx.target.baseRef();
  const verdicts: Verdict[] = [];
  for (const domain of touched) {
    const path = qualityScalePath(domain);
    const changed = changedExemptions(
      discoveryEntries(await ctx.repoFile(path, baseRef), `base:${domain}`),
      discoveryEntries(await ctx.repoFile(path), `head:${domain}`),
    );
    if (changed.length === 0) continue;

    const manifest = await fetchResultingIntegrationManifest(ctx, domain);
    if (!manifest) continue;
    for (const { rule, comment } of changed) {
      verdicts.push(judge(domain, rule, comment, manifest));
    }
  }

  if (verdicts.length === 0) {
    return { status: "skip", message: "No discovery exemption added or changed." };
  }

  const status = verdicts.reduce<SectionStatus>(
    (worst, v) => (SEVERITY[v.status] > SEVERITY[worst] ? v.status : worst),
    "pass",
  );
  const shown = status === "pass" ? verdicts : verdicts.filter((v) => v.status !== "pass");
  return { status, message: shown.map((v) => `- ${v.message}`).join("\n") };
}

export const discoveryExemption = check({
  id: "discovery-exemption",
  title: "Discovery exemption",
  waivableBy: "member",
  description:
    "Asks for evidence when a PR marks the discovery or discovery-update-info quality scale " +
    "rule exempt for an integration with physical devices",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
