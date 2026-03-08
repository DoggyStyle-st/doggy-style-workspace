// DoggyStyle Workspace Service Worker (Project Page safe)
// Cache strategy: network-first for HTML, cache-first for static

const BUILD_VERSION = "M50.9.9E_PROJECTPAGE_AUTH_ONLINEFIX_20260308";
const CACHE_NAME = "doggystyle-" + BUILD_VERSION;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./app.html",
  "./customer.html",
  "./pwreset.html",
  "./app.js",
  "./auth.js",
  "./firebase-config.js",
  "./styles.css",
  "./dashboard_master.css",
  "./login_override.css",
  "./manifest.json",
  // Firebase SDKs (cross-origin) – helps iOS/Safari stability
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"
];

function isHTMLRequest(request){
  return request.mode === "navigate" || (request.headers.get("accept")||"").includes("text/html");
}

function normSameOrigin(url){
  try{
    const u = new URL(url);
    if(u.origin === self.location.origin){
      u.search = "";
      u.hash = "";
      return u.toString();
    }
  }catch(e){}
  return url;
}

self.addEventListener("install", (event)=>{
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event)=>{
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith("doggystyle-") && k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  const url = new URL(req.url);

  const isGstatic = (url.origin === "https://www.gstatic.com");
  const isSame = (url.origin === self.location.origin);
  if(!isSame && !isGstatic) return;

  // HTML: network-first
  if(isSame && isHTMLRequest(req)){
    event.respondWith((async ()=>{
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(normSameOrigin(req.url), fresh.clone());
        return fresh;
      }catch(e){
        const cached = await caches.match(normSameOrigin(req.url));
        return cached || (await caches.match("./app.html")) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  // Static: cache-first (normalize same-origin URLs so ?v= works)
  event.respondWith((async ()=>{
    const key = isSame ? normSameOrigin(req.url) : req;
    const cached = await caches.match(key);
    if(cached) return cached;
    try{
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(key, fresh.clone());
      return fresh;
    }catch(e){
      return cached;
    }
  })());
});
