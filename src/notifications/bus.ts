import { log } from "../log.js";
import type { Notification } from "./types.js";

export type NotificationHandler = (notification: Notification) => Promise<void>;

/**
 * In-process hand-off between engines. Publishing never fails the publisher:
 * with no subscriber (Discord disabled) a notification is dropped, and a
 * subscriber's failure is logged, not thrown.
 */
export class NotificationBus {
  private readonly handlers = new Set<NotificationHandler>();

  /** Returns the unsubscribe function. */
  subscribe(handler: NotificationHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async publish(notification: Notification): Promise<void> {
    await Promise.all(
      [...this.handlers].map((handler) =>
        handler(notification).catch((err) => {
          log.warn("notifications: handler failed", {
            topic: notification.topic,
            error: String(err),
          });
        }),
      ),
    );
  }
}

/** The process-wide bus: the GitHub dispatcher publishes, the Discord gateway subscribes. */
export const notificationBus = new NotificationBus();
