// Login-Seite (stabil auf iPad/PWA): keine Overlays, keine globalen Touch-Hacks.
(function(){
  function $(id){ return document.getElementById(id); }
  function setMsg(t){ const el=$('authMsg'); if(el) el.textContent = t||''; }

  function firebaseReady(){
    return (window.firebase && window.firebase.initializeApp && window.firebaseConfig);
  }

  async function init(){
    if(!firebaseReady()){
      setMsg('Firebase nicht konfiguriert. Prüfe firebase-config.js');
      return;
    }
    try{
      // Initialisieren (idempotent)
      try{ window.firebase.app(); }catch(_){ window.firebase.initializeApp(window.firebaseConfig); }
      const auth = window.firebase.auth();
      // Firestore optional (für User-Profil). Wenn Firestore nicht verfügbar ist,
      // läuft Login/Registrierung trotzdem weiter.
      let db = null;
      try{ db = window.firebase.firestore ? window.firebase.firestore() : null; }catch(_){ db = null; }

      const ORG_ID = (window.CLOUD_ORG_ID || 'doggystyle');

      async function ensureUserProfile(currentUser, preferredName){
        try{
          if(!db || !currentUser) return;
          const uid = currentUser.uid;
          const email = (currentUser.email||'').toLowerCase();
          const ref = db.collection('orgs').doc(ORG_ID).collection('users').doc(uid);
          const snap = await ref.get();
          if(snap.exists) return;
          const dn = (preferredName||'').trim() || (email.split('@')[0]||'');
          await ref.set({
            uid,
            email: currentUser.email||'',
            displayName: dn,
            role: 'customer',
            createdAt: Date.now()
          }, { merge:true });
        }catch(e){
          // Nicht blockieren (Rules/Offline/etc.)
          console.warn('ensureUserProfile failed', e);
        }
      }

      // Optional: Login bei jedem Öffnen erzwingen (wenn window.firebaseForceLoginAlways = true)
      try{
        if(window.firebaseForceLoginAlways){
          await auth.signOut();
        }
      }catch(_){}

      // Button-Handler
      const btnLogin = $('btnLogin');
      const btnRegister = $('btnRegister');
      const btnReset = $('btnReset');

      function normalizeEmail(v){
        return (v||'').trim().toLowerCase();
      }

      function prettyAuthError(e){
        const code = (e && e.code) ? String(e.code) : '';
        switch(code){
          case 'auth/invalid-credential':
          case 'auth/wrong-password':
          case 'auth/user-not-found':
            return 'E‑Mail oder Passwort ist falsch.';
          case 'auth/email-already-in-use':
            return 'Diese E‑Mail ist bereits registriert. Bitte anmelden oder „Passwort vergessen“ nutzen.';
          case 'auth/weak-password':
            return 'Passwort zu schwach. Bitte mind. 6 Zeichen.';
          case 'auth/invalid-email':
            return 'Ungültige E‑Mail-Adresse.';
          case 'auth/network-request-failed':
            return 'Netzwerkfehler. Prüfe Internetverbindung.';
          default:
            return (code || (e && e.message) || String(e));
        }
      }

      const doLogin = async ()=>{
        const email = normalizeEmail($('loginEmail').value);
        const pass  = ($('loginPass').value||''); // Passwort nicht trimmen
        if(!email || !pass){ setMsg('Bitte E‑Mail und Passwort eingeben.'); return; }
        setMsg('Anmelden …');
        try{
          await auth.signInWithEmailAndPassword(email, pass);
          await ensureUserProfile(auth.currentUser, '');
          location.href = 'app.html';
        }catch(e){
          setMsg(prettyAuthError(e));
        }
      };

      const doRegister = async ()=>{
        const email = normalizeEmail($('loginEmail').value);
        const pass  = ($('loginPass').value||''); // Passwort nicht trimmen
        const name  = (($('regName') && $('regName').value) || '').trim();
        if(!email || !pass){ setMsg('Bitte E‑Mail und Passwort eingeben.'); return; }
        setMsg('Registrieren …');
        try{
          await auth.createUserWithEmailAndPassword(email, pass);
          try{ if(name) localStorage.setItem('ds_pending_name', name); }catch(_){ }
          await ensureUserProfile(auth.currentUser, name);
          location.href = 'app.html';
        }catch(e){
          // Wenn E-Mail schon existiert: Hinweis + optional Reset
          setMsg(prettyAuthError(e));
        }
      };

      const doReset = async ()=>{
        const email = normalizeEmail($('loginEmail').value);
        if(!email){ setMsg('Bitte E‑Mail eintragen, dann „Passwort vergessen“ drücken.'); return; }
        setMsg('Sende Passwort-Reset …');
        try{
          await auth.sendPasswordResetEmail(email);
          setMsg('Reset-Link wurde gesendet (prüfe auch Spam).');
        }catch(e){
          setMsg(prettyAuthError(e));
        }
      };

      btnLogin.addEventListener('click', (e)=>{ e.preventDefault(); doLogin(); });
      btnRegister.addEventListener('click', (e)=>{ e.preventDefault(); doRegister(); });
      if(btnReset){
        btnReset.addEventListener('click', (e)=>{ e.preventDefault(); doReset(); });
      }

      // Enter-Taste
      $('loginPass').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doLogin(); });

      setMsg('');
    }catch(err){
      setMsg('Fehler beim Initialisieren: ' + (err.message || err));
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();