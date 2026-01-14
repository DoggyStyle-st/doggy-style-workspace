/* app.js – Minimal bootstrap / hook for login flow (Safari safe, ES5)
   - Exposes window.startApp()
   - Marks window.__APP_READY = true for boot badges
*/
(function () {
  'use strict';

  function byId(id){ return document.getElementById(id); }

  function ensureStatusBadge(){
    var id = 'ds_js_status_chip';
    var b = byId(id);
    if(b) return b;
    b = document.createElement('div');
    b.id = id;
    b.style.position='fixed';
    b.style.left='12px';
    b.style.bottom='44px';
    b.style.zIndex='99999';
    b.style.padding='6px 10px';
    b.style.borderRadius='999px';
    b.style.background='rgba(0,0,0,.55)';
    b.style.border='1px solid rgba(255,255,255,.18)';
    b.style.color='#fff';
    b.style.font='12px/1.2 -apple-system,BlinkMacSystemFont,system-ui,Segoe UI,Roboto,Arial';
    b.style.backdropFilter='blur(8px)';
    b.textContent='JS bereit – Loader startet…';
    document.body.appendChild(b);
    return b;
  }

  function setBadge(txt, ok){
    var b = ensureStatusBadge();
    b.textContent = txt;
    b.style.background = ok ? 'rgba(0,120,0,.55)' : 'rgba(120,0,0,.55)';
  }

  function startApp(){
    window.__APP_READY = true;
    setBadge('JS OK – starte Auth/Login…', true);

    // initAuth is provided by auth.js
    try{
      if(typeof window.initAuth === 'function'){
        window.initAuth();
      }else if(typeof window.showLogin === 'function'){
        window.showLogin();
      }else{
        setBadge('JS OK – aber initAuth/showLogin fehlt', false);
      }
    }catch(e){
      setBadge('JS FEHLER: ' + (e && e.message ? e.message : String(e)), false);
    }
  }

  // Make hook globally available (IMPORTANT)
  window.startApp = startApp;

  // Auto-run on login.html
  document.addEventListener('DOMContentLoaded', function(){
    ensureStatusBadge();
    startApp();
  });

})();
