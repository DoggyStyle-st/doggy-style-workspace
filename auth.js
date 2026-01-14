/* ANA037_AUTH_ES5_FIX
 * auth.js (ES5) – iPad/Safari/PWA safe
 * - exposes window.startApp(), window.initAuth(), window.showLogin()
 * - no async/await, no const/let, no optional chaining
 */
(function(){
  'use strict';

  function $(id){ return document.getElementById(id); }

  function log(){
    try { console.log.apply(console, arguments); } catch(e) {}
  }

  function toast(text, ok){
    try{
      if(typeof window.toast === 'function') return window.toast(text, ok);
    }catch(e){}
    var m = $('authMsg');
    if(m) m.textContent = text || '';
  }

  function hasFirebaseCompat(){
    return !!(window.firebase && window.firebase.initializeApp && window.firebase.auth);
  }

  function ensureFirebaseApp(){
    if(!hasFirebaseCompat()){
      toast('Firebase libs fehlen (compat).', false);
      return false;
    }
    if(!window.firebaseConfig){
      toast('firebaseConfig fehlt (firebase-config.js nicht geladen)', false);
      return false;
    }
    try{
      if(!window.firebase.apps || !window.firebase.apps.length){
        window.firebase.initializeApp(window.firebaseConfig);
        log('[auth] firebase initialized');
      }
      return true;
    }catch(e){
      toast('Firebase init Fehler: ' + (e && e.message ? e.message : String(e)), false);
      return false;
    }
  }

  function isLoginPage(){
    return !!($('btnLogin') || $('loginEmail') || $('loginPass'));
  }

  function gotoLogin(){
    try{ window.location.href = 'login.html'; }catch(e){}
  }

  function gotoApp(){
    try{ window.location.href = 'app.html'; }catch(e){}
  }

  function bindLoginHandlers(){
    var btnLogin = $('btnLogin');
    var btnRegister = $('btnRegister');
    var btnForgot = $('btnForgot');

    function getEmail(){
      var v = $('loginEmail') ? $('loginEmail').value : '';
      return (v || '').trim();
    }
    function getPass(){
      return $('loginPass') ? $('loginPass').value : '';
    }

    function disableAll(dis){
      if(btnLogin) btnLogin.disabled = !!dis;
      if(btnRegister) btnRegister.disabled = !!dis;
      if(btnForgot) btnForgot.disabled = !!dis;
    }

    function doLogin(){
      if(!ensureFirebaseApp()) return;
      var email = getEmail();
      var pass = getPass();
      if(!email || !pass){
        toast('Bitte E‑Mail und Passwort eingeben.', false);
        return;
      }
      disableAll(true);
      toast('Anmelden…', true);
      window.firebase.auth().signInWithEmailAndPassword(email, pass)
        .then(function(){
          toast('Angemeldet ✓', true);
          setTimeout(gotoApp, 200);
        })
        .catch(function(err){
          var msg = (err && err.message) ? err.message : String(err);
          toast('Login fehlgeschlagen: ' + msg, false);
        })
        .then(function(){
          // runs after then OR catch
          disableAll(false);
        });
    }

    function doRegister(){
      if(!ensureFirebaseApp()) return;
      var email = getEmail();
      var pass = getPass();
      if(!email || !pass){
        toast('Bitte E‑Mail und Passwort eingeben.', false);
        return;
      }
      disableAll(true);
      toast('Registrieren…', true);
      window.firebase.auth().createUserWithEmailAndPassword(email, pass)
        .then(function(){
          toast('Account erstellt ✓ (jetzt angemeldet)', true);
          setTimeout(gotoApp, 200);
        })
        .catch(function(err){
          var msg = (err && err.message) ? err.message : String(err);
          toast('Registrierung fehlgeschlagen: ' + msg, false);
        })
        .then(function(){
          disableAll(false);
        });
    }

    function doForgot(){
      if(!ensureFirebaseApp()) return;
      var email = getEmail();
      if(!email){
        toast('Bitte E‑Mail eingeben.', false);
        return;
      }
      disableAll(true);
      toast('Sende Passwort‑Mail…', true);
      window.firebase.auth().sendPasswordResetEmail(email)
        .then(function(){
          toast('Mail verschickt ✓', true);
        })
        .catch(function(err){
          var msg = (err && err.message) ? err.message : String(err);
          toast('Fehler: ' + msg, false);
        })
        .then(function(){
          disableAll(false);
        });
    }

    if(btnLogin) btnLogin.addEventListener('click', doLogin);
    if(btnRegister) btnRegister.addEventListener('click', doRegister);
    if(btnForgot) btnForgot.addEventListener('click', doForgot);

    // enter key triggers login
    var emailEl = $('loginEmail');
    var passEl = $('loginPass');
    function onKey(e){
      e = e || window.event;
      var code = e.keyCode || e.which;
      if(code === 13){
        doLogin();
      }
    }
    if(emailEl) emailEl.addEventListener('keydown', onKey);
    if(passEl) passEl.addEventListener('keydown', onKey);
  }

  function showLogin(){
    // If we are already logged in, go to app
    if(!ensureFirebaseApp()) return;
    try{
      window.firebase.auth().onAuthStateChanged(function(user){
        if(user){
          toast('Schon angemeldet ✓', true);
          setTimeout(gotoApp, 200);
        }
      });
    }catch(e){}
    bindLoginHandlers();
    toast('Bitte anmelden.', true);
    window.__APP_READY = true;
  }

  function initAuth(){
    if(!ensureFirebaseApp()){
      // retry once after a short delay – helps on iOS when scripts arrive late
      setTimeout(function(){ ensureFirebaseApp(); }, 300);
      return;
    }

    if(isLoginPage()){
      showLogin();
      return;
    }

    // App page: enforce login
    try{
      window.firebase.auth().onAuthStateChanged(function(user){
        if(!user){
          toast('Nicht angemeldet → Login', false);
          setTimeout(gotoLogin, 150);
          return;
        }
        // Mark auth as ready for the loader
        window.__AUTH_READY = true;
        window.__APP_READY = true;
        toast('Auth OK ✓', true);

        // If the legacy app exposes an init hook, call it.
        var hooks = ['bootApp','initApp','appInit','DS_BOOT','DS_init','app_start'];
        for(var i=0;i<hooks.length;i++){
          var h = hooks[i];
          if(typeof window[h] === 'function'){
            try{
              window[h]();
              toast('App gestartet: '+h, true);
            }catch(e){
              toast('App‑Hook Fehler ('+h+'): ' + (e && e.message ? e.message : String(e)), false);
            }
            break;
          }
        }
      });
    }catch(e){
      toast('Auth listener Fehler: ' + (e && e.message ? e.message : String(e)), false);
    }
  }

  // ---- expose hooks for app.js loader ----
  window.showLogin = showLogin;
  window.initAuth = initAuth;
  // The loader looks for startApp as a final hook
  window.startApp = function(){
    initAuth();
  };

})();
