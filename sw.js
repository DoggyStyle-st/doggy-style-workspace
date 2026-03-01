// ===== M50.9.1 CLEAN SW =====
const BUILD_VERSION = "M50.9.1_CLEAN_SW_20260301";
const CACHE_NAME = "doggystyle-" + BUILD_VERSION;

// Nur echte Dateien – keine ?v= Versionen mehr
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./app.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./assets/logo.png"
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

  // Network-first für HTML
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./app.html"))
    );
    return;
  }

  // Cache-first für statische Assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});