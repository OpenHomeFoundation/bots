import { ignore, unignore } from "../commands/ignore.js";
import { update } from "../commands/update.js";
import {
  HomeAssistantRepository,
  homeAssistantLinkRules,
  homeAssistantOrgRules,
} from "./home-assistant-org.js";
import type { RepoManifest } from "./types.js";

export const homeAssistantContributors: RepoManifest = {
  slug: HomeAssistantRepository.CONTRIBUTORS_HOME_ASSISTANT,
  dashboard: true,
  rules: [
    // Related PRs
    ...homeAssistantLinkRules,

    // Org-wide
    ...homeAssistantOrgRules,
  ],
  commands: [update, ignore, unignore],
};
