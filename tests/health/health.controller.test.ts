import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { HealthControllerConfigParams } from "../../src/health/health.models.js";
import { HealthModule } from "../../src/health/health.module.js";

const version = { version: "1.2.3", commit: "abc1234" };

/**
 * Boots just the health module over HTTP: the routes are the contract other
 * OHF services and the Docker HEALTHCHECK depend on, so they are exercised
 * through the real Nest router rather than by calling the controller.
 */
async function healthApp(
  options: HealthControllerConfigParams = { version },
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [HealthModule.register(options)],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
  return app;
}

describe("health endpoints", () => {
  it("answers the load-balancer heartbeat with an empty object", async () => {
    const app = await healthApp();

    const res = await request(app.getHttpServer()).get("/__lbheartbeat__");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    await app.close();
  });

  it("answers the heartbeat with an empty object when no extra data is configured", async () => {
    const app = await healthApp();

    const res = await request(app.getHttpServer()).get("/__heartbeat__");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    await app.close();
  });

  it("answers the heartbeat with the configured extra data", async () => {
    const app = await healthApp({
      version,
      extraHealthData: async () => ({ discord: "connected" }),
    });

    const res = await request(app.getHttpServer()).get("/__heartbeat__");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ discord: "connected" });
    await app.close();
  });

  it("reports the configured version and commit", async () => {
    const app = await healthApp();

    const res = await request(app.getHttpServer()).get("/__version__");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(version);
    await app.close();
  });

  it("no longer serves the old /health route", async () => {
    const app = await healthApp();

    const res = await request(app.getHttpServer()).get("/health");

    expect(res.status).toBe(404);
    await app.close();
  });
});
