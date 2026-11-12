import { EventType } from "../../../engine/event.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { on } from "../../../engine/rule.js";
import type { Rule, RuleOutput } from "../../../engine/types.js";
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

/** One suggestion per new integration whose domain misses its transport suffix. */
async function suggestions(ctx: RuleContext<HandledEvent>): Promise<string[]> {
  if (await isReleasePR(ctx.target)) return [];

  const parsed = await parseFiles(ctx, await ctx.target.files());
  if (!(await isNewIntegrationPR(ctx, parsed))) return [];

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

  const result: string[] = [];
  for (const domain of newDomains) {
    const manifest = await fetchResultingIntegrationManifest(ctx, domain);
    if (!manifest) continue;
    const suffixes = expectedSuffixes(manifestDependencies(manifest));
    if (suffixes.length === 0) continue;
    if (suffixes.some((suffix) => domain.endsWith(suffix))) continue;

    const names = suffixes.map((suffix) => `\`${domain}${suffix}\``).join(" or ");
    const suffixList = suffixes.map((suffix) => `\`${suffix}\``).join(" or ");
    result.push(
      `Consider renaming \`${domain}\` to ${names}, following the ${suffixList} suffix ` +
        "core uses for integrations on this transport.",
    );
  }
  return result;
}

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
  if ("label" in ctx.event && ctx.event.label !== NEW_INTEGRATION_LABEL) return;
  // Plain rule (blocks, not check()): guard closed PRs itself.
  if ((await ctx.target.state()) !== "open") return;

  const found = await suggestions(ctx);
  return {
    blocks: [
      {
        block: "domain-name-suggestions",
        args: found.length === 0 ? null : { suggestions: found },
      },
    ],
  };
}

export const integrationDomainName: Rule = {
  name: "integration-domain-name",
  description:
    "Suggests a transport suffix for new integration domains (`_ble` for Bluetooth, " +
    "`_infrared` for infrared, `_radio_frequency` for radio frequency, `_modbus` for " +
    "Modbus) on the PR dashboard, read from the manifest the PR adds",
  events: on(
    [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_REOPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_LABELED,
      EventType.PULL_REQUEST_UNLABELED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.ON_DEMAND,
    ],
    evaluate,
  ),
};
