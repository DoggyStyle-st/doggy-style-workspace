/* ANA037_AUTH_ES5_HOOK
   ES5/ES2015-safe Auth layer for Safari/PWA.
   Exposes:
     - window.initAuth(mode)
     - window.showLogin()
     - window.doLogout()

   Modes:
     initAuth('app')   -> ensures signed-in, otherwise redirects to ./login.html
     initAuth('login') -> wires login UI, redirects to ./app.html on success
*/
(function(){
  'use strict';

  function byId(id){ return document.getElementById(id); }

  function toast(text, ok){
    try{
      if (typeof window.toast === 'function') return window.toast(text, !!ok);
    }catch(e){}
    // fallback (small bottom-left chip)
    var id = 'ds_auth_toast';
    var el = document.getElementById(id);
    if(!el){
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.left = '12px';
      el.style.bottom = '44px';
      el.style.zIndex = '99999';
      el.style.padding = '6px 10px';
      el.style.borderRadius = '999px';
      el.style.background = 'rgba(0,0,0,.55)';
      el.style.border = '1px solid rgba(255,255,255,.18)';
      el.style.font = '12px/1.2 -apple-system,BlinkMacSystemFont,system-ui,Segoe UI,Roboto,Arial';
      el.style.color = '#fff';
      el.style.backdropFilter = 'blur(8px)';
      document.body.appendChild(el);
    }
    el.textContent = String(text || '');
    el.style.background = ok ? 'rgba(0,120,0,.55)' : 'rgba(120,0,0,.55)';
  }

  function ensureFirebaseInit(){
    if(!window.firebaseConfig){
      toast('Auth: firebaseConfig fehlt', false);
      return null;
    }
    if(!window.firebase || !window.firebase.initializeApp){
      toast('Auth: Firebase libs fehlen', false);
      return null;
    }
    try{
      if(!window.firebase.apps || !window.firebase.apps.length){
        window.firebase.initializeApp(window.firebaseConfig);
      }
    }catch(e){
      // ignore "already exists" and similar
    }
    return window.firebase;
  }

  function redirectTo(path){
    try{
      var here = window.location.pathname || '';
      if(here.indexOf(path) !== -1) return;
      window.location.replace(path);
    }catch(e){
      window.location.href = path;
    }
  }

  function showLogin(){
    redirectTo('./login.html');
  }

  function doLogout(){
    var fb = ensureFirebaseInit();
    if(!fb) return;
    try{
      fb.auth().signOut().then(function(){
        toast('Abgemeldet', true);
        showLogin();
      }).catch(function(err){
        toast('Logout Fehler: ' + (err && err.message ? err.message : String(err)), false);
        showLogin();
      });
    }catch(e){
      toast('Logout Fehler: ' + String(e), false);
      showLogin();
    }
  }

  function wireLoginUI(){
    var btnLogin = byId('btnLogin');
    var btnRegister = byId('btnRegister');
    var btnForgot = byId('btnForgot');
    var emailEl = byId('loginEmail');
    var passEl = byId('loginPass');
    var msgEl = byId('authMsg');

    function setMsg(t, ok){
      if(msgEl) msgEl.textContent = t || '';
      toast(t, ok);
    }

    function getEmail(){ return emailEl ? String(emailEl.value || '').trim() : ''; }
    function getPass(){ return passEl ? String(passEl.value || '') : ''; }

    function disable(dis){
      if(btnLogin) btnLogin.disabled = !!dis;
      if(btnRegister) btnRegister.disabled = !!dis;
      if(btnForgot) btnForgot.disabled = !!dis;
    }

    function login(){
      var fb = ensureFirebaseInit();
      if(!fb) return;
      var email = getEmail();
      var pass = getPass();
      if(!email || !pass){ setMsg('Bitte E-Mail und Passwort eingeben.', false); return; }
      disable(true);
      setMsg('Anmeldung läuft…', true);
      fb.auth().signInWithEmailAndPassword(email, pass).then(function(){
        setMsg('Angemeldet – lade App…', true);
        redirectTo('./app.html');
      }).catch(function(err){
        disable(false);
        setMsg('Login fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), false);
      });
    }

    function register(){
      var fb = ensureFirebaseInit();
      if(!fb) return;
      var email = getEmail();
      var pass = getPass();
      if(!email || !pass){ setMsg('Bitte E-Mail und Passwort eingeben.', false); return; }
      disable(true);
      setMsg('Registrierung läuft…', true);
      fb.auth().createUserWithEmailAndPassword(email, pass).then(function(){
        setMsg('Registriert – lade App…', true);
        redirectTo('./app.html');
      }).catch(function(err){
        disable(false);
        setMsg('Registrierung fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), false);
      });
    }

    function forgot(){
      var fb = ensureFirebaseInit();
      if(!fb) return;
      var email = getEmail();
      if(!email){ setMsg('Bitte E-Mail eingeben.', false); return; }
      disable(true);
      setMsg('Sende Mail…', true);
      fb.auth().sendPasswordResetEmail(email).then(function(){
        disable(false);
        setMsg('Reset-Mail gesendet (wenn Konto existiert).', true);
      }).catch(function(err){
        disable(false);
        setMsg('Reset fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), false);
      });
    }

    if(btnLogin) btnLogin.addEventListener('click', function(ev){ if(ev) ev.preventDefault(); login(); });
    if(btnRegister) btnRegister.addEventListener('click', function(ev){ if(ev) ev.preventDefault(); register(); });
    if(btnForgot) btnForgot.addEventListener('click', function(ev){ if(ev) ev.preventDefault(); forgot(); });

    if(passEl){
      passEl.addEventListener('keydown', function(ev){
        ev = ev || window.event;
        if(ev && (ev.key === 'Enter' || ev.keyCode === 13)){
          try{ ev.preventDefault(); }catch(e){}
          login();
        }
      });
    }
  }

  function initAuth(mode){
    var fb = ensureFirebaseInit();
    if(!fb) return false;

    // expose auth instance for legacy code
    try{ window.__AUTH = fb.auth(); }catch(e){}

    // Watch auth state once.
    try{
      fb.auth().onAuthStateChanged(function(user){
        window.__AUTH_USER = user || null;
        // If app-mode and signed out -> to login
        if(mode === 'app'){
          if(!user){
            toast('Bitte anmelden…', false);
            // small delay so toast is visible
            setTimeout(function(){ showLogin(); }, 150);
          }
        }
      });
    }catch(e){
      toast('Auth State Fehler: ' + String(e), false);
    }

    if(mode === 'login'){
      // If already signed in -> jump directly to app
      try{
        var u = fb.auth().currentUser;
        if(u){ redirectTo('./app.html'); return true; }
      }catch(e){}
      wireLoginUI();
      return true;
    }

    if(mode === 'app'){
      // If already signed in -> allow app bootstrap
      try{
        var u2 = fb.auth().currentUser;
        if(u2){ toast('Auth OK', true); return true; }
      }catch(e){}
      // no currentUser yet -> onAuthStateChanged will redirect if needed
      return true;
    }

    // default: decide by presence of login form
    if(byId('btnLogin') || byId('loginEmail') || byId('loginPass')){
      return initAuth('login');
    }
    return initAuth('app');
  }

  window.initAuth = initAuth;
  window.showLogin = showLogin;
  window.doLogout = doLogout;
})();
