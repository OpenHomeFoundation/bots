import type { Octokit } from "@octokit/rest";

/** Per-dispatch cache of repo file reads, keyed by repo, ref and path. */
export interface RepoFileReads {
  byKey: Map<string, Promise<string | null>>;
}

export function createRepoFileReads(): RepoFileReads {
  return { byKey: new Map() };
}

function decodeContent(content: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)));
}

async function fetchRepoFile(
  github: Octokit,
  repo: { owner: string; name: string },
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const res = await github.repos.getContent({ owner: repo.owner, repo: repo.name, path, ref });
    // A directory (or a submodule/symlink) comes back without `content`.
    return "content" in res.data ? decodeContent(res.data.content) : null;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/**
 * A repo file's text at `ref` — branch, tag or commit SHA — or null when that
 * ref has no such file. One request per (repo, ref, path) per dispatch. A
 * failed read (anything but 404) drops its slot and propagates, so a later
 * rule can retry.
 */
export function readRepoFile(
  github: Octokit,
  repo: { owner: string; name: string },
  path: string,
  ref: string,
  reads: RepoFileReads,
): Promise<string | null> {
  const key = `${repo.owner}/${repo.name}@${ref}:${path}`;
  const cached = reads.byKey.get(key);
  if (cached) return cached;

  const inflight = fetchRepoFile(github, repo, path, ref);
  inflight.catch(() => {
    if (reads.byKey.get(key) === inflight) reads.byKey.delete(key);
  });
  reads.byKey.set(key, inflight);
  return inflight;
}
