(function(){
  if (window.__APP_INIT_BOOTED__) return;
  window.__APP_INIT_BOOTED__ = true;

  function ready(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    } else {
      fn();
    }
  }

  function showInitBadge(ok){
    try{
      var el = document.getElementById('build');
      if (!el) return;
      var span = document.createElement('span');
      span.style.marginLeft = '8px';
      span.style.fontWeight = '600';
      span.textContent = ok ? 'INIT: OK' : 'INIT: FAIL';
      el.appendChild(span);
    }catch(e){}
  }

  ready(function(){
    try{
      // Ensure essential globals exist
      if (!window.firebase || !window.CLOUD) {
        console.warn('INIT waiting for firebase/CLOUD');
      }

      // Force-call legacy init if present
      if (typeof window.initApp === 'function') {
        window.initApp();
      } else if (typeof window.boot === 'function') {
        window.boot();
      }

      // Enable pointer events if a guard blocked UI
      document.body.style.pointerEvents = 'auto';

      showInitBadge(true);
      console.log('APP_INIT_OK');
    } catch(e){
      console.error('APP_INIT_FAIL', e);
      showInitBadge(false);
    }
  });
})();
