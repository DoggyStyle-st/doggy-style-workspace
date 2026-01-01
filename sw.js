/* Doggy Style – Service Worker v6 (final) */

const SW_VERSION = "v6.2-2026-01-02";
const CACHE_NAME = `ds-cache-${SW_VERSION}`;

// Nur Grunddateien vorcachen (klein halten!)
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/login.html",
  "/styles.css",
  "/styles.css?v=20260101v62",
  "/app.js",
  "/app.js?v=20260101v62",
  "/manifest.webmanifest",
  "/assets/logo.png"
];

// INSTALL: Core Assets cachen + sofort aktiv werden
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

// ACTIVATE: alle alten Caches löschen + Kontrolle übernehmen
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("ds-cache-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Helpers
async function cachePut(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

// FETCH STRATEGY
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Nur GET Requests cachen
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nur eigene Origin behandeln (GitHub Pages Domain)
  if (url.origin !== self.location.origin) return;

  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  // 1) HTML: network-first (damit Updates sofort kommen)
  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          await cachePut(req, fresh);
          return fresh;
        } catch (e) {
          const cached = await caches.match(req);
          return cached || caches.match("/index.html");
        }
      })()
    );
    return;
  }

  // 2) Assets (CSS/JS/PNG): stale-while-revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (fresh) => {
          await cachePut(req, fresh);
          return fresh;
        })
        .catch(() => null);

      // sofort cached liefern, parallel neu holen
      return cached || (await fetchPromise) || cached;
    })()
  );
});