import assert from "node:assert/strict";
import test from "node:test";

import { sanitiseRegistry } from "../src/registry.js";

test("sanitiseRegistry removes excluded Workers and recomputes counts", () => {
  const registry = sanitiseRegistry({
    service: "atlas-api-index",
    counts: {
      workers: 3,
      documented: 2,
      undocumented: 1,
    },
    workers: [
      { name: "atlas-api-public", documented: true },
      { name: "simple-proxy", documented: false },
      { name: "site-pulse", documented: true },
    ],
  });

  assert.deepEqual(
    registry.workers.map((worker) => worker.name),
    ["atlas-api-public", "site-pulse"],
  );

  assert.deepEqual(registry.counts, {
    workers: 2,
    documented: 2,
    undocumented: 0,
  });
});
