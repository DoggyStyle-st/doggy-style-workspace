/*!
 * DoggyStyle Workspace - Safari-Fix Loader (robust boot)
 * Build: ANA037_SAFARI_FIX_LOADER_01
 *
 * Ziel:
 * - App "lebt" wieder (keine White/Dead UI), auch wenn Pfade / Caches zicken.
 * - Zeigt unten links einen grünen "JS bereit" Hinweis und fängt JS-Errors ab.
 * - Lädt vorhandene Legacy-Skripte (root oder /js) automatisch nach.
 *
 * Hinweis:
 * - ES5/ES2015-kompatibel (kein async/await, keine optional chaining).
 */

(function () {
  'use strict';

  var BUILD = 'ANA037_SAFARI_FIX_LOADER_01';
  var startTs = Date.now();

  // ---------- Minimal UI helpers ----------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'style') {
          for (var sk in attrs.style) n.style[sk] = attrs.style[sk];
        } else if (k === 'class') {
          n.className = attrs[k];
        } else if (k === 'text') {
          n.textContent = attrs[k];
        } else {
          n.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children && children.length) {
      for (var i = 0; i < children.length; i++) {
        if (children[i] == null) continue;
        n.appendChild(typeof children[i] === 'string' ? document.createTextNode(children[i]) : children[i]);
      }
    }
    return n;
  }

  function ensureStatusChip() {
    var id = 'ds_js_status_chip';
    var chip = document.getElementById(id);
    if (chip) return chip;

    chip = el('div', {
      id: id,
      style: {
        position: 'fixed',
        left: '10px',
        bottom: '10px',
        zIndex: '2147483647',
        padding: '6px 10px',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,.18)',
        background: 'rgba(0,0,0,.55)',
        color: '#fff',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '12px',
        lineHeight: '1.25',
        maxWidth: '70vw',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)'
      }
    });

    chip.appendChild(el('div', { style: { fontWeight: '700' }, text: 'Build: ' + BUILD }));
    chip.appendChild(el('div', { id: id + '_line', style: { opacity: '0.9' }, text: 'Boot…' }));

    document.documentElement.appendChild(chip);
    return chip;
  }

  function setChip(text, ok) {
    var chip = ensureStatusChip();
    var line = document.getElementById('ds_js_status_chip_line');
    if (line) line.textContent = text;
    chip.style.borderColor = ok ? 'rgba(120,255,120,.35)' : 'rgba(255,120,120,.35)';
    chip.style.boxShadow = ok ? '0 0 0 1px rgba(120,255,120,.12), 0 8px 30px rgba(0,0,0,.35)'
                              : '0 0 0 1px rgba(255,120,120,.12), 0 8px 30px rgba(0,0,0,.35)';
  }

  function toast(msg, ok) {
    var t = el('div', {
      style: {
        position: 'fixed',
        left: '10px',
        bottom: '52px',
        zIndex: '2147483647',
        padding: '8px 10px',
        borderRadius: '12px',
        border: '1px solid ' + (ok ? 'rgba(120,255,120,.35)' : 'rgba(255,120,120,.35)'),
        background: 'rgba(10,10,12,.72)',
        color: '#fff',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '12px',
        lineHeight: '1.25',
        maxWidth: '78vw',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)'
      }
    }, [msg]);

    document.documentElement.appendChild(t);
    setTimeout(function () {
      try { t.parentNode && t.parentNode.removeChild(t); } catch (e) {}
    }, 6500);
  }

  // ---------- Global error hooks ----------
  window.addEventListener('error', function (e) {
    try {
      var m = (e && (e.message || (e.error && e.error.message))) || 'Unbekannter JS-Fehler';
      toast('JS ERROR: ' + m, false);
      setChip('JS Fehler: ' + m, false);
    } catch (err) {}
  });

  window.addEventListener('unhandledrejection', function (e) {
    try {
      var r = e && e.reason;
      var m = (r && (r.message || String(r))) || 'Promise Rejection';
      toast('JS REJECTION: ' + m, false);
      setChip('JS Rejection: ' + m, false);
    } catch (err) {}
  });

  // ---------- Path / loader helpers ----------
  function cacheBust(url) {
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + 'v=' + Date.now();
  }

  function headOk(url, cb) {
    // Use XHR (more compatible than fetch for some Safari edge cases)
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', cacheBust(url), true);
      xhr.responseType = 'text';
      xhr.onload = function () {
        // GitHub Pages sometimes returns 200 with HTML 404 page.
        // Heuristic: if content looks like HTML doctype, treat as missing.
        var txt = String(xhr.responseText || '');
        var looksHtml = /<\s*html/i.test(txt) || /<!doctype/i.test(txt);
        cb(xhr.status >= 200 && xhr.status < 300 && !looksHtml);
      };
      xhr.onerror = function () { cb(false); };
      xhr.send();
    } catch (e) { cb(false); }
  }

  function loadScript(url, cb) {
    var s = document.createElement('script');
    s.src = cacheBust(url);
    s.defer = false;
    s.async = false;
    s.onload = function () { cb && cb(true); };
    s.onerror = function () { cb && cb(false); };
    document.head.appendChild(s);
  }

  function loadCss(url) {
    try {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = cacheBust(url);
      document.head.appendChild(l);
    } catch (e) {}
  }

  function tryPaths(paths, loaderFn, cb) {
    var i = 0;
    function next() {
      if (i >= paths.length) return cb(false, null);
      var p = paths[i++];
      headOk(p, function (ok) {
        if (!ok) return next();
        loaderFn(p, function (loadedOk) {
          if (loadedOk) return cb(true, p);
          next();
        });
      });
    }
    next();
  }

  // ---------- Boot sequence ----------
  function boot() {
    ensureStatusChip();
    setChip('JS bereit – Loader startet…', true);

    // Always try to attach base CSS if app.html removed links
    loadCss('./css/styles.css');
    loadCss('./css/dashboard_master.css');
    loadCss('./styles.css'); // fallback root

    // 1) Try to load firebase-config / firebase init if present (root or /js)
    var candidatesFirebaseCfg = ['./firebase-config.js', './js/firebase-config.js', './firebase_config.js', './js/firebase_config.js'];
    tryPaths(candidatesFirebaseCfg, loadScript, function (ok, used) {
      if (ok) {
        toast('Firebase config geladen: ' + used, true);
      } else {
        // Not fatal, some builds inline config elsewhere
        toast('Hinweis: firebase-config.js nicht gefunden (ok, falls inline).', true);
      }

      // 2) Load auth.js if present
      var candidatesAuth = ['./auth.js', './js/auth.js'];
      tryPaths(candidatesAuth, loadScript, function (ok2, used2) {
        if (ok2) toast('auth.js geladen: ' + used2, true);

        // 3) Load remaining modules that often exist
        var modules = [
          { name: 'auswertungen.js', paths: ['./auswertungen.js', './js/auswertungen.js'] },
          { name: 'pdf-report.js', paths: ['./pdf-report.js', './js/pdf-report.js'] }
        ];

        function loadModules(idx) {
          if (idx >= modules.length) return startApp();
          tryPaths(modules[idx].paths, loadScript, function (okm, usedm) {
            if (okm) toast(modules[idx].name + ' geladen: ' + usedm, true);
            loadModules(idx + 1);
          });
        }
        loadModules(0);
      });
    });
  }

  function startApp() {
    // Start hook – we call the first known init function we find.
    // We purposely keep this very defensive.
    var started = false;
    var hooks = [
      'bootApp',
      'initApp',
      'startApp',
      'appInit',
      'DS_BOOT',
      'DS_init'
    ];

    for (var i = 0; i < hooks.length; i++) {
      var h = hooks[i];
      if (typeof window[h] === 'function') {
        try {
          window[h]();
          started = true;
          toast('App gestartet über Hook: ' + h, true);
          break;
        } catch (e) {
          toast('Hook ' + h + ' Fehler: ' + (e && e.message ? e.message : String(e)), false);
        }
      }
    }

    // If nothing to call, at least show that JS is alive and clickable overlay isn't blocking
    if (!started) {
      toast('JS läuft. Kein Start-Hook gefunden → Bitte sagen, wie deine Init-Funktion heißt.', false);
      // Make sure the page can be interacted with (some overlays block taps)
      try {
        document.documentElement.style.pointerEvents = 'auto';
        document.body && (document.body.style.pointerEvents = 'auto');
      } catch (e) {}
    }

    var ms = Date.now() - startTs;
    setChip('JS bereit (' + ms + 'ms) – UI sollte bedienbar sein.', true);
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
