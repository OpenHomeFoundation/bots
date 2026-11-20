import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Rule, RuleOutput } from "../engine/types.js";
import { isNonIntegrationLabelEvent } from "../helpers/integration-domains.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ISSUES_OPENED
  | EventType.ISSUES_LABELED
  | EventType.ISSUES_ON_DEMAND
  | EventType.PULL_REQUEST_LABELED
  | EventType.ON_DEMAND;

const LABEL = "by-code-owner";

export function byCodeOwner(config: {
  pathPattern: (integration: string) => string;
  /**
   * Integration domains the item is about — repo policy (file layout, doc
   * links), injected by the manifest.
   */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
}): Rule {
  async function authorOwns(ctx: RuleContext<HandledEvent>, domain: string): Promise<boolean> {
    // The rule is only registered on repos that have a CODEOWNERS file, so a
    // missing one is a misconfiguration — surface it instead of no-opping.
    const codeownersContent = await ctx.codeownersContent();
    if (!codeownersContent) {
      throw new Error(`No CODEOWNERS file in ${ctx.repo.fullName}`);
    }

    const match = matchCodeOwners(config.pathPattern(domain), parseCodeOwners(codeownersContent));
    if (!match) return false;
    const owners = match.owners.map((o) => o.substring(1).toLowerCase());
    const authorLogin = (await ctx.target.authorLogin()).toLowerCase();
    return (await ctx.expandTeams(owners)).includes(authorLogin);
  }

  async function handle(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    if (isNonIntegrationLabelEvent(ctx)) return;

    // Owning one of several integrations says nothing about the others.
    const domains = await config.domains(ctx);
    if (domains.length === 1 && (await authorOwns(ctx, domains[0]))) {
      return { effects: [{ type: "addLabels", labels: [LABEL] }] };
    }
    if ((await ctx.target.labels()).includes(LABEL)) {
      return { effects: [{ type: "removeLabels", labels: [LABEL] }] };
    }
  }

  return {
    name: "by-code-owner",
    description:
      "Labels PRs/issues about a single integration authored by its code owner, and removes " +
      "the label once that no longer holds",
    events: on(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_EDITED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.ISSUES_OPENED,
        EventType.ISSUES_LABELED,
        EventType.ISSUES_ON_DEMAND,
        EventType.PULL_REQUEST_LABELED,
        EventType.ON_DEMAND,
      ],
      handle,
    ),
  };
}
