/* Doggy Style – Service Worker
   Master-Version: Cache ruhig & berechenbar
*/

const CACHE_NAME = 'doggy-style-master-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

/* Install: alten Ballast ignorieren, sauber starten */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

/* Activate: alte Caches löschen */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

/* Fetch: Netzwerk bevorzugen, Cache als Fallback */
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});