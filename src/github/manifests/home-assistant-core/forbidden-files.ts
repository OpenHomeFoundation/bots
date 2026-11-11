import type { ForbiddenFile } from "../../rules/forbidden-files.js";

/** Files that must not be committed to home-assistant/core. */
export const coreForbiddenFiles: ForbiddenFile[] = [
  {
    pattern: /^homeassistant\/components\/[^/]+\/translations\//,
    reason:
      "`translations/` is generated from `strings.json` and must not be committed; " +
      "edit `strings.json` instead.",
  },
  {
    pattern: /^homeassistant\/components\/[^/]+\/device_(action|condition|trigger)\.py$/,
    statuses: ["added"],
    reason:
      "new device triggers, actions and conditions are no longer accepted. See the " +
      "[device automation docs](https://developers.home-assistant.io/docs/device_automation_index).",
  },
  {
    pattern: /^homeassistant\/components\/[^/]+\/(readme\.md|hacs\.json|info\.md)$/i,
    statuses: ["added"],
    reason:
      "README, HACS and info files are for custom integrations and don't belong in core. " +
      "Documentation goes in the " +
      "[home-assistant.io](https://github.com/home-assistant/home-assistant.io) repository.",
  },
];
