import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Octokit } from "@octokit/rest";
import { addLogContext } from "../correlation.js";
import { ENV, type Env } from "../env.js";
import { log } from "../log.js";
import { dispatch, dispatchCommand } from "./engine/dispatch.js";
import { EventType } from "./engine/event.js";
import { commandContextFromWebhook, isBotCommand } from "./engine/model/command-context.js";
import {
  type RuleContext,
  ruleContextFromWebhook,
  type WebhookEventPayload,
} from "./engine/model/rule-context.js";
import type { RegistryConfig } from "./engine/types.js";
import { OCTOKIT } from "./octokit.provider.js";
import { logRace } from "./race-monitor.js";
import { REGISTRY_CONFIG } from "./registry.provider.js";
import type { IssueCommentCreatedEvent } from "./webhook-events.js";

const KNOWN_EVENT_TYPES = new Set<string>(Object.values(EventType));

/**
 * actions/stale removes its label again once the item changes after it was
 * marked, so anything we do in response to its label changes would undo them.
 */
function isStaleLabelChangeByBot(context: RuleContext): boolean {
  const { event } = context;
  return (
    context.senderIsBot &&
    (event.type === EventType.PULL_REQUEST_LABELED ||
      event.type === EventType.PULL_REQUEST_UNLABELED ||
      event.type === EventType.ISSUES_LABELED) &&
    event.label === "stale"
  );
}

@Injectable()
export class WebhookService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(OCTOKIT) private readonly octokit: Octokit,
    @Inject(REGISTRY_CONFIG) private readonly registry: RegistryConfig,
  ) {}

  /** Handle a signature-verified delivery (see `GithubWebhookGuard`). */
  async handle(body: string, event: string): Promise<string> {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(body);
    } catch {
      throw new BadRequestException("Invalid JSON");
    }
    const action = (raw.action as string) ?? "";
    const rawEventType = action ? `${event}.${action}` : event;

    // Skip events without repository scope
    if (!raw.repository || typeof raw.repository !== "object") {
      return "OK";
    }

    const payload = raw as unknown as WebhookEventPayload;
    const known = KNOWN_EVENT_TYPES.has(rawEventType);
    const senderLogin = payload.sender?.login ?? "";
    const ownBotLogin = `${this.env.BOT_SLUG}[bot]`;
    const selfWebhook = senderLogin.toLowerCase() === ownBotLogin.toLowerCase();

    // Skip self-webhooks
    if (selfWebhook) return "OK";

    if (!known) {
      return "OK";
    }

    const eventType = rawEventType as EventType;

    // Comment events are only relevant to commands
    if (eventType === EventType.ISSUE_COMMENT_CREATED) {
      const commentPayload = payload as IssueCommentCreatedEvent;
      if (isBotCommand(commentPayload.comment.body ?? "", this.env.COMMAND_SLUG)) {
        const context = commandContextFromWebhook(
          this.env,
          this.registry,
          this.octokit,
          commentPayload,
        );
        addLogContext({
          repository: context.repo.fullName,
          number: context.number,
          eventType,
        });
        log.info("webhook: dispatching");
        await logRace(`${context.repo.fullName}#${context.number}`, eventType, () =>
          dispatchCommand(context),
        );
      }
      return "OK";
    }

    const context = ruleContextFromWebhook(
      this.env,
      this.registry,
      this.octokit,
      payload,
      eventType,
    );
    if (isStaleLabelChangeByBot(context)) return "OK";
    addLogContext({
      repository: context.repo.fullName,
      number: context.number,
      eventType,
    });
    log.info("webhook: dispatching");
    await logRace(`${context.repo.fullName}#${context.number}`, eventType, () => dispatch(context));

    return "OK";
  }
}
