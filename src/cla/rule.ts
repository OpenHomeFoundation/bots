import type { Env } from "../env.js";
import { EventType } from "../github/engine/event.js";
import type { RuleContext } from "../github/engine/model/rule-context.js";
import { type CheckOutcome, on } from "../github/engine/rule.js";
import type { Effect, Rule, RuleOutput } from "../github/engine/types.js";
import { type ClaStore, dynamoClaStore } from "./store.js";

export const CLA_SIGNED_LABEL = "cla-signed";
export const CLA_NEEDED_LABEL = "cla-needed";
export const CLA_ERROR_LABEL = "cla-error";
export const CLA_RECHECK_LABEL = "cla-recheck";

// Bot accounts that are not masked as bots.
const IGNORED_AUTHOR_EMAILS = new Set([
  "travis@travis-ci.org",
  "ImgBotHelp@gmail.com",
  "support@lokalise.com",
  "github-action@users.noreply.github.com",
  "cursoragent@cursor.com",
  "noreply@anthropic.com",
]);

// Repositories that do not contain code.
const IGNORED_REPOSITORIES = new Set([
  "home-assistant/.github",
  "home-assistant/1password-teams-open-source",
  "home-assistant/architecture",
  "home-assistant/assets",
  "home-assistant/brands",
  "home-assistant/bthome.io",
  "home-assistant/buildroot",
  "home-assistant/companion.home-assistant",
  "home-assistant/data.home-assistant",
  "home-assistant/developers.home-assistant",
  "home-assistant/home-assistant.io",
  "home-assistant/organization",
  "home-assistant/partner.home-assistant",
  "home-assistant/people",
  "home-assistant/version",
  "home-assistant/webawesome",
]);

const MAX_LISTED_COMMITS = 10;

const LINK_ACCOUNT_HELP =
  "https://help.github.com/articles/setting-your-email-in-git/#commits-on-github-arent-linking-to-my-account";

/** Identifies the legacy-mode CLA comment for dedupe across dispatches. */
export const CLA_COMMENT_MARKER = "<!-- cla-bot-comment -->";

/** Identifies the unlinked-commits walkthrough comment (posted in both modes). */
export const CLA_UNLINKED_COMMENT_MARKER = "<!-- cla-bot-unlinked-comment -->";

/** The commit-status context legacy mode writes (never the `ha-bot` aggregate). */
export const CLA_STATUS_CONTEXT = "cla-bot";

/** A check outcome plus the short line legacy mode puts on the commit status. */
interface ClaOutcome extends CheckOutcome {
  summary: string;
  /** A standalone comment to post (once) alongside the outcome */
  comment?: { marker: string; body: string };
}

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.ON_DEMAND;

function signLink(ctx: RuleContext<HandledEvent>): string {
  // Query format the sign form expects, kept verbatim from the legacy bot.
  return `https://home-assistant.io/developers/cla_sign_start/?pr=${ctx.repo.fullName}#${ctx.number}`;
}

/**
 * The CLA check. Every human commit author must have a signature on file;
 * commits not linked to a GitHub account can't be checked at all and fail
 * with instructions. Unsigned authors are recorded as pending signers so the
 * /cla-sign endpoint can find this PR when they sign — signing adds the
 * `cla-recheck` label, whose labeled event re-runs this check.
 */
