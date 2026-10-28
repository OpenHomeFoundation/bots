import type { NestExpressApplication } from "@nestjs/platform-express";
import { sign } from "@octokit/webhooks-methods";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { appOptions, setupApp } from "../src/app.setup.js";

// AppConfigModule validates process.env the moment app.module.ts is
// evaluated — preset before the dynamic import (static imports would hoist
// above these assignments). Empty DISCORD_TOKEN/SENTRY_DSN keep those
// integrations off.
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_PRIVATE_KEY = "test-key";
process.env.GITHUB_INSTALLATION_ID = "1";
process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
process.env.DISCORD_TOKEN = "";
process.env.SENTRY_DSN = "";
process.env.ENVIRONMENT = "test";

const { AppModule } = await import("../src/app.module.js");
const { Test } = await import("@nestjs/testing");

const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = moduleRef.createNestApplication<NestExpressApplication>(appOptions);
setupApp(app);
await app.init();
const server = app.getHttpServer();

afterAll(async () => {
  await app.close();
});

describe("server routing", () => {
  it("serves the load-balancer heartbeat", async () => {
    const res = await request(server).get("/__lbheartbeat__");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("serves the application heartbeat", async () => {
    const res = await request(server).get("/__heartbeat__");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("reports the running version and build commit", async () => {
    const res = await request(server).get("/__version__");

    expect(res.status).toBe(200);
    // The version tracks package.json; GIT_COMMIT is unset in tests, so the
    // commit falls back to the local-build marker.
    expect(res.body).toEqual({ version: expect.any(String), commit: "dev" });
  });

  it("rejects webhook posts with an invalid signature", async () => {
    const res = await request(server)
      .post("/github/webhook")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send("{}");

    expect(res.status).toBe(401);
  });

  it("accepts webhook posts with a valid signature", async () => {
    const body = JSON.stringify({ action: "opened" });
    const signature = await sign("test-secret", body);

    const res = await request(server)
      .post("/github/webhook")
      .set("content-type", "application/json")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });

  it("accepts webhook payloads above body-parser's 100 kB default", async () => {
    const body = JSON.stringify({ action: "opened", padding: "x".repeat(150_000) });
    const signature = await sign("test-secret", body);

    const res = await request(server)
      .post("/github/webhook")
      .set("content-type", "application/json")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", signature)
      .send(body);

    expect(res.status).toBe(200);
  });

  it("returns 404 for anything else", async () => {
    const res = await request(server).get("/nope");

    expect(res.status).toBe(404);
  });

  it("503s the CLA sign endpoint when the store is unconfigured", async () => {
    const res = await request(server)
      .post("/cla-sign")
      .set("content-type", "application/json")
      .send({ github_username: "alice" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: "CLA sign flow is not configured" });
  });

  it("503s the CLA authorize endpoint when OAuth creds are unconfigured", async () => {
    const res = await request(server)
      .post("/cla-sign/authorize")
      .set("content-type", "application/json")
      .send({ code: "abc" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: "CLA sign flow is not configured" });
  });
});

describe("CORS for the CLA sign form", () => {
  const preflight = (path: string, origin: string) =>
    request(server)
      .options(path)
      .set("origin", origin)
      .set("access-control-request-method", "POST")
      .set("access-control-request-headers", "content-type");

  it.each([
    ["/cla-sign/authorize", "https://www.home-assistant.io"],
    ["/cla-sign", "https://www.home-assistant.io"],
    ["/cla-sign", "https://home-assistant.io"],
  ])("allows the preflight for %s from %s", async (path, origin) => {
    const res = await preflight(path, origin);

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    expect(res.headers["access-control-allow-methods"]).toBe("POST");
    expect(res.headers["access-control-allow-headers"]).toBe("content-type");
  });

  it.each([
    "https://evil.example",
    "https://home-assistant.io.evil.example",
    "http://www.home-assistant.io",
  ])("withholds Access-Control-Allow-Origin from %s", async (origin) => {
    const res = await preflight("/cla-sign", origin);

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("lets the sign form read the response", async () => {
    const res = await request(server)
      .post("/cla-sign")
      .set("origin", "https://www.home-assistant.io")
      .set("content-type", "application/json")
      .send({ github_username: "alice" });

    expect(res.status).toBe(503);
    expect(res.headers["access-control-allow-origin"]).toBe("https://www.home-assistant.io");
  });
});
