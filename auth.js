/* auth.js — ANA037 LOGIN FINAL (Root)
   - ES5/Safari-safe (kein async/await, keine optional chaining)
   - Erwartet Firebase Compat SDK als <script> (global "firebase")
   - Erwartet firebase-config.js im Root und dass es window.firebaseConfig ODER window.FIREBASE_CONFIG setzt
   - Stellt showLogin() bereit und setzt window.startApp() als finalen Boot-Hook
*/
(function () {
  'use strict';

  var BUILD = 'v11-LOGIN-FINAL';

  // ---------- Helpers ----------
  function $(id) { return document.getElementById(id); }

  function setText(id, txt) {
    var el = $(id);
    if (el) el.textContent = (txt == null ? '' : String(txt));
  }

  function setHtml(id, html) {
    var el = $(id);
    if (el) el.innerHTML = (html == null ? '' : String(html));
  }

  function showEl(id) {
    var el = $(id);
    if (el) el.style.display = '';
  }

  function hideEl(id) {
    var el = $(id);
    if (el) el.style.display = 'none';
  }

  function disableBtn(id, disabled) {
    var b = $(id);
    if (b) b.disabled = !!disabled;
  }

  function msg(text, isError) {
    // Nutzt <p id="authMsg">
    var el = $('authMsg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#ff6b6b' : '#b9ffb9';
  }

  function safeStr(x) {
    if (x == null) return '';
    return String(x);
  }

  function normalizeError(err) {
    if (!err) return 'Unbekannter Fehler';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    try { return JSON.stringify(err); } catch (e) { return String(err); }
  }

  // ---------- Firebase init ----------
  function getFirebaseConfig() {
    // Unterstützt mehrere Varianten aus deinen bisherigen Patches
    if (window.firebaseConfig && typeof window.firebaseConfig === 'object') return window.firebaseConfig;
    if (window.FIREBASE_CONFIG && typeof window.FIREBASE_CONFIG === 'object') return window.FIREBASE_CONFIG;
    if (window.__firebaseConfig && typeof window.__firebaseConfig === 'object') return window.__firebaseConfig;
    return null;
  }

  function ensureFirebaseReady() {
    if (!window.firebase) {
      throw new Error('Firebase SDK fehlt (firebase nicht geladen). Prüfe login.html Script-Tags.');
    }
    var cfg = getFirebaseConfig();
    if (!cfg) {
      throw new Error('firebaseConfig fehlt (firebase-config.js nicht geladen oder Variable nicht gesetzt).');
    }

    // Compat: firebase.initializeApp()
    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(cfg);
      }
    } catch (e) {
      // falls doppelt initialisiert
      // ignore, wenn schon existiert
    }

    return true;
  }

  // ---------- UI states ----------
  function wireButtons() {
    var btnLogin = $('btnLogin');
    var btnRegister = $('btnRegister');
    var btnForgot = $('btnForgot');

    if (btnLogin && !btnLogin.__wired) {
      btnLogin.__wired = true;
      btnLogin.addEventListener('click', onLogin);
    }
    if (btnRegister && !btnRegister.__wired) {
      btnRegister.__wired = true;
      btnRegister.addEventListener('click', onRegister);
    }
    if (btnForgot && !btnForgot.__wired) {
      btnForgot.__wired = true;
      btnForgot.addEventListener('click', onForgot);
    }
  }

  function showLogin() {
    // Login-Panel sichtbar machen
    showEl('loginPanel');
    hideEl('appRoot'); // falls du später ein App-Root nutzt

    // Build Badge setzen (falls vorhanden)
    setText('buildBadge', 'Build ' + BUILD);

    wireButtons();
    msg('', false);

    // Fokus ins E-Mail Feld
    var em = $('loginEmail');
    if (em) {
      try { em.focus(); } catch (e) {}
    }
  }

  function showAppAfterLogin(user) {
    // Optional: hier würdest du ins Dashboard weiterleiten
    // Minimal: auf app.html springen, falls du getrennte Seiten hast
    // Wenn du Login und App in EINER Seite hast, kannst du hier appRoot einblenden.
    // Wir halten’s stabil und einfach:

    msg('Angemeldet: ' + (user && user.email ? user.email : ''), false);

    // Wenn du getrennte Seiten nutzt:
    // - login.html => app.html
    // (Du kannst das ändern, wenn du lieber in-page weiter machst.)
    setTimeout(function () {
      // nur wenn app.html existiert
      try { window.location.href = 'app.html'; } catch (e) {}
    }, 250);
  }

  // ---------- Auth actions ----------
  function readCredentials() {
    var email = safeStr($('loginEmail') && $('loginEmail').value).trim();
    var pass = safeStr($('loginPass') && $('loginPass').value);
    return { email: email, pass: pass };
  }

  function onLogin() {
    msg('', false);
    disableBtn('btnLogin', true);
    disableBtn('btnRegister', true);
    disableBtn('btnForgot', true);

    try {
      ensureFirebaseReady();
    } catch (e) {
      msg(normalizeError(e), true);
      disableBtn('btnLogin', false);
      disableBtn('btnRegister', false);
      disableBtn('btnForgot', false);
      return;
    }

    var creds = readCredentials();
    if (!creds.email || !creds.pass) {
      msg('Bitte E-Mail und Passwort eingeben.', true);
      disableBtn('btnLogin', false);
      disableBtn('btnRegister', false);
      disableBtn('btnForgot', false);
      return;
    }

    // Firebase Auth compat
    firebase.auth().signInWithEmailAndPassword(creds.email, creds.pass)
      .then(function (res) {
        disableBtn('btnLogin', false);
        disableBtn('btnRegister', false);
        disableBtn('btnForgot', false);
        showAppAfterLogin(res && res.user ? res.user : null);
      })
      .catch(function (err) {
        msg('Anmelden fehlgeschlagen: ' + normalizeError(err), true);
        disableBtn('btnLogin', false);
        disableBtn('btnRegister', false);
        disableBtn('btnForgot', false);
      });
  }

  function onRegister() {
    msg('', false);

    var nameField = $('regName');
    var wantsName = !!nameField;

    var creds = readCredentials();
    if (!creds.email || !creds.pass) {
      msg('Bitte E-Mail und Passwort eingeben.', true);
      return;
    }

    try {
      ensureFirebaseReady();
    } catch (e) {
      msg(normalizeError(e), true);
      return;
    }

    disableBtn('btnLogin', true);
    disableBtn('btnRegister', true);
    disableBtn('btnForgot', true);

    firebase.auth().createUserWithEmailAndPassword(creds.email, creds.pass)
      .then(function (res) {
        // Optional displayName setzen
        var user = res && res.user ? res.user : null;
        var regName = wantsName ? safeStr(nameField.value).trim() : '';
        if (user && regName) {
          return user.updateProfile({ displayName: regName }).then(function () {
            return res;
          });
        }
        return res;
      })
      .then(function (res2) {
        msg('Registrierung erfolgreich. Du bist jetzt angemeldet.', false);
        disableBtn('btnLogin', false);
        disableBtn('btnRegister', false);
        disableBtn('btnForgot', false);
        showAppAfterLogin(res2 && res2.user ? res2.user : null);
      })
      .catch(function (err) {
        msg('Registrieren fehlgeschlagen: ' + normalizeError(err), true);
        disableBtn('btnLogin', false);
        disableBtn('btnRegister', false);
        disableBtn('btnForgot', false);
      });
  }

  function onForgot() {
    msg('', false);

    var email = safeStr($('loginEmail') && $('loginEmail').value).trim();
    if (!email) {
      msg('Bitte zuerst die E-Mail eingeben.', true);
      return;
    }

    try {
      ensureFirebaseReady();
    } catch (e) {
      msg(normalizeError(e), true);
      return;
    }

    disableBtn('btnForgot', true);

    firebase.auth().sendPasswordResetEmail(email)
      .then(function () {
        msg('Passwort-Reset E-Mail wurde gesendet.', false);
        disableBtn('btnForgot', false);
      })
      .catch(function (err) {
        msg('Reset fehlgeschlagen: ' + normalizeError(err), true);
        disableBtn('btnForgot', false);
      });
  }

  // ---------- Auth state listener ----------
  function attachAuthListener() {
    try {
      ensureFirebaseReady();
    } catch (e) {
      // Falls Config/SDK noch nicht da ist, später nochmal versuchen
      return false;
    }

    // Mehrfaches attach verhindern
    if (window.__AUTH_LISTENER_ATTACHED) return true;
    window.__AUTH_LISTENER_ATTACHED = true;

    firebase.auth().onAuthStateChanged(function (user) {
      if (user) {
        // Wenn wir auf login.html sind, kann es direkt weiterleiten
        // Aber nur, wenn loginPanel sichtbar ist (sonst stören wir app.html nicht)
        if ($('loginPanel')) {
          showAppAfterLogin(user);
        }
      } else {
        // ausgeloggt → Login anzeigen
        if ($('loginPanel')) showLogin();
      }
    });

    return true;
  }

  // ---------- FINAL BOOT HOOK ----------
  // Der Loader (app.js) findet diese Funktion garantiert.
  window.startApp = function () {
    // Versuche Auth-Listener anzuhängen; wenn SDK/Config noch nicht geladen, retry.
    var tries = 0;

    function go() {
      tries++;
      var ok = attachAuthListener();
      if (ok) {
        // Wenn kein User da ist, wird showLogin() über onAuthStateChanged kommen.
        // Sicherheitshalber: falls Listener nicht sofort feuert:
        setTimeout(function () {
          if ($('loginPanel')) {
            showLogin();
          }
        }, 50);
        return;
      }
      if (tries < 40) {
        setTimeout(go, 100); // max ~4s
      } else {
        // Fallback: Login anzeigen und Fehler melden
        if ($('loginPanel')) showLogin();
        msg('Firebase noch nicht bereit (timeout). Prüfe Script-Reihenfolge in login.html.', true);
      }
    }

    go();
  };

  // Optional: Wenn login.html OHNE Loader geöffnet wird, starten wir trotzdem.
  document.addEventListener('DOMContentLoaded', function () {
    // Wenn app.js nicht vorhanden ist, starten wir hier
    if (!window.__LOADER_PRESENT) {
      try { window.startApp(); } catch (e) {}
    }
  });

  // Expose showLogin (falls du debuggen willst)
  window.showLogin = showLogin;

})();
