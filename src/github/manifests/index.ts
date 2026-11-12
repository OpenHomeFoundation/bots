import type { Command, RegistryConfig, RepoConfig, Rule } from "../engine/types.js";
import { esphomeOrg } from "./esphome-org.js";
import { homeAssistantBrands } from "./home-assistant-brands.js";
import { homeAssistantContributors } from "./home-assistant-contributors.js";
import { homeAssistantCore } from "./home-assistant-core/index.js";
import { homeAssistantFrontend } from "./home-assistant-frontend.js";
import { homeAssistantIo } from "./home-assistant-io/index.js";
import { homeAssistantOrg } from "./home-assistant-org.js";
import { homeAssistantSupervisor } from "./home-assistant-supervisor/index.js";
import type { OrgManifest, RepoManifest } from "./types.js";

/** Repos with rules of their own. Add a repo by authoring a manifest and listing it here. */
const MANIFESTS: RepoManifest[] = [
  homeAssistantBrands,
  homeAssistantContributors,
  homeAssistantCore,
  homeAssistantFrontend,
  homeAssistantIo,
  homeAssistantSupervisor,
];

/** Orgs the bot acts in; every repo not in {@link MANIFESTS} runs its org's manifest. */
const ORG_MANIFESTS: OrgManifest[] = [homeAssistantOrg, esphomeOrg];

/**
 * Boot-time guardrails. The dispatcher silently dedupes rules and commands
 * by name, so a duplicate name would hide a mis-wire; two rules claiming the
 * same status section would fight over it. Fail loudly at module load
 * instead.
 */
function validate(slug: string, rules: Rule[], commands: Command[]): void {
  const names = new Set<string>();
  const sectionOwner = new Map<string, string>();
  for (const rule of rules) {
    if (names.has(rule.name)) {
      throw new Error(`[${slug}] duplicate rule name "${rule.name}"`);
    }
    names.add(rule.name);
    for (const { id } of rule.statusSections ?? []) {
      const owner = sectionOwner.get(id);
      if (owner) {
        throw new Error(
          `[${slug}] status section "${id}" claimed by both "${owner}" and "${rule.name}"`,
        );
      }
      sectionOwner.set(id, rule.name);
    }
  }

  const commandNames = new Set<string>();
  for (const command of commands) {
    if (commandNames.has(command.name)) {
      throw new Error(`[${slug}] duplicate command name "${command.name}"`);
    }
    commandNames.add(command.name);
  }
}

function build(): RegistryConfig {
  const repositories: Record<string, RepoConfig> = {};
  for (const { slug, aliases = [], commands = [], ...manifest } of MANIFESTS) {
    validate(slug, manifest.rules, commands);
    const config: RepoConfig = { ...manifest, commands };
    for (const name of [slug, ...aliases]) {
      if (repositories[name]) {
        throw new Error(`Repository "${name}" is declared by more than one manifest`);
      }
      repositories[name] = config;
    }
  }
  const orgs: Record<string, RepoConfig> = {};
  for (const { org, ...config } of ORG_MANIFESTS) {
    validate(org, config.rules, config.commands);
    orgs[org] = config;
  }
  return { repositories, orgs };
}

/**
 * The dispatcher's registry, assembled from every {@link RepoManifest} and
 * {@link OrgManifest}. One config serves both PR and issue webhooks —
 * `matchRules` filters each rule by the events it declares.
 */
export const registryConfig: RegistryConfig = build();