export function claCheck(getStore: (env: Env) => ClaStore | undefined): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<ClaOutcome | undefined> {
    if (IGNORED_REPOSITORIES.has(ctx.repo.fullName)) return;

    const store = getStore(ctx.env);
    if (!store) return;

    const effects: Effect[] = [];
    if ("label" in ctx.event) {
      if (ctx.event.label !== CLA_RECHECK_LABEL) return;
      effects.push({ type: "removeLabels", labels: [CLA_RECHECK_LABEL] });
    }

    const commits = await ctx.target.commits();
    const relevant = commits.filter(
      (c) => c.author?.type !== "Bot" && !IGNORED_AUTHOR_EMAILS.has(c.commit?.author?.email ?? ""),
    );

    const unlinked = relevant.filter((c) => !c.author?.login);
    if (unlinked.length > 0) {
      const commitsUrl = `https://github.com/${ctx.repo.fullName}/pull/${ctx.number}/commits/`;
      const lines = unlinked.slice(0, MAX_LISTED_COMMITS).map((c) => {
        const hint = c.commit?.author?.email?.includes("@")
          ? `authored as \`${c.commit.author.email}\` — [link that address to your account](${LINK_ACCOUNT_HELP})`
          : "no email attached — amend the commit with `git commit --amend --author=...`";
        return `- [\`${c.sha.slice(0, 7)}\`](${commitsUrl}${c.sha}) — ${hint}`;
      });
      const extra =
        unlinked.length > MAX_LISTED_COMMITS
          ? `\n…and ${unlinked.length - MAX_LISTED_COMMITS} more`
          : "";
      const commitList = `${lines.join("\n")}${extra}`;
      return {
        status: "fail",
        summary: "Commit(s) are missing a linked GitHub user.",
        message:
          `Signature status can't be verified: ${unlinked.length} commit(s) aren't linked ` +
          `to a GitHub account:\n${commitList}`,
        comment: {
          marker: CLA_UNLINKED_COMMENT_MARKER,
          body: unlinkedCommitsComment(await ctx.target.authorLogin(), commitList),
        },
        effects: [
          ...effects,
          { type: "addLabels", labels: [CLA_ERROR_LABEL] },
          { type: "removeLabels", labels: [CLA_SIGNED_LABEL] },
        ],
      };
    }

    const shasByLogin = new Map<string, string[]>();
    for (const c of relevant) {
      const login = c.author?.login;
      if (!login) continue;
      shasByLogin.set(login, [...(shasByLogin.get(login) ?? []), c.sha]);
    }

    const unsigned: string[] = [];
    for (const login of shasByLogin.keys()) {
      if (!(await store.hasSigned(login))) unsigned.push(login);
    }

    if (unsigned.length > 0) {
      await store.recordPendingSigners(
        unsigned.map((login) => ({
          login,
          // biome-ignore lint/style/noNonNullAssertion: keys come from the map
          shas: shasByLogin.get(login)!,
          pr: { owner: ctx.repo.owner, repo: ctx.repo.name, number: ctx.number },
        })),
      );
      const who = unsigned.map((login) => `@${login}`).join(", ");
      return {
        status: "fail",
        summary: "At least one contributor needs to sign the CLA.",
        message:
          `${who} — please [sign our Contributor License Agreement](${signLink(ctx)}). ` +
          `We can review and accept this pull request once every commit author has signed.`,
        effects: [
          ...effects,
          { type: "addLabels", labels: [CLA_NEEDED_LABEL] },
          { type: "removeLabels", labels: [CLA_SIGNED_LABEL] },
        ],
      };
    }

    const allIgnored = relevant.length === 0;
    if (!allIgnored) {
      effects.push({ type: "addLabels", labels: [CLA_SIGNED_LABEL] });
    }
    effects.push({ type: "removeLabels", labels: [CLA_NEEDED_LABEL, CLA_ERROR_LABEL] });
    const message = allIgnored
      ? "All commit authors are bots — nothing to sign."
      : "Everyone involved has signed the CLA.";
    return { status: "pass", summary: message, message, effects };
  }

  /**
   * The check runs in one of two modes, derived from whether the repo has a
   * dashboard — so the mode can never disagree with where the outcome lands:
   *
   * - **Modern** (dashboard repos): the outcome is a check row; the engine
   *   owns the aggregate commit status and draft-on-failure.
   * - **Legacy**: the rule owns its merge gate (`cla-bot` commit status) and
   *   explains failures in a one-time comment, like the legacy bot did.
   */
  async function handle(ctx: RuleContext<HandledEvent>): Promise<RuleOutput | undefined> {
    if ((await ctx.target.state()) !== "open") return;
    const outcome = await evaluate(ctx);
    if (!outcome) return;

    const effects: Effect[] = [...(outcome.effects ?? [])];
    if (outcome.comment) effects.push({ type: "commentOnce", ...outcome.comment });

    if (ctx.repoConfig.dashboard) {
      return {
        statuses: [{ id: "cla", title: "CLA", status: outcome.status, message: outcome.message }],
        effects,
      };
    }

    effects.push({
      type: "commitStatus",
      context: CLA_STATUS_CONTEXT,
      state: outcome.status === "pass" ? "success" : "failure",
      description: outcome.summary,
      targetUrl: outcome.status === "pass" ? undefined : signLink(ctx),
    });
    if (outcome.status !== "pass" && !outcome.comment) {
      effects.push({
        type: "commentOnce",
        marker: CLA_COMMENT_MARKER,
        body: legacyClaComment(outcome.message),
      });
    }
    return { effects };
  }

  return {
    name: "cla",
    description: "Requires every commit author to have signed the Contributor License Agreement.",
    statusSections: [{ id: "cla", title: "CLA" }],
    events: on(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_REOPENED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.PULL_REQUEST_LABELED,
        EventType.ON_DEMAND,
      ],
      handle,
    ),
  };
}

