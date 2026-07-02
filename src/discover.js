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

/** Route pattern → probe base URL: strip *, ensure scheme, trim /. */
function routeToBase(pattern) {
  let base = pattern.replace(/\*+$/, "");
  if (!/^https?:\/\//.test(base)) base = `https://${base}`;
  return base.replace(/\/+$/, "");
}

/**
 * Enumerate every Worker in the account with its best probe URL.
 * @returns {Promise<Array<{name: string, probe_url: string|null, via: string}>>}
 */
export async function discoverWorkers(env) {
  const [scripts, routes, subdomain] = await Promise.all([
    cf(env, `/accounts/${env.ACCOUNT_ID}/workers/scripts`),
    cf(env, `/zones/${env.ZONE_ID}/workers/routes`),
    cf(env, `/accounts/${env.ACCOUNT_ID}/workers/subdomain`).catch(() => null),
  ]);

  // script → first matching route (routes carry {pattern, script}).
  const routeByScript = new Map();
  for (const route of routes) {
    if (route.script && !routeByScript.has(route.script)) {
      routeByScript.set(route.script, route.pattern);
    }
  }
  const devHost = subdomain?.subdomain ? `${subdomain.subdomain}.workers.dev` : null;

  return scripts.map((script) => {
    const name = script.id;
    const pattern = routeByScript.get(name);
    if (pattern) {
      return { name, probe_url: `${routeToBase(pattern)}/_meta`, via: "route" };
    }
    if (devHost) {
      // Unrouted Workers with workers_dev disabled will simply fail the
      // probe and list as undocumented, which is the honest answer.
      return { name, probe_url: `https://${name}.${devHost}/_meta`, via: "workers.dev" };
    }
    return { name, probe_url: null, via: "none" };
  });
}
