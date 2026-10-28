import type { NestApplicationOptions } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";

// rawBody: the webhook guard verifies the HMAC against the raw bytes.
// Default parsers are replaced: body-parser's 100 kB default can reject a
// GitHub delivery (a 65k-char markdown body is ~256 kB in UTF-8) before the
// signature check ever runs.
export const appOptions: NestApplicationOptions = {
  rawBody: true,
  bodyParser: false,
  // The CLA sign form on home-assistant.io posts JSON cross-origin.
  cors: { origin: /^https:\/\/(www\.)?home-assistant\.io$/, methods: ["POST"] },
};

export function setupApp(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "1mb" });
}
