// DoggyStyle Workspace Service Worker
// Clean, consistent cache strategy (network-first for HTML, cache-first for static)

const BUILD_VERSION = "M50.9.9GB367_STAY_REVIEW_TEST_20261019";
const CACHE_NAME = "doggystyle-" + BUILD_VERSION;

// Keep this list conservative; do NOT include versioned query variants.
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./app.js",
  "./browser-store.js",
  "./workflow-core.js",
  "./communication-core.js",
  "./customer-portal.js",
  "./workflow-ui.js",
  "./workspace-repair-ui.js",
  "./REGELN_ANZEIGEN.html",
  "./styles.css",
  "./dashboard_master.css",
  "./auth.js",
  "./firebase-config.js",
  "./manifest.json",
  "./login.html",
  "./login_override.css",
  "./customer.html",
  "./assets/customer_start_light_wide.jpg",
  "./assets/customer_dogs_dark_wide.jpg",
  "./assets/customer_contract_light_wide.jpg",
  "./assets/customer_stay_dark_wide.jpg",
  "./assets/customer_chat_light_wide.jpg",
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
  if(req.method !== 'GET') return;

  // Network-first for HTML to avoid sticky old UI.
  if (isHTMLRequest(req)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          if(fresh.ok)cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          const cached = await caches.match(req) || await caches.match(url.pathname);
          return cached || new Response('Diese Seite ist offline nicht verfügbar. Bitte eine Verbindung herstellen.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
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
      if(fresh.ok)cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});
