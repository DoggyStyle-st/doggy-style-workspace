// SW-KILL (final): disables offline caching and forces removal of any previously
// installed service worker. This is intentionally minimal to stop "old build"
// issues on iOS/Safari and to prevent the app from getting stuck.

const KILL_SW_VERSION = 'SW_KILL_20260210B';

self.addEventListener('install', (event) => {
  // Activate immediately.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clear all caches.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}

    // Try to unregister ourselves.
    try {
      await self.registration.unregister();
    } catch (e) {}

    // Take control so the client can continue without being held by an old SW.
    try {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        try { client.postMessage({ type: 'SW_KILLED', version: KILL_SW_VERSION }); } catch (e) {}
      });
    } catch (e) {}
  })());
});

// Never cache. Always go to network.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
