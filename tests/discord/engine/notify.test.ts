import { describe, expect, it, vi } from "vitest";
import type { ChannelPort } from "../../../src/discord/engine/apply.js";
import type { GuildRegistry } from "../../../src/discord/engine/dispatch.js";
import {
  createNotificationDelivery,
  renderNotification,
  routeNotification,
} from "../../../src/discord/engine/notify.js";
import type { BetaIssueNotification } from "../../../src/notifications/types.js";

const NOTIFICATION: BetaIssueNotification = {
  topic: "beta-issue",
  repository: "home-assistant/core",
  number: 195162,
  title: "UniFi Protect: entities re-added after the console restarts",
  url: "https://github.com/home-assistant/core/issues/195162",
  author: "reporter",
  milestone: "2026.12.0",
};

function registry(notifications?: Record<string, string>): GuildRegistry {
  return {
    guilds: {
      "1": { messageFile: "x.yaml", commands: [], listeners: [], notifications },
      "2": { messageFile: "y.yaml", commands: [], listeners: [] },
    },
  };
}

function fakeChannels(): ChannelPort & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => undefined), deleteMessage: vi.fn(async () => undefined) };
}

describe("renderNotification", () => {
  it("renders a beta issue as a linked embed", () => {
    expect(renderNotification(NOTIFICATION)).toEqual({
      title: "#195162 UniFi Protect: entities re-added after the console restarts",
      url: "https://github.com/home-assistant/core/issues/195162",
      fields: [
        { name: "Repository", value: "home-assistant/core", inline: true },
        { name: "Milestone", value: "2026.12.0", inline: true },
        { name: "Reported by", value: "reporter", inline: true },
      ],
    });
  });

  it("truncates titles to Discord's embed title limit", () => {
    const title = renderNotification({ ...NOTIFICATION, title: "x".repeat(300) }).title ?? "";

    expect(title).toHaveLength(256);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("routeNotification", () => {
  it("sends to the channel each guild routes the topic to", () => {
    const effects = routeNotification(registry({ "beta-issue": "999" }), NOTIFICATION);

    expect(effects).toEqual([
      { type: "sendMessage", channelId: "999", embeds: [renderNotification(NOTIFICATION)] },
    ]);
  });

  it("sends nothing when no guild routes the topic", () => {
    expect(routeNotification(registry(), NOTIFICATION)).toEqual([]);
  });
});

describe("createNotificationDelivery", () => {
  it("delivers each notification once", async () => {
    const channels = fakeChannels();
    const deliver = createNotificationDelivery(registry({ "beta-issue": "999" }), channels);

    await deliver(NOTIFICATION);
    await deliver({ ...NOTIFICATION, title: "Renamed" });
    await deliver({ ...NOTIFICATION, number: 1 });

    expect(channels.send).toHaveBeenCalledTimes(2);
    expect(channels.send).toHaveBeenNthCalledWith(1, "999", expect.anything());
  });

  it("does not remember notifications nobody routes", async () => {
    const channels = fakeChannels();
    const reg = registry();
    const deliver = createNotificationDelivery(reg, channels);

    await deliver(NOTIFICATION);
    reg.guilds["1"].notifications = { "beta-issue": "999" };
    await deliver(NOTIFICATION);

    expect(channels.send).toHaveBeenCalledTimes(1);
  });
});
