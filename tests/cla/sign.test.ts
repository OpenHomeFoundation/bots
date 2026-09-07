import { HttpException } from "@nestjs/common";
import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { ClaService } from "../../src/cla/cla.service.js";
import type { ClaStore } from "../../src/cla/store.js";
import { createFakeGitHub, testEnv } from "../github/helpers/mock-context.js";
import { expectLoggedErrors } from "../helpers/log-guard.js";

// The recheck must not ride on a `cla-recheck` label added by the bot itself:
// that webhook arrives as a self-webhook and is dropped before dispatch
// (webhook.service.ts), so sign() evaluates the PR directly. Mock the
// evaluate module — the seam under test is that sign() triggers it.
const { evaluatePR } = vi.hoisted(() => ({
  evaluatePR: vi.fn(async () => ({ statuses: [], effects: [] })),
}));

vi.mock("../../src/github/engine/evaluate.js", () => ({
  evaluatePR,
  evaluateIssue: vi.fn(),
}));

function claService(store: ClaStore | undefined, github = createFakeGitHub()): ClaService {
  return new ClaService(testEnv, github as unknown as Octokit, store, { repositories: {} });
}

function fakeStore(pending?: { owner: string; repo: string; number: number }): ClaStore {
  return {
    hasSigned: async () => false,
    recordPendingSigners: async () => {},
    getPendingSigner: async () => pending,
    deletePendingSigner: vi.fn(async () => {}),
    recordSignature: vi.fn(async () => {}),
  };
}

async function expectHttpError(promise: Promise<unknown>, status: number): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(status);
    return (err as HttpException).getResponse();
  }
  throw new Error(`expected an HttpException(${status})`);
}

describe("ClaService.sign", () => {
  it("503s when the store is not configured", async () => {
    const service = claService(undefined);

    await expectHttpError(service.sign({ github_username: "alice" }, "1.2.3.4", ""), 503);
  });

  it("400s without a github_username", async () => {
    const service = claService(fakeStore());

    await expectHttpError(service.sign({ name: "Alice" }, "1.2.3.4", ""), 400);
  });

  it("400s when no pending request exists for the user", async () => {
    const service = claService(fakeStore(undefined));

    const body = await expectHttpError(
      service.sign({ github_username: "alice" }, "1.2.3.4", ""),
      400,
    );

    expect((body as { message: string }).message).toContain("No pending request");
  });

  it("records the signature, clears the pending entry, and re-evaluates the PR", async () => {
    evaluatePR.mockClear();
    const store = fakeStore({ owner: "home-assistant", repo: "core", number: 42 });
    const github = createFakeGitHub();
    const service = claService(store, github);

    const result = await service.sign(
      { github_username: "alice", email: "a@example.com" },
      "1.2.3.4",
      "",
    );

    expect(result).toEqual({ message: "ok" });
    expect(store.recordSignature).toHaveBeenCalledWith(
      expect.objectContaining({ github_username: "alice", ip_address: "1.2.3.4" }),
    );
    expect(store.deletePendingSigner).toHaveBeenCalledWith("alice");
    expect(evaluatePR).toHaveBeenCalledWith(
      testEnv,
      expect.anything(),
      github,
      expect.objectContaining({ owner: "home-assistant", repo: "core", number: 42 }),
    );
    // The signature must land in the store before the re-evaluation reads it.
    expect(evaluatePR.mock.invocationCallOrder[0]).toBeGreaterThan(
      (store.recordSignature as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
    // No label round-trip: a bot-added `cla-recheck` webhook would be dropped.
    expect(github.issues.addLabels).not.toHaveBeenCalled();
  });

  it("still returns ok when the re-evaluation fails — the signature is recorded", async () => {
    evaluatePR.mockClear();
    evaluatePR.mockRejectedValueOnce(new Error("GitHub is down"));
    const store = fakeStore({ owner: "home-assistant", repo: "core", number: 42 });
    const service = claService(store);

    const result = await service.sign({ github_username: "alice" }, "1.2.3.4", "");

    expect(result).toEqual({ message: "ok" });
    expect(store.recordSignature).toHaveBeenCalled();
    expect(store.deletePendingSigner).toHaveBeenCalledWith("alice");
    expectLoggedErrors(); // the failed recheck warns by design
  });
});
