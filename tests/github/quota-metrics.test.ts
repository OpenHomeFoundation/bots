import { Octokit } from "@octokit/rest";
import * as Sentry from "@sentry/nestjs";
import { describe, expect, it, vi } from "vitest";
import { trackGithubQuota } from "../../src/github/quota-metrics.js";

// `Sentry.metrics` is a module namespace, so it cannot be spied on in place.
vi.mock("@sentry/nestjs", async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  metrics: { count: vi.fn(), gauge: vi.fn() },
}));
const count = vi.mocked(Sentry.metrics.count);

const HEADERS = {
  "content-type": "application/json",
  "x-ratelimit-limit": "5000",
  "x-ratelimit-remaining": "4999",
  "x-ratelimit-resource": "core",
};

describe("trackGithubQuota", () => {
  it("counts calls per resource, method and route template", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 201, headers: HEADERS }));
    const octokit = new Octokit({ request: { fetch } });
    trackGithubQuota(octokit);

    await octokit.issues.createComment({ owner: "o", repo: "r", issue_number: 1, body: "hi" });

    expect(count).toHaveBeenCalledWith("github.api.calls", 1, {
      attributes: {
        resource: "core",
        method: "POST",
        route: "/repos/{owner}/{repo}/issues/{issue_number}/comments",
      },
    });
  });

  it("still counts a rejected call", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 403, headers: HEADERS }));
    const octokit = new Octokit({ request: { fetch }, retry: { enabled: false } });
    trackGithubQuota(octokit);

    await expect(octokit.rateLimit.get()).rejects.toThrow();

    expect(count).toHaveBeenCalledWith("github.api.calls", 1, {
      attributes: { resource: "core", method: "GET", route: "/rate_limit" },
    });
  });
});
