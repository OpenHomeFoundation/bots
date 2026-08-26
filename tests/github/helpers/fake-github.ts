import { Octokit } from "@octokit/rest";
import { type Mock, vi } from "vitest";

/**
 * A fake GitHub API served through Octokit's `request.fetch` seam: the real
 * Octokit runs — request building, pagination, RequestError on 4xx — and only
 * HTTP is faked. Routes not listed here throw, so an endpoint the code newly
 * depends on fails loudly instead of returning empty data.
 *
 * Each route is backed by a per-endpoint vi.fn spy, invoked with the caller's
 * params reconstructed from the request (path + query + JSON body). Tests
 * assert on the spies (`expect(github.issues.addLabels).toHaveBeenCalledWith`)
 * and stub reads octokit-style (`github.pulls.get.mockResolvedValue({ data })`).
 * A rejection whose `status` is set becomes that HTTP status, which the real
 * Octokit turns into a RequestError.
 */

export interface FakeWorld {
  /** pulls.get response body (lazy hydration). */
  pullRequest?: Record<string, unknown>;
  /** pulls.listFiles page; `patch` is the per-file unified diff. */
  files?: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }[];
  /**
   * Repo file content by path (repos.getContent); paths not listed 404
   */
  contents?: Record<string, string>;
  /** Org member logins; everyone else gets GitHub's 404. */
  members?: string[];
  /** team slug → member logins. */
  teamMembers?: Record<string, string[]>;
  /** pulls.listReviews page. */
  reviews?: Record<string, unknown>[];
  /** issues.get response body. */
  issue?: Record<string, unknown>;
}

export interface RecordedRequest {
  method: string;
  path: string;
  body?: unknown;
}

export interface StoredComment {
  id: number;
  body: string;
  html_url: string;
}

interface EndpointResult {
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
}

/** Endpoint spies are loosely typed; src's calls are typechecked against the real Octokit. */
type Endpoint = Mock<(params: Record<string, unknown>) => Promise<EndpointResult | undefined>>;

/**
 * The per-endpoint spy tree — the fake's test-facing API. Each spy plays two
 * roles: its resolved value is served as the HTTP response body when the code
 * under test hits the matching route, and its recorded calls carry the params
 * the code sent (reconstructed from path + query + body).
 */
export interface FakeEndpoints {
  issues: {
    createComment: Endpoint;
    updateComment: Endpoint;
    listComments: Endpoint;
    addLabels: Endpoint;
    removeLabel: Endpoint;
    get: Endpoint;
    getLabel: Endpoint;
    addAssignees: Endpoint;
    removeAssignees: Endpoint;
    update: Endpoint;
  };
  pulls: {
    get: Endpoint;
    listFiles: Endpoint;
    listReviews: Endpoint;
    listReviewComments: Endpoint;
    update: Endpoint;
    updateBranch: Endpoint;
    requestReviewers: Endpoint;
    dismissReview: Endpoint;
    listCommits: Endpoint;
  };
  repos: {
    createCommitStatus: Endpoint;
    getContent: Endpoint;
    listCommitStatusesForRef: Endpoint;
  };
  teams: {
    listMembersInOrg: Endpoint;
  };
  orgs: {
    checkMembershipForUser: Endpoint;
  };
  reactions: {
    createForIssueComment: Endpoint;
  };
  graphql: Mock<(query: string, variables?: Record<string, unknown>) => Promise<unknown>>;
}

export interface FakeGitHub extends FakeEndpoints {
  /** The real Octokit the code under test talks to; its fetch is the fake's router. */
  octokit: Octokit;
  /** Every request the code under test made, in order. */
  requests: RecordedRequest[];
  /** In-memory issue-comment store (createComment / updateComment / listComments). */
  comments: StoredComment[];
  world: FakeWorld;
}

/** Path/query params carrying these names are numbers in Octokit's params. */
const NUMERIC_PARAMS = new Set([
  "pull_number",
  "issue_number",
  "comment_id",
  "review_id",
  "per_page",
  "page",
]);

/** Statuses that must not carry a body (Response constructor enforces this). */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  endpoint: (endpoints: FakeEndpoints) => Endpoint;
}

