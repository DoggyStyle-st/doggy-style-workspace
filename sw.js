// DoggyStyle Workspace Service Worker
// Clean, consistent cache strategy (network-first for HTML, cache-first for static)

const BUILD_VERSION = "M50.9.9GB28_SYNC_DOT_FINALGREEN_20260329";
const CACHE_NAME = "doggystyle-" + BUILD_VERSION;

// Keep this list conservative; do NOT include versioned query variants.
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./app.js",
  "./styles.css",
  "./dashboard_master.css",
  "./auth.js",
  "./firebase-config.js",
  "./manifest.json",
  "./login.html",
  "./login_override.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("doggystyle-") && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isHTMLRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin.
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML to avoid sticky old UI.
  if (isHTMLRequest(req)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          const cached = await caches.match(req);
          return cached || (await caches.match("./app.html")) || (await caches.match("./index.html"));
        }
      })()
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});
