/* Doggy Style – Service Worker (update-safe) */

const SW_VERSION = "P1-1D-TAPFIX-2026-01-15";
const CACHE_NAME = `ds-test-cache-${SW_VERSION}`;

// Prinzip:
// - HTML: network-first
// - Critical JS (app.js): network-first
// - Rest: stale-while-revalidate
// - Install darf nicht fehlschlagen, wenn ein Asset fehlt

const CORE_ASSETS = [
  "index.html",
  "login.html",
  "app.html",
  "styles.css",
  "app.js",
  "manifest.json",
  "assets/logo.png"
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
  const path = url.pathname.replace(/^\//, "");
  const isCriticalJS = (path === "app.js");

  // HTML: network-first
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

  // Critical JS: network-first
  if(isCriticalJS){
    event.respondWith((async ()=>{
      try{
        const fresh = await fetch(req, {cache:"no-store"});
        await cachePut(req, fresh);
        return fresh;
      }catch(e){
        const cached = await caches.match(req);
        return cached || caches.match("app.js");
      }
    })());
    return;
  }

  // Rest: stale-while-revalidate
  event.respondWith((async ()=>{
    const cached = await caches.match(req);
    const fetchPromise = fetch(req).then(async fresh => {
      await cachePut(req, fresh);
      return fresh;
    }).catch(()=>null);

    if(cached) return cached;
    const net = await fetchPromise;
    return net || cached || new Response("", {status:504});
  })());
});
