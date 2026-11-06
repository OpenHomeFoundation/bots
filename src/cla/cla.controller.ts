import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { withCorrelationId } from "../correlation.js";
// biome-ignore lint/style/useImportType: DI paramtype — `import type` gets erased
import { ClaService } from "./cla.service.js";

@Controller("cla-sign")
export class ClaController {
  constructor(private readonly claService: ClaService) {}

  @Post()
  @HttpCode(200)
  sign(@Body() body: unknown, @Req() request: Request): Promise<{ message: string }> {
    const forwardedFor = request.headers["x-forwarded-for"];
    // cla:<uuid> — there's no upstream delivery ID; the generated one still
    // correlates the sign request with the PR re-evaluation it triggers.
    return withCorrelationId(`cla:${randomUUID()}`, () =>
      this.claService.sign(
        body,
        Array.isArray(forwardedFor) ? forwardedFor.join(", ") : (forwardedFor ?? ""),
        request.headers["user-agent"] ?? "",
      ),
    );
  }

  @Post("authorize")
  @HttpCode(200)
  authorize(@Body() body: unknown): Promise<Record<string, unknown>> {
    return withCorrelationId(`cla:${randomUUID()}`, () => this.claService.authorize(body));
  }
}
