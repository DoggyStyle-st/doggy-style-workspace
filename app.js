/* ANA037_BOOTFIX app.js
   Purpose: Provide a stable global start hook for the legacy app (initApp/appInit) without breaking older Safari.
*/
(function(){
  'use strict';

  function byId(id){ return document.getElementById(id); }

  function showBootMessage(msg){
    try{
      var root = byId('appRoot');
      if(root){
        root.innerHTML = '<div style="padding:16px;font-family:system-ui;color:#fff;">' +
          '<div style="opacity:.8;font-size:12px;margin-bottom:8px;">Boot</div>' +
          '<div style="font-size:14px;">' + String(msg) + '</div>' +
          '</div>';
      }
    }catch(e){}
  }

  function safeCall(fn, name){
    try{
      fn();
      return true;
    }catch(e){
      console.error('[boot] error in ' + name, e);
      showBootMessage('Fehler beim Start: ' + name);
      return false;
    }
  }

  function startApp(){
    if (window.__DS_APP_STARTED) return;
    window.__DS_APP_STARTED = true;

    // Prefer the known legacy init entry points
    if (typeof window.initApp === 'function') return safeCall(window.initApp, 'initApp');
    if (typeof window.appInit === 'function') return safeCall(window.appInit, 'appInit');
    if (typeof window.DS_legacyStart === 'function') return safeCall(window.DS_legacyStart, 'DS_legacyStart');

    // If nothing is available, keep page informative
    console.warn('[boot] No legacy init function found (initApp/appInit/DS_legacyStart).');
    showBootMessage('Kein Start-Hook gefunden (initApp/appInit fehlt).');
  }

  // Export multiple names for legacy compatibility
  window.startApp = startApp;
  window.DS_initApp = startApp;       // legacy export some builds expect
  window.DS_start = startApp;         // alternative
})();
