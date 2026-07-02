/**
 * /_meta probing with a hard timeout and shape validation.
 *
 * A probe can fail for boring reasons (worker gone, route stale, no
 * /_meta yet) and the registry must describe all of them calmly:
 * documented, undocumented, or unreachable are states, not errors.
 */

/**
 * Probe one Worker's /_meta.
 * @returns {Promise<{documented: boolean, meta?: object, note?: string}>}
 */
export async function probeMeta(worker, env, timeoutMs, ownMeta) {
  if (worker.name === ownMeta.name) {
    return { documented: true, meta: ownMeta, note: "self" };
  }
  if (!worker.probe_url) {
    return { documented: false, note: "no route and no workers.dev host" };
  }

  const service = worker.service_binding ? env[worker.service_binding] : null;
  if (service?.fetch) {
    return fetchMeta(
      () => service.fetch(serviceRequest(worker.probe_url, timeoutMs)),
      "service binding",
    );
  }

  return fetchMeta(
    () =>
      fetch(worker.probe_url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "atlas-api-index/1.0" },
      }),
    "public route",
  );
}

function serviceRequest(url, timeoutMs) {
  const path = new URL(url).pathname;
  return new Request(`https://atlas-service.internal${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "atlas-api-index/1.0" },
  });
}

async function fetchMeta(fetcher, via) {
  try {
    const response = await fetcher();
    if (!response.ok) {
      return { documented: false, note: `${via} answered ${response.status} at /_meta` };
    }
    const meta = await response.json();
    if (typeof meta?.name !== "string" || !Array.isArray(meta?.endpoints)) {
      return { documented: false, note: `${via} answered /_meta with an off-contract shape` };
    }
    return { documented: true, meta };
  } catch (err) {
    const note = err.name === "TimeoutError" ? `${via} probe timed out` : `${via} probe failed: ${err.message}`;
    return { documented: false, note };
  }
}
