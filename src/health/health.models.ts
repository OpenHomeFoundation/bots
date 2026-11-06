/** Build information reported by the `__version__` endpoint. */
export interface Version {
  /** The running application's semantic version (from package.json). */
  version: string;

  /** The git commit the running build came from. */
  commit: string;
}

/**
 * Configuration accepted by `HealthModule.register`. Lives here rather than
 * beside the module so the controller and service can import the type without
 * a cycle back through health.module.js.
 */
export interface HealthControllerConfigParams {
  /** Static version information reported by the `__version__` endpoint. */
  version: Version;

  /** Optional callback providing extra data for the `__heartbeat__` endpoint. */
  extraHealthData?: () => Promise<Record<string, unknown>>;
}
