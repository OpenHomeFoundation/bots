import type { Octokit } from "@octokit/rest";

export interface LatestRelease {
  tag: string;
  prerelease: boolean;
}

/** Per-dispatch cache of each repo's latest release, keyed by repo. */
export interface LatestReleaseReads {
  byRepo: Map<string, Promise<LatestRelease | null>>;
}

export function createLatestReleaseReads(): LatestReleaseReads {
  return { byRepo: new Map() };
}

/**
 * The repo's most recently published release, prereleases included (unlike
 * GitHub's `releases/latest`, which skips them). Null when the repo has none.
 * One request per repo per dispatch; a failed read drops its slot and
 * propagates, so a later rule can retry.
 */
export function readLatestRelease(
  github: Octokit,
  repo: { owner: string; name: string },
  reads: LatestReleaseReads,
): Promise<LatestRelease | null> {
  const key = `${repo.owner}/${repo.name}`;
  const cached = reads.byRepo.get(key);
  if (cached) return cached;

  const inflight = github.repos
    .listReleases({ owner: repo.owner, repo: repo.name, per_page: 1 })
    .then(({ data }) => {
      const [release] = data;
      return release ? { tag: release.tag_name, prerelease: release.prerelease } : null;
    });
  inflight.catch(() => {
    if (reads.byRepo.get(key) === inflight) reads.byRepo.delete(key);
  });
  reads.byRepo.set(key, inflight);
  return inflight;
}
