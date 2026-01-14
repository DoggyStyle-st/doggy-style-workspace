/* ANA037_AUTH_ES5_FIX
   ES5/ES2015-kompatibel (kein async/await, keine arrow functions).
   Erwartet Firebase compat libs:
     https://www.gstatic.com/firebasejs/9.6.11/firebase-app-compat.js
     https://www.gstatic.com/firebasejs/9.6.11/firebase-auth-compat.js
   firebase-config.js (ROOT) soll window.firebaseConfig setzen und idealerweise firebase.initializeApp(...) ausführen.

   Exportiert:
     - window.initAuth(): Guard für app.html (wenn nicht eingeloggt -> login.html)
     - window.showLogin(): Erzwungen zu login.html
     - window.doLogout(): SignOut
*/
(function(){
  'use strict';

  function $(id){ return document.getElementById(id); }

  function toast(msg, ok){
    try{
      // Wenn dein app.js Loader/Badge bereits toast() anbietet, nutzen wir das.
      if (typeof window.toast === 'function') { window.toast(msg, !!ok); return; }
    }catch(e){}
    // Fallback: kleine Statuszeile
    var el = $('authMsg');
    if (el) el.textContent = msg;
  }

  function ensureFirebase(){
    if (!window.firebase || !window.firebase.auth) {
      toast('Firebase libs fehlen (firebase-auth-compat.js?)', false);
      return false;
    }
    // Config sollte in firebase-config.js gesetzt werden
    if (!window.firebaseConfig) {
      toast('firebaseConfig fehlt (firebase-config.js nicht geladen)', false);
      return false;
    }

    // Falls firebase-config.js NICHT initialisiert hat, hier defensiv initialisieren
    try{
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(window.firebaseConfig);
      }
    }catch(e){
      // already exists / init error
    }
    return true;
  }

  function bindLoginUI(){
    var btnLogin = $('btnLogin');
    if (!btnLogin) return;

    btnLogin.addEventListener('click', function(){
      if (!ensureFirebase()) return;

      var emailEl = $('loginEmail');
      var passEl  = $('loginPass');
      var email = emailEl ? String(emailEl.value || '').trim() : '';
      var pass  = passEl ? String(passEl.value || '') : '';

      if (!email || !pass){
        toast('Bitte E-Mail + Passwort eingeben', false);
        return;
      }

      btnLogin.disabled = true;
      toast('Anmelden...', true);

      window.firebase.auth().signInWithEmailAndPassword(email, pass)
        .then(function(){
          toast('OK – weiter...', true);
          // Nach Login immer in die App
          window.location.href = 'app.html';
        })
        .catch(function(err){
          var msg = (err && err.message) ? err.message : String(err);
          toast('Login fehlgeschlagen: ' + msg, false);
        })
        .then(function(){
          btnLogin.disabled = false;
        });

    });

    var btnForgot = $('btnForgot');
    if (btnForgot){
      btnForgot.addEventListener('click', function(){
        if (!ensureFirebase()) return;
        var emailEl = $('loginEmail');
        var email = emailEl ? String(emailEl.value || '').trim() : '';
        if (!email){ toast('Bitte E-Mail eintragen', false); return; }
        window.firebase.auth().sendPasswordResetEmail(email)
          .then(function(){ toast('Reset-Mail gesendet', true); })
          .catch(function(err){
            toast('Reset fehlgeschlagen: ' + ((err&&err.message)||String(err)), false);
          });
      });
    }

    var btnRegister = $('btnRegister');
    if (btnRegister){
      btnRegister.addEventListener('click', function(){
        toast('Registrieren ist in dieser Version deaktiviert.', false);
      });
    }
  }

  function bindLogoutUI(){
    var btn = $('btnLogout') || $('btnAbmelden') || $('btnSignOut');
    if (!btn) return;
    btn.addEventListener('click', function(){
      if (!ensureFirebase()) { window.location.href='login.html'; return; }
      window.firebase.auth().signOut().then(function(){
        window.location.href='login.html';
      }).catch(function(){
        window.location.href='login.html';
      });
    });
  }

  // ---- Exports for app.html guard ----
  window.showLogin = function(){
    window.location.href = 'login.html';
  };

  window.initAuth = function(){
    if (!ensureFirebase()) return false;

    try{
      window.firebase.auth().onAuthStateChanged(function(user){
        if (!user){
          // Nicht eingeloggt -> login
          window.location.href = 'login.html';
          return;
        }
        // eingeloggt -> UI freigeben
        try{ window.__AUTH_OK = true; }catch(e){}
        bindLogoutUI();
      });
      return true;
    }catch(e){
      toast('Auth init Fehler: ' + (e && e.message ? e.message : String(e)), false);
      return false;
    }
  };

  window.doLogout = function(){
    if (!ensureFirebase()) { window.location.href='login.html'; return; }
    window.firebase.auth().signOut().then(function(){
      window.location.href='login.html';
    }).catch(function(){
      window.location.href='login.html';
    });
  };

  // Auto-bind, wenn wir auf login.html sind
  document.addEventListener('DOMContentLoaded', function(){
    // Nur binden, wenn Login-Form existiert
    if ($('btnLogin') || $('loginEmail') || $('loginPass')) {
      bindLoginUI();
    }
  });
})();
