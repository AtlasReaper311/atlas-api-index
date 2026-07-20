export const PUBLIC_WORKER_NAMES = Object.freeze([
  "atlas-api-index",
  "atlas-api-public",
  "atlas-blackbox",
  "atlas-daily-digest",
  "atlas-dora",
  "atlas-notify",
  "atlas-quota-watch",
  "deploy-watch",
  "github-pulse",
  "ramone-edge",
  "ramone-trigger",
  "site-pulse",
  "specular-edge",
  "specular-sonify",
]);

const PUBLIC_WORKERS = new Set(PUBLIC_WORKER_NAMES);

export function isPublicWorker(name) {
  return typeof name === "string" && PUBLIC_WORKERS.has(name);
}
