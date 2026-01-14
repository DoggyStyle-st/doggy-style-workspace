/* ANA037 app.js – Safari-safe boot loader (ES5)
   - waits for auth (initAuth) then loads legacy scripts and starts app
*/
(function(){
  'use strict';

  var BUILD = 'ANA037-FIXPACK';
  function toast(msg, ok){
    try{
      var id='ds_js_status_chip';
      var el=document.getElementById(id);
      if(!el){
        el=document.createElement('div');
        el.id=id;
        el.style.cssText='position:fixed;left:12px;bottom:44px;z-index:99999;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);font:12px/1.2 -apple-system,BlinkMacSystemFont,system-ui,Segoe UI,Roboto,Arial;color:#fff;backdrop-filter:blur(8px)';
        document.body.appendChild(el);
      }
      el.textContent=msg;
      el.style.background = ok ? 'rgba(0,120,0,.55)' : 'rgba(120,0,0,.55)';
    }catch(e){}
  }

  function loadScript(src, cb){
    cb = cb || function(){};
    var s = document.createElement('script');
    s.src = src;
    s.defer = true;
    s.onload = function(){ cb(null, src); };
    s.onerror = function(){ cb('failed', src); };
    document.head.appendChild(s);
  }

  function tryPaths(paths, cb){
    var i=0;
    function next(){
      if(i>=paths.length) return cb(false, null);
      var p = paths[i++];
      loadScript(p, function(err){
        if(!err) return cb(true, p);
        next();
      });
    }
    next();
  }

  var modules = [
    { name:'legacy-main', paths:['./js/app_main.js','./js/main.js','./js/workspace.js','./js/app_legacy.js','./js/ds.js'] },
    { name:'legacy-ui',   paths:['./js/ui.js','./js/ui_helpers.js','./js/dashboard.js'] },
    { name:'legacy-db',   paths:['./js/db.js','./js/firestore.js','./js/data.js'] },
    { name:'root-legacy', paths:['./app_main.js','./main.js','./workspace.js'] }
  ];

  function startHook(){
    var hooks = ['startApp','bootApp','initApp','appInit','DS_BOOT','DS_init','renderApp','mountApp'];
    for(var i=0;i<hooks.length;i++){
      var h = hooks[i];
      if(typeof window[h] === 'function'){
        try{
          window[h]();
          toast('App gestartet über Hook: '+h, true);
          window.__APP_READY = true;
          return true;
        }catch(e){
          toast('Hook '+h+' Fehler: '+(e && e.message ? e.message : String(e)), false);
          return true;
        }
      }
    }
    toast('Kein Start-Hook gefunden (Legacy export fehlt).', false);
    return false;
  }

  function loadModules(idx, done){
    if(idx>=modules.length) return done();
    tryPaths(modules[idx].paths, function(ok, used){
      if(ok) toast(modules[idx].name+' geladen: '+used, true);
      loadModules(idx+1, done);
    });
  }

  function bootAfterAuth(){
    toast('Auth OK – lade App…', true);
    loadModules(0, function(){
      startHook();
    });
  }

  function boot(){
    toast('Build '+BUILD+' – starte…', true);

    if(typeof window.initAuth !== 'function'){
      toast('initAuth fehlt (auth.js nicht geladen)', false);
      return;
    }
    window.initAuth({
      mode: 'app',
      onAuthed: function(){ bootAfterAuth(); },
      onNotAuthed: function(){},
      onError: function(msg){ toast('Auth Fehler: '+msg, false); }
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
