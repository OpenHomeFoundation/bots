import { EventType } from "../engine/event.js";
import type { PullRequest } from "../engine/model/pull-request.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_PATTERN = /^\s*(```|~~~)/;

/** Case, surrounding whitespace and a trailing colon don't make a heading different. */
function normalize(heading: string): string {
  return heading.trim().replace(/:$/, "").trim().toLowerCase();
}

type Line = { text: string; heading?: { level: number; name: string } };

/**
 * Splits a PR body into its headed sections, keyed by normalized heading.
 * Template comments are stripped first: they hold the template's own
 * instructions, so a section with only its comment left is still empty.
 * A section runs until the next heading of the same or a higher level, so
 * text under a subheading (`### Details` inside `## Proposed change`) still
 * counts as the parent's content; the subheading lines themselves don't.
 * Lines inside fenced code blocks are never headings.
 */
export function parseSections(body: string | null): Map<string, string> {
  const sections = new Map<string, string>();
  if (!body) return sections;

  let inFence = false;
  const lines: Line[] = body
    .replace(COMMENT_PATTERN, "")
    .split(/\r?\n/)
    .map((text) => {
      if (FENCE_PATTERN.test(text)) inFence = !inFence;
      const match = inFence ? null : HEADING_PATTERN.exec(text);
      return match
        ? { text, heading: { level: match[1].length, name: normalize(match[2]) } }
        : { text };
    });

  lines.forEach(({ heading }, start) => {
    if (!heading || sections.has(heading.name)) return;
    const content: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (line.heading && line.heading.level <= heading.level) break;
      if (!line.heading) content.push(line.text);
    }
    sections.set(heading.name, content.join("\n").trim());
  });
  return sections;
}

export function prTemplate(config: {
  /** Headings the PR description must keep, as written in the repo's template. */
  sections: string[];
  /** Headings (a subset of `sections`) that must also hold the contributor's own text. */
  requireContent?: string[];
  /** Repo policy for PRs that don't use the template; return the skip reason. */
  skip?: (pr: PullRequest) => Promise<string | undefined>;
}): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
    // allowBots stops bot-sent events; this also covers a human editing a bot's PR.
    if ((await ctx.target.authorLogin()).endsWith("[bot]")) {
      return { status: "skip", message: "Not checked on PRs opened by bots." };
    }
    const reason = await config.skip?.(ctx.target);
    if (reason) return { status: "skip", message: reason };

    const sections = parseSections(await ctx.target.body());
    const issues: string[] = [];
    for (const heading of config.sections) {
      const content = sections.get(normalize(heading));
      if (content === undefined) {
        issues.push(`The **${heading}** section is missing.`);
      } else if (config.requireContent?.includes(heading) && content === "") {
        issues.push(`The **${heading}** section is empty.`);
      }
    }

    if (issues.length === 0) {
      return { status: "pass", message: "The PR description follows the template." };
    }
    return {
      status: "fail",
      message: [
        "Please fill in the PR description using the template:",
        ...issues.map((i) => `- ${i}`),
      ].join("\n"),
    };
  }

  return check({
    id: "pr-template",
    title: "PR description",
    description:
      `Requires the PR description to keep the template's ${config.sections
        .map((s) => `**${s}**`)
        .join(", ")} sections` +
      (config.requireContent?.length
        ? `, with ${config.requireContent.map((s) => `**${s}**`).join(", ")} filled in.`
        : "."),
    allowBots: false,
    events: [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_REOPENED,
      EventType.PULL_REQUEST_EDITED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.ON_DEMAND,
    ],
    evaluate,
  });
}
