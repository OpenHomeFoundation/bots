import { afterEach, beforeEach } from "vitest";
import { resetDevComponentFiles } from "../src/github/helpers/dev-file.js";
import { resetItemLocks } from "../src/github/item-lock.js";
// Importing the guard silences src/log.js for the whole run (see the module).
import { verifyLogGuard } from "./helpers/log-guard.js";

// The dev file caches span deliveries in production; each test case must see
// the files it serves, not the previous case's.
beforeEach(resetDevComponentFiles);

// Lock queues span deliveries in production; a case must not wait on another's.
beforeEach(resetItemLocks);

// A warn/error/exception log a test didn't declare is a failure.
afterEach(verifyLogGuard);
