import { describe, expect, it } from "vitest";
import { PullRequest } from "../../../../src/github/engine/model/pull-request.js";
import { createFakeGitHub } from "../../helpers/mock-context.js";

const REF = { owner: "home-assistant", repo: "core", number: 7 };

describe("PullRequest entity", () => {
  it("serves seeded fields without any API call", async () => {
    const github = createFakeGitHub();
    const pr = new PullRequest(github.octokit, REF, {
      labels: ["bugfix"],
      body: "hello",
      draft: false,
      baseRef: "dev",
    });

    expect(await pr.labels()).toEqual(["bugfix"]);
    expect(await pr.body()).toBe("hello");
    expect(await pr.isDraft()).toBe(false);
    expect(await pr.baseRef()).toBe("dev");
    expect(github.pulls.get).not.toHaveBeenCalled();
  });

  it("hydrates unseeded fields with exactly one pulls.get", async () => {
    const github = createFakeGitHub();
    github.pulls.get.mockResolvedValue({
      data: {
        labels: [{ name: "stale" }],
        body: "fetched",
        merged: true,
        merged_at: "2026-01-01T00:00:00Z",
        head: { sha: "abc" },
        base: { ref: "dev" },
        state: "closed",
        draft: false,
        node_id: "PR_x",
        user: { login: "someone" },
        author_association: "MEMBER",
        assignees: [],
        mergeable_state: "clean",
      },
    });
    const pr = new PullRequest(github.octokit, REF);

    // Concurrent reads of different unseeded fields dedupe to one request.
    const [labels, merged, headSha] = await Promise.all([pr.labels(), pr.merged(), pr.headSha()]);
    expect(labels).toEqual(["stale"]);
    expect(merged).toBe(true);
    expect(headSha).toBe("abc");
    expect(github.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("always hydrates mergeableState, even with a full seed", async () => {
    const github = createFakeGitHub();
    github.pulls.get.mockResolvedValue({ data: { mergeable_state: "dirty" } });
    const pr = new PullRequest(github.octokit, REF, { labels: [], body: null, draft: true });

    expect(await pr.mergeableState()).toBe("dirty");
    expect(github.pulls.get).toHaveBeenCalledTimes(1);
  });

  it("fetches files once no matter how many readers", async () => {
    const github = createFakeGitHub();
    github.pulls.listFiles.mockResolvedValue({
      data: [
        { filename: "homeassistant/components/hue/light.py" },
        { filename: "homeassistant/components/hue/sensor.py" },
        { filename: "homeassistant/components/zwave_js/api.py" },
      ],
    });
    const pr = new PullRequest(github.octokit, REF);

    expect(await pr.files()).toHaveLength(3);
    expect(await pr.files()).toHaveLength(3);
    expect(github.pulls.listFiles).toHaveBeenCalledTimes(1);
  });

  it("caches list groups independently of the core group", async () => {
    const github = createFakeGitHub();
    const pr = new PullRequest(github.octokit, REF);

    await pr.reviews();
    await pr.reviews();
    await pr.reviewComments();
    await pr.issueComments();

    expect(github.pulls.listReviews).toHaveBeenCalledTimes(1);
    expect(github.pulls.listReviewComments).toHaveBeenCalledTimes(1);
    expect(github.issues.listComments).toHaveBeenCalledTimes(1);
    expect(github.pulls.get).not.toHaveBeenCalled();
  });
});
