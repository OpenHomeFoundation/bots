import { describe, expect, it, vi } from "vitest";
import { log } from "../../src/log.js";
import { NotificationBus } from "../../src/notifications/bus.js";
import type { Notification } from "../../src/notifications/types.js";
import { notificationKey } from "../../src/notifications/types.js";
import { expectLoggedErrors } from "../helpers/log-guard.js";

const NOTIFICATION: Notification = {
  topic: "beta-issue",
  repository: "home-assistant/frontend",
  number: 7,
  title: "Broken card",
  url: "https://github.com/home-assistant/frontend/issues/7",
  author: "reporter",
  milestone: "2026.12.0",
};

describe("NotificationBus", () => {
  it("hands notifications to every subscriber", async () => {
    const bus = new NotificationBus();
    const a = vi.fn(async () => undefined);
    const b = vi.fn(async () => undefined);
    bus.subscribe(a);
    bus.subscribe(b);

    await bus.publish(NOTIFICATION);

    expect(a).toHaveBeenCalledWith(NOTIFICATION);
    expect(b).toHaveBeenCalledWith(NOTIFICATION);
  });

  it("stops delivering after unsubscribe", async () => {
    const bus = new NotificationBus();
    const handler = vi.fn(async () => undefined);
    const unsubscribe = bus.subscribe(handler);
    unsubscribe();

    await bus.publish(NOTIFICATION);

    expect(handler).not.toHaveBeenCalled();
  });

  it("drops a notification nobody subscribes to", async () => {
    await expect(new NotificationBus().publish(NOTIFICATION)).resolves.toBeUndefined();
  });

  it("keeps a failing subscriber from failing the publisher or other subscribers", async () => {
    expectLoggedErrors();
    const bus = new NotificationBus();
    const healthy = vi.fn(async () => undefined);
    bus.subscribe(async () => {
      throw new Error("discord down");
    });
    bus.subscribe(healthy);

    await expect(bus.publish(NOTIFICATION)).resolves.toBeUndefined();
    expect(healthy).toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith("notifications: handler failed", {
      topic: "beta-issue",
      error: "Error: discord down",
    });
  });
});

describe("notificationKey", () => {
  it("identifies a notification by topic and item", () => {
    expect(notificationKey(NOTIFICATION)).toBe("beta-issue:home-assistant/frontend#7");
  });
});
