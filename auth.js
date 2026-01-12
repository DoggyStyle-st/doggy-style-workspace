// auth.js — Login/Register/Forgot handler (Phase 1 restore)
// Ziel: robust funktionieren, auch wenn andere Module/Styles variieren.

(function () {
  'use strict';

  const BUILD = window.APP_BUILD || 'ANA037_PHASE1';

  function $(id){ return document.getElementById(id); }
  function setMsg(text, isError){
    const el = $('authMsg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#ff6b6b' : '#9fe29f';
  }

  function ensureFirebase(){
    // firebase-app-compat + firebase-auth-compat müssen geladen sein
    if (!window.firebase || !firebase.apps) {
      throw new Error('Firebase nicht geladen (firebase-app-compat / firebase-auth-compat).');
    }
    // firebase-config.js sollte firebase.initializeApp(...) enthalten.
    if (!firebase.apps.length) {
      throw new Error('Firebase nicht initialisiert (firebase.initializeApp fehlt).');
    }
    if (!firebase.auth) {
      throw new Error('Firebase Auth nicht verfügbar.');
    }
    return firebase.auth();
  }

  async function onLogin(){
    setMsg('', false);
    try {
      const email = ($('loginEmail')?.value || '').trim();
      const pw = ($('loginPass')?.value || '').trim();
      if (!email || !pw) {
        setMsg('Bitte E‑Mail und Passwort eingeben.', true);
        return;
      }
      const auth = ensureFirebase();
      await auth.signInWithEmailAndPassword(email, pw);
      // Redirect auf App (Token zum Cache-Busting)
      const url = new URL('app.html', window.location.href);
      url.searchParams.set('v', String(Date.now()));
      window.location.href = url.toString();
    } catch (e) {
      console.error('LOGIN_ERROR', e);
      setMsg('Anmelden fehlgeschlagen: ' + (e?.message || e), true);
    }
  }

  async function onRegister(){
    setMsg('', false);
    try {
      const email = ($('loginEmail')?.value || '').trim();
      const pw = ($('loginPass')?.value || '').trim();
      if (!email || !pw) {
        setMsg('Bitte E‑Mail und Passwort eingeben.', true);
        return;
      }
      const auth = ensureFirebase();
      await auth.createUserWithEmailAndPassword(email, pw);
      setMsg('Registriert. Du kannst dich jetzt anmelden.', false);
      // Optional: direkt angemeldet lassen oder abmelden – hier abmelden für sauberen Flow
      await auth.signOut();
    } catch (e) {
      console.error('REGISTER_ERROR', e);
      setMsg('Registrieren fehlgeschlagen: ' + (e?.message || e), true);
    }
  }

  async function onForgot(){
    setMsg('', false);
    try {
      const email = ($('loginEmail')?.value || '').trim();
      if (!email) {
        setMsg('Bitte E‑Mail eingeben (für Passwort‑Reset).', true);
        return;
      }
      const auth = ensureFirebase();
      await auth.sendPasswordResetEmail(email);
      setMsg('E‑Mail zum Zurücksetzen wurde gesendet.', false);
    } catch (e) {
      console.error('FORGOT_ERROR', e);
      setMsg('Passwort‑Reset fehlgeschlagen: ' + (e?.message || e), true);
    }
  }

  function wire(){
    // Build badge
    const b = $('buildBadge');
    if (b) b.textContent = 'Build ' + BUILD;

    $('btnLogin')?.addEventListener('click', (ev)=>{ ev.preventDefault(); onLogin(); });
    $('btnRegister')?.addEventListener('click', (ev)=>{ ev.preventDefault(); onRegister(); });
    $('btnForgot')?.addEventListener('click', (ev)=>{ ev.preventDefault(); onForgot(); });

    // Enter in password triggers login
    $('loginPass')?.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter') { ev.preventDefault(); onLogin(); }
    });
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
