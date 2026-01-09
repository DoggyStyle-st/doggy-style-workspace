/* ANA028 PROBE JS – must show overlay updates and tap counters */
(function(){
  try{
    var o=document.getElementById('anaProbeOverlay');
    if(!o) return;
    var n=0;
    function set(msg){
      o.innerHTML='<b>ANA028 Probe</b><br><span>'+msg+'</span><br><code>'+new Date().toLocaleTimeString()+'</code>';
    }
    set('Probe-JS läuft. Tippe irgendwo.');

    function onEvt(e){
      n++;
      var t = e && e.type ? e.type : 'event';
      set('Event: '+t+' (#'+n+')');
    }
    ['touchend','pointerup','click','mouseup'].forEach(function(type){
      document.addEventListener(type,onEvt,true);
    });
  }catch(e){
    try{
      var o2=document.getElementById('anaProbeOverlay');
      if(o2) o2.innerHTML='<b>ANA028 Probe</b><br><span>JS Fehler: '+(e && e.message ? e.message : e)+'</span>';
    }catch(_){}
  }
})();