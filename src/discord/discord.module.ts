import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config.module.js";
import { DiscordGatewayService } from "./gateway.service.js";
import { discordRegistryProvider } from "./registry.provider.js";

@Module({
  imports: [AppConfigModule],
  providers: [discordRegistryProvider, DiscordGatewayService],
})
export class DiscordModule {}
