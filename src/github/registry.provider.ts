import type { Provider } from "@nestjs/common";
import { registryConfig } from "./manifests/index.js";

/**
 * Injection token for the GitHub rule/command registry
 */
export const REGISTRY_CONFIG = Symbol("REGISTRY_CONFIG");

export const registryConfigProvider: Provider = {
  provide: REGISTRY_CONFIG,
  useValue: registryConfig,
};
