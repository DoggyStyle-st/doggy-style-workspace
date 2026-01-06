(() => {
  // ÄNDERE NUR DIESE ZEILE, um sofort zu sehen ob neue Version ankommt
  const DIAG_BUILD = "DIAG-A-003";

  // Token für harte Cache-Busting-Reloads
  const url = new URL(location.href);
  const v = url.searchParams.get("v") || "(kein ?v=… gesetzt)";
  const token = Math.random().toString(16).slice(2);

  const $ = (id) => document.getElementById(id);

  function setText(id, txt) {
    const el = $(id);
    if (el) el.textContent = txt;
  }

  // Sichtkontrolle (groß + Badge)
  setText("buildId", DIAG_BUILD);
  setText("buildBadge", `BUILD: ${DIAG_BUILD}`);
  setText("urlInfo", `?v=${v} | token=${token}`);
  setText("now", new Date().toLocaleString());

  // UA
  const ua = navigator.userAgent || "";
  setText("ua", ua.slice(0, 800));
  setText("uaShort", ua.includes("iPad") ? "iPad" : (ua.includes("iPhone") ? "iPhone" : "Other"));

  // Service Worker Status
  async function swStatus() {
    if (!("serviceWorker" in navigator)) {
      setText("sw", "nicht unterstützt");
      return;
    }
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (!regs.length) {
        setText("sw", "kein Service Worker registriert");
        return;
      }
      const lines = regs.map((r, i) => {
        const scope = r.scope || "";
        const active = r.active?.scriptURL || "(kein active)";
        return `${i + 1}) scope=${scope}\n   active=${active}`;
      });
      setText("sw", `registriert:\n${lines.join("\n")}`);
    } catch (e) {
      setText("sw", `Fehler: ${String(e)}`);
    }
  }

  // Fetch helper (no-store + Cache-Control)
  async function fetchText(path) {
    const u = new URL(path, location.href);
    u.searchParams.set("_t", Date.now().toString());
    u.searchParams.set("_r", token);

    const res = await fetch(u.toString(), {
      cache: "no-store",
      headers: { "Cache-Control": "no-store" }
    });

    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      head: text.slice(0, 400)
    };
  }

  async function run() {
    await swStatus();

    $("btnUnreg")?.addEventListener("click", async () => {
      if (!("serviceWorker" in navigator)) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      let n = 0;
      for (const r of regs) {
        const ok = await r.unregister();
        if (ok) n++;
      }
      setText("out", `SW unregister: ${n} Registrierung(en) entfernt. Jetzt "Hart neu laden" drücken.`);
      await swStatus();
    });

    $("btnHard")?.addEventListener("click", () => {
      const u = new URL(location.href);
      u.searchParams.set("v", `${Date.now()}`); // erzwingt neuen Request
      location.replace(u.toString());
    });

    $("btnFetchJs")?.addEventListener("click", async () => {
      try {
        const r = await fetchText("diag.js");
        setText(
          "out",
          `FETCH diag.js\nok=${r.ok} status=${r.status}\nurl=${r.url}\n--- head ---\n${r.head}`
        );
      } catch (e) {
        setText("out", `FETCH diag.js FEHLER: ${String(e)}`);
      }
    });

    $("btnFetchApp")?.addEventListener("click", async () => {
      try {
        const r = await fetchText("app.js");
        setText(
          "out",
          `FETCH app.js\nok=${r.ok} status=${r.status}\nurl=${r.url}\n--- head ---\n${r.head}`
        );
      } catch (e) {
        setText("out", `FETCH app.js FEHLER: ${String(e)}`);
      }
    });
  }

  run();
})();