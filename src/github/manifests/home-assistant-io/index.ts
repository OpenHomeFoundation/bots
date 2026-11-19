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
import { integrationDomains } from "../../helpers/integration-domains.js";
import { byCodeOwner } from "../../rules/by-code-owner.js";
import { mentionCodeOwners } from "../../rules/code-owner-mention.js";
import { setIntegration } from "../../rules/set-integration.js";
import {
  HomeAssistantRepository,
  homeAssistantLinkRules,
  homeAssistantOrgRules,
} from "../home-assistant-org.js";
import type { RepoManifest } from "../types.js";
import { domainsFromFiles } from "./integration-domains.js";
import { branchLabels } from "./rules/branch-labels.js";
import { docsTargetBranch } from "./rules/docs-target-branch.js";
import { qualityScale } from "./rules/quality-scale.js";
import { setDocumentationSection } from "./rules/set-documentation-section.js";

const integrationDocPath = (domain: string) => `source/_integrations/${domain}.markdown`;
const domains = integrationDomains(domainsFromFiles);

const MANAGEABLE_LABELS = ["needs-more-information"];

export const homeAssistantIo: RepoManifest = {
  slug: HomeAssistantRepository.HOME_ASSISTANT_IO,
  dashboard: true,
  integrationPath: integrationDocPath,
  rules: [
    // Integrations
    setIntegration({ domains }),
    mentionCodeOwners({ pathPattern: integrationDocPath, domains, issueLabel: "feedback" }),
    byCodeOwner({ pathPattern: integrationDocPath, domains }),
    qualityScale({ domains }),

    // Branches
    branchLabels,
    docsTargetBranch,

    // Parenting
    ...homeAssistantLinkRules,

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
