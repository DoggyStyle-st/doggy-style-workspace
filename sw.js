/* Doggy Style – Service Worker P1-1B (update-safe, network-first for core) */

const SW_VERSION = "P1-2-SYNC-LABEL-2026-01-16a";
const CACHE_NAME = `ds-test-cache-${SW_VERSION}`;

// Wichtig:
// - KEIN hartes Caching von app.js/app.html als "alt"-Falle
// - HTML: network-first
// - Assets: stale-while-revalidate
// - Install darf NICHT fehlschlagen, wenn ein Asset fehlt

const CORE_ASSETS = [
  "index.html",
  "login.html",
  "app.html",
  "styles.css",
  "dashboard_master.css",
  "app.js",
  "auth.js",
  "firebase-config.js",
  "diag.html",
  "diag.js",
  "manifest.json",
  "assets/logo.png",
  "assets/pfote.png",
  "login_override.css",
  "templates/rechnung.json",
  "templates/hundeannahme.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    for(const p of CORE_ASSETS){
      try{
        const r = await fetch(p, {cache:"no-store"});
        if(r.ok) await cache.put(p, r.clone());
      }catch(e){
        // fehlende Datei darf Installation nicht verhindern
      }
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("ds-test-cache-") && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(()=> self.clients.claim())
  );
});

async function cachePut(req, res){
  const cache = await caches.open(CACHE_NAME);
  await cache.put(req, res.clone());
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  const CRITICAL_ASSETS = new Set(["/app.js","/styles.css","/dashboard_master.css","/auth.js","/firebase-config.js"]);

  const isHTML = req.mode === "navigate" || (req.headers.get("accept")||"").includes("text/html");

  // HTML: network-first (damit Updates sofort kommen)
  if(isHTML){
    event.respondWith((async ()=>{
      try{
        const fresh = await fetch(req, {cache:"no-store"});
        await cachePut(req, fresh);
        return fresh;
      }catch(e){
        const cached = await caches.match(req);
        return cached || caches.match("index.html");
      }
    })());
    return;
  }

  // Critical core assets: network-first (damit JS/CSS Updates sofort kommen)
  const path = url.pathname;
  if(CRITICAL_ASSETS.has(path) || CRITICAL_ASSETS.has('/'+path.split('/').pop())){
    event.respondWith((async ()=>{
      try{
        const fresh = await fetch(req, {cache:'no-store'});
        if(fresh && fresh.ok) await cachePut(req, fresh);
        return fresh;
      }catch(e){
        const cached = await caches.match(req);
        return cached || caches.match('app.js') || caches.match('styles.css');
      }
    })());
    return;
  }

  // Assets: stale-while-revalidate
  event.respondWith((async ()=>{
    const cached = await caches.match(req);
    const fetchPromise = fetch(req).then(async fresh => {
      await cachePut(req, fresh);
      return fresh;
    }).catch(()=>null);

    return cached || (await fetchPromise) || cached;
  })());
});
