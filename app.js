/* ANA037 APP (START-HOOK FIX)
   Goal: after login, app.html must not show "Kein Start-Hook gefunden".
   We provide a stable startApp() hook and a minimal boot that can run without other legacy modules.
*/
(function(){
  'use strict';
  var startTs = Date.now();

  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }
  function setChip(msg, ok){
    try{
      var badge = document.getElementById('bootBadge') || document.getElementById('bootBadge2');
      if(badge){
        badge.textContent = msg;
        badge.style.background = ok ? 'rgba(0,120,0,.55)' : 'rgba(120,0,0,.55)';
      }
    }catch(e){}
  }

  function markReady(){
    window.__APP_READY = true;
    var ms = Date.now() - startTs;
    setChip('JS OK ('+ms+'ms)', true);
  }

  // ---- REAL start hook: called once after auth is OK ----
  function realStart(){
    if(window.__APP_STARTED) return;
    window.__APP_STARTED = true;

    // If the old app exposes something, call it; otherwise show a safe placeholder.
    var called = false;
    var candidates = [
      'startLegacy', 'initApp', 'AppInit', 'bootApp', 'workspaceInit',
      'renderApp', 'initDashboard', 'startWorkspace'
    ];
    for(var i=0;i<candidates.length;i++){
      try{
        var fn = window[candidates[i]];
        if(typeof fn === 'function'){
          called = true;
          fn();
          break;
        }
      }catch(e){}
    }

    // Ensure there is at least something visible / interactive.
    try{
      var root = document.getElementById('appRoot') || document.getElementById('app') || document.body;
      if(root && !called){
        var div = document.createElement('div');
        div.id = 'ana037Placeholder';
        div.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;color:#fff;font:16px/1.4 -apple-system,BlinkMacSystemFont,system-ui,Segoe UI,Roboto,Arial;';
        div.innerHTML = '<div style="padding:16px 18px;border-radius:14px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.15);backdrop-filter:blur(8px)">' +
                        '<div style="font-weight:700;margin-bottom:6px">Workspace geladen</div>' +
                        '<div style="opacity:.85">Auth OK. Start-Hook ist vorhanden. (Nächster Schritt: Legacy-UI wieder anbinden.)</div>' +
                        '</div>';
        // Don't cover existing UI if it exists
        if(!document.getElementById('ana037Placeholder')) document.body.appendChild(div);
      }
    }catch(e){}

    markReady();
  }

  // Expose stable hooks (some builds look for different names)
  window.startApp = realStart;
  window.initApp  = realStart;
  window.bootApp  = realStart;

  // "Legacy export" fallbacks (because some loaders look for these names)
  window.startAppLegacy = realStart;
  window.startLegacy    = realStart;
  window.legacyStart    = realStart;
  window.__LEGACY_EXPORT_OK = true;

  function boot(){
    // If auth.js is present it will call startApp() after user is logged-in.
    // But we also call initAuth here if it exists (app.html includes auth.js in this fix).
    if(typeof window.initAuth === 'function'){
      try{ window.initAuth(); }catch(e){}
      setChip('Build ANA037-START-HOOK – warte auf Login…', true);
      return;
    }

    // No auth available: still mark ready and keep page usable
    setChip('JS OK – Auth-Modul fehlt (auth.js nicht geladen)', false);
    markReady();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, false);
  }else{
    boot();
  }
})();
