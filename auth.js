/* ANA037 AUTH (ES5, ROOT)
   Provides global hooks: initAuth(), showLogin(), doLogin().
   Works on Safari/iPad, GitHub Pages, Firebase compat (9.x / 10.x).
*/
(function(){
  'use strict';

  // --- tiny log helpers (no console crashes) ---
  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }
  function warn(){ try{ console.warn.apply(console, arguments); }catch(e){} }

  // --- UI message helper (optional) ---
  function setMsg(id, txt, ok){
    try{
      var el = document.getElementById(id);
      if(!el) return;
      el.textContent = txt || '';
      el.style.color = ok ? '#7CFF7C' : '#FF7C7C';
    }catch(e){}
  }

  // --- wait until firebase compat libs are present ---
  function waitForFirebase(cb){
    var tries = 0;
    var t = setInterval(function(){
      tries++;
      var ok = !!(window.firebase && window.firebase.initializeApp && window.firebase.auth);
      if(ok){
        clearInterval(t);
        cb(true);
        return;
      }
      if(tries > 200){ // ~20s
        clearInterval(t);
        cb(false);
      }
    }, 100);
  }

  function ensureFirebaseInit(){
    try{
      if(window.firebase && window.firebase.apps && window.firebase.apps.length){
        return true;
      }
      if(!window.firebase || !window.firebase.initializeApp){
        return false;
      }
      if(!window.firebaseConfig){
        // firebase-config.js should set window.firebaseConfig
        warn('[auth] firebaseConfig missing');
        return false;
      }
      window.firebase.initializeApp(window.firebaseConfig);
      log('[auth] firebase initialized');
      return true;
    }catch(e){
      warn('[auth] init error', e);
      return false;
    }
  }

  function pageName(){
    var p = (location.pathname || '').toLowerCase();
    if(p.indexOf('login.html') !== -1) return 'login';
    if(p.indexOf('app.html') !== -1) return 'app';
    return 'other';
  }

  function gotoLogin(){
    // Preserve target so we can return after login
    try{
      var next = encodeURIComponent('app.html');
      location.replace('login.html?next='+next);
    }catch(e){
      location.href='login.html';
    }
  }

  function gotoApp(){
    try{
      var url = new URL(location.href);
      var next = url.searchParams.get('next');
      if(next){ location.replace(next); return; }
    }catch(e){}
    location.replace('app.html');
  }

  function bindLoginForm(){
    var btn = document.getElementById('btnLogin') || document.getElementById('loginBtn') || document.querySelector('button[type="submit"]');
    var emailEl = document.getElementById('loginEmail') || document.getElementById('email') || document.querySelector('input[type="email"]');
    var passEl  = document.getElementById('loginPass')  || document.getElementById('password') || document.querySelector('input[type="password"]');
    var msgId   = 'authMsg';

    if(!btn || !emailEl || !passEl){
      // Some builds use different ids; don't hard-fail.
      warn('[auth] login form elements missing', {btn:!!btn, email:!!emailEl, pass:!!passEl});
    }

    function doLogin(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      var email = (emailEl && emailEl.value || '').trim();
      var pass  = (passEl && passEl.value || '');
      if(!email || !pass){
        setMsg(msgId, 'Bitte E‑Mail und Passwort eingeben.', false);
        return;
      }
      setMsg(msgId, 'Anmeldung…', true);

      try{
        var auth = window.firebase.auth();
        auth.signInWithEmailAndPassword(email, pass)
          .then(function(){
            setMsg(msgId, 'Login OK – weiter…', true);
            // onAuthStateChanged will redirect; but do a small fallback:
            setTimeout(function(){ gotoApp(); }, 250);
          })
          .catch(function(err){
            setMsg(msgId, (err && err.message) ? err.message : 'Login fehlgeschlagen', false);
          });
      }catch(e){
        setMsg(msgId, 'Login-Fehler: ' + (e && e.message ? e.message : String(e)), false);
      }
    }

    // make available for legacy hooks
    window.doLogin = doLogin;

    if(btn){
      btn.addEventListener('click', doLogin, false);
      // iOS Safari sometimes needs touchstart
      btn.addEventListener('touchstart', function(){}, false);
    }
    if(passEl){
      passEl.addEventListener('keydown', function(ev){
        var k = ev && (ev.key || ev.keyCode);
        if(k === 'Enter' || k === 13){
          doLogin(ev);
        }
      }, false);
    }
  }

  function initAuth(){
    // This is the requested global hook.
    // It sets up auth-state routing for login/app pages.
    waitForFirebase(function(ok){
      if(!ok){
        setMsg('authMsg', 'Firebase nicht bereit (libs fehlen)', false);
        return;
      }
      if(!ensureFirebaseInit()){
        setMsg('authMsg', 'Firebase Config fehlt/Init fehlgeschlagen', false);
        return;
      }

      var where = pageName();
      try{
        var auth = window.firebase.auth();
        auth.onAuthStateChanged(function(user){
          // expose user
          window.__AUTH_USER = user || null;

          if(where === 'login'){
            if(user){
              // Already logged in -> go to app
              gotoApp();
            }else{
              bindLoginForm();
              setMsg('authMsg', 'Bereit', true);
            }
          }else if(where === 'app'){
            if(!user){
              gotoLogin();
            }else{
              // Auth ok: start app if there is a hook
              try{
                if(typeof window.startApp === 'function'){
                  window.startApp();
                }
              }catch(e){}
            }
          }
        }, function(err){
          setMsg('authMsg', (err && err.message) ? err.message : 'Auth Fehler', false);
        });
      }catch(e){
        setMsg('authMsg', 'Auth init error: ' + (e && e.message ? e.message : String(e)), false);
      }
    });
  }

  function showLogin(){
    gotoLogin();
  }

  // Export globals (legacy)
  window.initAuth = initAuth;
  window.showLogin = showLogin;

  // Auto-run on both pages (safe)
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ try{ initAuth(); }catch(e){} }, false);
  }else{
    try{ initAuth(); }catch(e){}
  }
})();