/** The failure explanation posted (once) on dashboard-less repos. */
function legacyClaComment(message: string): string {
  return [
    "👋 Thanks for the contribution!",
    "",
    message,
    "",
    "_This check re-runs automatically once the issue above is resolved._",
  ].join("\n");
}

/**
 * The unlinked-commits walkthrough, ported from the legacy bot: new
 * contributors hit this without understanding why, so the fix deserves the
 * full step-by-step rather than a dashboard row.
 */
function unlinkedCommitsComment(prAuthor: string, commitList: string): string {
  return `Hello @${prAuthor},

When attempting to inspect the commits of your pull request for CLA signature status among all authors we encountered commit(s) which were not linked to a GitHub account, thus not allowing us to determine their status(es).

The commits that are missing a linked GitHub account are the following:

${commitList}

Unfortunately, **we are unable to accept this pull request until this situation is corrected.**

Here are your options:

1. If you had an email address set for the commit that simply wasn't linked to your GitHub account you can link that email now and it will retroactively apply to your commits. The simplest way to do this is to click the link to one of the above commits and look for a blue question mark in a blue circle in the top left. Hovering over that bubble will show you what email address you used. Clicking on that button will take you to your email address settings on GitHub. Just add the email address on that page and you're all set. GitHub has more information about this option [in their help center](${LINK_ACCOUNT_HELP}).

2. If you didn't use an email address at all, it was an invalid email, or it's one you can't link to your GitHub, you will need to change the authorship information of the commit and your global Git settings so this doesn't happen again going forward. GitHub provides some great instructions on how to change your authorship information [in their help center](https://help.github.com/articles/setting-your-email-in-git/).
   - If you only made a single commit you should be able to run
     \`\`\`
     git commit --amend --author="Author Name <email@address.com>"
     \`\`\`
     (substituting "Author Name" and "\`email@address.com\`" for your actual information) to set the authorship information.
   - If you made more than one commit and the commit with the missing authorship information is not the most recent one you have two options:
     1. You can re-create all commits missing authorship information. This is going to be the easiest solution for developers that aren't extremely confident in their Git and command line skills.
     2. You can use [this script](https://help.github.com/articles/changing-author-info/) that GitHub provides to rewrite history. **Please note:** this should be used only if you are very confident in your abilities and understand its impacts.
   - Whichever method you choose, the check re-runs automatically once you push the fixes to this branch.

We apologize for this inconvenience, especially since it usually bites new contributors to Home Assistant. We hope you understand the need for us to protect ourselves and the great community we all have built legally. The best thing to come out of this is that you only need to fix this once and it benefits the entire Home Assistant and GitHub community.

Thanks, I look forward to checking this PR again soon! :heart:`;
}

/** The production rule, reading and writing the DynamoDB-backed store. */
export const cla: Rule = claCheck(dynamoClaStore);
