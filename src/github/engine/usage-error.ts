/**
 * A command handler rejecting its user input (bad arguments, unknown
 * label/check). dispatchCommand treats it as a rejection — info-level
 * "command rejected" plus the 👎 — rather than a failure; a plain Error
 * stays a genuine fault and logs "command failed" at error level.
 */
export class UsageError extends Error {
  override readonly name = "UsageError";
}
