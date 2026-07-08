/**
 * Worker discovery via the Cloudflare API.
 *
 * Three read-only calls build the probe map:
 *   1. Account scripts list: every deployed Worker, whether routed or not.
 *   2. Zone Workers routes: pattern → script, which is how a script's
 *      public URL is derived (strip the trailing *, that prefix plus
 *      /_meta is the probe target).
 *   3. Account workers.dev subdomain: the fallback probe host for
 *      Workers with no zone route (atlas-vault lives there).
 *
 * The runtime token behind this is narrow and read-only (Workers
 * Scripts:Read + Workers Routes:Read); discovery can enumerate, it can
 * never touch.
 */

const API = "https://api.cloudflare.com/client/v4";
const EXCLUDED_WORKERS = new Set(["atlas-backend"]);
const SERVICE_BINDINGS = {
  "atlas-notify": "ATLAS_NOTIFY",
  "atlas-vault": "WORKER_ATLAS_VAULT",
  "deploy-watch": "WORKER_DEPLOY_WATCH",
  "github-pulse": "WORKER_GITHUB_PULSE",
  "ramone-edge": "WORKER_RAMONE_EDGE",
  "ramone-trigger": "WORKER_RAMONE_TRIGGER",
  "simple-proxy": "WORKER_SIMPLE_PROXY",
  "site-pulse": "WORKER_SITE_PULSE",
  "specular-edge": "WORKER_SPECULAR_EDGE",
};

async function cf(env, path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      "content-type": "application/json",
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const detail = (payload.errors || []).map((e) => e.message).join("; ");
    throw new Error(`Cloudflare API ${response.status} on ${path}: ${detail}`);
  }
  return payload.result;
}

async function optionalCf(env, path, fallback, warnings) {
  try {
    return await cf(env, path);
  } catch (err) {
    warnings.push(`${path}: ${err.message}`);
    console.log(`optional Cloudflare discovery failed on ${path}:`, err.message);
    return fallback;
  }
}

/** Route pattern → probe base URL: strip *, ensure scheme, trim /. */
function routeToBase(pattern) {
  let base = pattern.replace(/\*+$/, "");
  if (!/^https?:\/\//.test(base)) base = `https://${base}`;
  return base.replace(/\/+$/, "");
}

function routeToMetaUrl(pattern) {
  const base = routeToBase(pattern);
  const path = new URL(base).pathname;
  return path.endsWith("/_meta") ? base : `${base}/_meta`;
}

function routePriority(pattern) {
  const base = routeToBase(pattern);
  const url = new URL(base);
  const isMetaRoute = url.pathname.endsWith("/_meta");
  const isCatchAll = pattern.endsWith("/*");
  return (isMetaRoute ? 1000 : 0) + (isCatchAll ? 500 : 0) - url.pathname.length;
}

function routeCandidate(route) {
  return { pattern: route.pattern, priority: routePriority(route.pattern) };
}

/**
 * Enumerate every Worker in the account with its best probe URL.
 * @returns {Promise<{workers: Array<{name: string, probe_url: string|null, via: string, service_binding: string|null}>, warnings: string[]}>}
 */
export async function discoverWorkers(env) {
  const warnings = [];
  const scripts = await cf(env, `/accounts/${env.ACCOUNT_ID}/workers/scripts`);
  const [routes, subdomain] = await Promise.all([
    optionalCf(env, `/zones/${env.ZONE_ID}/workers/routes`, [], warnings),
    optionalCf(env, `/accounts/${env.ACCOUNT_ID}/workers/subdomain`, null, warnings),
  ]);

  // script -> best matching route. Prefer specific public route prefixes
  // over catch-alls and exact /_meta routes.
  const routeByScript = new Map();
  for (const route of routes) {
    if (!route.script) continue;
    const next = routeCandidate(route);
    const current = routeByScript.get(route.script);
    if (!current || next.priority < current.priority) {
      routeByScript.set(route.script, next);
    }
  }
  const devHost = subdomain?.subdomain ? `${subdomain.subdomain}.workers.dev` : null;

  const workers = scripts.filter((script) => !EXCLUDED_WORKERS.has(script.id)).map((script) => {
    const name = script.id;
    const pattern = routeByScript.get(name)?.pattern;
    const service_binding = SERVICE_BINDINGS[name] ?? null;
    if (pattern) {
      return { name, probe_url: routeToMetaUrl(pattern), via: "route", service_binding };
    }
    if (devHost) {
      // Unrouted Workers with workers_dev disabled will simply fail the
      // probe and list as undocumented, which is the honest answer.
      return { name, probe_url: `https://${name}.${devHost}/_meta`, via: "workers.dev", service_binding };
    }
    return { name, probe_url: null, via: "none", service_binding };
  });
  return { workers, warnings };
}
