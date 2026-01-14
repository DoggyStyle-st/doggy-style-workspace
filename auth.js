/* ANA037 auth.js (root) - ES5 compat
   - Works on Safari iOS/iPadOS
   - Guards app.html (requires logged in)
   - Powers login.html (email/pass sign-in)
*/
(function(){
  'use strict';

  var BUILD = 'ANA037-AUTH-STABLE';
  function $(id){ return document.getElementById(id); }

  function log(){ try{ console.log.apply(console, arguments);}catch(e){} }

  function toast(msg, ok){
    try{
      var box = document.getElementById('statusToast');
      if(!box){
        box = document.createElement('div');
        box.id = 'statusToast';
        box.style.position='fixed';
        box.style.left='10px';
        box.style.bottom='10px';
        box.style.zIndex='99999';
        box.style.padding='8px 10px';
        box.style.borderRadius='10px';
        box.style.font='12px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial';
        box.style.boxShadow='0 8px 24px rgba(0,0,0,.35)';
        box.style.background= ok ? 'rgba(10,120,40,.85)' : 'rgba(140,20,20,.85)';
        box.style.color='#fff';
        document.body.appendChild(box);
      }
      box.style.background= ok ? 'rgba(10,120,40,.85)' : 'rgba(140,20,20,.85)';
      box.textContent = msg;
    }catch(e){}
  }

  function setBuildBadge(){
    try{
      var badge = document.getElementById('buildBadge');
      if(badge){ badge.textContent = 'Build ' + BUILD; }
    }catch(e){}
  }

  function isLoginPage(){
    return /login\.html/i.test(location.pathname) || document.body.getAttribute('data-page')==='login';
  }

  function redirectToLogin(){
    try{
      var base = location.href.split('#')[0].split('?')[0];
      var root = base.replace(/\/[^\/]*$/,'/');
      location.href = root + 'login.html?from=' + encodeURIComponent(location.pathname + location.search);
    }catch(e){
      location.href = './login.html';
    }
  }

  function redirectToApp(){
    try{
      var base = location.href.split('#')[0].split('?')[0];
      var root = base.replace(/\/[^\/]*$/,'/');
      location.href = root + 'app.html';
    }catch(e){
      location.href = './app.html';
    }
  }

  function ensureFirebaseReady(cb){
    var tries = 0;
    function tick(){
      tries++;
      if(window.firebase && window.firebase.auth && window.firebase.apps){
        // Ensure initialized
        try{
          if(!firebase.apps.length){
            if(window.firebaseConfig){ firebase.initializeApp(window.firebaseConfig); }
          }
        }catch(e){
          // ignore
        }
        cb(true);
        return;
      }
      if(tries > 80){ cb(false); return; } // ~8s
      setTimeout(tick, 100);
    }
    tick();
  }

  function bindLoginUI(){
    var emailEl = $('email');
    var passEl  = $('password');
    var btnLogin = $('btnLogin');
    var btnRegister = $('btnRegister');
    var btnReset = $('btnReset');

    function getEmail(){ return (emailEl && emailEl.value || '').trim(); }
    function getPass(){ return (passEl && passEl.value || ''); }

    function doLogin(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      toast('Anmelden…', true);
      var email = getEmail();
      var pass  = getPass();
      if(!email || !pass){ toast('Bitte E-Mail + Passwort eingeben.', false); return false; }
      ensureFirebaseReady(function(ok){
        if(!ok){ toast('Firebase nicht bereit (libs/config).', false); return; }
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
          .then(function(){
            return firebase.auth().signInWithEmailAndPassword(email, pass);
          })
          .then(function(){
            toast('Login OK – weiter…', true);
            setTimeout(redirectToApp, 250);
          })
          .catch(function(err){
            toast('Login Fehler: ' + (err && err.message ? err.message : err), false);
          });
      });
      return false;
    }

    function doRegister(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      toast('Registrieren…', true);
      var email = getEmail();
      var pass  = getPass();
      if(!email || !pass){ toast('Bitte E-Mail + Passwort eingeben.', false); return false; }
      ensureFirebaseReady(function(ok){
        if(!ok){ toast('Firebase nicht bereit (libs/config).', false); return; }
        firebase.auth().createUserWithEmailAndPassword(email, pass)
          .then(function(){ toast('Registriert – weiter…', true); setTimeout(redirectToApp, 300); })
          .catch(function(err){ toast('Registrieren Fehler: ' + (err && err.message ? err.message : err), false); });
      });
      return false;
    }

    function doReset(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      var email = getEmail();
      if(!email){ toast('Bitte E-Mail eingeben.', false); return false; }
      ensureFirebaseReady(function(ok){
        if(!ok){ toast('Firebase nicht bereit (libs/config).', false); return; }
        firebase.auth().sendPasswordResetEmail(email)
          .then(function(){ toast('Reset-Mail gesendet.', true); })
          .catch(function(err){ toast('Reset Fehler: ' + (err && err.message ? err.message : err), false); });
      });
      return false;
    }

    // Important: explicit listeners (Safari sometimes ignores inline handlers depending on overlays)
    if(btnLogin){ btnLogin.addEventListener('click', doLogin, false); }
    if(btnRegister){ btnRegister.addEventListener('click', doRegister, false); }
    if(btnReset){ btnReset.addEventListener('click', doReset, false); }

    // Enter key submits login
    if(passEl){
      passEl.addEventListener('keydown', function(e){
        var k = e && (e.key || e.keyCode);
        if(k === 'Enter' || k === 13){ doLogin(e); }
      }, false);
    }
  }

  function guardApp(){
    ensureFirebaseReady(function(ok){
      if(!ok){ toast('Firebase nicht bereit – Login nicht prüfbar.', false); return; }
      try{
        firebase.auth().onAuthStateChanged(function(user){
          if(user){
            toast('JS OK (' + (Math.round(performance.now()) || 0) + 'ms)', true);
          } else {
            toast('Nicht angemeldet – weiter zum Login…', false);
            setTimeout(redirectToLogin, 200);
          }
        });
      }catch(e){
        toast('Auth Guard Fehler: ' + e, false);
      }
    });
  }

  function init(){
    setBuildBadge();
    if(isLoginPage()){
      toast('Bereit', true);
      bindLoginUI();
      // If already logged in, go app
      ensureFirebaseReady(function(ok){
        if(!ok) return;
        try{
          firebase.auth().onAuthStateChanged(function(user){
            if(user){ redirectToApp(); }
          });
        }catch(e){}
      });
    } else {
      guardApp();
    }
  }

  window.initAuth = init;
  window.__ANA037_AUTH_BUILD = BUILD;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, false);
  } else {
    init();
  }
})();
