import { update } from "../commands/update.js";
import { draftOnChangesRequested } from "../rules/draft-on-changes-requested.js";
import { readyForReview } from "../rules/ready-for-review.js";
import { Organization, type OrgManifest } from "./types.js";

/** esphome org repos, for rules that need to reference one by slug. */
export enum ESPHomeRepository {
  ESPHOME = "esphome/esphome",
}

/** Every org repo without a manifest of its own. */
export const esphomeOrg: OrgManifest = {
  org: Organization.ESPHOME,
  rules: [draftOnChangesRequested, readyForReview],
  commands: [update],
};
