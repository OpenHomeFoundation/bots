import { Inject, Injectable } from "@nestjs/common";
import { HEALTH_CONFIG } from "./health.constants.js";
import type { HealthControllerConfigParams, Version } from "./health.models.js";

/**
 * Builds the payloads the health endpoints serve. The config it reads is the
 * value `HealthModule.register` was called with.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(HEALTH_CONFIG) private readonly config: HealthControllerConfigParams) {}

  /**
   * Load-balancer heartbeat payload: empty whenever the process can answer at
   * all. Deliberately checks nothing - a dependency outage must not take the
   * container out of rotation while it can still serve webhooks.
   */
  lbheartbeat(): Record<string, unknown> {
    return {};
  }

  /** Deep heartbeat payload: the configured extra health data, or empty. */
  async heartbeat(): Promise<Record<string, unknown>> {
    return this.config.extraHealthData ? await this.config.extraHealthData() : {};
  }

  /** The configured version and build commit. */
  version(): Version {
    return this.config.version;
  }
}
