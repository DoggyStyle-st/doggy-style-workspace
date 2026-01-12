/* ANA037P4 - resilient loader for app runtime
   Purpose: load the main app bundle regardless of whether it is in /js or root.
   This avoids "UI shows but nothing works" when app.js path changes during GitHub uploads.
*/
(function () {
  var BUILD = "ANA037P4";
  var badgeId = "ds-appjs-badge";

  function ensureBadge() {
    var el = document.getElementById(badgeId);
    if (!el) {
      el = document.createElement("div");
      el.id = badgeId;
      el.style.position = "fixed";
      el.style.left = "12px";
      el.style.bottom = "12px";
      el.style.zIndex = "999999";
      el.style.padding = "6px 10px";
      el.style.borderRadius = "10px";
      el.style.background = "rgba(0,0,0,0.55)";
      el.style.color = "#fff";
      el.style.font = "12px/1.2 -apple-system, system-ui, Segoe UI, Roboto, Arial, sans-serif";
      el.style.backdropFilter = "blur(8px)";
      el.style.webkitBackdropFilter = "blur(8px)";
      el.style.pointerEvents = "none";
      el.textContent = "JS: loading… (" + BUILD + ")";
      document.body.appendChild(el);
    }
    return el;
  }

  function setBadge(text) {
    try { ensureBadge().textContent = text; } catch(e) {}
  }

  // Cache-bust token so Service Worker cannot serve a stale file after path reshuffles.
  var bust = "v=" + encodeURIComponent(BUILD + "-" + Date.now());

  // Try common locations in priority order.
  var candidates = ["js/app.js","./js/app.js","app.js","./app.js"];
  candidates = candidates.filter(function(v, idx) { return candidates.indexOf(v) === idx; });

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement("script");
      s.src = src + (src.indexOf("?") >= 0 ? "&" : "?") + bust;
      s.defer = true;
      s.onload = function() { resolve(src); };
      s.onerror = function() { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  (function run() {
    setBadge("JS: loading… (" + BUILD + ")");
    var p = Promise.reject();
    candidates.forEach(function(src) {
      p = p.catch(function() { return loadScript(src); });
    });
    p.then(function(src) {
      setBadge("JS: OK (" + BUILD + ") – " + src);
      window.__DS_APP_MAIN_SRC__ = src;
      window.__DS_APP_BOOT_BUILD__ = BUILD;
    }).catch(function(err) {
      setBadge("JS: FEHLT (" + BUILD + ")");
      try { console.error(err); } catch(e) {}
    });
  })();
})();
