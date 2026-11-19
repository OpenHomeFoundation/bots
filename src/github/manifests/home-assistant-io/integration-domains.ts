import type { ListPullRequestFiles } from "../../engine/model/pull-request.js";

// A platform page (`sensor.mqtt`) names the integration in its second
// segment, as `/integrations/sensor.mqtt/` links do.
const INTEGRATION_PAGE = /^source\/_integrations\/(?:[a-z0-9_]+\.)?([a-z0-9_]+)\.markdown$/;

/** Integration domains of the integration pages a docs PR changes. */
export function domainsFromFiles(files: ListPullRequestFiles): string[] {
  const domains = new Set<string>();
  for (const { filename } of files) {
    const domain = filename.match(INTEGRATION_PAGE)?.[1];
    if (domain) domains.add(domain);
  }
  return [...domains];
}
