import "./instrument.js";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { appOptions, setupApp } from "./app.setup.js";
import { migrateClaDatabaseWithRetry } from "./cla/migrations.js";
import { loadEnv } from "./env.js";
import { log } from "./log.js";

const env = loadEnv();

// Not awaited: an unreachable CLA database must degrade only the CLA check,
// not keep the GitHub and Discord halves from booting. Retries until done.
void migrateClaDatabaseWithRetry(env);

const app = await NestFactory.create<NestExpressApplication>(AppModule, appOptions);
setupApp(app);
app.enableShutdownHooks();
await app.listen(env.PORT);

log.info(`bot finished setup`);
