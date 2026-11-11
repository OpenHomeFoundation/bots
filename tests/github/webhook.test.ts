import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { Octokit } from "@octokit/rest";
import { sign } from "@octokit/webhooks-methods";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env.js";
import { GithubWebhookGuard } from "../../src/github/github-webhook.guard.js";
import { WebhookService } from "../../src/github/webhook.service.js";
import { log } from "../../src/log.js";

// vi.mock is hoisted above the imports and scoped to this file, so the mocked
// dispatch only exists here — helpers/e2e.ts and engine/dispatch.test.ts keep
// the real module.
const { dispatch, evaluatePR } = vi.hoisted(() => ({
  dispatch: vi.fn(async () => undefined),
  evaluatePR: vi.fn(async () => undefined),
}));

vi.mock("../../src/github/engine/dispatch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/github/engine/dispatch.js")>()),
  dispatch,
}));

vi.mock("../../src/github/engine/evaluate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/github/engine/evaluate.js")>()),
  evaluatePR,
}));

// Routing tests never reach the API; an inert Octokit suffices.
const octokit = {} as unknown as Octokit;

const env: Env = {
  GITHUB_APP_ID: "123",
  GITHUB_PRIVATE_KEY: "key",
  GITHUB_INSTALLATION_ID: "456",
  GITHUB_WEBHOOK_SECRET: "secret",
  SENTRY_DSN: "",
  ENVIRONMENT: "test",
  BOT_SLUG: "ha-bot",
  COMMAND_SLUG: "home-assistant",
  PORT: 0,
};

// Routing decisions don't consult the registry; empty is enough.
const service = new WebhookService(env, octokit, { repositories: {} });

