export const META = {
  name: "atlas-api-index",
  description:
    "Fail-closed registry of explicitly approved public Atlas Systems Workers",
  version: "1.0.0",
  endpoints: [
    { method: "GET", path: "/", description: "The live registry document" },
    { method: "GET", path: "/_meta", description: "This document" },
  ],
  source: "https://github.com/AtlasReaper311/atlas-api-index",
};
