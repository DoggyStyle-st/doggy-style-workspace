// ANA036.4 - SW bypass + cache purge (debug)
// Purpose: eliminate stale cache / SW interference on iOS Safari/PWA.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}
    await self.clients.claim();
  })());
});

// Intentionally no fetch handler -> network passthrough (no SW caching)
