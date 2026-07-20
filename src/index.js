/**
 * atlas-api-index
 *
 * The self-healing registry of approved public Atlas Systems Workers. Hourly
 * cron: enumerate the Cloudflare account, discard every script outside the
 * explicit public allowlist, probe each remaining Worker's /_meta, aggregate
 * to KV, and notify when a newly approved public Worker appears.
 *
 * Account inventory and public documentation are deliberately separate. A
 * private or unknown Worker may exist and operate normally without ever being
 * written to this registry, exposed through the API, or rendered on the site.
 */

import { handleMeta } from "../shared/_meta.js";
import { META } from "./meta.js";
import { notify } from "./notify.js";
import { buildRegistry, readRegistry, writeRegistry } from "./registry.js";

async function refreshRegistry(env, reason) {
  const previous = await readRegistry(env);
  const registry = await buildRegistry(env);
  await writeRegistry(env, registry);

  const known = new Set((previous?.workers ?? []).map((worker) => worker.name));
  const fresh = registry.workers.filter((worker) => !known.has(worker.name));
  if (previous && fresh.length > 0) {
    await notify(env, {
      level: "info",
      title: `api-index: ${fresh.length} new public worker${fresh.length === 1 ? "" : "s"} discovered`,
      message: fresh
        .map((worker) => `${worker.name} (${worker.documented ? "documented" : "no /_meta yet"})`)
        .join(", "),
      fields: {
        trigger: reason,
        workers: String(registry.counts.workers),
        documented: String(registry.counts.documented),
        registry: "https://api.atlas-systems.uk/",
      },
    });
  }
  console.log(
    `public registry rebuilt (${reason}): ${registry.counts.workers} workers, ` +
      `${registry.counts.documented} documented, ${fresh.length} new`,
  );
  return registry;
}

function json(body, { status = 200, cacheSeconds = 300 } = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=60, s-maxage=${cacheSeconds}`,
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    const meta = handleMeta(url, META);
    if (meta) return meta;

    if (url.pathname !== "/") {
      return json({ error: "not found; the registry lives at /" }, { status: 404, cacheSeconds: 60 });
    }
    if (request.method !== "GET") {
      return json({ error: "method not allowed" }, { status: 405, cacheSeconds: 0 });
    }

    let registry = await readRegistry(env);
    if (!registry) {
      try {
        registry = await refreshRegistry(env, "on-demand");
      } catch (err) {
        console.log("live rebuild failed:", err.message);
        return json(
          { error: "registry unavailable and rebuild failed; next cron will retry" },
          { status: 503, cacheSeconds: 0 },
        );
      }
    }
    return json(registry);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      refreshRegistry(env, "cron").catch((err) =>
        console.log("cron rebuild failed:", err.message),
      ),
    );
  },
};
