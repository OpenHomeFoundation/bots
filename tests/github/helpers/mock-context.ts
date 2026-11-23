import type { Env } from "../../../src/env.js";
import { EventType } from "../../../src/github/engine/event.js";
import { seedEntityPlatforms } from "../../../src/github/engine/model/component-registry.js";
import type {
  RuleContext,
  WebhookEventPayload,
} from "../../../src/github/engine/model/rule-context.js";
import { ruleContextFromWebhook } from "../../../src/github/engine/model/rule-context.js";
import type { StatusSection } from "../../../src/github/engine/status/types.js";
import type {
  BlockUpdate,
  Effect,
  RegistryConfig,
  Rule,
  RuleOutput,
} from "../../../src/github/engine/types.js";
import { createFakeGitHub, type FakeGitHub } from "./fake-github.js";

export { BOT_LOGIN, createFakeGitHub, type FakeGitHub } from "./fake-github.js";

// Seed the component registry so rule tests never hit the network for the
// entity-platform list (parseFiles reads it).
seedEntityPlatforms([
  "light",
  "sensor",
  "binary_sensor",
  "switch",
  "climate",
  "cover",
  "number",
  "select",
  "button",
  "fan",
  "lock",
  "event",
  "update",
  "camera",
  "media_player",
]);

/** Fake Env for contexts built outside the webhook handler. */
export const testEnv: Env = {
  GITHUB_APP_ID: "1",
  GITHUB_PRIVATE_KEY: "test-key",
  GITHUB_INSTALLATION_ID: "1",
  GITHUB_WEBHOOK_SECRET: "test-secret",
  BOT_SLUG: "ha-bot",
  COMMAND_SLUG: "home-assistant",
  SENTRY_DSN: "",
  ENVIRONMENT: "test",
  PORT: 0,
};

export function createMockPayload(overrides: Record<string, unknown> = {}) {
  const { pull_request: prOverride, ...restOverrides } = overrides;
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
      state: "open",
      draft: false,
      merged: false,
      merged_at: null,
      assignees: [],
      locked: false,
      ...(prOverride as Record<string, unknown>),
    },
    ...restOverrides,
  };
}

export function createMockIssuePayload(overrides: Record<string, unknown> = {}) {
  const { issue: issueOverride, ...restOverrides } = overrides;
  return {
    action: "opened",
    number: 1,
    sender: { login: "testuser", type: "User" },
    repository: {
      full_name: "home-assistant/core",
      name: "core",
      owner: { login: "home-assistant" },
    },
    issue: {
      number: 1,
      body: "",
      user: { login: "testuser" },
      assignees: [] as { login: string }[],
      labels: [] as { name: string }[],
      state: "open",
      locked: false,
      ...(issueOverride as Record<string, unknown>),
    },
    ...restOverrides,
  };
}

interface MockContextOverrides {
  eventType?: EventType;
  payload?: Record<string, unknown>;
  github?: FakeGitHub;
  registry?: RegistryConfig;
}

/** Fake behind each context, so helpers like mockPRFiles can reach its spies. */
const fakeByContext = new WeakMap<RuleContext, FakeGitHub>();

export function createMockContext(overrides: MockContextOverrides = {}): RuleContext {
  const github = overrides.github ?? createFakeGitHub();
  const eventType = overrides.eventType ?? EventType.PULL_REQUEST_OPENED;
  const payload = createMockPayload(overrides.payload);

  const context = ruleContextFromWebhook(
    testEnv,
    overrides.registry ?? { repositories: {} },
    github.octokit,
    payload as unknown as WebhookEventPayload,
    eventType,
  );
  fakeByContext.set(context, github);
  return context;
}

export function createMockIssueContext(overrides: MockContextOverrides = {}): RuleContext {
  const github = overrides.github ?? createFakeGitHub();
  const eventType = overrides.eventType ?? EventType.ISSUES_OPENED;
  const payload = createMockIssuePayload(overrides.payload);

  const context = ruleContextFromWebhook(
    testEnv,
    overrides.registry ?? { repositories: {} },
    github.octokit,
    payload as unknown as WebhookEventPayload,
    eventType,
  );
  fakeByContext.set(context, github);
  return context;
}

/** Stub the target PR's changed files (served through pulls.listFiles). */
export function mockPRFiles(context: RuleContext, files: Record<string, unknown>[]) {
  const github = fakeByContext.get(context);
  if (!github) throw new Error("mockPRFiles: context was not created by createMockContext");
  github.pulls.listFiles.mockResolvedValue({ data: files });
}

export function lastSegment(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Convenience views over a handler's output so tests can assert against
 * fields like `labels` or `section` directly. `output` exposes the raw
 * {@link RuleOutput}; `effects` the raw effect array.
 */
export interface RuleSummary {
  output: RuleOutput;
  effects: Effect[];
  labels?: string[];
  removeLabels?: string[];
  comment?: string;
  comments: string[];
  assignees?: string[];
  section?: StatusSection;
  sections: StatusSection[];
  blocks: BlockUpdate[];
  state?: unknown;
}

export function summarizeOutput(output: RuleOutput | undefined): RuleSummary | undefined {
  if (!output) return undefined;

  const effects = output.effects ?? [];
  const labels: string[] = [];
  const removeLabels: string[] = [];
  const comments: string[] = [];
  const assignees: string[] = [];

  for (const e of effects) {
    switch (e.type) {
      case "addLabels":
        labels.push(...e.labels);
        break;
      case "removeLabels":
        removeLabels.push(...e.labels);
        break;
      case "comment":
        comments.push(e.body);
        break;
      case "addAssignees":
        assignees.push(...e.assignees);
        break;
    }
  }

  const sections = output.statuses ?? [];
  return {
    output,
    effects,
    labels: labels.length ? labels : undefined,
    removeLabels: removeLabels.length ? removeLabels : undefined,
    comment: comments[0],
    comments,
    assignees: assignees.length ? assignees : undefined,
    section: sections[0],
    sections,
    blocks: output.blocks ?? [],
    state: output.state,
  };
}

/**
 * Invokes the rule's handler registered for `context.eventType` (with the
 * given persisted state slice, if any) and returns a `RuleSummary` view of
 * the output (or `undefined` if the handler returned nothing or the rule
 * does not handle this event).
 */
export async function runRule(
  rule: Rule,
  context: RuleContext,
  state?: unknown,
): Promise<RuleSummary | undefined> {
  const handler = rule.events[context.eventType];
  if (!handler) return undefined;
  const output = await (
    handler as (ctx: RuleContext, state: unknown) => Promise<RuleOutput | undefined>
  )(context, state);
  return summarizeOutput(output);
}
