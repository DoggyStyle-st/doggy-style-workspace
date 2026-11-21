// DoggyStyle Workspace Service Worker
// Clean, consistent cache strategy (network-first for HTML, cache-first for static)

const BUILD_VERSION = "M50.9.15GB397_INVOICE_YEARS_OWNER_20261121";
const CACHE_NAME = "doggystyle-" + BUILD_VERSION;

// Keep this list conservative; do NOT include versioned query variants.
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./app.js",
  "./billing.js",
  "./invoice-workspace.js",
  "./settings-workspace.js",
  "./settings-workspace.css",
  "./invoice-workspace.css",
  "./invoice-print.js",
  "./compliance-print.js",
  "./billing.css",
  "./organization-ui.js",
  "./account-directory.js",
  "./statistics-store.js",
  "./analytics-core.js",
  "./analytics-view.js",
  "./analytics.css",
  "./calendar-events.js",
  "./calendar-events.css",
  "./document-output.js",
  "./document-output.css",
  "./workforms-print.js",
  "./vendor/jspdf.umd.min.js",
  "./vendor/print-font.js",
  "./browser-store.js",
  "./workflow-core.js",
  "./communication-core.js",
  "./customer-portal.js",
  "./portal-actions.js",
  "./workflow-ui.js",
  "./workspace-repair-ui.js",
  "./REGELN_ANZEIGEN.html",
  "./styles.css",
  "./dashboard_master.css",
  "./auth.js",
  "./auth-session.js",
  "./firebase-config.js",
  "./manifest.json",
  "./login.html",
  "./login_override.css",
  "./customer.html",
  "./assets/customer_start_light_wide.jpg",
  "./assets/customer_dogs_dark_wide.jpg",
  "./assets/customer_contract_light_wide.jpg",
  "./assets/customer_stay_dark_wide.jpg",
  "./assets/customer_chat_light_wide.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("doggystyle-") && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isHTMLRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin.
  if (url.origin !== self.location.origin) return;
  if(req.method !== 'GET') return;

  // Network-first for HTML to avoid sticky old UI.
  if (isHTMLRequest(req)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          if(fresh.ok)cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          const cached = await caches.match(req) || await caches.match(url.pathname);
          return cached || new Response('Diese Seite ist offline nicht verfügbar. Bitte eine Verbindung herstellen.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
        }
      })()
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      if(fresh.ok)cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});

self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json(); } catch (_) { payload = null; }
  if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.day) || !/^[A-Za-z0-9-]{20,48}$/.test(payload.id)) return;
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: "calendar-" + payload.id,
    icon: new URL("assets/logo.png", self.registration.scope).href,
    data: { day: payload.day }
  }));
});

self.addEventListener("notificationclick", (event) => {
  const day = event.notification.data?.day;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  event.notification.close();
  event.waitUntil((async () => {
    const app = new URL("app.html", self.registration.scope);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => {
      const current = new URL(client.url);
      return current.origin === app.origin && current.pathname === app.pathname;
    });
    if (existing) {
      existing.postMessage({ type: "DS_CALENDAR_REMINDER", day });
      return existing.focus();
    }
    app.hash = "termin=" + day;
    return self.clients.openWindow(app.href);
  })());
});
