import { describe, expect, it } from "vitest";
import {
  extractDocumentationLinks,
  extractForumLinks,
  extractIntegrationDocumentationLinks,
} from "../../../src/github/helpers/ha-links.js";

describe("extractIntegrationDocumentationLinks", () => {
  it("extracts a www integration link", () => {
    const links = extractIntegrationDocumentationLinks(
      "https://www.home-assistant.io/integrations/hue",
    );
    expect(links).toEqual([
      {
        link: "https://www.home-assistant.io/integrations/hue",
        integration: "hue",
        platform: undefined,
      },
    ]);
  });

  it("extracts integration with platform", () => {
    const links = extractIntegrationDocumentationLinks(
      "https://www.home-assistant.io/integrations/hue.light",
    );
    expect(links).toHaveLength(1);
    expect(links[0].integration).toBe("hue");
    expect(links[0].platform).toBe("light");
  });

  it("extracts links from rc and next subdomains", () => {
    const body = `
      https://rc.home-assistant.io/integrations/mqtt
      https://next.home-assistant.io/integrations/zwave
    `;
    const links = extractIntegrationDocumentationLinks(body);
    expect(links).toHaveLength(2);
    expect(links[0].integration).toBe("mqtt");
    expect(links[1].integration).toBe("zwave");
  });

  it("returns empty for null body", () => {
    expect(extractIntegrationDocumentationLinks(null)).toEqual([]);
  });
});

describe("extractForumLinks", () => {
  it("extracts a community forum link", () => {
    const links = extractForumLinks("See https://community.home-assistant.io/t/some-topic/12345");
    expect(links).toEqual(["https://community.home-assistant.io/t/some-topic/12345"]);
  });

  it("extracts multiple forum links on separate lines", () => {
    const links = extractForumLinks(
      "https://community.home-assistant.io/t/a/1\nhttps://community.home-assistant.io/t/b/2",
    );
    expect(links).toHaveLength(2);
  });

  it("returns empty for null body", () => {
    expect(extractForumLinks(null)).toEqual([]);
  });

  it("returns empty when no forum links found", () => {
    expect(extractForumLinks("not a forum link")).toEqual([]);
  });
});

describe("extractDocumentationLinks", () => {
  it("extracts links without query or fragment", () => {
    const links = extractDocumentationLinks(
      "See [the docs](https://www.home-assistant.io/docs/automation/trigger/#state-trigger) " +
        "and https://rc.home-assistant.io/getting-started?x=1",
    );
    expect(links).toEqual([
      "https://www.home-assistant.io/docs/automation/trigger/",
      "https://rc.home-assistant.io/getting-started",
    ]);
  });

  it("drops a trailing sentence period", () => {
    expect(
      extractDocumentationLinks(
        "Wrong on https://www.home-assistant.io/faq. See https://home-assistant.io/.",
      ),
    ).toEqual(["https://www.home-assistant.io/faq", "https://home-assistant.io/"]);
  });

  it("extracts the home page", () => {
    expect(extractDocumentationLinks("https://home-assistant.io")).toEqual([
      "https://home-assistant.io",
    ]);
  });

  it("skips other home-assistant.io subdomains", () => {
    expect(
      extractDocumentationLinks("https://companion.home-assistant.io/docs/core/sensors"),
    ).toEqual([]);
  });

  it("deduplicates links", () => {
    const links = extractDocumentationLinks(
      "https://www.home-assistant.io/faq/ and https://www.home-assistant.io/faq/",
    );
    expect(links).toEqual(["https://www.home-assistant.io/faq/"]);
  });

  it("returns empty for null body", () => {
    expect(extractDocumentationLinks(null)).toEqual([]);
  });
});
