/* auth.js (ROOT)
   Login/Register/Reset for Safari + GitHub Pages.
   Depends on:
     - firebase-config.js (root)
     - Firebase compat libs (gstatic)
*/
(function(){
  'use strict';

  function $(id){ return document.getElementById(id); }
  function setMsg(txt, ok){
    var p = $('authMsg');
    if(!p) return;
    p.textContent = txt || '';
    p.style.color = ok ? '#8ff0a4' : '#ff7b7b';
  }

  function ensureFirebaseReady(){
    if (!window.firebaseConfig) return { ok:false, msg:"firebaseConfig fehlt (firebase-config.js nicht geladen)" };
    if (!window.firebase || !window.firebase.initializeApp) return { ok:false, msg:"Firebase SDK nicht geladen (gstatic compat)" };
    try{
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
      if (!firebase.auth) return { ok:false, msg:"firebase.auth nicht verfügbar" };
      return { ok:true };
    }catch(e){
      return { ok:false, msg:String(e && e.message || e) };
    }
  }

  function bind(){
    var emailEl = $('loginEmail');
    var passEl  = $('loginPass');
    var btnLogin = $('btnLogin');
    var btnReg   = $('btnRegister');
    var btnForgot= $('btnForgot');

    function getCred(){
      var email = (emailEl && emailEl.value || '').trim();
      var pass  = (passEl && passEl.value || '');
      return { email: email, pass: pass };
    }

    function disableAll(disabled){
      [btnLogin, btnReg, btnForgot].forEach(function(b){
        if(b) b.disabled = !!disabled;
      });
    }

    if(btnLogin) btnLogin.addEventListener('click', function(){
      var st = ensureFirebaseReady();
      if(!st.ok){ setMsg("JS FEHLER: " + st.msg, false); return; }
      var c = getCred();
      if(!c.email || !c.pass){ setMsg("Bitte E-Mail und Passwort eingeben.", false); return; }
      disableAll(true);
      setMsg("Anmelden…", true);
      firebase.auth().signInWithEmailAndPassword(c.email, c.pass)
        .then(function(){
          setMsg("OK – angemeldet.", true);
          // to main app
          window.location.href = "./app.html";
        })
        .catch(function(err){
          setMsg("Anmelden fehlgeschlagen: " + (err && err.message ? err.message : String(err)), false);
        })
        .finally(function(){ disableAll(false); });
    });

    if(btnReg) btnReg.addEventListener('click', function(){
      var st = ensureFirebaseReady();
      if(!st.ok){ setMsg("JS FEHLER: " + st.msg, false); return; }
      var c = getCred();
      if(!c.email || !c.pass){ setMsg("Bitte E-Mail und Passwort eingeben.", false); return; }
      disableAll(true);
      setMsg("Registrieren…", true);
      firebase.auth().createUserWithEmailAndPassword(c.email, c.pass)
        .then(function(){
          setMsg("OK – registriert & angemeldet.", true);
          window.location.href = "./app.html";
        })
        .catch(function(err){
          setMsg("Registrieren fehlgeschlagen: " + (err && err.message ? err.message : String(err)), false);
        })
        .finally(function(){ disableAll(false); });
    });

    if(btnForgot) btnForgot.addEventListener('click', function(){
      var st = ensureFirebaseReady();
      if(!st.ok){ setMsg("JS FEHLER: " + st.msg, false); return; }
      var c = getCred();
      if(!c.email){ setMsg("Bitte E-Mail eingeben (für Passwort-Reset).", false); return; }
      disableAll(true);
      setMsg("Reset-Mail wird gesendet…", true);
      firebase.auth().sendPasswordResetEmail(c.email)
        .then(function(){
          setMsg("OK – Reset-Mail gesendet.", true);
        })
        .catch(function(err){
          setMsg("Reset fehlgeschlagen: " + (err && err.message ? err.message : String(err)), false);
        })
        .finally(function(){ disableAll(false); });
    });

    // Auto-redirect if already logged in
    try{
      var st = ensureFirebaseReady();
      if(st.ok){
        firebase.auth().onAuthStateChanged(function(user){
          if(user) window.location.href = "./app.html";
        });
      } else {
        setMsg("JS FEHLER: " + st.msg, false);
      }
    }catch(e){
      setMsg("JS FEHLER: " + (e && e.message ? e.message : String(e)), false);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
