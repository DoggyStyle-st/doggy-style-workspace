/* ANA037 START HOOK SHIM (ohne app.js zu überschreiben)
   Ziel: Falls irgendein Legacy-Code nach einem Start-Hook sucht,
   liefern wir mehrere bekannte Namen und versuchen, die App zu starten.
*/
(function(){
  'use strict';
  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }

  function callFirstAvailable(){
    var candidates = [
      'startApp','StartApp','initApp','InitApp','bootApp','BootApp',
      'appInit','AppInit','init','Init','runApp','RunApp','startWorkspace','StartWorkspace'
    ];
    for(var i=0;i<candidates.length;i++){
      var k=candidates[i];
      try{
        if(typeof window[k]==='function' && window[k]!==callFirstAvailable){
          log('[start-hook] calling', k);
          window[k]();
          return true;
        }
      }catch(e){}
    }
    return false;
  }

  // Provide legacy export(s)
  if(typeof window.startApp!=='function'){
    window.startApp = function(){ callFirstAvailable(); };
  }
  if(typeof window.initApp!=='function'){
    window.initApp = function(){ callFirstAvailable(); };
  }
  if(typeof window.startWorkspace!=='function'){
    window.startWorkspace = function(){ callFirstAvailable(); };
  }

  // Let auth.js notify us when authed
  window.__ds_onAuthed = function(){
    // Defer a bit so app scripts can finish loading
    setTimeout(function(){
      var ok = callFirstAvailable();
      if(!ok){
        // last resort: if app has a global render function
        log('[start-hook] no known start function found yet');
      }
    }, 50);
  };

  // Try once on load as well (in case app doesn't require auth)
  setTimeout(function(){ callFirstAvailable(); }, 250);
})();
