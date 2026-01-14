/* ANA037_AUTH_HOTFIX_ES5
   Zweck: Safari/iOS stabiler Login (ES5), stellt globale Hooks bereit:
   - window.initAuth()
   - window.showLogin()
   - window.signOut()
   - window.isLoggedIn(cb)
   Erwartet: firebase-config.js im ROOT + Firebase compat libs (9.6.11).
*/
(function () {
  'use strict';

  var BUILD = 'ANA037_AUTH_HOTFIX_ES5_01';

  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }

  function toast(msg, ok){
    try{
      var id='ds_toast';
      var el=document.getElementById(id);
      if(!el){
        el=document.createElement('div');
        el.id=id;
        el.style.cssText=[
          'position:fixed','left:12px','bottom:12px','z-index:99999',
          'padding:8px 12px','border-radius:12px',
          'background:rgba(0,0,0,.55)','border:1px solid rgba(255,255,255,.18)',
          'font:12px/1.25 -apple-system,BlinkMacSystemFont,system-ui,Segoe UI,Roboto,Arial',
          'color:#fff','backdrop-filter:blur(8px)','max-width:80vw'
        ].join(';');
        document.body.appendChild(el);
      }
      el.textContent=msg;
      el.style.background = ok ? 'rgba(0,120,0,.55)' : 'rgba(120,0,0,.55)';
    }catch(e){}
  }

  function ensureFirebaseInit(){
    if(!window.firebase){
      toast('Firebase SDK fehlt (libs nicht geladen).', false);
      return false;
    }
    if(!window.firebaseConfig){
      toast('firebaseConfig fehlt (firebase-config.js nicht geladen).', false);
      return false;
    }
    try{
      if(!firebase.apps || !firebase.apps.length){
        firebase.initializeApp(window.firebaseConfig);
        log('[auth]', 'firebase initialized');
      }
      return true;
    }catch(e){
      toast('Firebase init Fehler: '+ (e && e.message ? e.message : String(e)), false);
      return false;
    }
  }

  function qs(sel){ return document.querySelector(sel); }
  function byId(id){ return document.getElementById(id); }

  function wireLoginUI(){
    var btnLogin = byId('btnLogin');
    var btnRegister = byId('btnRegister');
    var btnForgot = byId('btnForgot');
    var emailEl = byId('loginEmail');
    var passEl = byId('loginPass');
    var msgEl  = byId('authMsg');

    function setMsg(t, ok){
      if(msgEl){ msgEl.textContent = t || ''; msgEl.style.color = ok ? '#dfffe0' : '#ffd0d0'; }
      toast(t, ok);
    }

    function getCreds(){
      var email = emailEl ? (emailEl.value||'').trim() : '';
      var pass  = passEl ? (passEl.value||'') : '';
      return { email: email, pass: pass };
    }

    function doLogin(){
      if(!ensureFirebaseInit()) return;
      var c = getCreds();
      if(!c.email || !c.pass){
        setMsg('Bitte E-Mail und Passwort eingeben.', false);
        return;
      }
      setMsg('Anmelden…', true);
      try{
        firebase.auth().signInWithEmailAndPassword(c.email, c.pass)
          .then(function(){
            setMsg('Erfolgreich angemeldet.', true);
            // Zur App
            try{ window.location.href = './app.html'; }catch(e){}
          })
          .catch(function(err){
            setMsg('Login fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), false);
          });
      }catch(e){
        setMsg('Login Exception: ' + (e && e.message ? e.message : String(e)), false);
      }
    }

    function doRegister(){
      if(!ensureFirebaseInit()) return;
      var c = getCreds();
      if(!c.email || !c.pass){
        setMsg('Bitte E-Mail und Passwort eingeben.', false);
        return;
      }
      setMsg('Registrieren…', true);
      try{
        firebase.auth().createUserWithEmailAndPassword(c.email, c.pass)
          .then(function(){
            setMsg('Registrierung ok. Du bist angemeldet.', true);
            try{ window.location.href = './app.html'; }catch(e){}
          })
          .catch(function(err){
            setMsg('Registrierung fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), false);
          });
      }catch(e){
        setMsg('Register Exception: ' + (e && e.message ? e.message : String(e)), false);
      }
    }

    function doForgot(){
      if(!ensureFirebaseInit()) return;
      var c = getCreds();
      if(!c.email){
        setMsg('Bitte E-Mail eingeben.', false);
        return;
      }
      setMsg('Sende Reset-Mail…', true);
      try{
        firebase.auth().sendPasswordResetEmail(c.email)
          .then(function(){ setMsg('Reset-Mail gesendet.', true); })
          .catch(function(err){ setMsg('Reset fehlgeschlagen: '+ (err && err.message ? err.message : String(err)), false); });
      }catch(e){
        setMsg('Reset Exception: '+ (e && e.message ? e.message : String(e)), false);
      }
    }

    if(btnLogin){
      btnLogin.onclick = function(ev){ if(ev && ev.preventDefault) ev.preventDefault(); doLogin(); return false; };
    }
    if(btnRegister){
      btnRegister.onclick = function(ev){ if(ev && ev.preventDefault) ev.preventDefault(); doRegister(); return false; };
    }
    if(btnForgot){
      btnForgot.onclick = function(ev){ if(ev && ev.preventDefault) ev.preventDefault(); doForgot(); return false; };
    }

    // Enter = login
    function onKey(ev){
      ev = ev || window.event;
      if(ev && ev.keyCode === 13){ doLogin(); }
    }
    if(emailEl) emailEl.onkeydown = onKey;
    if(passEl) passEl.onkeydown  = onKey;

    setMsg('Login bereit. ('+BUILD+')', true);
  }

  function redirectToLogin(){
    try{ window.location.href = './login.html'; }catch(e){}
  }

  function initAuth(opts){
    opts = opts || {};
    var page = opts.page || '';
    // if called before DOM is ready, delay
    if(document.readyState !== 'complete' && document.readyState !== 'interactive'){
      document.addEventListener('DOMContentLoaded', function(){ initAuth(opts); });
      return;
    }

    if(!ensureFirebaseInit()) return;

    try{
      firebase.auth().onAuthStateChanged(function(user){
        if(page === 'login'){
          // On login page: if already logged in -> app
          if(user){
            toast('Schon angemeldet → App…', true);
            try{ window.location.href = './app.html'; }catch(e){}
          }else{
            wireLoginUI();
          }
          return;
        }

        // On app page: if not logged in -> login
        if(!user){
          toast('Nicht angemeldet → Login…', false);
          redirectToLogin();
          return;
        }

        // Logged in: expose user
        window.__dsUser = user;
        toast('Angemeldet: ' + (user.email || user.uid), true);
      });
    }catch(e){
      toast('Auth watcher Fehler: '+ (e && e.message ? e.message : String(e)), false);
    }
  }

  function showLogin(){
    redirectToLogin();
  }

  function signOut(){
    if(!ensureFirebaseInit()) return;
    try{
      firebase.auth().signOut().then(function(){
        toast('Abgemeldet.', true);
        redirectToLogin();
      }).catch(function(err){
        toast('Logout fehlgeschlagen: '+ (err && err.message ? err.message : String(err)), false);
      });
    }catch(e){
      toast('Logout Exception: '+ (e && e.message ? e.message : String(e)), false);
    }
  }

  function isLoggedIn(cb){
    cb = cb || function(){};
    if(!ensureFirebaseInit()){ cb(false); return; }
    try{
      var u = firebase.auth().currentUser;
      cb(!!u, u || null);
    }catch(e){
      cb(false, null);
    }
  }

  // Expose global hooks expected by loader
  window.initAuth = initAuth;
  window.showLogin = showLogin;
  window.signOut = signOut;
  window.isLoggedIn = isLoggedIn;
  window.__AUTH_BUILD = BUILD;

})();
