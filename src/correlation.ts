import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ambient log context for the unit of work currently executing. Established
 * with a correlation ID — `gh:<delivery>` for GitHub webhook deliveries,
 * `dc:<snowflake>` for Discord events, `cla:<uuid>` for CLA sign requests —
 * and enriched via `addLogContext` as the work figures out what it is
 * handling (repository, number, eventType, …). Stored in AsyncLocalStorage
 * so `log` can stamp it onto every entry without the call sites threading it
 * through.
 */
type LogContext = Record<string, unknown>;

const storage = new AsyncLocalStorage<LogContext>();

/** Run `fn` (and everything async it starts) under the given correlation ID. */
export function withCorrelationId<T>(id: string, fn: () => T): T {
  return storage.run({ correlationId: id }, fn);
}

/**
 * Merge attributes into the ambient context — every log call in the current
 * unit of work carries them from here on. Keep it to a few flat identity
 * fields; everything added lands on every subsequent line. No-op outside a
 * correlation scope.
 */
export function addLogContext(attributes: LogContext): void {
  const store = storage.getStore();
  if (store) Object.assign(store, attributes);
}

export function logContext(): LogContext | undefined {
  return storage.getStore();
}
