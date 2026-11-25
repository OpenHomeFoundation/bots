/** `domain:`, `fix(scope):`, `[domain]`, `Brand Name - `. */
const PREFIX = /^(?:\[[^\]]+\]|[\w./-]+(?:\([^)]*\))?!?:(?=\s)|(?:\S+ ){1,2}[-–—] )/;

/** What is wrong with a title's form, whatever the PR does. */
export function styleProblems(title: string): string[] {
  const text = title.trim();
  const problems: string[] = [];
  if (PREFIX.test(text)) {
    problems.push("Remove the prefix from the title.");
  } else if (/^\p{Ll}/u.test(text)) {
    problems.push("Start the title with a capital letter.");
  }
  if (/[^.]\.$/.test(text)) problems.push("Remove the dot at the end of the title.");
  if (/#\d+/.test(text)) {
    problems.push("Move the issue or pull request number from the title to the description.");
  }
  return problems;
}
