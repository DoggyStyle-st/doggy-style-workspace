// sw.js (ANA035 minimal)
// simple cache-bust: change CACHE name each version
const CACHE = "ANA035_MINLOGIN_v1";
const ASSETS = ["./","./index.html","./app.html","./app.js","./firebase-config.js","./manifest.json"];
self.addEventListener("install", (e)=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",(e)=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",(e)=>{
  const req=e.request;
  if(req.method!=="GET") return;
  e.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});
