import { close } from "../../commands/close.js";
import { ignore, unignore } from "../../commands/ignore.js";
import { addLabel } from "../../commands/label-add.js";
import { removeLabel } from "../../commands/label-remove.js";
import { markDraft } from "../../commands/mark-draft.js";
import { rename } from "../../commands/rename.js";
import { reopen } from "../../commands/reopen.js";
import { unassign } from "../../commands/unassign.js";
import { update } from "../../commands/update.js";
import { updateBranch } from "../../commands/update-branch.js";
import { byCodeOwner } from "../../rules/by-code-owner.js";
import { mentionCodeOwners } from "../../rules/code-owner-mention.js";
import { setIntegration } from "../../rules/set-integration.js";
import { HomeAssistantRepository, homeAssistantOrgRules } from "../home-assistant-org.js";
import type { RepoManifest } from "../types.js";
import { itemIntegrationDomains } from "./helpers/integration-domains.js";
import { branchLabels } from "./rules/branch-labels.js";
import { docsParenting } from "./rules/docs-parenting.js";
import { docsTargetBranch } from "./rules/docs-target-branch.js";
import { setDocumentationSection } from "./rules/set-documentation-section.js";

const integrationDocPath = (domain: string) => `source/_integrations/${domain}.markdown`;

const MANAGEABLE_LABELS = ["needs-more-information"];

export const homeAssistantIo: RepoManifest = {
  slug: HomeAssistantRepository.HOME_ASSISTANT_IO,
  dashboard: true,
  integrationPath: integrationDocPath,
  rules: [
    // Integrations
    setIntegration({ domains: itemIntegrationDomains }),
    mentionCodeOwners({
      pathPattern: integrationDocPath,
      domains: itemIntegrationDomains,
      itemLabel: "feedback",
    }),
    byCodeOwner({ pathPattern: integrationDocPath, domains: itemIntegrationDomains }),

    // Branches
    branchLabels,
    docsTargetBranch,

    // Parenting
    docsParenting,

    // Issues
    setDocumentationSection,

    // Org-wide
    ...homeAssistantOrgRules,
  ],
  commands: [
    update,
    ignore,
    unignore,
    close,
    reopen,
    rename,
    addLabel(MANAGEABLE_LABELS),
    removeLabel(MANAGEABLE_LABELS),
    unassign,
    markDraft,
    updateBranch,
  ],
};
