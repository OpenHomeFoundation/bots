import { afterEach, beforeEach } from "vitest";
import { resetIntegrationManifests } from "../src/github/helpers/integration-manifest.js";
import { resetItemLocks } from "../src/github/item-lock.js";
// Importing the guard silences src/log.js for the whole run (see the module).
import { verifyLogGuard } from "./helpers/log-guard.js";

// The manifest cache spans deliveries in production; each test case must see
// the manifests it serves, not the previous case's.
beforeEach(resetIntegrationManifests);

// Lock queues span deliveries in production; a case must not wait on another's.
beforeEach(resetItemLocks);

// A warn/error/exception log a test didn't declare is a failure.
afterEach(verifyLogGuard);
