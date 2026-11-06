import { Controller, Get } from "@nestjs/common";
import type { Version } from "./health.models.js";
// biome-ignore lint/style/useImportType: DI paramtype - `import type` gets erased
import { HealthService } from "./health.service.js";

/**
 * Operational health endpoints used by load balancers and monitoring. The
 * `__dunder__` route names are the OHF convention shared by every NestJS
 * service, so probes are configured identically across deployments.
 */
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Lightweight load-balancer heartbeat. */
  @Get("__lbheartbeat__")
  lbheartbeat(): Record<string, unknown> {
    return this.healthService.lbheartbeat();
  }

  /** Deep heartbeat, including application-specific health data when configured. */
  @Get("__heartbeat__")
  heartbeat(): Promise<Record<string, unknown>> {
    return this.healthService.heartbeat();
  }

  /** The running application version and build commit. */
  @Get("__version__")
  versionData(): Version {
    return this.healthService.version();
  }
}
