import { EventType } from "../../../src/github/engine/event.js";
import { homeAssistantPrLinks } from "../../../src/github/manifests/home-assistant-org.js";
import type { PrLinks } from "../../../src/github/rules/linked-prs.js";
import { createFakeGitHub, createMockContext } from "./mock-context.js";

export const LINE = "- This PR belongs together with:";

const FOLLOWERS = new Set(["home-assistant.io", "brands"]);

/**
 * home-assistant's lines with every relation, so the shared rules are tested
 * apart from the pairs home-assistant enables: two code or two follower PRs
 * are siblings, a follower follows code, and other orgs never pair.
 */
export const testLinks: PrLinks = {
  ...homeAssistantPrLinks,
  relationOf: (self, other) => {
    if (self.owner !== "home-assistant" || other.owner !== "home-assistant") return null;
    const [a, b] = [FOLLOWERS.has(self.repo), FOLLOWERS.has(other.repo)];
    if (a === b) return "sibling";
    return a ? "parent" : "child";
  },
};
export const ref = (repo: string, number: number) => ({ owner: "home-assistant", repo, number });

export interface OtherPR {
  body: string;
  state?: "open" | "closed";
  merged?: boolean;
  /** The repo GitHub answers with, when the listed name is another spelling. */
  canonical?: string;
  /** GitHub's review decision; null (the default) where the repo requires no reviews. */
  decision?: string | null;
  reviews?: { login: string; state: string; association: string }[];
}

/**
 * A PR in home-assistant/<self.repo> (core by default) with `body`. Other PRs
 * are served by `repo#number` as listed (lowercased): an Error is thrown,
 * anything missing 404s, as an issue does.
 */
export function linkedContext(
  body: string,
  others: Record<string, OtherPR | Error>,
  self: {
    repo?: string;
    type?: EventType;
    state?: "open" | "closed";
    merged?: boolean;
    previousBody?: string;
  } = {},
) {
  const github = createFakeGitHub();
  github.pulls.get.mockImplementation(async (params: unknown) => {
    const { owner, repo, pull_number } = params as {
      owner: string;
      repo: string;
      pull_number: number;
    };
    const other = others[`${repo}#${pull_number}`];
    if (other instanceof Error) throw other;
    if (!other) throw { status: 404 };
    const name = other.canonical ?? repo;
    return {
      data: {
        number: pull_number,
        state: "open",
        merged: false,
        ...other,
        base: { repo: { owner: { login: owner }, name, full_name: `${owner}/${name}` } },
      },
    };
  });
  const otherAt = (repo: string, number: number) => {
    const other = others[`${repo}#${number}`];
    return other instanceof Error ? undefined : other;
  };
  github.graphql.mockImplementation(async (_query, variables) => {
    const { repo, number } = variables as { repo: string; number: number };
    const decision = otherAt(repo, number)?.decision ?? null;
    return { repository: { pullRequest: { reviewDecision: decision } } };
  });
  github.pulls.listReviews.mockImplementation(async (params: unknown) => {
    const { repo, pull_number } = params as { repo: string; pull_number: number };
    const reviews = otherAt(repo, pull_number)?.reviews ?? [];
    return {
      data: reviews.map((r) => ({
        user: { login: r.login },
        state: r.state,
        author_association: r.association,
      })),
    };
  });
  const repo = self.repo ?? "core";
  const context = createMockContext({
    eventType: self.type ?? EventType.PULL_REQUEST_EDITED,
    github,
    payload: {
      repository: {
        full_name: `home-assistant/${repo}`,
        name: repo,
        owner: { login: "home-assistant" },
      },
      pull_request: { body, state: self.state ?? "open", merged: self.merged ?? false },
      ...(self.previousBody !== undefined
        ? { changes: { body: { from: self.previousBody } } }
        : {}),
    },
  });
  return { github, context };
}
