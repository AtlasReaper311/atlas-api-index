/**
 * atlas-api-index
 *
 * The self-healing registry of every Worker in the account. Hourly
 * cron: enumerate via the Cloudflare API, probe each Worker's /_meta,
 * aggregate to KV, and fire atlas-notify when a Worker appears that
 * the previous snapshot had never seen. Serves the registry at
 * api.atlas-systems.uk/ and answers its own /_meta, because a registry
 * that does not follow its own convention is a joke at its own
 * expense.
 *
 * Closes the documented gap: the hand-maintained JSON list at the api
 * root, which was accurate exactly as often as it was remembered.
 */

import { handleMeta } from "../shared/_meta.js";
import { META } from "./meta.js";
import { notify } from "./notify.js";
import { buildRegistry, readRegistry, writeRegistry } from "./registry.js";

/** Rebuild, diff against the previous snapshot, persist, notify news. */
async function refreshRegistry(env, reason) {
  const previous = await readRegistry(env);
  const registry = await buildRegistry(env);
  await writeRegistry(env, registry);

  const known = new Set((previous?.workers ?? []).map((worker) => worker.name));
  const fresh = registry.workers.filter((worker) => !known.has(worker.name));
  // First-ever pass discovers everything; announcing the entire estate
  // as "new" would be noise, so news only exists once a baseline does.
  if (previous && fresh.length > 0) {
    await notify(env, {
      level: "info",
      title: `api-index: ${fresh.length} new worker${fresh.length === 1 ? "" : "s"} discovered`,
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
    `registry rebuilt (${reason}): ${registry.counts.workers} workers, ` +
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
      // The registry is public documentation; let anything read it.
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
      // KV expired (missed crons) or first request ever: heal live.
      // The visitor pays one slow request; the next hour is cached.
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
