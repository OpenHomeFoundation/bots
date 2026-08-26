/**
 * Capture real Discord events as test fixtures: starts the real gateway
 * (commands register, the bot responds), and additionally writes every
 * normalized event to tests/discord/fixtures/_captured/. Perform actions on
 * a guild the bot is in, then copy the interesting captures into
 * tests/discord/fixtures/<guild>/ named `<type>[.variant].json`.
 *
 * Usage: DISCORD_TOKEN=... pnpm run capture-discord
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscordEvent } from "../src/discord/engine/event.js";

// Node's type stripping can't follow the src graph's `.js` specifiers into
// `.ts` files, so the gateway comes from the build output — the package
// script runs `pnpm build` first. dist ships no declarations, so the
// specifiers are widened to `string` (skipping tsc's module resolution)
// and the types come from the src modules the build compiled.
const { startDiscordGateway } = (await import(
  "../dist/discord/engine/gateway.js" as string
)) as typeof import("../src/discord/engine/gateway.js");
const { discordRegistry } = (await import(
  "../dist/discord/manifests/index.js" as string
)) as typeof import("../src/discord/manifests/index.js");

const CAPTURE_DIR = fileURLToPath(new URL("../tests/discord/fixtures/_captured", import.meta.url));

try {
  process.loadEnvFile();
} catch {
  // no .env file — the token can come from the real environment
}
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is required");
  process.exit(1);
}

mkdirSync(CAPTURE_DIR, { recursive: true });

let sequence = 0;
function capture(event: DiscordEvent): void {
  const name = `${String(++sequence).padStart(3, "0")}.${event.type}.json`;
  writeFileSync(join(CAPTURE_DIR, name), `${JSON.stringify(event, null, 2)}\n`);
  console.log(`captured ${name}`);
}

await startDiscordGateway(discordRegistry, { token, onEvent: capture });
console.log(`capturing to ${CAPTURE_DIR}`);
