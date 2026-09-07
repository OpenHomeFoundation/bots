import type { Provider } from "@nestjs/common";
import { registryConfig } from "./manifests/index.js";

/**
 * Injection token for the GitHub rule/command registry. Consumers inject it
 * instead of importing `manifests/index.js` directly, so tests can substitute
 * a registry through DI (or a plain constructor argument) rather than a
 * module mock.
 */
export const REGISTRY_CONFIG = Symbol("REGISTRY_CONFIG");

export const registryConfigProvider: Provider = {
  provide: REGISTRY_CONFIG,
  useValue: registryConfig,
};
