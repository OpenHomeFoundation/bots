import { evaluateIssue, evaluatePR } from "../engine/evaluate.js";
import type { Command } from "../engine/types.js";
import { UsageError } from "../engine/usage-error.js";
import { rateLimiter } from "../rate-limiter.js";

// A re-evaluation is the most expensive thing a comment can trigger, and
// anyone may trigger it; the cap keeps one item from draining the
// installation's rate limit. Members are exempt.
const WINDOW_MS = 30 * 60 * 1000;
const MAX_RUNS_PER_WINDOW = 10;
const runs = rateLimiter(MAX_RUNS_PER_WINDOW, WINDOW_MS);

/** Test hook: forget every recorded run. */
export function resetUpdateRateLimit(): void {
  runs.reset();
}

export const update: Command = {
  name: "update",
  description: "Re-runs the bot's checks on the issue or pull request.",
  permission: "none",

  async handle(context) {
    const ref = { owner: context.repo.owner, repo: context.repo.name, number: context.number };
    if (!runs.take(`${context.repo.fullName}#${context.number}`)) {
      if (!(await context.senderIsMember())) {
        throw new UsageError(
          `at most ${MAX_RUNS_PER_WINDOW} updates per ${WINDOW_MS / 60_000} minutes`,
        );
      }
    }
    if (context.target.kind === "pull_request") {
      await evaluatePR(context.env, context.registry, context.github, ref);
    } else {
      await evaluateIssue(context.env, context.registry, context.github, ref);
    }
    return undefined;
  },
};
