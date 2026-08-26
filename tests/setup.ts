import { beforeEach } from "vitest";
import { resetIntegrationManifests } from "../src/github/helpers/integration-manifest.js";

// The manifest cache spans deliveries in production; each test case must see
// the manifests it serves, not the previous case's.
beforeEach(resetIntegrationManifests);
