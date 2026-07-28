import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { captureRegistryContractEvidence } from "../scripts/capture-registry-contract-evidence.mjs";

test("the public registry remains JSON-only and fail-closed", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-api-index-evidence-"));
  try {
    const evidence = await captureRegistryContractEvidence({ outputDirectory });
    assert.equal(evidence.schema_version, "atlas-public-interface/registry-evidence/v1");
    assert.equal(evidence.visual_assertions, false);
    assert.equal(evidence.screenshots, false);
    assert.equal(evidence.summary.case_count, 4);
    assert.equal(evidence.summary.failed, 0);
    assert.equal(evidence.summary.json_only, true);
    assert.equal(evidence.summary.get_only_root, true);
    assert.equal(evidence.summary.fail_closed, true);
    assert.ok(fs.statSync(path.join(outputDirectory, "registry-contract-evidence.json")).size > 0);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});
