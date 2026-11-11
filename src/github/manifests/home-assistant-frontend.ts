import { ignore, unignore } from "../commands/ignore.js";
import { update } from "../commands/update.js";
import { blockingLabels } from "../rules/blocking-labels.js";
import {
  HomeAssistantRepository,
  homeAssistantLinkRules,
  homeAssistantOrgRules,
} from "./home-assistant-org.js";
import type { RepoManifest } from "./types.js";

export const homeAssistantFrontend: RepoManifest = {
  slug: HomeAssistantRepository.FRONTEND,
  dashboard: true,
  rules: [
    // Related PRs
    ...homeAssistantLinkRules,

    // Classification & process
    blockingLabels({
      "wait for backend": { message: "This PR is awaiting changes to the backend" },
    }),

    // Org-wide
    ...homeAssistantOrgRules,
  ],
  commands: [update, ignore, unignore],
};
