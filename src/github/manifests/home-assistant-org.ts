import { cla } from "../../cla/rule.js";
import { slugOf } from "../../util/item-ref.js";
import { update } from "../commands/update.js";
import type { Rule } from "../engine/types.js";
import { belongsTogether } from "../rules/belongs-together.js";
import { draftOnChangesRequested } from "../rules/draft-on-changes-requested.js";
import { followParent } from "../rules/follow-parent.js";
import type { PrLinks } from "../rules/linked-prs.js";
import { pokeLinked } from "../rules/poke-linked.js";
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
  CONTRIBUTORS_HOME_ASSISTANT = "home-assistant/contributors.home-assistant.io",
  CORE = "home-assistant/core",
  DEVELOPERS_HOME_ASSISTANT = "home-assistant/developers.home-assistant",
  FRONTEND = "home-assistant/frontend",
  HOME_ASSISTANT_IO = "home-assistant/home-assistant.io",
  IOS = "home-assistant/iOS",
  MY_HOME_ASSISTANT = "home-assistant/my.home-assistant.io",
  OPERATING_SYSTEM = "home-assistant/operating-system",
  SUPERVISED_INSTALLER = "home-assistant/supervised-installer",
  SUPERVISOR = "home-assistant/supervisor",
}

const {
  ANDROID,
  BRANDS,
  COMPANION_HOME_ASSISTANT,
  CONTRIBUTORS_HOME_ASSISTANT,
  CORE,
  FRONTEND,
  HOME_ASSISTANT_IO,
  IOS,
  SUPERVISOR,
} = HomeAssistantRepository;

/**
 * Each repo whose PRs follow code (docs, brands), with the code repos it
 * follows. One entry per pair, as the code side's view follows from it; any
 * other two repos don't pair.
 */
const FOLLOWS = new Map<string, string[]>(
  (
    [
      [HOME_ASSISTANT_IO, [CORE, FRONTEND, SUPERVISOR]],
      [CONTRIBUTORS_HOME_ASSISTANT, [CORE, FRONTEND, SUPERVISOR, ANDROID, IOS]],
      [COMPANION_HOME_ASSISTANT, [ANDROID, IOS]],
      [BRANDS, [CORE]],
    ] as const
  ).map(([follower, code]) => [follower.toLowerCase(), code.map((slug) => slug.toLowerCase())]),
);

/** Where home-assistant PR templates list the PRs that belong together. */
export const homeAssistantPrLinks: PrLinks = {
  label: "This PR belongs together with",
  legacyLabels: [
    // core, frontend, supervisor, brands
    "Link to documentation pull request",
    "Link to contributors documentation pull request",
    "Link to developer documentation pull request",
    "Link to brands pull request",
    "Link to My Home Assistant pull request",
    "Link to frontend pull request",
    "Link to backend pull request",
    "Link to cli pull request",
    "Link to client library pull request",
    "Link to code base pull request",
    // home-assistant.io, contributors.home-assistant.io
    "Link to parent pull request in the codebase",
    "Link to parent pull request in the Brands repository",
    "This PR documents an open pull request (merge this PR after it)",
    // companion.home-assistant, developers.home-assistant
    "Link to relevant existing code or pull request",
  ],
  relationOf: (self, other) => {
    const [a, b] = [slugOf(self).toLowerCase(), slugOf(other).toLowerCase()];
    if (FOLLOWS.get(a)?.includes(b)) return "parent";
    if (FOLLOWS.get(b)?.includes(a)) return "child";
    return null;
  },
};

/**
 * What every repo with a dashboard runs for PRs that belong together. On a
 * code repo `followParent` finds no parents, so one list fits every manifest.
 */
export const homeAssistantLinkRules: Rule[] = [
  belongsTogether(homeAssistantPrLinks),
  pokeLinked(homeAssistantPrLinks),
  followParent(homeAssistantPrLinks),
];

/**
 * Rules every home-assistant org repo runs. Spread these into each repo
 * manifest (`...homeAssistantOrgRules`) so the manifest stays the single
 * top-to-bottom list of everything that runs on the repo.
 */
export const homeAssistantOrgRules: Rule[] = [wth, draftOnChangesRequested, readyForReview, cla];

/** Every org repo without a manifest of its own. */
export const homeAssistantOrg: OrgManifest = {
  org: Organization.HOME_ASSISTANT,
  rules: homeAssistantOrgRules,
  commands: [update],
};
