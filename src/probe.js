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
export async function probeMeta(url, timeoutMs) {
  if (!url) return { documented: false, note: "no route and no workers.dev host" };
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "atlas-api-index/1.0" },
    });
    if (!response.ok) {
      return { documented: false, note: `answered ${response.status} at /_meta` };
    }
    const meta = await response.json();
    if (typeof meta?.name !== "string" || !Array.isArray(meta?.endpoints)) {
      return { documented: false, note: "answered /_meta with an off-contract shape" };
    }
    return { documented: true, meta };
  } catch (err) {
    const note = err.name === "TimeoutError" ? "probe timed out" : `probe failed: ${err.message}`;
    return { documented: false, note };
  }
}
