import type { Provider } from "@nestjs/common";
import { discordRegistry } from "./manifests/index.js";

/**
 * Injection token for the Discord guild registry
 */
export const DISCORD_REGISTRY = Symbol("DISCORD_REGISTRY");

export const discordRegistryProvider: Provider = {
  provide: DISCORD_REGISTRY,
  useValue: discordRegistry,
};
