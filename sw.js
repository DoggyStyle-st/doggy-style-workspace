const BUILD_VERSION = "M50.6.6_STABLE_SW_OFFLINE_FIX_20260227";
const CACHE_NAME = "doggystyle-" + BUILD_VERSION;

const PRECACHE = [
  "./",
  "./app.html",
  "./app.js",
  "./styles.css",
  "./dashboard_master.css",
  "./manifest.json",
  "./firebase-config.js",
  "./auth.js",
  "./stat-scales-hotfix.js",
  "./assets/logo.png",
  "./assets/dash_daycare.jpg",
  "./assets/dash_vacation.jpg"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).catch(() => null)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith("doggystyle-") && k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Network-first for HTML navigations
  if (event.request.mode === "navigate" || (event.request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./app.html", copy)).catch(() => null);
          return resp;
        })
        .catch(() => caches.match("./app.html"))
    );
    return;
  }

  // Cache-first for same-origin static assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Default: network
  event.respondWith(fetch(event.request));
});
