/**
 * Helpers for user-controlled text that ends up in a comment the bot posts.
 * The bot is an org member: its `@user` and `@org/team` mentions notify,
 * which outside contributors could not do themselves.
 */

/** `text` as a code span the text itself cannot close. */
export function codeSpan(text: string): string {
  const runs = [...text.matchAll(/`+/g)].map((m) => m[0].length);
  const fence = "`".repeat(Math.max(0, ...runs) + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text.replace(/\r?\n/g, " ")}${pad}${fence}`;
}

/** `text` with every mention split by a zero-width space, so none notifies. */
export function neutraliseMentions(text: string): string {
  return text.replace(/@(?=\w)/g, "@\u200B");
}

/** `text` with HTML comment openers defused, so it cannot hide or forge the bot's markers. */
export function defuseHtmlComments(text: string): string {
  return text.replaceAll("<!--", "&lt;!--");
}
