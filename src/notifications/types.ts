/**
 * Facts one engine states for another to deliver. A GitHub rule says what
 * happened; the Discord engine owns which channel hears about it and how it
 * renders. One variant per topic, so both sides are typechecked against the
 * same shape.
 */
export type Notification = BetaIssueNotification;

export type NotificationTopic = Notification["topic"];

/** An issue landed on the milestone of the release currently in beta. */
export interface BetaIssueNotification {
  topic: "beta-issue";
  /** `owner/repo`. */
  repository: string;
  number: number;
  title: string;
  url: string;
  author: string;
  /** Milestone title, e.g. `2026.12.0`. */
  milestone: string;
}

/** Identity of a notification, for delivering each one only once. */
export function notificationKey(notification: Notification): string {
  return `${notification.topic}:${notification.repository}#${notification.number}`;
}
