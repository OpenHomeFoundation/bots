import { describe, expect, it, vi } from "vitest";
import { migrateClaDatabaseWithRetry } from "../../src/cla/migrations.js";
import { expectLoggedErrors } from "../helpers/log-guard.js";

const env = { CLA_DATABASE_URL: "postgresql://bots@db.invalid/bots" };

describe("migrateClaDatabaseWithRetry", () => {
  it("does nothing when CLA is not configured", async () => {
    const migrate = vi.fn();
    const wait = vi.fn();

    await migrateClaDatabaseWithRetry({ CLA_DATABASE_URL: undefined }, migrate, wait);

    expect(migrate).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it("migrates once without waiting when the database is reachable", async () => {
    const migrate = vi.fn().mockResolvedValue(undefined);
    const wait = vi.fn();

    await migrateClaDatabaseWithRetry(env, migrate, wait);

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("keeps retrying with a growing delay until the migration succeeds", async () => {
    expectLoggedErrors(); // each failed attempt logs an error by design
    const migrate = vi
      .fn()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockResolvedValueOnce(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    await migrateClaDatabaseWithRetry(env, migrate, wait);

    expect(migrate).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[30_000], [60_000]]);
  });

  it("caps the delay at five minutes", async () => {
    expectLoggedErrors(); // each failed attempt logs an error by design
    let failures = 12;
    const migrate = vi.fn(async () => {
      if (failures-- > 0) throw new Error("down");
    });
    const wait = vi.fn().mockResolvedValue(undefined);

    await migrateClaDatabaseWithRetry(env, migrate, wait);

    const delays = wait.mock.calls.map(([ms]) => ms);
    expect(delays).toHaveLength(12);
    expect(delays.slice(0, 3)).toEqual([30_000, 60_000, 90_000]);
    expect(Math.max(...delays)).toBe(300_000);
  });
});
