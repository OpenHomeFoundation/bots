import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Correlation ID for the unit of work currently executing — `gh:<delivery>`
 * for GitHub webhook deliveries, `dc:<snowflake>` for Discord events. Stored
 * in AsyncLocalStorage so `log` can stamp it onto every entry without the
 * call sites threading it through.
 */
const storage = new AsyncLocalStorage<string>();

/** Run `fn` (and everything async it starts) under the given correlation ID. */
export function withCorrelationId<T>(id: string, fn: () => T): T {
  return storage.run(id, fn);
}

export function correlationId(): string | undefined {
  return storage.getStore();
}
