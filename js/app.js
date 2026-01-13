/* js/app.js forwarder (works in subfolders like /doggy-style-workspace/)
   Ensures any request to /js/app.js loads the canonical ../app.js relative
   to THIS script file (not relative to the current page URL).
*/
(function(){
  try{
    var current = document.currentScript && document.currentScript.src;
    if(!current){
      // Fallback: find last script tag
      var scripts = document.getElementsByTagName('script');
      current = scripts && scripts.length ? scripts[scripts.length-1].src : '';
    }
    var appUrl = new URL('../app.js', current || window.location.href);
    var s = document.createElement('script');
    // Cache-bust
    appUrl.searchParams.set('v', String(Date.now()));
    s.src = appUrl.toString();
    s.defer = true;
    s.async = false;
    s.onerror = function(){ console.error('Forwarder failed to load', appUrl.toString()); };
    document.head.appendChild(s);
  }catch(e){
    console.error('Forwarder exception', e);
  }
})();
