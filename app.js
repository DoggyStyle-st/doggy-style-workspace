/* ANA037_FINAL_APPJS
   Safari-safe App Bootstrap
   ES5 only
*/
(function () {
  'use strict';

  var BUILD = 'ANA037_FINAL_STARTAPP';
  var started = false;

  console.log('[app.js] loaded', BUILD);

  // ========= PUBLIC START HOOK =========
  window.startApp = function startApp() {
    if (started) {
      console.log('[startApp] already started');
      return;
    }
    started = true;

    try {
      console.log('[startApp] starting…');

      // App bereit melden
      window.__APP_READY = true;

      // UI entsperren
      document.body.classList.remove('loading');

      // Sichtbarer Minimal-Test
      var app = document.getElementById('app');
      if (app) {
        app.innerHTML =
          '<div style="padding:24px">' +
          '<h2>DoggyStyle Workspace</h2>' +
          '<p>App erfolgreich gestartet.</p>' +
          '</div>';
      }

      console.log('[startApp] done');
    } catch (e) {
      console.error('[startApp] ERROR', e);
    }
  };

})();
