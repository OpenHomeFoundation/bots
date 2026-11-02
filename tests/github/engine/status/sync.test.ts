import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { placeholderBody } from "../../../../src/github/engine/status/render.js";
import {
  createCommitStatusWithRetry,
  findStatusComment,
} from "../../../../src/github/engine/status-sync.js";
import { BOT_LOGIN, createFakeGitHub, createMockContext } from "../../helpers/mock-context.js";

describe("findStatusComment", () => {
  it("finds a comment containing the status sentinel", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [
        { id: 1, body: "Regular comment", user: { login: BOT_LOGIN } },
        { id: 2, body: placeholderBody(), user: { login: BOT_LOGIN } },
      ],
    });

    const result = await findStatusComment(createMockContext({ github }));
    expect(result).toEqual({ id: 2, body: placeholderBody() });
  });

  it("matches the bot's login case-insensitively", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [{ id: 2, body: placeholderBody(), user: { login: "HA-Bot[bot]" } }],
    });

    const result = await findStatusComment(createMockContext({ github }));
    expect(result).toEqual({ id: 2, body: placeholderBody() });
  });

  it("ignores sentinel comments the bot did not write", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [
        { id: 1, body: placeholderBody(), user: { login: "troll" } },
        { id: 2, body: placeholderBody(), user: null },
        { id: 3, body: placeholderBody(), user: { login: BOT_LOGIN } },
      ],
    });

    const result = await findStatusComment(createMockContext({ github }));
    expect(result).toEqual({ id: 3, body: placeholderBody() });
  });

  it("returns null when no status comment exists", async () => {
    const github = createFakeGitHub();
    github.issues.listComments.mockResolvedValue({
      data: [{ id: 1, body: "Just a comment", user: { login: BOT_LOGIN } }],
    });

    const result = await findStatusComment(createMockContext({ github }));
    expect(result).toBeNull();
  });

  it("returns null when no comments exist", async () => {
    const result = await findStatusComment(createMockContext());
    expect(result).toBeNull();
  });
});

describe("createCommitStatusWithRetry", () => {
  const params = { sha: "abc123", context: "ha-bot", state: "success" as const };
  // GitHub's answer when the webhook beats a fork push into the base repo.
  const commitNotFound = { status: 422, message: "No commit found for SHA: abc123" };

  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("retries 'No commit found for SHA' with backoff until the commit shows up", async () => {
    const github = createFakeGitHub();
    github.repos.createCommitStatus
      .mockRejectedValueOnce(commitNotFound)
      .mockRejectedValueOnce(commitNotFound);

    const write = createCommitStatusWithRetry(createMockContext({ github }), params);
    await vi.advanceTimersByTimeAsync(999);
    expect(github.repos.createCommitStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(github.repos.createCommitStatus).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    await write;

    expect(github.repos.createCommitStatus).toHaveBeenCalledTimes(3);
    expect(github.repos.createCommitStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ owner: "home-assistant", repo: "core", ...params }),
    );
  });

  it("gives up after four attempts and rethrows", async () => {
    const github = createFakeGitHub();
    github.repos.createCommitStatus.mockRejectedValue(commitNotFound);

    const write = createCommitStatusWithRetry(createMockContext({ github }), params);
    const rejected = expect(write).rejects.toMatchObject({ status: 422 });
    await vi.runAllTimersAsync();
    await rejected;

    expect(github.repos.createCommitStatus).toHaveBeenCalledTimes(4);
  });

  it("does not retry other errors", async () => {
    const github = createFakeGitHub();
    github.repos.createCommitStatus.mockRejectedValue({
      status: 422,
      message: "Validation Failed",
    });

    await expect(
      createCommitStatusWithRetry(createMockContext({ github }), params),
    ).rejects.toMatchObject({ status: 422 });

    expect(github.repos.createCommitStatus).toHaveBeenCalledTimes(1);
  });
});
