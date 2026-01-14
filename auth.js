/* auth.js – Minimal, Safari-safe, Firebase compat
   Exposes window.initAuth() and window.showLogin().
*/
(function () {
  'use strict';

  function $(id){ return document.getElementById(id); }

  function setMsg(txt, ok){
    var el = $('authMsg');
    if(!el) return;
    el.textContent = txt || '';
    el.style.color = ok ? '#b9ffb9' : '#ffb9b9';
  }

  function ensureFirebase(){
    if(!window.firebase){ throw new Error('firebase global fehlt (compat scripts nicht geladen)'); }
    if(!window.firebaseConfig){ throw new Error('firebaseConfig fehlt (firebase-config.js nicht geladen)'); }
    try{
      if(!firebase.apps || !firebase.apps.length){
        firebase.initializeApp(window.firebaseConfig);
      }
    }catch(e){
      // ignore "already exists"
    }
  }

  function wireButtons(){
    var btnLogin = $('btnLogin');
    var btnRegister = $('btnRegister');
    var btnForgot = $('btnForgot');

    if(btnLogin){
      btnLogin.addEventListener('click', function(){
        doLogin();
      });
    }
    if(btnRegister){
      btnRegister.addEventListener('click', function(){
        doRegister();
      });
    }
    if(btnForgot){
      btnForgot.addEventListener('click', function(){
        doForgot();
      });
    }
  }

  function doLogin(){
    try{
      ensureFirebase();
      var email = ($('loginEmail')||{}).value || '';
      var pass  = ($('loginPass')||{}).value || '';
      setMsg('Anmelden…', true);
      firebase.auth().signInWithEmailAndPassword(email.trim(), pass)
        .then(function(){
          setMsg('Login OK. Lade Workspace…', true);
          // redirect to app.html after login
          setTimeout(function(){ window.location.href = './app.html'; }, 250);
        })
        .catch(function(err){
          setMsg('Login fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), false);
        });
    }catch(e){
      setMsg('Login nicht möglich: ' + (e && e.message ? e.message : String(e)), false);
    }
  }

  function doRegister(){
    try{
      ensureFirebase();
      var email = ($('loginEmail')||{}).value || '';
      var pass  = ($('loginPass')||{}).value || '';
      if(pass.length < 6){
        setMsg('Passwort muss mindestens 6 Zeichen haben.', false);
        return;
      }
      setMsg('Registrieren…', true);
      firebase.auth().createUserWithEmailAndPassword(email.trim(), pass)
        .then(function(){
          setMsg('Registrierung OK. Du bist eingeloggt.', true);
          setTimeout(function(){ window.location.href = './app.html'; }, 250);
        })
        .catch(function(err){
          setMsg('Registrierung fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), false);
        });
    }catch(e){
      setMsg('Registrierung nicht möglich: ' + (e && e.message ? e.message : String(e)), false);
    }
  }

  function doForgot(){
    try{
      ensureFirebase();
      var email = ($('loginEmail')||{}).value || '';
      if(!email){
        setMsg('Bitte E‑Mail eintragen, dann Passwort-Reset.', false);
        return;
      }
      setMsg('Sende Reset-Mail…', true);
      firebase.auth().sendPasswordResetEmail(email.trim())
        .then(function(){ setMsg('Reset-Mail gesendet.', true); })
        .catch(function(err){
          setMsg('Reset fehlgeschlagen: ' + (err && err.message ? err.message : String(err)), false);
        });
    }catch(e){
      setMsg('Reset nicht möglich: ' + (e && e.message ? e.message : String(e)), false);
    }
  }

  function showLogin(){
    // login.html is already the login UI; this is a no-op but keeps compatibility.
    wireButtons();
  }

  function initAuth(){
    ensureFirebase();
    wireButtons();

    // If already logged in, jump to app.html
    firebase.auth().onAuthStateChanged(function(user){
      if(user){
        setMsg('Bereits eingeloggt. Lade Workspace…', true);
        setTimeout(function(){ window.location.href = './app.html'; }, 150);
      }else{
        setMsg('', true);
      }
    });
  }

  window.showLogin = showLogin;
  window.initAuth = initAuth;

})();
