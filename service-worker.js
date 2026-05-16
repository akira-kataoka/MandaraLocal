// MandaraNext service worker — cache-first for own assets, network-first for data.
const CACHE = "mandaranext-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./css/style.css",
  "./js/main.js",
  "./js/map.js",
  "./js/data.js",
  "./js/classification.js",
  "./js/color.js",
  "./js/legend.js",
  "./js/stats.js",
  "./js/export.js",
  "./js/scatter.js",
  "./js/histogram.js",
  "./js/table.js",
  "./js/settings.js",
  "./js/pref_table.js",
  "./data/japan_prefectures.geojson",
  "./data/sample_population.csv",
];

self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE).then((c) =>
      // Cache best-effort: missing files shouldn't break install
      Promise.allSettled(ASSETS.map((u) => c.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evt) => {
  const req = evt.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Own-origin asset: cache-first
  if (url.origin === location.origin) {
    evt.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return resp;
        }).catch(() => caches.match("./index.html"));
      })
    );
    return;
  }

  // Cross-origin (CDN libs, tile servers, geocoder): network-first with cache fallback
  evt.respondWith(
    fetch(req).then((resp) => {
      if (resp && resp.ok && req.url.startsWith("https://unpkg.com/")) {
        const clone = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, clone));
      }
      return resp;
    }).catch(() => caches.match(req))
  );
});
