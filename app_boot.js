/* ANA037P5 Boot Loader + Health Badge
   Purpose: Ensure app.js is loaded in GitHub Pages regardless of /js folder structure
   and show visible diagnostics if JS fails early. */
(function(){
  const badge = document.getElementById('bootBadge');
  function setBadge(txt, ok){
    if(!badge) return;
    badge.textContent = txt;
    badge.style.background = ok ? 'rgba(0,128,0,.55)' : 'rgba(180,0,0,.55)';
  }

  // capture JS errors early
  window.addEventListener('error', function(ev){
    const msg = (ev && ev.message) ? ev.message : 'Script error';
    setBadge('JS ERROR: ' + msg, false);
  });
  window.addEventListener('unhandledrejection', function(ev){
    let msg = 'Promise rejection';
    try{
      if(ev && ev.reason){
        msg = (ev.reason && ev.reason.message) ? ev.reason.message : String(ev.reason);
      }
    }catch(_){}
    setBadge('JS REJECT: ' + msg, false);
  });

  // mark initial boot
  setBadge('BOOT: loader', true);

  // helper to load a script with callbacks
  function loadScript(src){
    return new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = ()=>resolve(src);
      s.onerror = ()=>reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  // try multiple candidate paths (root first to match existing app.html)
  const v = 'ANA037P5';
  const candidates = [
    'app.js?v=' + v,
    'js/app.js?v=' + v,
    './app.js?v=' + v,
    './js/app.js?v=' + v
  ];

  // If Firebase libs are missing, show it explicitly
  function firebaseOk(){
    return typeof window.firebase !== 'undefined' || (typeof window.firebase !== 'undefined');
  }

  (async function(){
    // Wait a tick so defer scripts (firebase) have executed
    await new Promise(r=>setTimeout(r, 0));

    // Basic check: Firebase compat should attach global firebase namespace
    // If not, app.js will fail. We still try, but badge will tell.
    if(typeof window.firebase === 'undefined'){
      setBadge('BOOT: firebase not ready (loading app anyway)', false);
    }

    for(const src of candidates){
      try{
        setBadge('BOOT: load ' + src, true);
        await loadScript(src);
        // If app.js sets a known marker, prefer it; otherwise consider loaded ok.
        setBadge('JS OK (' + src.replace(/\?v=.*/, '') + ')', true);
        return;
      }catch(e){
        // continue
      }
    }
    setBadge('BOOT FAIL: app.js not found', false);
  })();
})();
