import { describe, expect, it } from "vitest";
import {
  createOrgReads,
  expandTeamRefs,
  readTeamMembers,
} from "../../../../src/github/engine/model/org-membership.js";
import { createFakeGitHub } from "../../helpers/mock-context.js";

describe("expandTeamRefs", () => {
  it("expands team refs to member logins and passes users through", async () => {
    const github = createFakeGitHub();
    github.teams.listMembersInOrg.mockResolvedValue({
      data: [{ login: "Alice" }, { login: "bob" }],
    });

    const expanded = await expandTeamRefs(
      github.octokit,
      "home-assistant",
      ["@balloob", "@home-assistant/core-team"],
      createOrgReads(),
    );

    expect(expanded).toEqual(["balloob", "alice", "bob"]);
    expect(github.teams.listMembersInOrg).toHaveBeenCalledWith({
      org: "home-assistant",
      team_slug: "core-team",
      per_page: 100,
    });
  });

  it("caches team membership per slug", async () => {
    const github = createFakeGitHub();
    github.teams.listMembersInOrg.mockResolvedValue({ data: [] });
    const reads = createOrgReads();

    await expandTeamRefs(github.octokit, "home-assistant", ["@home-assistant/core-team"], reads);
    await readTeamMembers(github.octokit, "home-assistant", "core-team", reads);

    expect(github.teams.listMembersInOrg).toHaveBeenCalledTimes(1);
  });
});
