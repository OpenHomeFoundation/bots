import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { EventType } from "../../../src/github/engine/event.js";
import { issuePayload, runScenario, type Scenario } from "./harness.js";

/**
 * Full-pipeline snapshots for the home-assistant/home-assistant.io manifest,
 * built like the core ones (see home-assistant-core.test.ts).
 */

const REPOSITORY = {
  full_name: "home-assistant/home-assistant.io",
  name: "home-assistant.io",
  owner: { login: "home-assistant" },
};

const HUE_MANIFEST = {
  domain: "hue",
  name: "Philips Hue",
  quality_scale: "platinum",
  codeowners: ["@balloob"],
};

/** The issue the docs feedback form files, with the page's URL prefilled. */
function feedbackBody(url: string): string {
  return `### Feedback\n\nThe bridge pairing steps are outdated.\n\n### URL\n\n${url}\n`;
}

const HUE_FEEDBACK = {
  title: "Hue pairing steps are outdated",
  body: feedbackBody("https://www.home-assistant.io/integrations/hue/"),
};

const HUE_STATE = {
  codeowners: "source/_integrations/hue.markdown @balloob\n",
  remote: { "components/hue/manifest.json": HUE_MANIFEST },
};

const scenarios: Record<string, Scenario> = {
  "issues.opened.integration-feedback": {
    eventType: EventType.ISSUES_OPENED,
    payload: issuePayload("opened", HUE_FEEDBACK, { repository: REPOSITORY }),
    state: HUE_STATE,
  },

  // `@home-assistant update` on the issue, e.g. after its URL was corrected.
  "issues.on_demand.integration-feedback": {
    eventType: EventType.ISSUES_ON_DEMAND,
    payload: issuePayload("opened", HUE_FEEDBACK, { repository: REPOSITORY }),
    state: HUE_STATE,
  },
};

describe("home-assistant/home-assistant.io dispatch snapshots", () => {
  for (const [name, scenario] of Object.entries(scenarios)) {
    it(name, async () => {
      const result = await runScenario(scenario);
      await expect(stringify(result, { lineWidth: 0 })).toMatchFileSnapshot(
        `snapshots/home-assistant-io/${name}.yaml`,
      );
    });
  }
});
