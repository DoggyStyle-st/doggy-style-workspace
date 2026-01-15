/* Doggy Style – Service Worker TEST-OPTIK-01-2026-01-03b (offline-first, update-safe) */

const SW_VERSION = "P0-2-PRECACHE-2026-01-15a";
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
  "login_override.css",
  "app.js",
  "auth.js",
  "firebase-config.js",
  "diag.html",
  "diag.js",
  "manifest.json",
  "assets/logo.png",
  "assets/pfote.png",
  "templates/hundeannahme.json",
  "templates/rechnung.json"
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
