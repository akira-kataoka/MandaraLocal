// MandaraNext service worker
// Cycle 300: switch HTML/JS/CSS to network-first so deploys reach users
// immediately (the old cache-first strategy pinned broken builds in place).
const CACHE = "mandaranext-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./data/japan_prefectures.geojson",
  "./data/sample_population.csv",
];

self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE).then((c) =>
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

  // Own-origin
  if (url.origin === location.origin) {
    const isCode = /\.(html|js|css)(\?|$)/i.test(url.pathname) || url.pathname === "/" || url.pathname.endsWith("/");
    if (isCode) {
      // network-first: always try fresh, fall back to cache when offline.
      evt.respondWith(
        fetch(req).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return resp;
        }).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
      );
      return;
    }
    // Static data / images: cache-first.
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
