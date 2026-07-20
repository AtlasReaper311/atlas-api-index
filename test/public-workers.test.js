import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_WORKER_NAMES, isPublicWorker } from "../src/public-workers.js";

test("the public Worker allowlist is sorted and unique", () => {
  assert.deepEqual(PUBLIC_WORKER_NAMES, [...new Set(PUBLIC_WORKER_NAMES)].sort());
});

test("unknown account Workers fail closed", () => {
  assert.equal(isPublicWorker("owner-private-service"), false);
  assert.equal(isPublicWorker("new-worker-not-yet-approved"), false);
  assert.equal(isPublicWorker(""), false);
  assert.equal(isPublicWorker(null), false);
});

test("approved public Workers remain publishable", () => {
  assert.equal(isPublicWorker("atlas-api-index"), true);
  assert.equal(isPublicWorker("atlas-api-public"), true);
  assert.equal(isPublicWorker("atlas-dora"), true);
});
