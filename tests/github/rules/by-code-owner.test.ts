import { describe, expect, it } from "vitest";
import { EventType } from "../../../src/github/engine/event.js";
import { itemIntegrationDomains } from "../../../src/github/manifests/home-assistant-core/helpers/integration-domains.js";
import { byCodeOwner } from "../../../src/github/rules/by-code-owner.js";
import { createFakeGitHub, createMockIssueContext, runRule } from "../helpers/mock-context.js";

const rule = byCodeOwner({
  pathPattern: (name) => `homeassistant/components/${name}/*`,
  domains: itemIntegrationDomains,
});

const CODEOWNERS =
  "homeassistant/components/hue/* @reporter\nhomeassistant/components/zha/* @balloob";

/** An issue by `reporter`, who owns hue but not zha, just labeled with `labels`. */
function issueLabeled(labels: string[]) {
  const github = createFakeGitHub();
  github.repos.getContent.mockResolvedValue({ data: { content: btoa(CODEOWNERS) } });
  github.teams.listMembersInOrg.mockResolvedValue({ data: [] });

  return createMockIssueContext({
    eventType: EventType.ISSUES_LABELED,
    github,
    payload: {
      label: { name: labels.find((l) => l.startsWith("integration: ")) },
      issue: { user: { login: "reporter" }, labels: labels.map((name) => ({ name })) },
    },
  });
}

describe("by-code-owner", () => {
  it("labels items authored by a code owner", async () => {
    const result = await runRule(rule, issueLabeled(["integration: hue"]));
    expect(result?.labels).toEqual(["by-code-owner"]);
  });

  it("does nothing when the author is not a code owner", async () => {
    const result = await runRule(rule, issueLabeled(["integration: zha"]));
    expect(result).toBeUndefined();
  });

  it("does not label an item about several integrations", async () => {
    const result = await runRule(rule, issueLabeled(["integration: hue", "integration: zha"]));
    expect(result).toBeUndefined();
  });

  it("removes the label once the item is about several integrations", async () => {
    const result = await runRule(
      rule,
      issueLabeled(["by-code-owner", "integration: hue", "integration: zha"]),
    );
    expect(result?.removeLabels).toEqual(["by-code-owner"]);
  });
});
