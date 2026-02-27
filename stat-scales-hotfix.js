/**
 * Doggy Style Workspace – Statistik Skalen Hotfix
 * Build: M50.6.6_STABLE_SW_OFFLINE_FIX_20260227
 *
 * Ziel: Standardisierte Merkmale (Skalen 1–10) IMMER rendern – unabhängig von Feature-Flags / Timing.
 * Einbau: app.html -> nach app.js einbinden:
 *   <script src="./stat-scales-hotfix.js"></script>
 */

(function() {
  const BUILD = "M50.6.6_STABLE_SW_OFFLINE_FIX_20260227";

  // Try to override build label without touching existing core logic
  try {
    if (window.DS_MASTER_FREEZE && typeof window.DS_MASTER_FREEZE === "object") {
      window.DS_MASTER_FREEZE.tag = BUILD;
    }
  } catch (e) {}

  // Central, hard-defined standardized dimensions (as agreed)
  const STAT_SCALES = [
    // Sozialverhalten
    { key: "socialCompatibility", label: "Artgenossenverträglichkeit", group: "Sozialverhalten" },
    { key: "resourceDefense", label: "Ressourcenverteidigung", group: "Sozialverhalten" },
    { key: "impulseControl", label: "Impulskontrolle", group: "Sozialverhalten" },
    { key: "frustrationTolerance", label: "Frustrationstoleranz", group: "Sozialverhalten" },

    // Menschenbezogen
    { key: "leadershipAcceptance", label: "Führbarkeit", group: "Menschenbezogen" },
    { key: "reactivity", label: "Reaktivität", group: "Menschenbezogen" },
    { key: "distanceBehavior", label: "Distanzverhalten", group: "Menschenbezogen" },
    { key: "cooperation", label: "Kooperationsbereitschaft", group: "Menschenbezogen" },

    // Stress / Erregung
    { key: "baselineStress", label: "Grundanspannung", group: "Stress / Erregung" },
    { key: "displacement", label: "Übersprungshandlungen", group: "Stress / Erregung" },
    { key: "hyperactivity", label: "Hyperaktivität", group: "Stress / Erregung" },
    { key: "withdrawal", label: "Rückzugsverhalten", group: "Stress / Erregung" }
  ];

  window.__DS_STAT_SCALES = STAT_SCALES;

  function ensureStyles() {
    if (document.getElementById("ds-stat-scales-style")) return;
    const css = `
      .ds-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
      .ds-stat-card { padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
      .ds-stat-card h4 { margin: 0 0 8px 0; font-size: 14px; opacity: 0.9; }
      .ds-stat-row { display: grid; grid-template-columns: 1fr 56px; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.06); }
      .ds-stat-row:first-of-type { border-top: none; }
      .ds-stat-label { font-size: 13px; opacity: 0.9; }
      .ds-stat-val { text-align: right; font-variant-numeric: tabular-nums; opacity: 0.9; }
      .ds-stat-slider { width: 100%; }
      @media (max-width: 900px) { .ds-stat-grid { grid-template-columns: 1fr; } }
    `;
    const style = document.createElement("style");
    style.id = "ds-stat-scales-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function renderScalesInto(container) {
    if (!container) return;
    ensureStyles();

    // group -> dims
    const groups = {};
    for (const d of STAT_SCALES) {
      groups[d.group] = groups[d.group] || [];
      groups[d.group].push(d);
    }

    container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "ds-stat-grid";

    Object.keys(groups).forEach(groupName => {
      const card = document.createElement("div");
      card.className = "ds-stat-card";

      const h = document.createElement("h4");
      h.textContent = groupName;
      card.appendChild(h);

      groups[groupName].forEach(dim => {
        const row = document.createElement("div");
        row.className = "ds-stat-row";

        const left = document.createElement("div");
        const label = document.createElement("div");
        label.className = "ds-stat-label";
        label.textContent = dim.label;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "1";
        slider.max = "10";
        slider.step = "1";
        slider.value = "5";
        slider.className = "ds-stat-slider";
        slider.dataset.key = dim.key;

        left.appendChild(label);
        left.appendChild(slider);

        const val = document.createElement("div");
        val.className = "ds-stat-val";
        val.textContent = slider.value;

        slider.addEventListener("input", () => {
          val.textContent = slider.value;
        });

        row.appendChild(left);
        row.appendChild(val);
        card.appendChild(row);
      });

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  function tryRender() {
    // Expected container id based on earlier builds:
    const c = document.getElementById("statScales") || document.querySelector("[data-stat-scales]");
    if (!c) return false;

    // Only render if Statistik view is active/visible OR container is inside DOM.
    renderScalesInto(c);
    return true;
  }

  function installHooks() {
    // 1) Render on any click on element that contains "Statistik"
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      const txt = (t.textContent || "").trim().toLowerCase();
      if (txt.includes("statistik")) {
        setTimeout(() => tryRender(), 60);
      }
    }, true);

    // 2) Render when Statistik panel becomes visible (Safari BFCache / tab toggles)
    const obs = new MutationObserver(() => {
      tryRender();
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });

    // 3) Render on DOM ready + on pageshow (BFCache restore)
    document.addEventListener("DOMContentLoaded", () => setTimeout(() => tryRender(), 80));
    window.addEventListener("pageshow", () => setTimeout(() => tryRender(), 120));
  }

  installHooks();
})();
