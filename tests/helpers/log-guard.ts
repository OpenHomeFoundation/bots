import { type Mock, vi } from "vitest";
import { log } from "../../src/log.js";

/**
 * Test stand-ins for src/log.js, installed at module load (setup.ts imports
 * this). They keep pino/Sentry output out of test runs, and the afterEach
 * guard turns an unexpected warn/error/exception into a test failure:
 * logging above info for an outcome a test treats as normal is exactly the
 * noise we don't want reaching production logs.
 */

type LogMethod = keyof typeof log;
const GUARDED = ["warn", "error", "exception"] as const;

const mocks: Record<LogMethod, Mock> = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  exception: vi.fn(),
};
Object.assign(log, mocks);

let expected = false;

/**
 * Declare that the current test intentionally drives a path that logs at
 * warn or above. Where the log itself is the behavior under test, prefer
 * asserting it instead: vi.spyOn(log, "...").mockImplementation(() => {})
 * plus toHaveBeenCalledWith also satisfies the guard (the mockImplementation
 * keeps the call from reaching the guarded stub).
 */
export function expectLoggedErrors(): void {
  expected = true;
}

/** afterEach body (registered in setup.ts): fail on unexpected calls, reset. */
export function verifyLogGuard(): void {
  const offenders = GUARDED.flatMap((level) =>
    mocks[level].mock.calls.map((args) => `${level}: ${String(args[0])}`),
  );
  const wasExpected = expected;
  expected = false;
  for (const mock of Object.values(mocks)) mock.mockClear();
  if (offenders.length > 0 && !wasExpected) {
    throw new Error(
      `Unexpected log above info level:\n  ${offenders.join("\n  ")}\n` +
        "If this test drives the failure path on purpose, call expectLoggedErrors() " +
        "(tests/helpers/log-guard.ts) or assert the log via a spy with a mockImplementation.",
    );
  }
  if (offenders.length === 0 && wasExpected) {
    throw new Error(
      "expectLoggedErrors() was called but nothing logged above info level — " +
        "the failure path this test declares no longer logs; drop the call or fix the test.",
    );
  }
}
