import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Rule, RuleOutput } from "../engine/types.js";

type HandledEvent = EventType.ISSUES_OPENED | EventType.ISSUES_ON_DEMAND;

/** Issue-form heading the Core and frontend bug templates both use. */
export const CORE_VERSION_HEADING = "What version of Home Assistant Core has the issue?";

/** A beta build, e.g. `2026.12.0b2` or `core-2026.12.0b2`. */
const BETA_VERSION = /\b(\d{4})\.(\d{1,2})\.\d+b\d+\b/;

/** The answer under an issue-form `### heading`, up to the next heading. */
export function formSection(body: string, heading: string): string | undefined {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `### ${heading}`);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("### "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/**
 * The milestone title of the release a beta build belongs to:
 * `2026.12.0b2` → `2026.12.0`. Undefined when the text names no beta.
 */
export function betaReleaseMilestone(text: string): string | undefined {
  const match = BETA_VERSION.exec(text);
  if (!match) return undefined;
  return `${match[1]}.${Number(match[2])}.0`;
}

/**
 * Puts issues reported against a beta on that release's milestone, read from
 * the version the reporter filled in on the issue form. Leaves issues that
 * already have a milestone alone, so a maintainer's choice always wins, and
 * does nothing when the milestone isn't open (the release already shipped).
 */
export function betaMilestone(config: { heading?: string } = {}): Rule {
  const heading = config.heading ?? CORE_VERSION_HEADING;

  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    if ((await ctx.target.state()) !== "open") return;
    if (await ctx.target.milestone()) return;

    const section = formSection((await ctx.target.body()) ?? "", heading);
    if (section === undefined) return;
    const title = betaReleaseMilestone(section);
    if (!title) return;

    const milestone = (await ctx.openMilestones()).find((m) => m.title === title);
    if (!milestone) return;

    return { effects: [{ type: "setMilestone", milestone: milestone.number }] };
  }

  return {
    name: "beta-milestone",
    description: "Puts issues reported against a beta on that release's milestone",
    events: on([EventType.ISSUES_OPENED, EventType.ISSUES_ON_DEMAND], evaluate),
  };
}
