import type { Provider } from "@nestjs/common";
import { createAppAuth } from "@octokit/auth-app";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";
import { ENV, type Env } from "../env.js";
import { log } from "../log.js";
import { trackGithubQuota } from "./quota-metrics.js";

/** Injection token for the app-authenticated, quota-tracked Octokit client. */
export const OCTOKIT = Symbol("OCTOKIT");

/**
 * Octokit's per-request log lines are disabled: Only octokit's own
 * `warn` channel (deprecations, auth warnings) is kept, routed through pino.
 */
const noop = (): void => {};
const octokitLog = {
  debug: noop,
  info: noop,
  warn: (message: string): void => log.warn(message),
  error: noop,
};

const ThrottledOctokit = Octokit.plugin(throttling, retry);

const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_AFTER_SECONDS = 60;

function shouldRetryRateLimited(retryAfter: number, retryCount: number): boolean {
  return retryCount < MAX_RATE_LIMIT_RETRIES && retryAfter <= MAX_RETRY_AFTER_SECONDS;
}

export const octokitProvider: Provider = {
  provide: OCTOKIT,
  useFactory: (env: Env): Octokit => {
    const octokit = new ThrottledOctokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(env.GITHUB_APP_ID),
        installationId: Number(env.GITHUB_INSTALLATION_ID),
        privateKey: env.GITHUB_PRIVATE_KEY,
      },
      log: octokitLog,
      throttle: {
        onRateLimit: (retryAfter, options, _octokit, retryCount) => {
          log.warn("GitHub rate limit hit", {
            retryAfter,
            retryCount,
            method: options.method,
            url: options.url,
          });
          return shouldRetryRateLimited(retryAfter, retryCount);
        },
        onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
          log.warn("GitHub secondary rate limit hit", {
            retryAfter,
            retryCount,
            method: options.method,
            url: options.url,
          });
          return shouldRetryRateLimited(retryAfter, retryCount);
        },
      },
    });
    trackGithubQuota(octokit);
    return octokit;
  },
  inject: [ENV],
};
