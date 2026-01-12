// ANA037 Phase 2 — diag.js
(() => {
  const BUILD = "ANA037P2-DIAG";
  const $ = (id) => document.getElementById(id);
  const set = (id, t) => { const el = $(id); if (el) el.textContent = t; };

  set("build", BUILD);
  set("url", location.href);
  const ua = navigator.userAgent || "";
  set("uaShort", ua.includes("iPad") ? "iPad" : (ua.includes("iPhone") ? "iPhone" : "Browser"));

  async function swStatus() {
    if (!("serviceWorker" in navigator)) { set("sw","nicht unterstützt"); return; }
    const regs = await navigator.serviceWorker.getRegistrations();
    if (!regs.length) { set("sw","kein Service Worker"); return; }
    const list = regs.map(r => (r.active ? r.active.scriptURL : (r.installing ? r.installing.scriptURL : "SW"))).join(" | ");
    set("sw", "aktiv: " + list);
  }

  async function unregisterAll() {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}
    await swStatus();
    set("out","Service Worker abgemeldet + Caches gelöscht.");
  }

  function hardReload() {
    const u = new URL(location.href);
    u.searchParams.set("v", String(Date.now()));
    location.href = u.toString();
  }

  async function fetchNoStore(url) {
    const res = await fetch(url, { cache: "no-store" });
    const txt = await res.text();
    return { ok: res.ok, status: res.status, head: txt.slice(0, 240) };
  }

  async function test(url) {
    set("out","Lade: " + url + " ...");
    try {
      const r = await fetchNoStore(url);
      set("out", `Status: ${r.status}\nOK: ${r.ok}\n--- HEAD ---\n${r.head}`);
    } catch (e) {
      set("out","Fehler: " + (e && e.message ? e.message : String(e)));
    }
  }

  $("btnUnreg")?.addEventListener("click", () => { unregisterAll(); });
  $("btnHard")?.addEventListener("click", () => { hardReload(); });
  $("btnFetchApp")?.addEventListener("click", () => { test("./app.js?v=" + Date.now()); });
  $("btnFetchCss")?.addEventListener("click", () => { test("./styles.css?v=" + Date.now()); });

  swStatus();
})();
