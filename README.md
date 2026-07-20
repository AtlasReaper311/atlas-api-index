<div align="center">
  <img src="https://raw.githubusercontent.com/AtlasReaper311/AtlasReaper311/main/atlas-icon-dark-256.png" width="88" alt="Atlas Systems"/>
</div>

# atlas-api-index

```
┌─────────────────────────────────────────────┐
│  ATLAS SYSTEMS // atlas-api-index           │
│  fail-closed public Worker registry         │
└─────────────────────────────────────────────┘
```

![Worker](https://img.shields.io/badge/worker-cloudflare-f5a623?style=flat-square&labelColor=0a0a0f)
![Cron](https://img.shields.io/badge/cron-hourly-4ade80?style=flat-square&labelColor=0a0a0f)
![Convention](https://img.shields.io/badge/convention-%2F__meta-aaa9a0?style=flat-square&labelColor=0a0a0f)
![Cost](https://img.shields.io/badge/cost-%C2%A30-aaa9a0?style=flat-square&labelColor=0a0a0f)

A read-only Cloudflare Worker registry for the intentionally public Atlas Systems runtime. The Worker can observe account-level script and route inventory, but publication is a separate decision: only names in the explicit public allowlist are probed, stored in registry KV, returned from `api.atlas-systems.uk/`, or reported as newly discovered.

```text
Cloudflare account scripts + routes
              │
              ▼
      public allowlist filter
              │
              ▼
     probe approved /_meta
              │
              ▼
 public registry ──▶ KV ──▶ api.atlas-systems.uk/
              └──▶ event notification on approved arrival
```

Unknown or private Workers fail closed. Deploying a new script does not register it publicly; publication requires an explicit source change to the allowlist and the public estate declaration.

## Prerequisites

- A Cloudflare API token scoped to account Worker script read and zone Worker route read.
- `wrangler` authentication for deployment.
- Node.js and npm for repository validation.

Runtime discovery credentials and deployment credentials remain separate.

## Setup

```bash
npm ci
npx wrangler kv namespace create REGISTRY_KV
```

Set the namespace identifier in `wrangler.toml`, then configure secrets through interactive prompts:

```bash
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put NOTIFY_TOKEN
```

Validate before deployment:

```bash
npm run lint
npm test
npx wrangler deploy --dry-run --outdir dist
```

Production deployment is a separate owner-approved action.

## Public Worker allowlist

`src/public-workers.js` is the publication gate. A Worker name must be explicitly present before discovery can construct a public record for it.

The filter is applied before route resolution and metadata probing. This prevents an undeclared account Worker from leaking through:

- registry names
- probe URLs
- metadata documents
- KV snapshots
- discovery notifications
- downstream API and Lab consumers

`atlas-api-public` applies a second independent filter against the public estate manifest, so one boundary regression does not automatically become a public API disclosure.

## The `/_meta` convention

Approved public Workers can answer `GET <route-prefix>/_meta` with a bounded self-description:

```json
{
  "name": "specular-edge",
  "description": "Live hardware telemetry from SPECULAR-CORE, cached at the edge",
  "version": "1.0.0",
  "endpoints": [
    {
      "method": "GET",
      "path": "/specular",
      "description": "Public telemetry projection"
    }
  ],
  "status": "live",
  "source": "https://github.com/AtlasReaper311/specular-telemetry"
}
```

The metadata contract is a documentation mechanism for approved public Workers, not an account-wide requirement. A private Worker can operate normally without adopting or exposing this public contract.

## Design notes

**Observation is not publication.** The Cloudflare API answers what exists in the account. The allowlist answers what Atlas Systems intentionally publishes. Those are separate trust decisions.

**Unknown fails closed.** A new Worker remains invisible until explicitly approved. This prevents account growth from silently expanding the public architecture surface.

**Discovery remains read-only.** The runtime token lists scripts and routes but cannot deploy, edit, or delete them.

**Registry freshness has two paths.** The cron refreshes the snapshot on schedule; a cold read can rebuild it when KV has expired. Both paths apply the same public allowlist.

**Probe failure is honest.** An approved public Worker that lacks valid metadata can appear as undocumented. A private or unknown Worker never appears as documentation debt.

## How it fits into Atlas Systems

`atlas-api-index` supplies live status and metadata for the public Worker subset consumed by [`atlas-api-public`](https://github.com/AtlasReaper311/atlas-api-public) and the public Lab. The authoritative publication boundary is explicit rather than inferred from Cloudflare account membership.

The transferable pattern is to separate discovery from disclosure: inventory systems can observe broadly while public projections remain narrowly allowlisted.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)
