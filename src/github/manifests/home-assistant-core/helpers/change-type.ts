import { extractTasks } from "../../../../util/pr-body.js";

export const NEW_INTEGRATION_LABEL = "new-integration";
export const CODE_QUALITY_LABEL = "code-quality";

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
    description: "Code quality improvements to existing code or addition of tests",
    labels: [CODE_QUALITY_LABEL],
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
