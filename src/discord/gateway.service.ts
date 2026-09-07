import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { Client } from "discord.js";
import { ENV, type Env } from "../env.js";
import { log } from "../log.js";
import type { GuildRegistry } from "./engine/dispatch.js";
import { startDiscordGateway } from "./engine/gateway.js";
import { DISCORD_REGISTRY } from "./registry.provider.js";

@Injectable()
export class DiscordGatewayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private client: Client | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DISCORD_REGISTRY) private readonly registry: GuildRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const token = this.env.DISCORD_TOKEN;
    if (!token) return;

    // Fire-and-forget: a Discord outage must not block or take down the
    // webhook endpoints.
    startDiscordGateway(this.registry, { token })
      .then((client) => {
        this.client = client;
      })
      .catch((err) => {
        log.exception(err instanceof Error ? err : new Error(String(err)));
      });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.destroy();
  }
}
