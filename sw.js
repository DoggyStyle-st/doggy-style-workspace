
const BUILD_VERSION = "M50.7.1_STAT_RESEARCH_PRO_20260301";
const CACHE_NAME = "doggystyle-" + BUILD_VERSION;

const STATIC_ASSETS = [
  "./",
  "./app.html",
  "./app.html?v=M50.7.1_STAT_RESEARCH_PRO_20260301",
  "./app.js",
  "./app.js?v=M50.7.1_STAT_RESEARCH_PRO_20260301",
  "./styles.css",
  "./styles.css?v=M50.7.1_STAT_RESEARCH_PRO_20260301",
  "./manifest.json",
  "./manifest.json?v=M50.7.1_STAT_RESEARCH_PRO_20260301"
];

// INSTALL
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// FETCH
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Network-first for HTML
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match("./app.html"))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => response)
      );
    })
  );
});
