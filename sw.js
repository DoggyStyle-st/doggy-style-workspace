/* Doggy Style – Service Worker v6.1 (cache-safe, GitHub Pages friendly) */

const SW_VERSION = "v6.1-2026-01-01";
const CACHE_NAME = `ds-cache-${SW_VERSION}`;

// GitHub Pages / Unterordner-freundlich: KEINE führenden "/" verwenden.
// Alles relativ zur SW-Scope (z.B. /DoggyStyleApp/)
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./app.html",
  "./styles.css",
  "./app.js",
  "./auth.js",
  "./login_override.css",
  "./manifest.json",
  "./assets/logo.png"
];

// INSTALL: Core Assets cachen (ohne bei fehlenden Dateien zu crashen)
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache.addAll bricht bei 404 ab -> daher einzeln fetchen
      await Promise.allSettled(
        CORE_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (res && res.ok) await cache.put(url, res);
          } catch (_) {}
        })
      );
    })()
  );
});

// ACTIVATE: alte Caches löschen + Kontrolle übernehmen
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

// Helper
async function cachePut(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

// FETCH STRATEGY
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nur eigene Origin behandeln
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  // 1) HTML: network-first (Updates sofort)
  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          await cachePut(req, fresh);
          return fresh;
        } catch (_) {
          // Fallback: index.html aus Cache innerhalb der Scope
          const cached = await caches.match(req);
          return cached || caches.match("./index.html") || caches.match("./app.html");
        }
      })()
    );
    return;
  }

  // 2) Assets: stale-while-revalidate (schnell + aktualisiert im Hintergrund)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (fresh) => {
          if (fresh && fresh.ok) await cachePut(req, fresh);
          return fresh;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || cached;
    })()
  );
});
