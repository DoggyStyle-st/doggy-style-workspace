/* ANA037P5_CANONICAL_APPJS
   Problem observed:
   - UI renders (from app.html) but most actions do nothing.
   - This typically happens when app.html (new) is paired with a legacy app.js (old),
     so DOM IDs/classes no longer match the JS event bindings.

   Fix strategy:
   1) Prefer the canonical root app.js first.
   2) Keep legacy paths as fallback.
   3) Show which path actually loaded.
*/

(function () {
  // ---- small on-screen badge (re-usable) ----
  const id = 'ds-js-badge';
  function badge(text, ok) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = [
        'position:fixed',
        'left:12px',
        'bottom:12px',
        'z-index:2147483647',
        'padding:8px 10px',
        'border-radius:10px',
        'font:12px/1.25 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif',
        'box-shadow:0 8px 30px rgba(0,0,0,.35)',
        'border:1px solid rgba(255,255,255,.12)',
        'backdrop-filter: blur(10px)',
        'color:#fff'
      ].join(';');
      document.body.appendChild(el);
    }
    el.style.background = ok ? 'rgba(20,140,60,.85)' : 'rgba(170,60,40,.85)';
    el.textContent = text;
  }

  // Catch runtime errors to make "silent failures" visible on iPad Safari.
  window.addEventListener('error', (e) => {
    badge('JS ERROR: ' + (e && e.message ? e.message : 'unknown'), false);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = (e && e.reason && e.reason.message) ? e.reason.message : String(e && e.reason ? e.reason : 'unknown');
    badge('JS REJECT: ' + msg, false);
  });

  // ---- app.js loader ----
  // IMPORTANT: root app.js FIRST. Legacy folders only as fallback.
  const candidates = [
    'app.js',
    './app.js',
    'js/app.js',
    './js/app.js'
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error('failed: ' + src));
      document.head.appendChild(s);
    });
  }

  (async () => {
    badge('ANA037P5: Lade app.js …', false);

    for (const src of candidates) {
      try {
        const loaded = await loadScript(src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now());
        badge('JS OK: ' + loaded, true);
        return;
      } catch (e) {
        // continue
      }
    }

    badge('JS FAIL: app.js nicht gefunden', false);
  })();
})();
