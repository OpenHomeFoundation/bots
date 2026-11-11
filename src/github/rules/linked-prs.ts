import { type ItemRef, slugOf } from "../../util/item-ref.js";
import { extractListedLinks } from "../../util/pr-body.js";
import type { PullRequest } from "../engine/model/pull-request.js";
import type { RuleContext } from "../engine/model/rule-context.js";

/**
 * The linked PR, seen from this one: a sibling has to be merged together with
 * it, a child follows it, a parent is what it follows.
 */
export type Relation = "sibling" | "child" | "parent";

type RepoRef = Pick<ItemRef, "owner" | "repo">;

/** How an org's PR descriptions list the PRs that belong together. */
export interface PrLinks {
  /** The template line, by its visible text before the colon. */
  label: string;
  /** Lines of older templates that still count, for PRs opened from them. */
  legacyLabels: readonly string[];
  /** What a PR in `other` is to one in `self`; null where the two never pair, e.g. a library. */
  relationOf: (self: RepoRef, other: RepoRef) => Relation | null;
}

export interface LinkedPR {
  /** As GitHub names it, whichever spelling the description used. */
  ref: ItemRef;
  pr: PullRequest;
  relation: Relation;
  /** Whether it lists this PR back. Anyone can name any PR, so only then do the two belong together. */
  confirmed: boolean;
}

// Each listed PR costs a read; real changes span a handful.
const MAX_LINKED = 10;

export const nameOf = (ref: ItemRef) => `${slugOf(ref)}#${ref.number}`;
// Repo names are case-insensitive on GitHub, and descriptions are typed by hand.
export const keyOf = (ref: ItemRef) => nameOf(ref).toLowerCase();

const listed = (body: string | null, links: PrLinks, repo: RepoRef) =>
  extractListedLinks(body, [links.label, ...links.legacyLabels], repo);

/**
 * The PRs this one's description lists (or `body`, e.g. an earlier version
 * of it), read from their side. Another spelling of this PR or of a linked
 * one counts once; issues drop out.
 */
export async function linkedPRs(
  ctx: RuleContext,
  links: PrLinks,
  body?: string | null,
): Promise<LinkedPR[]> {
  const self = { owner: ctx.repo.owner, repo: ctx.repo.name, number: ctx.number };
  const refs = listed(body === undefined ? await ctx.target.body() : body, links, self)
    .filter((ref) => keyOf(ref) !== keyOf(self) && links.relationOf(self, ref))
    .slice(0, MAX_LINKED);

  const read = await Promise.all(
    refs.map(async (listedRef): Promise<LinkedPR | null> => {
      const pr = ctx.pullRequest(listedRef);
      try {
        const ref = { ...(await pr.baseRepo()), number: listedRef.number };
        const relation = links.relationOf(self, ref);
        if (keyOf(ref) === keyOf(self) || !relation) return null;
        const confirmed = listed(await pr.body(), links, ref).some(
          (link) => keyOf(link) === keyOf(self),
        );
        return { ref, pr, relation, confirmed };
      } catch (err) {
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      }
    }),
  );
  const seen = new Set<string>();
  return read.filter((linked): linked is LinkedPR => {
    if (!linked || seen.has(keyOf(linked.ref))) return false;
    seen.add(keyOf(linked.ref));
    return true;
  });
}
