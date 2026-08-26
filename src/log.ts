import * as Sentry from "@sentry/nestjs";
import { pino } from "pino";
import { correlationId } from "./correlation.js";

type Attributes = Record<string, unknown>;

// Structured JSON on stdout keeps logs usable without Sentry (local dev,
// docker logs).
const logger = pino({
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Stamp the ambient correlation ID (see correlation.ts) onto every entry. */
function withId(attributes?: Attributes): Attributes {
  const id = correlationId();
  if (!id) return attributes ?? {};
  return { correlationId: id, ...attributes };
}

/** An object rather than free functions so tests can spyOn. */
export const log = {
  info(message: string, attributes?: Attributes): void {
    const attrs = withId(attributes);
    logger.info(attrs, message);
    Sentry.logger.info(message, attrs);
  },

  warn(message: string, attributes?: Attributes): void {
    const attrs = withId(attributes);
    logger.warn(attrs, message);
    Sentry.logger.warn(message, attrs);
  },

  error(message: string, attributes?: Attributes): void {
    const attrs = withId(attributes);
    logger.error(attrs, message);
    Sentry.logger.error(message, attrs);
  },

  exception(err: unknown, attributes?: Attributes): void {
    const attrs = withId(attributes);
    logger.error({ err, ...attrs }, err instanceof Error ? err.message : String(err));
    // handled: false — every caller is a last-resort catch (exception filter,
    // gateway .catch); these are unhandled failures, not expected captures.
    Sentry.captureException(err, {
      mechanism: { handled: false },
      ...(Object.keys(attrs).length ? { captureContext: { extra: attrs } } : {}),
    });
  },
};
