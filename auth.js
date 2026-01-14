/* ANA037 AUTH - Option A (stabil, ohne App.js anzufassen)
   - bietet window.initAuth() + window.showLogin() (damit Legacy-Aufrufer nicht crashen)
   - Login-Seite: Klick-Handler sauber (type=button, preventDefault), Redirect NUR wenn user wirklich eingeloggt ist
   - App-Seite: wenn nicht eingeloggt -> login.html (mit return)
*/
(function(){
  'use strict';

  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }
  function qs(id){ return document.getElementById(id); }

  function setStatus(txt, ok){
    var el = qs('status');
    if(!el) return;
    el.textContent = txt;
    el.className = 'status ' + (ok ? 'ok' : 'err');
  }

  function isFirebaseReady(){
    try{ return !!(window.firebase && firebase.auth && firebase.auth()); }catch(e){ return false; }
  }

  function waitFirebase(cb){
    var tries = 0;
    (function tick(){
      tries++;
      if(isFirebaseReady()) return cb();
      if(tries > 200) { setStatus('Firebase nicht bereit (Timeout).', false); return; }
      setTimeout(tick, 50);
    })();
  }

  function safeRedirect(url){
    try{
      // Avoid endless redirect loops on iOS cache glitches
      if(location.href.indexOf(url) !== -1) return;
    }catch(e){}
    location.href = url;
  }

  function onLoginPage(){
    return /login\.html/i.test(location.pathname) || /login/i.test(location.href);
  }

  function bindLoginHandlers(){
    var emailEl = qs('email');
    var passEl  = qs('password');
    var btnLogin = qs('btnLogin');
    var btnReg   = qs('btnRegister');
    var btnReset = qs('btnReset');

    function valEmail(){ return (emailEl && emailEl.value || '').trim(); }
    function valPass(){ return (passEl && passEl.value || ''); }

    function disable(v){
      if(btnLogin) btnLogin.disabled = v;
      if(btnReg) btnReg.disabled = v;
      if(btnReset) btnReset.disabled = v;
    }

    function doLogin(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      waitFirebase(function(){
        var email = valEmail();
        var pass  = valPass();
        if(!email || !pass){ setStatus('Bitte E‑Mail & Passwort eingeben.', false); return; }
        disable(true);
        setStatus('Login…', true);
        firebase.auth().signInWithEmailAndPassword(email, pass)
          .then(function(){
            setStatus('Login OK – weiter…', true);
            // Redirect is done by onAuthStateChanged below (more stable on iOS)
          })
          .catch(function(err){
            setStatus('Login fehlgeschlagen: ' + (err && err.message ? err.message : err), false);
            disable(false);
          });
      });
    }

    function doRegister(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      waitFirebase(function(){
        var email = valEmail();
        var pass  = valPass();
        if(!email || !pass){ setStatus('Bitte E‑Mail & Passwort eingeben.', false); return; }
        disable(true);
        setStatus('Registrieren…', true);
        firebase.auth().createUserWithEmailAndPassword(email, pass)
          .then(function(){
            setStatus('Registriert – weiter…', true);
          })
          .catch(function(err){
            setStatus('Registrieren fehlgeschlagen: ' + (err && err.message ? err.message : err), false);
            disable(false);
          });
      });
    }

    function doReset(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      waitFirebase(function(){
        var email = valEmail();
        if(!email){ setStatus('Bitte E‑Mail eingeben.', false); return; }
        disable(true);
        setStatus('Sende Reset‑Mail…', true);
        firebase.auth().sendPasswordResetEmail(email)
          .then(function(){ setStatus('Reset‑Mail gesendet.', true); disable(false); })
          .catch(function(err){
            setStatus('Reset fehlgeschlagen: ' + (err && err.message ? err.message : err), false);
            disable(false);
          });
      });
    }

    if(btnLogin){ btnLogin.addEventListener('click', doLogin, false); }
    if(btnReg){ btnReg.addEventListener('click', doRegister, false); }
    if(btnReset){ btnReset.addEventListener('click', doReset, false); }

    // Enter = Login
    if(passEl){
      passEl.addEventListener('keydown', function(e){
        var k = e && (e.key || e.keyCode);
        if(k === 'Enter' || k === 13) doLogin(e);
      }, false);
    }
  }

  function setupAuthRedirects(mode){
    waitFirebase(function(){
      firebase.auth().onAuthStateChanged(function(user){
        if(onLoginPage()){
          if(user){
            // If a return target exists, honor it, else go to app.html
            var ret = '';
            try{
              ret = (new URL(location.href)).searchParams.get('return') || '';
            }catch(e){}
            safeRedirect(ret || 'app.html');
          }else{
            // stay on login
          }
        }else{
          // app.html or other protected pages
          if(!user){
            var returnTo = '';
            try{ returnTo = location.pathname.split('/').pop() || 'app.html'; }catch(e){ returnTo='app.html'; }
            safeRedirect('login.html?return=' + encodeURIComponent(returnTo));
          }else{
            // logged in -> let app boot
            try{ if(window.__ds_onAuthed) window.__ds_onAuthed(user); }catch(e){}
          }
        }
      });
      if(mode === 'login'){ bindLoginHandlers(); }
    });
  }

  // Public API (legacy compatibility)
  window.showLogin = function(){
    safeRedirect('login.html?return=' + encodeURIComponent('app.html'));
  };

  window.initAuth = function(opts){
    opts = opts || {};
    setupAuthRedirects(opts.mode || (onLoginPage() ? 'login' : 'app'));
  };

  // Auto-init
  try{
    // If login page: init now; if app page: init now as well
    window.initAuth({ mode: onLoginPage() ? 'login' : 'app' });
  }catch(e){
    log('[auth] init error', e);
  }
})();
