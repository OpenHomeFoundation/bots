import { log } from "../../log.js";
import { fetchWithTimeout } from "../../util/fetch.js";

// Long: these files change only by PR, and every reader re-evaluates on later
// events, so a stale read corrects itself.
const HIT_TTL_MS = 6 * 60 * 60 * 1000;

// Short: a 404 means "not on dev *yet*", and a file merged minutes ago must
// not stay invisible for six hours.
const MISS_TTL_MS = 5 * 60 * 1000;

// Core's domain grammar. Callers pass user input (command arguments, link
// segments, directory names, labels), which otherwise ends up in the URL.
const DOMAIN = /^[a-z0-9_]+$/;

const resets: (() => void)[] = [];

/**
 * A cached reader for one file in every integration directory on core's dev
 * branch, e.g. `manifest.json`. `read` turns a successful response into the
 * value (undefined when it is not usable). Cached across deliveries, one
 * entry per domain; concurrent readers share one fetch; a failed fetch keeps
 * the last good value and is not cached.
 */
export function devComponentFile<T>(
  file: string,
  read: (res: Response, domain: string) => Promise<T | undefined>,
): (domain: string) => Promise<T | undefined> {
  const byDomain = new Map<string, { value?: T; fetchedAt: number }>();
  const inflight = new Map<string, Promise<T | undefined>>();
  resets.push(() => {
    byDomain.clear();
    inflight.clear();
  });

  async function fetchFromDev(domain: string): Promise<T | undefined> {
    let value: T | undefined;
    try {
      const res = await fetchWithTimeout(
        `https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/${domain}/${file}`,
      );
      if (res.ok) value = await read(res, domain);
    } catch (err) {
      log.warn("devComponentFile: fetch failed", { domain, file, error: String(err) });
      // Uncached: a transient failure must not pin a miss.
      return byDomain.get(domain)?.value;
    }
    byDomain.set(domain, { value, fetchedAt: Date.now() });
    return value;
  }

  return (domain) => {
    if (!DOMAIN.test(domain)) return Promise.resolve(undefined);
    const cached = byDomain.get(domain);
    if (cached) {
      const ttl = cached.value === undefined ? MISS_TTL_MS : HIT_TTL_MS;
      if (Date.now() - cached.fetchedAt < ttl) return Promise.resolve(cached.value);
    }

    let pending = inflight.get(domain);
    if (!pending) {
      pending = fetchFromDev(domain).finally(() => inflight.delete(domain));
      inflight.set(domain, pending);
    }
    return pending;
  };
}

/** Test hook: drop every cache so a case sees the files it serves. */
export function resetDevComponentFiles(): void {
  for (const reset of resets) reset();
}
