import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { SentryModule } from "@sentry/nestjs/setup";
import { ClaModule } from "./cla/cla.module.js";
import { AppConfigModule } from "./config.module.js";
import { DiscordModule } from "./discord/discord.module.js";
import { GithubModule } from "./github/github.module.js";
import { HealthModule } from "./health/health.module.js";
import { UnhandledExceptionFilter } from "./unhandled-exception.filter.js";
import { packageJson } from "./util/package-info.js";

@Module({
  imports: [
    SentryModule.forRoot(),
    AppConfigModule,
    GithubModule,
    ClaModule,
    DiscordModule,
    // GIT_COMMIT is read off process.env rather than the ENV provider: the
    // register() call runs while this module is being defined, before any
    // provider exists. The env schema still documents and validates it.
    HealthModule.register({
      version: {
        version: packageJson.version,
        commit: process.env.GIT_COMMIT ?? "dev",
      },
    }),
  ],
  providers: [{ provide: APP_FILTER, useClass: UnhandledExceptionFilter }],
})
export class AppModule {}
