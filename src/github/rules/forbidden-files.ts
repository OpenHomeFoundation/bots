import { EventType } from "../engine/event.js";
import type { ListPullRequestFiles } from "../engine/model/pull-request.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { type CheckOutcome, check } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";

type FileStatus = ListPullRequestFiles[number]["status"];

export interface ForbiddenFile {
  /** Matched against the repo-relative path. */
  pattern: RegExp;
  /** File changes that count. Defaults to anything but a removal, so cleanups pass. */
  statuses?: readonly FileStatus[];
  /** Why the file must not be committed; shown after the matched paths. */
  reason: string;
}

const SHOWN_PATHS = 5;

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

function listPaths(paths: string[]): string {
  const shown = paths
    .slice(0, SHOWN_PATHS)
    .map((p) => `\`${p}\``)
    .join(", ");
  return paths.length > SHOWN_PATHS ? `${shown} and ${paths.length - SHOWN_PATHS} more` : shown;
}

export function forbiddenFiles(config: {
  /**
   * Only PRs into this branch are checked: release PRs carry files that were
   * already reviewed (or waived) on their way into it.
   */
  base?: string;
  files: readonly ForbiddenFile[];
}): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome> {
    if (config.base && (await ctx.target.baseRef()) !== config.base) {
      return { status: "skip", message: `Only checked on PRs into \`${config.base}\`.` };
    }

    const changed = await ctx.target.files();
    const findings = config.files.flatMap((entry) => {
      const paths = changed
        .filter((f) =>
          entry.statuses ? entry.statuses.includes(f.status) : f.status !== "removed",
        )
        .map((f) => f.filename)
        .filter((path) => entry.pattern.test(path))
        .sort();
      return paths.length > 0 ? [`- ${listPaths(paths)}: ${entry.reason}`] : [];
    });

    if (findings.length === 0) {
      return { status: "pass", message: "No forbidden files." };
    }
    return { status: "fail", message: findings.join("\n") };
  }

  return check({
    id: "forbidden-files",
    title: "Forbidden files",
    waivableBy: "member",
    description: "Fails PRs that commit files the repository doesn't accept",
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
