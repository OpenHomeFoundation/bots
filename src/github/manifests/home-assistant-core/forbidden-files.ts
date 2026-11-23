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
    pattern: /^homeassistant\/components\/[^/]+\/brand\//,
    reason:
      "brand images go to the [brands repository](https://github.com/home-assistant/brands), " +
      "not core. See the " +
      "[brand images docs](https://developers.home-assistant.io/docs/core/integration/brand_images).",
  },
  {
    pattern: /^homeassistant\/components\/[^/]+\/device_(action|condition|trigger)\.py$/,
    statuses: ["added"],
    reason:
      "new device triggers, actions and conditions are no longer accepted. See the " +
      "[device automation docs](https://developers.home-assistant.io/docs/device_automation_index).",
  },
];
