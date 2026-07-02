# Adding `/_meta` to an existing Worker

The registry lists every Worker it discovers; the ones answering `/_meta` get their full self-description published, the rest appear as "discovered but undocumented". Retrofitting takes one file, one import, one line, and one object. atlas-notify, github-pulse, and site-pulse are worked through below; every other Worker is the same moves with different words.

## The three moves

**1. Vendor the module.** Copy [`shared/_meta.js`](../shared/_meta.js) from this repo into the Worker's `src/`:

```bash
cp ../atlas-api-index/shared/_meta.js src/_meta.js
```

Vendored, not npm-installed: one 40-line file per Worker beats a registry dependency and a publish step at £0. This repo's copy is canonical; if the contract ever changes, the change lands here first and the vendored copies follow.

**2. Describe the Worker.** A `META` object next to the imports. Honest descriptions of real endpoints; the registry publishes exactly what this says.

**3. Mount it.** One line at the top of `fetch()`, before routing:

```js
const meta = handleMeta(url, META);
if (meta) return meta;
```

Suffix matching inside the module means the same line works behind `api.atlas-systems.uk/notify*` and behind a bare `workers.dev` hostname; the endpoint appears at `<route-prefix>/_meta`.

## atlas-notify

Route: `api.atlas-systems.uk/notify*` (plus the `/*` wildcard). Meta lands at `/notify/_meta`.

```js
import { handleMeta } from "./_meta.js";

const META = {
  name: "atlas-notify",
  description: "The estate's notification router: payload dialects in, Discord embeds out",
  version: "2.0.0",
  endpoints: [
    { method: "POST", path: "/notify", description: "Accept an event envelope; Bearer NOTIFY_TOKEN" },
    { method: "GET", path: "/notify/recent", description: "Ring buffer of recent events; ?level= filters" },
  ],
  source: "https://github.com/AtlasReaper311/atlas-notify",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const meta = handleMeta(url, META);
    if (meta) return meta;
    // ...existing routing unchanged...
  },
};
```

One care with the wildcard: atlas-notify also owns `/*`, so `handleMeta`'s suffix match would answer `/anything/_meta`. That is harmless (it returns atlas-notify's own truth), and `/` plus `/_meta` at the root now belong to atlas-api-index by route specificity, so nothing collides.

## github-pulse

Route: `api.atlas-systems.uk/pulse*`. Meta lands at `/pulse/_meta`. Same three moves;

```js
const META = {
  name: "github-pulse",
  description: "GitHub activity feed for the site, cached at the edge",
  version: "1.0.0",
  endpoints: [
    { method: "GET", path: "/pulse", description: "Recent public GitHub activity, cached" },
  ],
  source: "https://github.com/AtlasReaper311/github-pulse",
};
```

## site-pulse

Route: `api.atlas-systems.uk/site-pulse*`. Meta lands at `/site-pulse/_meta`.

```js
const META = {
  name: "site-pulse",
  description: "Deploy and uptime signal for atlas-systems.uk",
  version: "1.0.0",
  endpoints: [
    { method: "GET", path: "/site-pulse", description: "Current site pulse snapshot" },
  ],
  source: "https://github.com/AtlasReaper311/site-pulse",
};
```

## Ship it

```bash
npx eslint .
git add src/_meta.js src/index.js
git commit -m "feat: answer the /_meta convention"
git push   # the reusable caller deploys it
curl -sS https://api.atlas-systems.uk/pulse/_meta
```

The registry notices within the hour (cron at :07), or immediately on the next cold read of `api.atlas-systems.uk/`. No registration step exists, which is the point: deploying a documented Worker IS registering it.
