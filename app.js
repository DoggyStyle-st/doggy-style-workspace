/* ANA036.1_LOGIN_HANDLER_FIX.js
   Fix: Login/Logout handler + robust Auth-State-Controller for Safari/iPad.
   - Korrigiert: email/password Variablen waren undefiniert.
   - Bindet Enter-Taste im Passwortfeld.
   - Erzwingt sauberes Umschalten LoginOverlay <-> Workspace.
*/
(function(){
  'use strict';

  const TAG = '[ANA036.1]';
  const $ = (id) => document.getElementById(id);
  const log = (...a) => console.log(TAG, ...a);

  // UI helpers
  function showLogin(){
    const o = $('loginOverlay');
    const w = $('workspace');
    if(o) o.style.display = 'block';
    if(w) w.classList.add('hidden');
  }

  function showWorkspace(){
    const o = $('loginOverlay');
    const w = $('workspace');
    if(o) o.style.display = 'none';
    if(w) w.classList.remove('hidden');
  }

  // Firebase auth getter (firebase compat expected)
  function getAuth(){
    try{
      if(window.firebase && typeof window.firebase.auth === 'function') {
        return window.firebase.auth();
      }
    } catch(e) {
      log('getAuth() error', e);
    }
    return null;
  }

  let auth = null;
  function ensureAuth(){
    if(auth) return auth;
    auth = getAuth();
    return auth;
  }

  async function doLogin(){
    const a = ensureAuth();
    if(!a){
      alert('Firebase Auth ist noch nicht bereit. Bitte Seite neu laden.');
      return;
    }

    const emailEl = $('email');
    const passEl  = $('password');

    const email = (emailEl && emailEl.value ? emailEl.value.trim() : '');
    const pass  = (passEl && passEl.value ? passEl.value : '');

    if(!email || !pass){
      alert('Bitte E-Mail und Passwort eingeben.');
      return;
    }

    try{
      await a.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged schaltet UI um
    } catch(err){
      const msg = (err && (err.message || err.code)) ? (err.message || err.code) : String(err);
      alert('Login fehlgeschlagen: ' + msg);
      log('Login error', err);
    }
  }

  async function doLogout(){
    const a = ensureAuth();
    try{
      if(a) await a.signOut();
    } catch(err){
      log('Logout error', err);
    } finally {
      // UI direkt zurücksetzen (auch wenn onAuthStateChanged mal delayed ist)
      showLogin();
    }
  }

  function bindEnterToLogin(){
    const passEl = $('password');
    if(!passEl) return;
    if(passEl.dataset && passEl.dataset.anaBound === '1') return;

    passEl.addEventListener('keydown', (ev) => {
      if(ev.key === 'Enter'){
        ev.preventDefault();
        doLogin();
      }
    });

    if(passEl.dataset) passEl.dataset.anaBound = '1';
  }

  function bindAuthState(){
    const a = ensureAuth();
    if(!a){
      // Fallback: Wenn Firebase später kommt, nochmal versuchen
      setTimeout(bindAuthState, 300);
      return;
    }

    // onAuthStateChanged nur einmal registrieren
    if(window.__ANA036_AUTH_BOUND) return;
    window.__ANA036_AUTH_BOUND = true;

    a.onAuthStateChanged((user) => {
      if(user){
        log('Auth OK', user.email);
        showWorkspace();
      } else {
        log('No user');
        showLogin();
      }
    }, (err) => {
      log('onAuthStateChanged error', err);
      showLogin();
    });
  }

  // Export functions expected by index.html inline onclick
  window.login = doLogin;
  window.logout = doLogout;
  window.showLogin = showLogin;
  window.showWorkspace = showWorkspace;

  document.addEventListener('DOMContentLoaded', () => {
    bindEnterToLogin();
    bindAuthState();
    // Default: erst Login zeigen, bis Auth entschieden hat
    showLogin();
  });
})();
