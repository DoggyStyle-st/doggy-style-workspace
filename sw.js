/* Doggy Style Workspace – Service Worker */
/* Cache-Fix für Login & UI – Freigabe A */

const CACHE_VERSION = 'doggystyle-login-final-2026-01-01';
const CACHE_NAME = `ds-cache-${CACHE_VERSION}`;

/* Dateien, die bewusst gecacht werden dürfen */
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/style.css',
  '/app.js',
  '/logo.png'
];

/* INSTALL */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

/* ACTIVATE – ALLES ALTE LÖSCHEN (WICHTIG!) */
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

/* FETCH */
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});