const ROUTES: Route[] = [
  // --- Pull requests ---
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/,
    keys: ["owner", "repo", "pull_number"],
    endpoint: (g) => g.pulls.get,
  },
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/files$/,
    keys: ["owner", "repo", "pull_number"],
    endpoint: (g) => g.pulls.listFiles,
  },
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/reviews$/,
    keys: ["owner", "repo", "pull_number"],
    endpoint: (g) => g.pulls.listReviews,
  },
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/comments$/,
    keys: ["owner", "repo", "pull_number"],
    endpoint: (g) => g.pulls.listReviewComments,
  },
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/commits$/,
    keys: ["owner", "repo", "pull_number"],
    endpoint: (g) => g.pulls.listCommits,
  },
  {
    method: "PATCH",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/,
    keys: ["owner", "repo", "pull_number"],
    endpoint: (g) => g.pulls.update,
  },
  {
    method: "PUT",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/update-branch$/,
    keys: ["owner", "repo", "pull_number"],
    endpoint: (g) => g.pulls.updateBranch,
  },
  {
    method: "POST",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/requested_reviewers$/,
    keys: ["owner", "repo", "pull_number"],
    endpoint: (g) => g.pulls.requestReviewers,
  },
  {
    method: "PUT",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/reviews\/(\d+)\/dismissals$/,
    keys: ["owner", "repo", "pull_number", "review_id"],
    endpoint: (g) => g.pulls.dismissReview,
  },

  // --- Issues ---
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/,
    keys: ["owner", "repo", "issue_number"],
    endpoint: (g) => g.issues.listComments,
  },
  {
    method: "POST",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/,
    keys: ["owner", "repo", "issue_number"],
    endpoint: (g) => g.issues.createComment,
  },
  {
    method: "PATCH",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/comments\/(\d+)$/,
    keys: ["owner", "repo", "comment_id"],
    endpoint: (g) => g.issues.updateComment,
  },
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/,
    keys: ["owner", "repo", "issue_number"],
    endpoint: (g) => g.issues.get,
  },
  {
    method: "PATCH",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/,
    keys: ["owner", "repo", "issue_number"],
    endpoint: (g) => g.issues.update,
  },
  {
    method: "POST",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/labels$/,
    keys: ["owner", "repo", "issue_number"],
    endpoint: (g) => g.issues.addLabels,
  },
  {
    method: "DELETE",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/labels\/([^/]+)$/,
    keys: ["owner", "repo", "issue_number", "name"],
    endpoint: (g) => g.issues.removeLabel,
  },
  {
    method: "POST",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/assignees$/,
    keys: ["owner", "repo", "issue_number"],
    endpoint: (g) => g.issues.addAssignees,
  },
  {
    method: "DELETE",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/assignees$/,
    keys: ["owner", "repo", "issue_number"],
    endpoint: (g) => g.issues.removeAssignees,
  },
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/labels\/([^/]+)$/,
    keys: ["owner", "repo", "name"],
    endpoint: (g) => g.issues.getLabel,
  },
  {
    method: "POST",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/issues\/comments\/(\d+)\/reactions$/,
    keys: ["owner", "repo", "comment_id"],
    endpoint: (g) => g.reactions.createForIssueComment,
  },

  // --- Repo contents & statuses ---
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/,
    keys: ["owner", "repo", "path"],
    endpoint: (g) => g.repos.getContent,
  },
  {
    method: "POST",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/statuses\/([^/]+)$/,
    keys: ["owner", "repo", "sha"],
    endpoint: (g) => g.repos.createCommitStatus,
  },
  {
    method: "GET",
    regex: /^\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)\/statuses$/,
    keys: ["owner", "repo", "ref"],
    endpoint: (g) => g.repos.listCommitStatusesForRef,
  },

  // --- Org & team membership ---
  {
    method: "GET",
    regex: /^\/orgs\/([^/]+)\/members\/([^/]+)$/,
    keys: ["org", "username"],
    endpoint: (g) => g.orgs.checkMembershipForUser,
  },
  {
    method: "GET",
    regex: /^\/orgs\/([^/]+)\/teams\/([^/]+)\/members$/,
    keys: ["org", "team_slug"],
    endpoint: (g) => g.teams.listMembersInOrg,
  },
];

function toResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  if (NULL_BODY_STATUSES.has(status) || body === undefined) {
    return new Response(null, { status, headers });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function endpointFn(
  impl: (params: Record<string, unknown>) => Promise<EndpointResult | undefined>,
): Endpoint {
  return vi.fn(impl);
}

export function createFakeGitHub(world: FakeWorld = {}): FakeGitHub {
  const requests: RecordedRequest[] = [];
  const comments: StoredComment[] = [];

  const endpoints: FakeEndpoints = {
    issues: {
      createComment: endpointFn(async (params) => {
        const p = params as { owner: string; repo: string; issue_number: number; body: string };
        const id = 1000 + comments.length;
        const comment = {
          id,
          body: p.body,
          html_url: `https://github.com/${p.owner}/${p.repo}/issues/${p.issue_number}#issuecomment-${id}`,
        };
        comments.push(comment);
        return { status: 201, data: comment };
      }),
      updateComment: endpointFn(async (params) => {
        const p = params as { comment_id: number; body: string };
        const comment = comments.find((c) => c.id === p.comment_id);
        if (comment) comment.body = p.body;
        return { data: { id: p.comment_id, html_url: comment?.html_url } };
      }),
      listComments: endpointFn(async () => ({ data: comments })),
      addLabels: endpointFn(async () => ({ data: [] })),
      removeLabel: endpointFn(async () => ({ data: [] })),
      get: endpointFn(async () => ({ data: world.issue ?? {} })),
      getLabel: endpointFn(async () => ({ data: {} })),
      addAssignees: endpointFn(async () => ({ data: {} })),
      removeAssignees: endpointFn(async () => ({ data: {} })),
      update: endpointFn(async () => ({ data: {} })),
    },
    pulls: {
      get: endpointFn(async () => ({ data: world.pullRequest ?? {} })),
      listFiles: endpointFn(async () => ({ data: world.files ?? [] })),
      listReviews: endpointFn(async () => ({ data: world.reviews ?? [] })),
      listReviewComments: endpointFn(async () => ({ data: [] })),
      update: endpointFn(async () => ({ data: {} })),
      updateBranch: endpointFn(async () => ({ data: {} })),
      requestReviewers: endpointFn(async () => ({ data: {} })),
      dismissReview: endpointFn(async () => ({ data: {} })),
      listCommits: endpointFn(async () => ({ data: [] })),
    },
    repos: {
      createCommitStatus: endpointFn(async () => ({ status: 201, data: {} })),
      getContent: endpointFn(async (params) => {
        const path = (params as { path?: string }).path ?? "";
        const body = world.contents?.[path];
        if (body === undefined) throw { status: 404 };
        return { data: { content: Buffer.from(body).toString("base64"), encoding: "base64" } };
      }),
      listCommitStatusesForRef: endpointFn(async () => ({ data: [] })),
    },
    teams: {
      listMembersInOrg: endpointFn(async (params) => {
        const p = params as { team_slug: string };
        return { data: (world.teamMembers?.[p.team_slug] ?? []).map((login) => ({ login })) };
      }),
    },
    orgs: {
      checkMembershipForUser: endpointFn(async (params) => {
        const p = params as { username: string };
        if ((world.members ?? []).includes(p.username)) return { status: 204 };
        throw { status: 404 };
      }),
    },
    reactions: {
      createForIssueComment: endpointFn(async () => ({ status: 201, data: {} })),
    },
    graphql: vi.fn(async () => ({})),
  };

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : undefined;
    requests.push({ method, path: url.pathname, body });

    if (method === "POST" && url.pathname === "/graphql") {
      const { query, variables } = body as { query: string; variables?: Record<string, unknown> };
      try {
        const data = await endpoints.graphql(query, variables);
        return toResponse(200, { data: data ?? {} });
      } catch (err) {
        return toResponse((err as { status?: number }).status ?? 500, { message: String(err) });
      }
    }

    for (const route of ROUTES) {
      if (route.method !== method) continue;
      const match = url.pathname.match(route.regex);
      if (!match) continue;

      const params: Record<string, unknown> = {};
      route.keys.forEach((key, i) => {
        const value = decodeURIComponent(match[i + 1]);
        params[key] = NUMERIC_PARAMS.has(key) ? Number(value) : value;
      });
      for (const [key, value] of url.searchParams) {
        params[key] = NUMERIC_PARAMS.has(key) && /^\d+$/.test(value) ? Number(value) : value;
      }
      if (body) Object.assign(params, body);
      const conditional = new Headers(init?.headers).get("if-none-match");
      if (conditional) params.headers = { "if-none-match": conditional };

      let result: EndpointResult | undefined;
      try {
        result = await route.endpoint(endpoints)(params);
      } catch (err) {
        const { status, message, response } = err as {
          status?: number;
          message?: string;
          response?: { status?: number; data?: unknown };
        };
        return toResponse(
          status ?? response?.status ?? 500,
          response?.data ?? { message: message ?? `fake GitHub: ${method} ${url.pathname}` },
        );
      }
      return toResponse(result?.status ?? 200, result?.data ?? {}, result?.headers);
    }

    throw new Error(`fake GitHub: unstubbed route ${method} ${url.pathname}`);
  };

  const octokit = new Octokit({ request: { fetch: fakeFetch } });
  return { ...endpoints, octokit, requests, comments, world };
}
