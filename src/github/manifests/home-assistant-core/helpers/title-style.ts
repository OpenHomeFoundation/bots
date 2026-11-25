/** `domain:`, `fix(scope):`, `[domain]`, `Brand Name - `. */
const PREFIX = /^(?:\[[^\]]+\]|[\w./-]+(?:\([^)]*\))?!?:(?=\s)|(?:\S+ ){1,2}[-–—] )/;

/** GitHub cuts longer commit subjects off with `…` and moves the rest to the description. */
const MAX_LENGTH = 72;

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
  const length = [...text].length;
  if (text.endsWith("…")) {
    problems.push(`Shorten the title to at most ${MAX_LENGTH} characters: it was cut off.`);
  } else if (length > MAX_LENGTH) {
    problems.push(`Shorten the title to at most ${MAX_LENGTH} characters: it has ${length}.`);
  }
  if (/#\d+/.test(text)) {
    problems.push("Move the issue or pull request number from the title to the description.");
  }
  return problems;
}