function guardContext(body: string, signature: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { "x-hub-signature-256": signature },
        rawBody: Buffer.from(body),
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("webhook signature guard", () => {
  it("throws 401 for an invalid signature", async () => {
    const guard = new GithubWebhookGuard(env);

    await expect(guard.canActivate(guardContext("{}", "sha256=deadbeef"))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("throws 401 when the signature header is missing", async () => {
    const guard = new GithubWebhookGuard(env);

    await expect(guard.canActivate(guardContext("{}", ""))).rejects.toThrow(UnauthorizedException);
  });

  it("passes a valid signature through", async () => {
    const guard = new GithubWebhookGuard(env);
    const body = JSON.stringify({ action: "opened" });

    await expect(guard.canActivate(guardContext(body, await sign("secret", body)))).resolves.toBe(
      true,
    );
  });
});

describe("webhook handler", () => {
  it("rejects invalid JSON with a 400", async () => {
    await expect(service.handle("not-json", "pull_request")).rejects.toThrow(BadRequestException);
  });

  it("returns OK and skips new_permissions_accepted", async () => {
    dispatch.mockClear();

    const result = await service.handle(
      JSON.stringify({ action: "new_permissions_accepted" }),
      "pull_request",
    );

    expect(result).toBe("OK");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches pull request events", async () => {
    dispatch.mockClear();

    const payload = {
      action: "opened",
      number: 1,
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      sender: { login: "testuser", type: "User" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };

    const result = await service.handle(JSON.stringify(payload), "pull_request");

    expect(result).toBe("OK");
    expect(dispatch).toHaveBeenCalled();
  });

  it("short-circuits self-webhooks without dispatching", async () => {
    dispatch.mockClear();

    const payload = {
      action: "labeled",
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      // Sender login matches `${BOT_SLUG}[bot]` — the cascade webhook from
      // the bot's own label add. Should be ignored.
      sender: { login: "ha-bot[bot]", type: "Bot" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };

    const result = await service.handle(JSON.stringify(payload), "pull_request");

    expect(result).toBe("OK");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("matches self-webhook login case-insensitively", async () => {
    dispatch.mockClear();

    const payload = {
      action: "labeled",
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      sender: { login: "HA-Bot[Bot]", type: "Bot" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };

    const result = await service.handle(JSON.stringify(payload), "pull_request");

    expect(result).toBe("OK");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still dispatches for other bot senders", async () => {
    dispatch.mockClear();

    const payload = {
      action: "opened",
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      // Dependabot or any other bot should still flow through.
      sender: { login: "dependabot[bot]", type: "Bot" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };

    const result = await service.handle(JSON.stringify(payload), "pull_request");

    expect(result).toBe("OK");
    expect(dispatch).toHaveBeenCalled();
  });

  const repository = {
    full_name: "home-assistant/core",
    name: "core",
    owner: { login: "home-assistant" },
  };
  const staleBot = { login: "issue-triage-workflows[bot]", type: "Bot" };

  it.each([
    ["pull_request", "labeled", { pull_request: { number: 1, head: { sha: "abc" } } }],
    ["pull_request", "unlabeled", { pull_request: { number: 1, head: { sha: "abc" } } }],
    ["issues", "labeled", { issue: { number: 1 } }],
  ])("ignores the stale bot's %s.%s of the stale label", async (event, action, item) => {
    dispatch.mockClear();

    const payload = { action, repository, sender: staleBot, label: { name: "stale" }, ...item };
    const result = await service.handle(JSON.stringify(payload), event);

    expect(result).toBe("OK");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still dispatches when a person adds the stale label", async () => {
    dispatch.mockClear();

    const payload = {
      action: "labeled",
      repository,
      sender: { login: "testuser", type: "User" },
      label: { name: "stale" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };
    await service.handle(JSON.stringify(payload), "pull_request");

    expect(dispatch).toHaveBeenCalled();
  });

  it("still dispatches when the stale bot closes a PR", async () => {
    dispatch.mockClear();

    const payload = {
      action: "closed",
      repository,
      sender: staleBot,
      pull_request: { number: 1, head: { sha: "abc" }, merged: false },
    };
    await service.handle(JSON.stringify(payload), "pull_request");

    expect(dispatch).toHaveBeenCalled();
  });

  describe("pull_request.unlocked", () => {
    const unlocked = (state: string) =>
      JSON.stringify({
        action: "unlocked",
        repository: {
          full_name: "home-assistant/core",
          name: "core",
          owner: { login: "home-assistant" },
        },
        sender: { login: "maintainer", type: "User" },
        pull_request: { number: 7, state, locked: false },
      });

    it("re-evaluates an open PR in full", async () => {
      dispatch.mockClear();
      evaluatePR.mockClear();

      await service.handle(unlocked("open"), "pull_request");

      expect(evaluatePR).toHaveBeenCalledWith(env, expect.anything(), octokit, {
        owner: "home-assistant",
        repo: "core",
        number: 7,
      });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("leaves a closed PR alone", async () => {
      evaluatePR.mockClear();

      await service.handle(unlocked("closed"), "pull_request");

      expect(evaluatePR).not.toHaveBeenCalled();
    });
  });

  // A burst of `labeled` webhooks for one issue: each dispatch must see the
  // comments the previous one posted, or every one of them re-posts the
  // code-owner mentions (home-assistant/core#191545).
  describe("per-item serialization", () => {
    function labeledIssue(number: number, label: string): string {
      return JSON.stringify({
        action: "labeled",
        repository,
        sender: { login: "testuser", type: "User" },
        label: { name: label },
        issue: { number },
      });
    }

    function trackConcurrency(): { maxRunning: () => number } {
      let running = 0;
      let max = 0;
      dispatch.mockReset();
      dispatch.mockImplementation((async () => {
        running++;
        max = Math.max(max, running);
        await new Promise((resolve) => setTimeout(resolve, 10));
        running--;
        return undefined;
      }) as never);
      return { maxRunning: () => max };
    }

    it("runs dispatches for the same item one at a time", async () => {
      const tracked = trackConcurrency();

      await Promise.all(
        ["integration: hue", "integration: lifx", "integration: shelly"].map((label) =>
          service.handle(labeledIssue(1, label), "issues"),
        ),
      );

      expect(dispatch).toHaveBeenCalledTimes(3);
      expect(tracked.maxRunning()).toBe(1);
      expect(log.info).toHaveBeenCalledWith(
        "dispatch queued",
        expect.objectContaining({ ahead: 2, waitedMs: expect.any(Number) }),
      );
    });

    it("keeps serving the item after a dispatch fails", async () => {
      dispatch.mockReset();
      dispatch.mockRejectedValueOnce(new Error("boom"));
      dispatch.mockResolvedValueOnce(undefined);

      const results = await Promise.allSettled([
        service.handle(labeledIssue(1, "integration: hue"), "issues"),
        service.handle(labeledIssue(1, "integration: lifx"), "issues"),
      ]);

      expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
      expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it("does not hold up other items", async () => {
      const tracked = trackConcurrency();

      await Promise.all([
        service.handle(labeledIssue(1, "integration: hue"), "issues"),
        service.handle(labeledIssue(2, "integration: hue"), "issues"),
      ]);

      expect(tracked.maxRunning()).toBe(2);
    });
  });
});
