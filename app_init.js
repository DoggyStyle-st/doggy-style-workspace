/* ANA037_FINAL_APP_INIT
   Boot-Status & Start-Hook-Caller
*/
(function () {
  'use strict';

  function badge(text, ok) {
    var b = document.getElementById('bootBadge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'bootBadge';
      b.style.cssText =
        'position:fixed;left:12px;bottom:12px;z-index:99999;' +
        'padding:6px 10px;border-radius:999px;' +
        'background:#333;color:#fff;font:12px system-ui';
      document.body.appendChild(b);
    }
    b.textContent = text;
    b.style.background = ok ? '#0a7d28' : '#8b1e1e';
  }

  function tryStart() {
    if (typeof window.startApp === 'function') {
      badge('JS bereit – starte App…', true);
      window.startApp();
      return true;
    }
    return false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    badge('JS geladen – warte auf startApp()', false);

    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (tryStart() || tries > 40) {
        if (tries > 40) {
          badge('FEHLER: startApp nicht gefunden', false);
        }
        clearInterval(t);
      }
    }, 250);
  });

})();
