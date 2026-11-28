import type { Octokit } from "@octokit/rest";

export interface OpenMilestone {
  number: number;
  title: string;
}

/** Per-dispatch cache of a repo's open milestones, keyed by repo. */
export interface MilestoneReads {
  byRepo: Map<string, Promise<OpenMilestone[]>>;
}

export function createMilestoneReads(): MilestoneReads {
  return { byRepo: new Map() };
}

/**
 * The repo's open milestones. One paginated request per repo per dispatch; a
 * failed read drops its slot and propagates, so a later rule can retry.
 */
export function readOpenMilestones(
  github: Octokit,
  repo: { owner: string; name: string },
  reads: MilestoneReads,
): Promise<OpenMilestone[]> {
  const key = `${repo.owner}/${repo.name}`;
  const cached = reads.byRepo.get(key);
  if (cached) return cached;

  const inflight = github
    .paginate(github.issues.listMilestones, {
      owner: repo.owner,
      repo: repo.name,
      state: "open",
      per_page: 100,
    })
    .then((milestones) => milestones.map((m) => ({ number: m.number, title: m.title })));
  inflight.catch(() => {
    if (reads.byRepo.get(key) === inflight) reads.byRepo.delete(key);
  });
  reads.byRepo.set(key, inflight);
  return inflight;
}
