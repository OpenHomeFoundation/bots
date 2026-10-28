import "./instrument.js";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { appOptions, setupApp } from "./app.setup.js";
import { loadEnv } from "./env.js";
import { log } from "./log.js";

const env = loadEnv();

const app = await NestFactory.create<NestExpressApplication>(AppModule, appOptions);
setupApp(app);
app.enableShutdownHooks();
await app.listen(env.PORT);

log.info(`bot finished setup`);
