/**
 * List the home-assistant.io sections set-documentation-section doesn't cover:
 * sitemap pages whose section is neither labeled nor deliberately unlabeled in
 * src/github/manifests/home-assistant-io/sections.ts. Prints one markdown list
 * item per section, and nothing when the table is complete.
 *
 * Usage: pnpm run check-io-sections
 */
import type * as Sections from "../src/github/manifests/home-assistant-io/sections.js";

// Node's type stripping can't follow the src graph's `.js` specifiers into
// `.ts` files, so the table comes from the build output — the package script
// runs `pnpm build` first. dist ships no declarations, so the specifier is
// widened to `string` and the types come from the src module.
const { isKnownSection, sectionOf } = (await import(
  "../dist/github/manifests/home-assistant-io/sections.js" as string
)) as typeof Sections;

const SITEMAP = "https://www.home-assistant.io/sitemap.xml";

const res = await fetch(SITEMAP);
if (!res.ok) throw new Error(`Failed to fetch ${SITEMAP}: ${res.status}`);

const unknown = new Map<string, string[]>();
for (const [, url] of (await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const path = new URL(url).pathname;
  const section = sectionOf(path);
  if (!isKnownSection(section)) unknown.set(section, [...(unknown.get(section) ?? []), path]);
}

for (const [section, paths] of [...unknown].sort(([a], [b]) => a.localeCompare(b))) {
  const pages = paths.length === 1 ? "1 page" : `${paths.length} pages`;
  console.log(`- \`${section}\` (${pages}), e.g. https://www.home-assistant.io${paths[0]}`);
}
