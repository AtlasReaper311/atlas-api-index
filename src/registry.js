/**
 * Registry build and KV persistence.
 *
 * One KV key, versioned, written once per cron pass (24 writes/day,
 * nowhere near the 1,000/day free cap). The TTL is 75 minutes: long
 * enough that one missed cron does not blank the index, short enough
 * that a dead cron becomes visible within the hour it should have run.
 * A read miss rebuilds live and re-persists, so the endpoint heals
 * itself instead of 404ing.
 */

import { discoverWorkers } from "./discover.js";
import { probeMeta } from "./probe.js";

export const KV_KEY = "api-index:registry:v1";
const KV_TTL_SECONDS = 4500;

/** Discover, probe, and assemble the registry document. */
export async function buildRegistry(env) {
  const discovered = await discoverWorkers(env);
  const timeoutMs = Number(env.PROBE_TIMEOUT_MS || "4000");

  const probes = await Promise.all(
    discovered.map((worker) => probeMeta(worker.probe_url, timeoutMs)),
  );

  const workers = discovered
    .map((worker, i) => ({
      name: worker.name,
      probe_url: worker.probe_url,
      via: worker.via,
      documented: probes[i].documented,
      meta: probes[i].documented ? probes[i].meta : null,
      note: probes[i].note ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    service: "atlas-api-index",
    generated_at: new Date().toISOString(),
    counts: {
      workers: workers.length,
      documented: workers.filter((w) => w.documented).length,
      undocumented: workers.filter((w) => !w.documented).length,
    },
    workers,
  };
}

/** Last persisted registry, or null. */
export async function readRegistry(env) {
  return env.REGISTRY_KV.get(KV_KEY, "json");
}

/** Persist a registry snapshot. */
export async function writeRegistry(env, registry) {
  await env.REGISTRY_KV.put(KV_KEY, JSON.stringify(registry), {
    expirationTtl: KV_TTL_SECONDS,
  });
}
