// M16_HARDCLEAN_NO_SW_20260204 - SW disabled stub
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch(e) {}
    try { await self.clients.claim(); } catch(e) {}
    try { await self.registration.unregister(); } catch(e) {}
  })());
});
