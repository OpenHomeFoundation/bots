import { type DynamicModule, Module } from "@nestjs/common";
import { HEALTH_CONFIG } from "./health.constants.js";
import { HealthController } from "./health.controller.js";
import type { HealthControllerConfigParams } from "./health.models.js";
import { HealthService } from "./health.service.js";

/**
 * Provides the operational health endpoints (`__lbheartbeat__`,
 * `__heartbeat__`, `__version__`) that load balancers and monitoring consume.
 */
@Module({})
export class HealthModule {
  /**
   * Registers the health module with the supplied configuration.
   *
   * @param options The version and optional extra health-data provider.
   * @returns A dynamic module exposing the health controller.
   */
  static register(options: HealthControllerConfigParams): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [{ provide: HEALTH_CONFIG, useValue: options }, HealthService],
    };
  }
}
