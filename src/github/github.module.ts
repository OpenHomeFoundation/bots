import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config.module.js";
import { GithubController } from "./github.controller.js";
import { OCTOKIT, octokitProvider } from "./octokit.provider.js";
import { REGISTRY_CONFIG, registryConfigProvider } from "./registry.provider.js";
import { WebhookService } from "./webhook.service.js";

@Module({
  imports: [AppConfigModule],
  controllers: [GithubController],
  providers: [octokitProvider, registryConfigProvider, WebhookService],
  exports: [OCTOKIT, REGISTRY_CONFIG],
})
export class GithubModule {}
