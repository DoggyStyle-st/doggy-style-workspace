/* ANA037 app_init.js – small boot badge + early errors (ES5) */
(function(){
  function el(tag, attrs, txt){
    var n=document.createElement(tag);
    if(attrs){ for(var k in attrs){ n.setAttribute(k, attrs[k]); } }
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

  window.__bootErrors = window.__bootErrors || [];
  window.addEventListener('error', function(ev){
    try{ window.__bootErrors.push({type:'error', msg: ev && ev.message, src: ev && ev.filename, line: ev && ev.lineno, col: ev && ev.colno}); }catch(e){}
  });
  window.addEventListener('unhandledrejection', function(ev){
    try{ var r = ev && ev.reason; window.__bootErrors.push({type:'rejection', msg: (r && (r.message||r.code)) || String(r||'')}); }catch(e){}
  });

  document.addEventListener('DOMContentLoaded', function(){
    ensureBadge();
    setBadge('Boot: JS läuft', true);
  });
})();
