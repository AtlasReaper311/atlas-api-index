/**
 * Public Worker discovery via the Cloudflare API.
 *
 * The Cloudflare account is broader than the public Atlas Systems surface.
 * Discovery may observe every deployed script internally, but this module only
 * returns Workers that are explicitly approved for public registry projection.
 * Unknown and private scripts fail closed and never reach probing, KV, alerts,
 * the public API, or the Lab.
 */

import { isPublicWorker } from "./public-workers.js";

const API = "https://api.cloudflare.com/client/v4";
const SERVICE_BINDINGS = {
  "atlas-notify": "ATLAS_NOTIFY",
  "deploy-watch": "WORKER_DEPLOY_WATCH",
  "github-pulse": "WORKER_GITHUB_PULSE",
  "ramone-edge": "WORKER_RAMONE_EDGE",
  "ramone-trigger": "WORKER_RAMONE_TRIGGER",
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
 * Enumerate approved public Workers with their best probe URL.
 * Account-wide discovery is intentionally filtered before any public record is
 * constructed. A newly deployed script does not become public by existing.
 *
 * @returns {Promise<{workers: Array<{name: string, probe_url: string|null, via: string, service_binding: string|null}>, warnings: string[]}>}
 */
export async function discoverWorkers(env) {
  const warnings = [];
  const scripts = await cf(env, `/accounts/${env.ACCOUNT_ID}/workers/scripts`);
  const [routes, subdomain] = await Promise.all([
    optionalCf(env, `/zones/${env.ZONE_ID}/workers/routes`, [], warnings),
    optionalCf(env, `/accounts/${env.ACCOUNT_ID}/workers/subdomain`, null, warnings),
  ]);

  const routeByScript = new Map();
  for (const route of routes) {
    if (!route.script || !isPublicWorker(route.script)) continue;
    const next = routeCandidate(route);
    const current = routeByScript.get(route.script);
    if (!current || next.priority < current.priority) {
      routeByScript.set(route.script, next);
    }
  }
  const devHost = subdomain?.subdomain ? `${subdomain.subdomain}.workers.dev` : null;

  const workers = scripts
    .filter((script) => isPublicWorker(script.id))
    .map((script) => {
      const name = script.id;
      const pattern = routeByScript.get(name)?.pattern;
      const service_binding = SERVICE_BINDINGS[name] ?? null;
      if (pattern) {
        return { name, probe_url: routeToMetaUrl(pattern), via: "route", service_binding };
      }
      if (devHost) {
        return {
          name,
          probe_url: `https://${name}.${devHost}/_meta`,
          via: "workers.dev",
          service_binding,
        };
      }
      return { name, probe_url: null, via: "none", service_binding };
    });
  return { workers, warnings };
}
