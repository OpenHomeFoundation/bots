import { describe, expect, it } from "vitest";
import { placeholderBody } from "../../../../src/github/engine/status/render.js";
import { findStatusComment } from "../../../../src/github/engine/status-sync.js";
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
