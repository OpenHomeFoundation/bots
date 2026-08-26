import type { Provider } from "@nestjs/common";
import { createAppAuth } from "@octokit/auth-app";
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

export const octokitProvider: Provider = {
  provide: OCTOKIT,
  useFactory: (env: Env): Octokit => {
    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(env.GITHUB_APP_ID),
        installationId: Number(env.GITHUB_INSTALLATION_ID),
        privateKey: env.GITHUB_PRIVATE_KEY,
      },
      log: octokitLog,
    });
    trackGithubQuota(octokit);
    return octokit;
  },
  inject: [ENV],
};
