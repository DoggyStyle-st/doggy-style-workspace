// sw.js – Offline‑First + Cloud‑Ready
// Ziel:
// 1) App-Shell offline verfügbar
// 2) Firebase CDN Scripts einmal laden & dann offline cachebar machen
// 3) Keine "harten" Redirect-Schleifen, wenn Netz weg ist

// Bump this when UI/assets change so Safari/PWA reliably picks up updates.
const VERSION = '2026-01-01_ui_v1';
const CACHE_APP = `ds-app-${VERSION}`;
const CACHE_EXT = `ds-ext-${VERSION}`;

// App-Shell (same-origin)
const APP_ASSETS = [
  './',
  './index.html',
  './login.html',
  './app.html',
  './styles.css',
  './app.js',
  './auth.js',
  './firebase-config.js',
  './manifest.json',
  './assets/logo.png'
];

// Firebase compat (cross-origin)
const FIREBASE_CDN = [
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();

    // App shell
    const appCache = await caches.open(CACHE_APP);
    await appCache.addAll(APP_ASSETS.map(u => new Request(u, { cache: 'reload' })));

    // External libs (best effort)
    const extCache = await caches.open(CACHE_EXT);
    await Promise.allSettled(FIREBASE_CDN.map(async (u) => {
      try {
        const req = new Request(u, { mode: 'cors', cache: 'reload' });
        const res = await fetch(req);
        if (res && res.ok) await extCache.put(u, res.clone());
      } catch (_) {
        // Wenn offline beim Install: später im Fetch-Handler nachziehen.
      }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (![CACHE_APP, CACHE_EXT].includes(k)) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

function isSameOrigin(req){
  try{ return new URL(req.url).origin === self.location.origin; }catch(_){ return false; }
}

function isFirebaseCdn(req){
  return FIREBASE_CDN.includes(req.url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nur GET cachen
  if (req.method !== 'GET') {
    event.respondWith(fetch(req));
    return;
  }

  // Firebase CDN: cache-first
  if (isFirebaseCdn(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_EXT);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) await cache.put(req.url, res.clone());
        return res;
      } catch (e) {
        // Offline und nix im Cache
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Same-origin: network-first für HTML, cache-first für Assets
  if (isSameOrigin(req)) {
    const url = new URL(req.url);
    const isHtml = req.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/';

    event.respondWith((async () => {
      const cache = await caches.open(CACHE_APP);
      if (isHtml) {
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (_) {
          const fallback = await cache.match(req) || await cache.match('./app.html') || await cache.match('./index.html');
          return fallback || new Response('Offline', { status: 503 });
        }
      }

      // assets: cache-first
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (_) {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Sonst: normal fetch
  event.respondWith(fetch(req));
});
