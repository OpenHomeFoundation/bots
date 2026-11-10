import { log } from "../log.js";

/**
 * Per-item serialization of webhook dispatches.
 *
 * Rules decide "already done?" by reading the thread (the code-owner mention,
 * the status comment) and dispatches only finish once their effects are
 * applied. Run concurrently, every dispatch reads the thread before any of
 * the others' comments land: a burst of `labeled` webhooks for an issue with
 * many integrations queued a full set of mention comments per event, and the
 * comment throttle (one POST every few seconds) kept posting them long after.
 * Queueing dispatches per item makes each one see the previous one's writes.
 *
 * Callers must not re-enter the lock for the same key from inside `run`
 * (`@<slug> update` evaluates the item it was invoked on): that would wait on
 * itself forever.
 *
 * A dispatch that had to wait logs how many were ahead of it and for how
 * long: the queue is where a comment-throttle backlog shows up first.
 */

const tails = new Map<string, Promise<void>>();
const depth = new Map<string, number>();

export async function withItemLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const ahead = depth.get(key) ?? 0;
  depth.set(key, ahead + 1);
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  // `previous` only ever resolves (it is built from `done` promises), so the
  // chain never rejects even when a dispatch throws.
  const tail = previous.then(() => done);
  tails.set(key, tail);

  try {
    const queuedAt = Date.now();
    await previous;
    if (ahead > 0) log.info("dispatch queued", { ahead, waitedMs: Date.now() - queuedAt });
    return await run();
  } finally {
    release();
    const left = (depth.get(key) ?? 1) - 1;
    if (left > 0) depth.set(key, left);
    else depth.delete(key);
    if (tails.get(key) === tail) tails.delete(key);
  }
}

/** Test hook: drop every queue so cases don't wait on each other's. */
export function resetItemLocks(): void {
  tails.clear();
  depth.clear();
}
