/* ANA037_BOOTFIX auth.js (ES5)
   - Ensures Firebase is initialized (compat)
   - login.html: binds buttons and signs in / registers / reset
   - app.html: if not signed in -> go to login.html; if signed in -> call start hook
*/
(function(){
  'use strict';
  var BUILD = 'ANA037-BOOTFIX';

  function $(id){ return document.getElementById(id); }

  function toast(msg, good){
    try{
      var el = document.createElement('div');
      el.textContent = String(msg);
      el.style.position='fixed';
      el.style.left='10px';
      el.style.bottom='10px';
      el.style.zIndex='99999';
      el.style.padding='8px 10px';
      el.style.borderRadius='10px';
      el.style.fontSize='13px';
      el.style.fontFamily='system-ui, -apple-system, Segoe UI, Roboto, Arial';
      el.style.color = good ? '#0b3d0b' : '#fff';
      el.style.background = good ? 'rgba(80,220,120,.95)' : 'rgba(180,40,40,.95)';
      el.style.boxShadow='0 6px 18px rgba(0,0,0,.35)';
      document.body.appendChild(el);
      setTimeout(function(){ try{ el.remove(); }catch(e){} }, 3500);
    }catch(e){}
  }

  function ensureFirebase(cb){
    // Wait for firebase compat to exist
    var t0 = Date.now();
    (function tick(){
      if(window.firebase && window.firebase.initializeApp && window.firebase.auth){
        // Init if needed, using window.firebaseConfig (provided by firebase-config.js)
        try{
          if(!firebase.apps || !firebase.apps.length){
            if(window.firebaseConfig){
              firebase.initializeApp(window.firebaseConfig);
            }
          }
        }catch(e){}
        cb(true);
        return;
      }
      if(Date.now() - t0 > 8000){
        toast('Firebase libs nicht geladen', false);
        cb(false);
        return;
      }
      setTimeout(tick, 50);
    })();
  }

  function isLoginPage(){
    return /login\.html/i.test(location.pathname) || !!$('loginEmail') || !!$('btnLogin');
  }

  function go(url){
    try{ location.replace(url); }catch(e){ location.href=url; }
  }

  function callStartHook(){
    // Try known hooks in order
    if(typeof window.startApp === 'function'){ window.startApp(); return true; }
    if(typeof window.DS_initApp === 'function'){ window.DS_initApp(); return true; }
    if(typeof window.initApp === 'function'){ window.initApp(); return true; }
    if(typeof window.appInit === 'function'){ window.appInit(); return true; }
    return false;
  }

  function bindLoginUI(){
    var emailEl = $('loginEmail') || $('email') || $('emailInput');
    var passEl  = $('loginPass')  || $('password') || $('passInput');
    var btnLogin = $('btnLogin') || $('loginBtn') || $('btnAnmelden');
    var btnReg   = $('btnRegister') || $('registerBtn') || $('btnRegistrieren');
    var btnReset = $('btnReset') || $('resetBtn') || $('btnPassReset');
    var statusEl = $('loginStatus') || $('status') || $('loginMsg');
    var badgeEl  = $('buildBadge');
    if(badgeEl) badgeEl.textContent = 'Build ' + BUILD;

    function setStatus(msg, good){
      if(statusEl){ statusEl.textContent = msg; statusEl.style.color = good ? '#6df58a' : '#ff9a9a'; }
      toast(msg, good);
    }

    function getEmail(){ return emailEl ? String(emailEl.value||'').trim() : ''; }
    function getPass(){ return passEl ? String(passEl.value||'') : ''; }

    function onLogin(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      var email = getEmail(), pass = getPass();
      if(!email || !pass){ setStatus('Bitte E-Mail + Passwort eingeben', false); return; }
      setStatus('Anmelden...', true);
      firebase.auth().signInWithEmailAndPassword(email, pass)
        .then(function(){
          setStatus('Login OK – weiter...', true);
          go('./app.html');
        })
        .catch(function(err){
          setStatus('Login Fehler: ' + (err && err.message ? err.message : err), false);
        });
      return false;
    }

    function onRegister(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      var email = getEmail(), pass = getPass();
      if(!email || !pass){ setStatus('Bitte E-Mail + Passwort eingeben', false); return; }
      setStatus('Registrieren...', true);
      firebase.auth().createUserWithEmailAndPassword(email, pass)
        .then(function(){
          setStatus('Registrierung OK – weiter...', true);
          go('./app.html');
        })
        .catch(function(err){
          setStatus('Registrierung Fehler: ' + (err && err.message ? err.message : err), false);
        });
      return false;
    }

    function onReset(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      var email = getEmail();
      if(!email){ setStatus('Bitte E-Mail eingeben', false); return; }
      setStatus('Sende Reset-Mail...', true);
      firebase.auth().sendPasswordResetEmail(email)
        .then(function(){ setStatus('Reset-Mail gesendet', true); })
        .catch(function(err){ setStatus('Reset Fehler: ' + (err && err.message ? err.message : err), false); });
      return false;
    }

    // Bind (supports both click + submit)
    if(btnLogin) btnLogin.onclick = onLogin;
    if(btnReg) btnReg.onclick = onRegister;
    if(btnReset) btnReset.onclick = onReset;

    var form = $('loginForm');
    if(form) form.onsubmit = onLogin;

    // If already logged in, go straight to app.html
    firebase.auth().onAuthStateChanged(function(user){
      if(user){ go('./app.html'); }
    });

    setStatus('Bereit', true);
  }

  function guardApp(){
    ensureFirebase(function(ok){
      if(!ok) return;
      firebase.auth().onAuthStateChanged(function(user){
        if(!user){
          // not signed in -> login
          go('./login.html');
          return;
        }
        // signed in -> start app (no redirect loop)
        var started = callStartHook();
        if(!started){
          toast('Kein Start-Hook gefunden (startApp/initApp fehlt).', false);
        }
      });
    });
  }

  function init(){
    ensureFirebase(function(ok){
      if(!ok) return;
      if(isLoginPage()) bindLoginUI();
      else guardApp();
    });
  }

  window.__ANA037_AUTH_BUILD = BUILD;
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, false);
  } else {
    init();
  }
})();
