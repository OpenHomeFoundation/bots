import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
import { domainsFromFiles } from "../helpers/integration-domains.js";
import {
  fetchResultingIntegrationManifest,
  manifestDependencies,
} from "../helpers/integration-manifest.js";
import { isNewIntegrationPR } from "../helpers/new-integration.js";
import { parseFiles } from "../helpers/parse-path.js";
import { NEW_INTEGRATION_LABEL } from "./change-type.js";

const TRANSPORT_LABEL_PREFIX = "transport: ";

/**
 * A transport core carries, named by the integration that carries it. The
 * dependency edge is the whole signal — no source scanning, no guessing from
 * library names. An integration talking Modbus through its own vendor library
 * rather than through `modbus` isn't using our transport, and isn't labeled.
 */
interface Transport {
  /** Label suffix: `transport: <label>`. */
  label: string;
  /** Transport-integration domains that put an integration on this transport. */
  domains: readonly string[];
  /**
   * A medium other transports ride on, not a protocol in its own right.
   * Reported only when nothing rides on it: Modbus over a serial proxy is
   * Modbus, while a Zigbee dongle — no label of its own — stays `serial`.
   */
  carrier?: true;
  /**
   * The domain suffix core uses for integrations on this transport
   * (`xiaomi_ble`, `lg_infrared`, `solaredge_modbus`), suggested by
   * integration-domain-name. Unset where core has no such convention.
   */
  domainSuffix?: string;
}

export const TRANSPORTS: readonly Transport[] = [
  { label: "mqtt", domains: ["mqtt"] },
  // `bluetooth_adapters` is the seam most BLE integrations depend on; a few
  // reach for `bluetooth` itself.
  { label: "bluetooth", domains: ["bluetooth", "bluetooth_adapters"], domainSuffix: "_ble" },
  { label: "ir", domains: ["infrared"], domainSuffix: "_infrared" },
  { label: "rf", domains: ["radio_frequency"] },
  { label: "modbus", domains: ["modbus"], domainSuffix: "_modbus" },
  // `usb` is core's serial transport — discovery plus the port handle.
  // `homeassistant_hardware` sits on top of it for the first-party radios.
  { label: "serial", domains: ["usb", "homeassistant_hardware"], carrier: true },
];

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
  if ("label" in ctx.event && ctx.event.label !== NEW_INTEGRATION_LABEL) return;

  const files = await ctx.target.files();
  if (!(await isNewIntegrationPR(ctx, await parseFiles(ctx, files)))) return;

  const dependencies = new Set<string>();
  for (const domain of domainsFromFiles(files)) {
    const manifest = await fetchResultingIntegrationManifest(ctx, domain);
    if (manifest) for (const dep of manifestDependencies(manifest)) dependencies.add(dep);
  }

  const used = TRANSPORTS.filter((transport) =>
    transport.domains.some((domain) => dependencies.has(domain)),
  );
  // A carrier only classifies the integration when nothing rides on it.
  const protocols = used.filter((transport) => !transport.carrier);
  const reported = protocols.length > 0 ? protocols : used;
  if (reported.length === 0) return;

  return {
    effects: [
      {
        type: "addLabels",
        labels: reported.map((transport) => `${TRANSPORT_LABEL_PREFIX}${transport.label}`),
      },
    ],
  };
}

export const integrationTransport: Rule = {
  name: "integration-transport",
  description:
    "Labels new-integration PRs with the core transports the integration uses " +
    "(`transport: mqtt`, `transport: bluetooth`, `transport: serial`, `transport: ir`, " +
    "`transport: rf`, `transport: modbus`), read from the manifest the PR adds.",
  events: on(
    [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_REOPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_LABELED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.ON_DEMAND,
    ],
    evaluate,
  ),
};
