/* js/app.js forwarder
   Some older pages or caches may still request /js/app.js.
   This forwarder ensures they always get the canonical root /app.js.
*/
(function(){
  var s=document.createElement('script');
  s.src='../app.js?v=' + Date.now();
  s.async=false;
  s.onload=function(){};
  s.onerror=function(){console.error('Forwarder failed to load ../app.js');};
  document.head.appendChild(s);
})();
