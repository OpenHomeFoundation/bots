import type { PullRequest } from "../../../engine/model/pull-request.js";

/** Release PRs (`rc` → `master`) carry a changelog, not the contributor template. */
export async function isReleasePR(pr: PullRequest): Promise<boolean> {
  return (await pr.baseRef()) === "master";
}
