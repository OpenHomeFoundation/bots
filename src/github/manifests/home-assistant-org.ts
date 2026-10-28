import { cla } from "../../cla/rule.js";
import { update } from "../commands/update.js";
import type { Rule } from "../engine/types.js";
import { draftOnChangesRequested } from "../rules/draft-on-changes-requested.js";
import { hacktoberfest } from "../rules/hacktoberfest.js";
import { readyForReview } from "../rules/ready-for-review.js";
import { wth } from "../rules/wth.js";
import { Organization, type OrgManifest } from "./types.js";

/** home-assistant org repos, for rules that need to reference one by slug. */
export enum HomeAssistantRepository {
  ANDROID = "home-assistant/android",
  APPS = "home-assistant/apps",
  BRANDS = "home-assistant/brands",
  CLI = "home-assistant/cli",
  COMPANION_HOME_ASSISTANT = "home-assistant/companion.home-assistant",
  CORE = "home-assistant/core",
  DEVELOPERS_HOME_ASSISTANT = "home-assistant/developers.home-assistant",
  FRONTEND = "home-assistant/frontend",
  HOME_ASSISTANT_IO = "home-assistant/home-assistant.io",
  INTENTS = "home-assistant/intents",
  IOS = "home-assistant/iOS",
  OPERATING_SYSTEM = "home-assistant/operating-system",
  SUPERVISED_INSTALLER = "home-assistant/supervised-installer",
  SUPERVISOR = "home-assistant/supervisor",
}

/**
 * Rules every home-assistant org repo runs. Spread these into each repo
 * manifest (`...homeAssistantOrgRules`) so the manifest stays the single
 * top-to-bottom list of everything that runs on the repo.
 */
export const homeAssistantOrgRules: Rule[] = [
  hacktoberfest,
  wth,
  draftOnChangesRequested,
  readyForReview,
  cla,
];

/** Every org repo without a manifest of its own. */
export const homeAssistantOrg: OrgManifest = {
  org: Organization.HOME_ASSISTANT,
  rules: homeAssistantOrgRules,
  commands: [update],
};
