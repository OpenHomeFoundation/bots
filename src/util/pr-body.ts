import { type ItemRef, slugOf } from "./item-ref.js";

interface Task {
  checked: boolean;
  description: string;
}

function groups(m: RegExpMatchArray): Record<string, string> {
  return m.groups as Record<string, string>;
}

/**
 * Returns every issue/PR reference in `body` — the `owner/repo#123`
 * shorthand plus `https://github.com/owner/repo/pull/123` and
 * `https://github.com/owner/repo/issues/123` URLs — in the order they
 * appear. Deduplicated by (owner, repo, number).
 */
export function extractAllLinks(body: string | null): ItemRef[] {
  const all = [
    ...extractIssuesOrPullRequestMarkdownLinks(body),
    ...extractPullRequestURLLinks(body),
    ...extractIssueURLLinks(body),
  ];
  const seen = new Set<string>();
  const result: ItemRef[] = [];
  for (const link of all) {
    const key = `${slugOf(link)}#${link.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}

function extractIssuesOrPullRequestMarkdownLinks(body: string | null): ItemRef[] {
  if (!body) return [];
  // Starting only at a word boundary keeps a long word run linear.
  const re = /(?<![\w\-.])([\w\-.]+)\/([\w\-.]+)#(\d+)/g;
  return [...body.matchAll(re)].map((m) => ({
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  }));
}

function extractPullRequestURLLinks(body: string | null): ItemRef[] {
  if (!body) return [];
  const re = /https:\/\/github\.com\/([\w\-.]+)\/([\w\-.]+)\/pull\/(\d+)/g;
  return [...body.matchAll(re)].map((m) => ({
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  }));
}

function extractIssueURLLinks(body: string | null): ItemRef[] {
  if (!body) return [];
  const re = /https:\/\/github\.com\/([\w\-.]+)\/([\w\-.]+)\/issues\/(\d+)/g;
  return [...body.matchAll(re)].map((m) => ({
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  }));
}

// A listed line holds a handful of refs; the cap keeps a crafted body cheap.
const MAX_LINE = 1000;

const visibleText = (text: string) =>
  text.replace(/\[([^\][]*)\](?:\[[^\][]*\]|\([^()]*\))/g, "$1").trim();

/**
 * The issue/PR references listed on the template lines named by `labels`
 * (`- <label>: <refs>`) and on bullets indented under such a line, lowercased
 * and deduplicated. Labels compare by visible text, ignoring case, so
 * `Link to [documentation][docs] pull request` still matches. A markdown link
 * counts by where it points, not by its text; a bare `#123` is in `repo`.
 */
export function extractListedLinks(
  body: string | null,
  labels: readonly string[],
  repo: Pick<ItemRef, "owner" | "repo">,
): ItemRef[] {
  if (!body) return [];
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  const lines = body.split(/\r?\n/).map((line) => line.slice(0, MAX_LINE));
  const definitions = new Map<string, string>();
  for (const line of lines) {
    const definition = /^\s*\[([^\][]+)\]:\s*(\S+)/.exec(line);
    if (definition) definitions.set(definition[1].toLowerCase(), definition[2]);
  }

  const listed: string[] = [];
  let underLabel = false;
  for (const line of lines) {
    const item = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (underLabel && item && item[1].length > 0) {
      listed.push(item[2]);
      continue;
    }
    underLabel = false;
    // The label ends at the first colon followed by a space, so `https://` in it doesn't.
    const labelled = item && item[1].length === 0 ? /^(.*?):(?:\s|$)(.*)$/.exec(item[2]) : null;
    if (!labelled || !wanted.has(visibleText(labelled[1]).toLowerCase())) continue;
    listed.push(labelled[2]);
    underLabel = true;
  }

  const text = listed
    .join("\n")
    .replace(/\[[^\][]*\]\(([^()\s]*)\)/g, " $1 ")
    .replace(
      /\[[^\][]*\]\[([^\][]*)\]/g,
      (_, ref: string) => ` ${definitions.get(ref.toLowerCase()) ?? ""} `,
    )
    .replace(/(?<![\w/&])#(\d+)\b/g, ` ${repo.owner}/${repo.repo}#$1`);
  return extractAllLinks(text.toLowerCase());
}

export function extractTasks(body: string | null): Task[] {
  if (!body) return [];
  return body
    .split("\n")
    .map((line) => /^-\s?\[\s?(?<checked>\w| |)\s?\] (?<description>.*)/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null && m.groups !== undefined)
    .map((m) => {
      const g = groups(m);
      return { checked: Boolean(g.checked?.trim()), description: g.description };
    });
}
