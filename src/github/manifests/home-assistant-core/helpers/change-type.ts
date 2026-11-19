import { extractTasks } from "../../../../util/pr-body.js";

export const NEW_INTEGRATION_LABEL = "new-integration";
export const CODE_QUALITY_LABEL = "code-quality";
export const TESTS_LABEL = "tests";
export const DEVELOPER_TOOLING_LABEL = "developer-tooling";

const BODY_MATCHES: { description: string; labels: string[] }[] = [
  { description: "Bugfix (non-breaking change which fixes an issue)", labels: ["bugfix"] },
  { description: "Dependency upgrade", labels: ["dependency"] },
  { description: "New integration (thank you!)", labels: [NEW_INTEGRATION_LABEL] },
  {
    description: "New feature (which adds functionality to an existing integration)",
    labels: ["new-feature"],
  },
  {
    description: "Deprecation (breaking change to happen in the future)",
    labels: ["deprecation"],
  },
  {
    description: "Breaking change (fix/feature causing existing functionality to break)",
    labels: ["breaking-change"],
  },
  {
    description:
      "Code quality improvements to existing code (refactoring, typing, performance, etc.)",
    labels: [CODE_QUALITY_LABEL],
  },
  // Open PRs keep the checkbox text they were created with.
  {
    description: "Code quality improvements to existing code or addition of tests",
    labels: [CODE_QUALITY_LABEL],
  },
  { description: "Tests (adding or improving tests only)", labels: [TESTS_LABEL] },
  {
    description:
      "Developer tooling (CI, GitHub workflows, linters and checkers, scripts, AI instructions, code owners)",
    labels: [DEVELOPER_TOOLING_LABEL],
  },
];

export const TYPE_OF_CHANGE_LABELS = new Set(BODY_MATCHES.flatMap((m) => m.labels));

/** Type-of-change labels checked in the PR body, so rules derive the change
 * type from the body instead of waiting for the change-type rule's labels. */
export function pickedTypeLabels(body: string | null): string[] {
  const completedTasks = extractTasks(body)
    .filter((t) => t.checked)
    .map((t) => t.description);
  return BODY_MATCHES.filter((m) => completedTasks.includes(m.description)).flatMap(
    (m) => m.labels,
  );
}
