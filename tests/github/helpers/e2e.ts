import { type ExecutionContext, HttpException } from "@nestjs/common";
import { sign } from "@octokit/webhooks-methods";
import type { Env } from "../../../src/env.js";
import type { RegistryConfig } from "../../../src/github/engine/types.js";
import { GithubWebhookGuard } from "../../../src/github/github-webhook.guard.js";
import { WebhookService } from "../../../src/github/webhook.service.js";
import { createFakeGitHub, type FakeGitHub } from "./fake-github.js";

const TEST_SECRET = "test-webhook-secret";

const EMPTY_REGISTRY: RegistryConfig = { repositories: {} };

export interface E2EHarnessOptions {
  config?: RegistryConfig;
}

export interface E2EHarness {
  github: FakeGitHub;
  deliver(event: string, payload: object): Promise<Response>;
  /** Send a request with a bad signature for the unhappy path. */
  deliverUnsigned(event: string, payload: object): Promise<Response>;
}

/**
 * Wire a test registry and a mock Octokit into a real WebhookService, then
 * provide a `deliver(event, payload)` helper that POSTs a signed webhook through
 * the real signature-verification + dispatch pipeline.
 *
 * Modeled on Probot's `probot.receive({ name, payload })` — but assertions
 * happen against the captured Octokit mock rather than nock interceptors.
 */
export function createE2EHarness(options: E2EHarnessOptions = {}): E2EHarness {
  const github = createFakeGitHub();

  const env = {
    GITHUB_APP_ID: "1",
    GITHUB_PRIVATE_KEY: "test-key",
    GITHUB_INSTALLATION_ID: "1",
    GITHUB_WEBHOOK_SECRET: TEST_SECRET,
    BOT_SLUG: "ha-bot",
    COMMAND_SLUG: "home-assistant",
    SENTRY_DSN: "",
    ENVIRONMENT: "test",
  } as unknown as Env;

  const guard = new GithubWebhookGuard(env);
  const service = new WebhookService(env, github.octokit, options.config ?? EMPTY_REGISTRY);

  // Runs the same guard → service pipeline the controller does, folding
  // HttpExceptions back into a Response so status assertions read naturally.
  const receive = async (event: string, body: string, signature: string): Promise<Response> => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { "x-hub-signature-256": signature },
          rawBody: Buffer.from(body),
        }),
      }),
    } as unknown as ExecutionContext;
    try {
      await guard.canActivate(context);
      return new Response(await service.handle(body, event));
    } catch (err) {
      if (err instanceof HttpException) {
        return new Response(JSON.stringify(err.getResponse()), { status: err.getStatus() });
      }
      throw err;
    }
  };

  return {
    github,
    deliver: async (event, payload) => {
      const body = JSON.stringify(payload);
      return receive(event, body, await sign(TEST_SECRET, body));
    },
    deliverUnsigned: async (event, payload) =>
      receive(event, JSON.stringify(payload), "sha256=deadbeef"),
  };
}

/**
 * Minimal pull_request.opened payload. Tests override fields they need.
 */
export function prOpenedPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "opened",
    number: 1,
    sender: { login: "testuser", type: "User" },
    repository: {
      full_name: "home-assistant/core",
      name: "core",
      owner: { login: "home-assistant" },
    },
    pull_request: {
      number: 1,
      node_id: "PR_1",
      head: { sha: "abc123" },
      base: { ref: "dev" },
      labels: [],
      body: "",
      user: { login: "testuser" },
    },
    ...overrides,
  };
}

/**
 * Minimal issue_comment.created payload with a PR-linked issue.
 */
export function commentPayload(
  body: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action: "created",
    sender: { login: "testuser", type: "User" },
    repository: {
      full_name: "home-assistant/core",
      name: "core",
      owner: { login: "home-assistant" },
    },
    issue: {
      number: 1,
      pull_request: { url: "https://api.github.com/repos/home-assistant/core/pulls/1" },
      user: { login: "testuser" },
      body: "",
    },
    comment: {
      id: 42,
      body,
      user: { login: "testuser" },
    },
    ...overrides,
  };
}
