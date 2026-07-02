<div align="center">
  <img src="https://raw.githubusercontent.com/AtlasReaper311/AtlasReaper311/main/atlas-icon-dark-256.png" width="88" alt="Atlas Systems"/>
</div>

# atlas-api-index

```
┌─────────────────────────────────────────────┐
│  ATLAS SYSTEMS // atlas-api-index           │
│  the estate documents itself: workers       │
│  discovered, probed, published hourly       │
└─────────────────────────────────────────────┘
```

![Worker](https://img.shields.io/badge/worker-cloudflare-f5a623?style=flat-square&labelColor=0a0a0f)
![Cron](https://img.shields.io/badge/cron-hourly-4ade80?style=flat-square&labelColor=0a0a0f)
![Convention](https://img.shields.io/badge/convention-%2F__meta-aaa9a0?style=flat-square&labelColor=0a0a0f)
![Cost](https://img.shields.io/badge/cost-%C2%A30-aaa9a0?style=flat-square&labelColor=0a0a0f)

The registry at `api.atlas-systems.uk/` used to be a hand-maintained JSON list, accurate exactly as often as it was remembered. Now it maintains itself: an hourly cron enumerates every Worker in the account through the Cloudflare API, derives each one's public URL from its route, probes `GET /_meta`, aggregates the answers to KV, and posts to Discord when a Worker appears that the previous snapshot had never seen. Deploying a documented Worker IS registering it.

```
cron :07 ──▶ CF API: scripts + zone routes + workers.dev subdomain
                │  route pattern minus * plus /_meta = probe URL
                ▼
        probe every Worker (4s timeout)
                │
                ▼
        registry ──▶ KV (24 writes/day) ──▶ GET api.atlas-systems.uk/
                └──▶ atlas-notify on new-worker diff
```

## Prerequisites

- The Worker estate as it stands (atlas-notify live; this binds to it)
- A **new** Cloudflare API token, read-only: Account, Workers Scripts:Read; Zone, Workers Routes:Read. Runtime and deploy credentials stay separate tokens.
- `wrangler` authenticated; `npm` for the lint step

## Setup

Release the root first: whatever currently serves the hand-maintained list at `api.atlas-systems.uk/` keeps working untouched, because this Worker claims only the two exact patterns `/` and `/_meta`, which win over atlas-notify's `/*` by specificity. Nothing to unwire.

```bash
npm ci
npx wrangler kv namespace create REGISTRY_KV
```

Paste the returned id into `wrangler.toml`, then:

```bash
npx eslint .
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put NOTIFY_TOKEN
npx wrangler deploy
curl -sS https://api.atlas-systems.uk/
curl -sS https://api.atlas-systems.uk/_meta
```

The first request performs the first build (the cron takes over from :07). Wire the estate deploy caller as usual: copy the 12-line reusable caller from [`github-pulse`](https://github.com/AtlasReaper311/github-pulse), set `CF_WORKERS_DEPLOY_TOKEN`, `CF_ACCOUNT_ID`, `DISCORD_CICD_WEBHOOK`.

## The `/_meta` convention

Every Worker answers `GET <route-prefix>/_meta` with its self-description:

```json
{
  "name": "specular-edge",
  "description": "Live hardware telemetry from SPECULAR-CORE, cached at the edge",
  "version": "1.0.0",
  "endpoints": [{ "method": "GET", "path": "/specular", "description": "…" }],
  "status": "live",
  "source": "https://github.com/AtlasReaper311/specular-telemetry"
}
```

[`shared/_meta.js`](shared/_meta.js) is the canonical module: vendored into each Worker's `src/` (one 40-line file beats an npm publish step at £0), imported once, mounted with one line at the top of `fetch()`. Workers that answer are published in full; Workers that do not are listed as discovered but undocumented, which is the honest state and a gentle todo list. [`examples/adding-meta-to-existing-worker.md`](examples/adding-meta-to-existing-worker.md) retrofits atlas-notify, github-pulse, and site-pulse step by step.

## Design notes

**Self-healing has two clocks.** The cron rebuilds hourly and writes KV with a 75-minute TTL, so one missed cron degrades nothing and a dead cron becomes visible within the hour. A cold read (KV expired, or first ever) rebuilds live, serves, and re-persists: one visitor pays one slow request, the endpoint never 404s over a scheduling hiccup.

**Discovery is read-only by construction.** The runtime token can list scripts and routes; it cannot deploy, delete, or edit. Enumeration is the whole capability, and the blast radius of the secret leaking is that someone learns what `GET api.atlas-systems.uk/` already tells them.

**New means new against the last snapshot.** The notify fires on the set difference of names, so the first-ever pass (everything is new) announces nothing, and a Worker flapping in and out of documentation does not spam: only genuine arrivals do.

**Probing failure is a state, not an error.** Timed out, off-contract shape, no route and no workers.dev host: each gets recorded with a note in the registry itself, so the registry doubles as the estate's `/_meta` adoption dashboard.

## How it fits into Atlas Systems

This is the estate turning a convention into infrastructure. [`specular-edge`](https://github.com/AtlasReaper311/specular-telemetry) and [`ramone-trigger`](https://github.com/AtlasReaper311/ramone-voice-trigger) shipped `/_meta` from day one and appear without any registration; the retrofit guide brings [`atlas-notify`](https://github.com/AtlasReaper311/atlas-notify), [`github-pulse`](https://github.com/AtlasReaper311/github-pulse), and [`site-pulse`](https://github.com/AtlasReaper311/site-pulse) into the fold; discovery events flow through atlas-notify like everything else. [`atlas-corpus`](https://github.com/AtlasReaper311/atlas-corpus) ingests the READMEs this registry points at, which makes the api root and the search box two views of the same self-describing estate.

A system that can be asked what it is stays documented for the same reason it stays deployed: because a machine does it, on a schedule, and tells you when the answer changes.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)
