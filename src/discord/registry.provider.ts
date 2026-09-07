import type { Provider } from "@nestjs/common";
import { discordRegistry } from "./manifests/index.js";

/**
 * Injection token for the Discord guild registry — the DI counterpart of
 * `REGISTRY_CONFIG` on the GitHub side.
 */
export const DISCORD_REGISTRY = Symbol("DISCORD_REGISTRY");

export const discordRegistryProvider: Provider = {
  provide: DISCORD_REGISTRY,
  useValue: discordRegistry,
};
