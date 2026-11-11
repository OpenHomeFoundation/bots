import { cla } from "../../cla/rule.js";
import { slugOf } from "../../util/item-ref.js";
import { update } from "../commands/update.js";
import type { Rule } from "../engine/types.js";
import { belongsTogether } from "../rules/belongs-together.js";
import { draftOnChangesRequested } from "../rules/draft-on-changes-requested.js";
import { followParent } from "../rules/follow-parent.js";
import type { PrLinks, Relation } from "../rules/linked-prs.js";
import { pokeLinked } from "../rules/poke-linked.js";
import { readyForReview } from "../rules/ready-for-review.js";
import { siblingApproval } from "../rules/sibling-approval.js";
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
  INTENTS = "home-assistant/intents",
  IOS = "home-assistant/iOS",
  MY_HOME_ASSISTANT = "home-assistant/my.home-assistant.io",
  OPERATING_SYSTEM = "home-assistant/operating-system",
  SUPERVISED_INSTALLER = "home-assistant/supervised-installer",
  SUPERVISOR = "home-assistant/supervisor",
}

type LinkGroup = "code" | "docs" | "brands" | "links";

// A repo's own entry wins over its org's; a repo in no group is a library,
// released and bumped on its own, so its PRs never pair.
const REPO_GROUPS = new Map<string, LinkGroup | "library">(
  (
    [
      [HomeAssistantRepository.HOME_ASSISTANT_IO, "docs"],
      [HomeAssistantRepository.CONTRIBUTORS_HOME_ASSISTANT, "docs"],
      [HomeAssistantRepository.COMPANION_HOME_ASSISTANT, "docs"],
      [HomeAssistantRepository.DEVELOPERS_HOME_ASSISTANT, "docs"],
      [HomeAssistantRepository.BRANDS, "brands"],
      [HomeAssistantRepository.MY_HOME_ASSISTANT, "links"],
      ["home-assistant/home-assistant-js-websocket", "library"],
    ] as const
  ).map(([slug, group]) => [slug.toLowerCase(), group]),
);
const ORG_GROUPS = new Map<string, LinkGroup>([
  [Organization.HOME_ASSISTANT, "code"],
  ["ohf-voice", "code"],
]);

/** Row: this PR's group, column: the linked PR's. A pair that isn't listed doesn't pair. */
const RELATIONS: Record<LinkGroup, Partial<Record<LinkGroup, Relation>>> = {
  code: { code: "sibling", docs: "child", brands: "child", links: "child" },
  docs: { code: "parent", docs: "sibling", brands: "sibling" },
  brands: { code: "parent", docs: "sibling", brands: "sibling" },
  links: { code: "parent" },
};

function groupOf(repo: { owner: string; repo: string }): LinkGroup | undefined {
  const own = REPO_GROUPS.get(slugOf(repo).toLowerCase());
  if (own) return own === "library" ? undefined : own;
  return ORG_GROUPS.get(repo.owner.toLowerCase());
}

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
    const [from, to] = [groupOf(self), groupOf(other)];
    return (from && to && RELATIONS[from][to]) || null;
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
  siblingApproval(homeAssistantPrLinks),
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
