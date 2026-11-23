import { ignore, unignore } from "../../commands/ignore.js";
import { update } from "../../commands/update.js";
import {
  HomeAssistantRepository,
  homeAssistantLinkRules,
  homeAssistantOrgRules,
} from "../home-assistant-org.js";
import type { RepoManifest } from "../types.js";
import { changeType } from "./rules/change-type.js";

export const homeAssistantSupervisor: RepoManifest = {
  slug: HomeAssistantRepository.SUPERVISOR,
  dashboard: true,
  rules: [changeType, ...homeAssistantLinkRules, ...homeAssistantOrgRules],
  commands: [update, ignore, unignore],
};
