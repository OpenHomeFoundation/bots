import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../../../engine/rule.js";
import {
  fetchResultingIntegrationManifest,
  manifestDependencies,
} from "../helpers/integration-manifest.js";
import { isNewIntegrationPR } from "../helpers/new-integration.js";
import { parseFiles } from "../helpers/parse-path.js";
import { isReleasePR } from "../helpers/release-pr.js";
import { NEW_INTEGRATION_LABEL } from "./change-type.js";
import { TRANSPORTS } from "./integration-transport.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

/**
 * The domain suffixes core expects of an integration, given the transport
 * integrations it depends on. Read from the same table integration-transport
 * labels from, so the dependency edge stays the whole signal.
 */
function expectedSuffixes(dependencies: readonly string[]): string[] {
  const deps = new Set(dependencies);
  const suffixes = TRANSPORTS.filter(
    (transport) =>
      transport.domainSuffix !== undefined && transport.domains.some((domain) => deps.has(domain)),
  ).map((transport) => transport.domainSuffix as string);
  return [...new Set(suffixes)];
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
  if ("label" in ctx.event && ctx.event.label !== NEW_INTEGRATION_LABEL) return;
  if (await isReleasePR(ctx.target)) {
    return { status: "skip", message: "Not checked on release PRs." };
  }

  const parsed = await parseFiles(ctx, await ctx.target.files());
  if (!(await isNewIntegrationPR(ctx, parsed))) {
    return { status: "skip", message: "Not a new-integration PR." };
  }

  // The integration being added is the one whose manifest the PR adds.
  const newDomains = [
    ...new Set(
      parsed
        .filter((p) => p.type === "component" && p.status === "added")
        .filter((p) => p.filename === "manifest.json")
        .map((p) => p.component)
        .filter((domain): domain is string => !!domain),
    ),
  ].sort();

  const suggestions: string[] = [];
  const conforming: string[] = [];
  for (const domain of newDomains) {
    const manifest = await fetchResultingIntegrationManifest(ctx, domain);
    if (!manifest) continue;
    const suffixes = expectedSuffixes(manifestDependencies(manifest));
    if (suffixes.length === 0) continue;
    if (suffixes.some((suffix) => domain.endsWith(suffix))) {
      conforming.push(domain);
      continue;
    }
    const names = suffixes.map((suffix) => `\`${domain}${suffix}\``).join(" or ");
    const suffixList = suffixes.map((suffix) => `\`${suffix}\``).join(" or ");
    suggestions.push(
      `Consider renaming \`${domain}\` to ${names}, following the ${suffixList} suffix ` +
        "core uses for integrations on this transport.",
    );
  }

  if (suggestions.length > 0) {
    return { status: "warn", message: suggestions.join("\n") };
  }
  if (conforming.length > 0) {
    return {
      status: "pass",
      message: `Domain follows the transport naming convention: ${conforming.map((d) => `\`${d}\``).join(", ")}.`,
    };
  }
  return { status: "skip", message: "No transport naming convention applies." };
}

export const integrationDomainName = check({
  id: "integration-domain-name",
  title: "Integration domain name",
  description:
    "Suggests a transport suffix for new integration domains (`_ble` for Bluetooth, " +
    "`_infrared` for infrared, `_modbus` for Modbus), read from the manifest the PR adds",
  events: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.ON_DEMAND,
  ],
  evaluate,
});
