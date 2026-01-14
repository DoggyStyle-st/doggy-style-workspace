/* ANA037P2 app_init.js
   Shows a small status badge bottom-left so we know JS is alive.
   Also reports early boot errors captured in window.__bootErrors.
*/
(function(){
  function el(tag, attrs, txt){
    var n=document.createElement(tag);
    if(attrs) for(var k in attrs) n.setAttribute(k, attrs[k]);
    if(txt!=null) n.textContent=txt;
    return n;
  }
  function ensureBadge(){
    var b=document.getElementById('bootBadge');
    if(b) return b;
    b=el('div',{id:'bootBadge',style:[
      'position:fixed','left:12px','bottom:12px','z-index:99999',
      'padding:6px 10px','border-radius:999px',
      'background:rgba(0,0,0,.55)','border:1px solid rgba(255,255,255,.18)',
      'font:12px/1.2 -apple-system,BlinkMacSystemFont,system-ui,Segoe UI,Roboto,Arial',
      'color:#fff','backdrop-filter:blur(8px)'
    ].join(';')},'Boot: …');
    document.body.appendChild(b);
    return b;
  }

  function setBadge(text, ok){
    var b=ensureBadge();
    b.textContent=text;
    b.style.background = ok ? 'rgba(0,120,0,.55)' : 'rgba(120,0,0,.55)';
  }

  function summarizeErrors(){
    var arr = (window.__bootErrors||[]).slice(-3);
    if(!arr.length) return '';
    return arr.map(function(e){
      if(!e) return '';
      var s = (e.type==='rejection'?'REJ: ':'ERR: ') + (e.msg||'');
      if(e.src) s += ' @'+e.src.split('/').slice(-1)[0]+':'+(e.line||'')+':'+(e.col||'');
      return s;
    }).filter(Boolean).join(' | ');
  }

  function check(){
    // If app.js sets window.__APP_READY = true we are good.
    var ready = !!window.__APP_READY;
    var errs = summarizeErrors();
    if(ready && !errs){
      setBadge('JS OK', true);
      return true;
    }
    if(errs){
      setBadge('JS FEHLER: '+errs, false);
      return true;
    }
    return false;
  }

  document.addEventListener('DOMContentLoaded', function(){
    ensureBadge();
    // Give app.js a moment to boot
    var tries=0;
    var t=setInterval(function(){
      tries++;
      if(check() || tries>40){ // ~10s
        if(tries>40 && !check()){
          setBadge('JS nicht bereit (timeout)', false);
        }
        clearInterval(t);
      }
    }, 250);
  });
   // ---- START-HOOK für den Safari-Loader ----
  // Der Loader sucht u.a. window.startApp. Wir stellen ihn bereit
  // und leiten dann auf die echte Init-Funktion weiter (falls vorhanden).
  window.startApp = function () {
    try {
      // Wenn irgendwo bereits eine echte Boot-Funktion existiert, rufen wir sie auf:
      var candidates = ['bootApp','initApp','appInit','DS_BOOT','DS_init'];
      for (var i=0; i<candidates.length; i++) {
        var h = candidates[i];
        if (typeof window[h] === 'function') {
          return window[h]();
        }
      }

      // Falls es keinen echten Boot gibt, markieren wir wenigstens "bereit"
      // (damit du siehst, dass JS läuft) – aber UI baut sich dann nicht von selbst.
      window.__APP_READY = true;
      setBadge('JS OK (kein Boot gefunden)', true);
    } catch (e) {
      setBadge('JS FEHLER: ' + (e && e.message ? e.message : String(e)), false);
      throw e;
    }
  };  
})();
