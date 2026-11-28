import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Rule, RuleOutput } from "../engine/types.js";
import { betaReleaseMilestone } from "./beta-milestone.js";

/** Core: its releases say which release is in beta for every repo. */
const CORE = { owner: "home-assistant", name: "core" };

/**
 * Announces an issue once it lands on the milestone of the release currently
 * in beta, whoever put it there: beta-milestone, or a maintainer by hand. The
 * beta is read off the latest release of `betaSource` (Core by default): a
 * prerelease `2026.12.0b2` means `2026.12.0` is in beta; a stable latest
 * release means no beta is running and nothing is announced.
 */
export function betaIssueNotify(
  config: { betaSource?: { owner: string; name: string } } = {},
): Rule {
  const betaSource = config.betaSource ?? CORE;

  async function evaluate(
    ctx: RuleContext<EventType.ISSUES_MILESTONED>,
  ): Promise<RuleOutput | undefined> {
    const { milestone } = ctx.event;
    if (milestone.state !== "open") return;
    if ((await ctx.target.state()) !== "open") return;

    const release = await ctx.latestRelease(betaSource);
    if (!release?.prerelease) return;
    if (betaReleaseMilestone(release.tag) !== milestone.title) return;

    return {
      effects: [
        {
          type: "notify",
          notification: {
            topic: "beta-issue",
            repository: ctx.repo.fullName,
            number: ctx.number,
            title: await ctx.target.title(),
            url: ctx.logContext.url,
            author: await ctx.target.authorLogin(),
            milestone: milestone.title,
          },
        },
      ],
    };
  }

  return {
    name: "beta-issue-notify",
    description: "Announces issues put on the milestone of the release in beta",
    events: on([EventType.ISSUES_MILESTONED], evaluate),
  };
}
