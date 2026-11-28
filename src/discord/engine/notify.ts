import type { Notification, NotificationTopic } from "../../notifications/types.js";
import { notificationKey } from "../../notifications/types.js";
import { applyDiscordEffects, type ChannelPort } from "./apply.js";
import type { GuildRegistry } from "./dispatch.js";
import type { DiscordEffect, Embed } from "./types.js";

/** Topic → channel snowflake that hears about it, per guild. */
export type NotificationRoutes = Partial<Record<NotificationTopic, string>>;

/** Discord's embed title limit. */
const EMBED_TITLE_MAX = 256;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function renderNotification(notification: Notification): Embed {
  switch (notification.topic) {
    case "beta-issue":
      return {
        title: truncate(`#${notification.number} ${notification.title}`, EMBED_TITLE_MAX),
        url: notification.url,
        fields: [
          { name: "Repository", value: notification.repository, inline: true },
          { name: "Milestone", value: notification.milestone, inline: true },
          { name: "Reported by", value: notification.author, inline: true },
        ],
      };
  }
}

/** One message per guild that routes the notification's topic to a channel. */
export function routeNotification(
  registry: GuildRegistry,
  notification: Notification,
): DiscordEffect[] {
  const embed = renderNotification(notification);
  return Object.values(registry.guilds).flatMap((guild) => {
    const channelId = guild.notifications?.[notification.topic];
    return channelId ? [{ type: "sendMessage" as const, channelId, embeds: [embed] }] : [];
  });
}

/** How many delivered notifications are remembered to skip repeats. */
const REMEMBERED = 1000;

/**
 * A notification-bus handler delivering through `channels`. Each notification
 * is delivered once per process: an issue taken off the beta milestone and put
 * back is not announced twice (until a restart forgets it).
 */
export function createNotificationDelivery(
  registry: GuildRegistry,
  channels: ChannelPort,
): (notification: Notification) => Promise<void> {
  const delivered = new Set<string>();
  return async (notification) => {
    const key = notificationKey(notification);
    if (delivered.has(key)) return;
    const effects = routeNotification(registry, notification);
    if (effects.length === 0) return;
    delivered.add(key);
    if (delivered.size > REMEMBERED) {
      // Sets iterate in insertion order: drop the oldest.
      delivered.delete(delivered.values().next().value as string);
    }
    await applyDiscordEffects(effects, { channels });
  };
}
