/* Minimal service worker: cache-first for static assets (duckdb wasm, warehouse,
   fonts), network-first for navigations so new deploys are picked up. */
const CACHE = "quillmere-ci-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        "./",
        "data/warehouse.duckdb",
        "vendor/duckdb/duckdb-mvp.wasm",
        "vendor/duckdb/duckdb-browser-mvp.worker.js",
      ]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    // network-first for pages
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || caches.match("./")))
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // cache-first for same-origin static assets
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});