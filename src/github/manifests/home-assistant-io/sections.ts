/**
 * The label for issues filed from each part of home-assistant.io. A section is
 * a page path's first segment, or its first two under `/docs/`. Every section
 * in the site's sitemap is either labeled here or listed in `UNLABELED`; the
 * scheduled `io-sections` workflow opens an issue for any that is neither.
 */
export const SECTIONS: Record<string, string[]> = {
  "section: apps": ["apps", "docs/apps-and-integrations"],
  "section: authentication": ["docs/authentication", "docs/locked_out"],
  "section: automation": [
    "actions",
    "building-blocks",
    "conditions",
    "docs/automation",
    "docs/blueprint",
    "docs/scene",
    "docs/script",
    "docs/scripts",
    "triggers",
  ],
  "section: blog": ["blog"],
  "section: cloud": ["cloud"],
  "section: common-tasks": ["common-tasks"],
  "section: community": ["community"],
  "section: companion": ["android", "ios"],
  "section: configuration": ["docs/configuration"],
  "section: dashboards": ["dashboards", "docs/frontend"],
  "section: developers": ["developers"],
  "section: energy": ["docs/energy"],
  "section: faq": ["faq"],
  "section: getting-started": ["getting-started"],
  "section: glossary": ["docs/glossary"],
  "section: hardware": [
    "blue",
    "connect",
    "connectzbt1",
    "green",
    "hardware",
    "home-energy-management",
    "voice-pe",
    "yellow",
  ],
  "section: help": ["help"],
  "section: installation": ["installation"],
  "section: legal": ["code_of_conduct", "privacy", "security", "tos"],
  "section: more-info": ["more-info"],
  "section: organizing": ["docs/organizing"],
  "section: quality-scale": ["docs/quality_scale"],
  "section: release-notes": ["changelogs"],
  "section: templating": ["docs/templating", "template-functions"],
  "section: tools": ["docs/tools"],
  "section: troubleshooting": ["docs/troubleshooting_general"],
  "section: voice": ["voice_control"],
  "section: z-wave": ["docs/z-wave"],
};

/**
 * Sections deliberately left without a label: one-off pages, and integration
 * pages, which set-integration labels instead. `""` is the home page, `docs`
 * the docs index.
 */
export const UNLABELED = new Set([
  "",
  "conference",
  "docs",
  "images",
  "integrations",
  "socials",
  "state-of-the-open-home",
  "tag",
]);

const LABELS = new Map(
  Object.entries(SECTIONS).flatMap(([label, sections]) => sections.map((s) => [s, label] as const)),
);

/** The section a page path belongs to: `/docs/energy/gas/` → `docs/energy`. */
export function sectionOf(path: string): string {
  const [first = "", second] = path.split("/").filter(Boolean);
  return first === "docs" && second ? `docs/${second}` : first;
}

/** The label for issues about the page at `path`, if its section has one. */
export function sectionLabel(path: string): string | undefined {
  return LABELS.get(sectionOf(path));
}

/** Whether the table covers `section`, with a label or as deliberately unlabeled. */
export function isKnownSection(section: string): boolean {
  return LABELS.has(section) || UNLABELED.has(section);
}
