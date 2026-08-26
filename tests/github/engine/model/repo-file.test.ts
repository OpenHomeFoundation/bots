import { describe, expect, it } from "vitest";
import {
  createFakeGitHub,
  createMockContext,
  createMockIssueContext,
} from "../../helpers/mock-context.js";

const PATH = "homeassistant/components/hue/manifest.json";

function contextWith(contents: Record<string, string>) {
  const github = createFakeGitHub({ contents });
  return { context: createMockContext({ github }), github };
}

describe("repoFile", () => {
  it("serves the file's text", async () => {
    const { context } = contextWith({ [PATH]: '{"domain": "hue"}' });
    expect(await context.repoFile(PATH, "abc123")).toBe('{"domain": "hue"}');
  });

  it("reads a path once per dispatch however many rules ask", async () => {
    const { context, github } = contextWith({ [PATH]: "content" });

    await context.repoFile(PATH, "abc123");
    await context.repoFile(PATH, "abc123");

    expect(github.repos.getContent).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent reads into one request", async () => {
    const { context, github } = contextWith({ [PATH]: "content" });

    await Promise.all([context.repoFile(PATH, "abc123"), context.repoFile(PATH, "abc123")]);

    expect(github.repos.getContent).toHaveBeenCalledTimes(1);
  });

  it("keys the cache by ref, so a different commit is a different read", async () => {
    const { context, github } = contextWith({ [PATH]: "content" });

    await context.repoFile(PATH, "abc123");
    await context.repoFile(PATH, "def456");

    expect(github.repos.getContent).toHaveBeenCalledTimes(2);
  });

  it("caches a missing file as null rather than re-asking", async () => {
    const { context, github } = contextWith({});

    expect(await context.repoFile(PATH, "abc123")).toBeNull();
    expect(await context.repoFile(PATH, "abc123")).toBeNull();
    expect(github.repos.getContent).toHaveBeenCalledTimes(1);
  });

  it("propagates a failed read and lets the next caller retry", async () => {
    const { context, github } = contextWith({ [PATH]: "content" });
    github.repos.getContent.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { status: 500 }),
    );

    await expect(context.repoFile(PATH, "abc123")).rejects.toThrow();
    expect(await context.repoFile(PATH, "abc123")).toBe("content");
  });

  it("defaults to the PR's head commit", async () => {
    const { context, github } = contextWith({ [PATH]: "content" });

    await context.repoFile(PATH);

    expect(github.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ path: PATH, ref: "abc123" }),
    );
  });

  it("shares the cache whether the head sha is passed or defaulted", async () => {
    const { context, github } = contextWith({ [PATH]: "content" });

    await context.repoFile(PATH);
    await context.repoFile(PATH, "abc123");

    expect(github.repos.getContent).toHaveBeenCalledTimes(1);
  });

  it("names the default branch explicitly for an issue, which has no branch", async () => {
    const github = createFakeGitHub({ contents: { [PATH]: "content" } });
    const context = createMockIssueContext({ github });

    await context.repoFile(PATH);

    expect(github.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ path: PATH, ref: "HEAD" }),
    );
  });
});
