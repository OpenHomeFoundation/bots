import { update } from "../commands/update.js";
import { draftOnChangesRequested } from "../rules/draft-on-changes-requested.js";
import { readyForReview } from "../rules/ready-for-review.js";
import { ESPHomeRepository } from "./esphome-org.js";
import type { RepoManifest } from "./types.js";

export const esphome: RepoManifest = {
  slug: ESPHomeRepository.ESPHOME,
  rules: [draftOnChangesRequested, readyForReview],
  commands: [update],
};
