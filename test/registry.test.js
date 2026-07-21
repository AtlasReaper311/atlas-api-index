import assert from "node:assert/strict";
import test from "node:test";

import {
  KV_KEY,
  readRegistry,
  sanitiseRegistry,
  writeRegistry,
} from "../src/registry.js";

function staleRegistry() {
  return {
    service: "atlas-api-index",
    counts: {
      workers: 3,
      documented: 2,
      undocumented: 1,
    },
    workers: [
      { name: "atlas-api-public", documented: true },
      { name: "simple-proxy", documented: false },
      { name: "owner-private-service", documented: true },
    ],
  };
}

test("sanitiseRegistry removes workers outside the public allowlist", () => {
  const registry = sanitiseRegistry(staleRegistry());

  assert.deepEqual(
    registry.workers.map((worker) => worker.name),
    ["atlas-api-public"],
  );
  assert.deepEqual(registry.counts, {
    workers: 1,
    documented: 1,
    undocumented: 0,
  });
});

test("readRegistry reapplies the public boundary to cached KV snapshots", async () => {
  const env = {
    REGISTRY_KV: {
      async get(key, format) {
        assert.equal(key, KV_KEY);
        assert.equal(format, "json");
        return staleRegistry();
      },
    },
  };

  const registry = await readRegistry(env);
  assert.deepEqual(
    registry.workers.map((worker) => worker.name),
    ["atlas-api-public"],
  );
});

test("malformed cached snapshots fail closed and trigger rebuild semantics", async () => {
  const env = {
    REGISTRY_KV: {
      async get() {
        return { service: "atlas-api-index" };
      },
    },
  };

  assert.equal(await readRegistry(env), null);
});

test("writeRegistry persists only allowlisted workers and corrected counts", async () => {
  let stored = null;

  const env = {
    REGISTRY_KV: {
      async put(key, value, options) {
        stored = { key, value, options };
      },
    },
  };

  await writeRegistry(env, staleRegistry());

  assert.equal(stored.key, KV_KEY);
  assert.deepEqual(stored.options, { expirationTtl: 4500 });

  const registry = JSON.parse(stored.value);
  assert.deepEqual(
    registry.workers.map((worker) => worker.name),
    ["atlas-api-public"],
  );
  assert.deepEqual(registry.counts, {
    workers: 1,
    documented: 1,
    undocumented: 0,
  });
});

test("writeRegistry refuses malformed snapshots", async () => {
  const env = {
    REGISTRY_KV: {
      async put() {
        throw new Error("put should not be called");
      },
    },
  };

  await assert.rejects(
    () => writeRegistry(env, { service: "atlas-api-index" }),
    /registry snapshot is malformed/,
  );
});
