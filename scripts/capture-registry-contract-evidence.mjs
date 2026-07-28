import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import worker from "../src/index.js";

const SCHEMA = "atlas-public-interface/registry-evidence/v1";

function seededEnvironment(registry) {
  return {
    REGISTRY_KV: {
      async get() {
        return registry;
      },
      async put() {
        throw new Error("evidence must not write KV");
      },
    },
  };
}

async function readCase(name, request, env) {
  const response = await worker.fetch(request, env, {});
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return {
    name,
    request: { method: request.method, path: new URL(request.url).pathname },
    response: {
      status: response.status,
      content_type: response.headers.get("content-type"),
      cache_control: response.headers.get("cache-control"),
      cors: response.headers.get("access-control-allow-origin"),
      body,
      contains_html: /<html[\s>]/i.test(text),
    },
  };
}

function assertJsonCase(item, expectedStatus) {
  assert.equal(item.response.status, expectedStatus, `${item.name}: status`);
  assert.match(item.response.content_type || "", /^application\/json\b/i, `${item.name}: JSON content type`);
  assert.equal(item.response.cors, "*", `${item.name}: public CORS`);
  assert.match(item.response.cache_control || "", /^public, max-age=60, s-maxage=\d+$/, `${item.name}: bounded cache policy`);
  assert.equal(item.response.contains_html, false, `${item.name}: HTML is forbidden`);
  assert.ok(item.response.body && typeof item.response.body === "object", `${item.name}: JSON object body`);
}

export async function captureRegistryContractEvidence({ outputDirectory = process.cwd() } = {}) {
  const registry = {
    service: "atlas-api-index",
    generated_at: "2026-07-28T00:00:00.000Z",
    counts: { workers: 1, documented: 1, undocumented: 0 },
    discovery_warnings: [],
    workers: [{ name: "atlas-api-public", documented: true, meta: { version: "1.0.0" } }],
  };

  const cases = [];
  cases.push(await readCase(
    "root-success",
    new Request("https://api.atlas-systems.uk/", { method: "GET" }),
    seededEnvironment(registry),
  ));
  cases.push(await readCase(
    "not-found",
    new Request("https://api.atlas-systems.uk/private", { method: "GET" }),
    seededEnvironment(registry),
  ));
  cases.push(await readCase(
    "method-not-allowed",
    new Request("https://api.atlas-systems.uk/", { method: "POST" }),
    seededEnvironment(registry),
  ));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ success: false, errors: [{ message: "deterministic discovery failure" }] }),
    { status: 503, headers: { "content-type": "application/json" } },
  );
  try {
    cases.push(await readCase(
      "registry-unavailable",
      new Request("https://api.atlas-systems.uk/", { method: "GET" }),
      seededEnvironment(null),
    ));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const expected = new Map([
    ["root-success", 200],
    ["not-found", 404],
    ["method-not-allowed", 405],
    ["registry-unavailable", 503],
  ]);
  for (const item of cases) assertJsonCase(item, expected.get(item.name));

  const success = cases.find((item) => item.name === "root-success");
  assert.equal(success.response.body.service, "atlas-api-index");
  assert.equal(success.response.body.counts.workers, 1);
  assert.deepEqual(success.response.body.workers.map((item) => item.name), ["atlas-api-public"]);
  assert.equal(cases.find((item) => item.name === "not-found").response.body.error, "not found; the registry lives at /");
  assert.equal(cases.find((item) => item.name === "method-not-allowed").response.body.error, "method not allowed");
  assert.equal(
    cases.find((item) => item.name === "registry-unavailable").response.body.error,
    "registry unavailable and rebuild failed; next cron will retry",
  );

  const evidence = {
    schema_version: SCHEMA,
    repository: process.env.GITHUB_REPOSITORY || "AtlasReaper311/atlas-api-index",
    head_sha: process.env.HEAD_SHA || process.env.GITHUB_SHA || "local",
    surface: "https://api.atlas-systems.uk/",
    visual_assertions: false,
    screenshots: false,
    cases,
    summary: {
      case_count: cases.length,
      passed: cases.length,
      failed: 0,
      json_only: true,
      get_only_root: true,
      fail_closed: true,
    },
  };

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, "registry-contract-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  return evidence;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  captureRegistryContractEvidence({
    outputDirectory: process.env.REGISTRY_EVIDENCE_OUTPUT_DIR || process.cwd(),
  }).then((evidence) => {
    console.log(`Captured ${evidence.summary.case_count} JSON-only registry contract cases.`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
