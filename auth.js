// Login / Registrierung (stabil auf iPad/PWA)
(function(){
  const $ = (id)=>document.getElementById(id);

  function setMsg(text){
    const el = $('authMsg');
    if(el) el.textContent = text || '';
  }

  function firebaseReady(){
    return (window.firebase && window.firebase.initializeApp && window.firebaseConfig);
  }

  
  async function getUserRole(auth, db){
    try{
      const u = auth.currentUser;
      if(!u || !db) return 'guest';
      const ORG_ID = (window.CLOUD_ORG_ID || window.firebaseOrgId || 'doggystyle');
      const ref = db.collection('orgs').doc(ORG_ID).collection('users').doc(u.uid);
      const snap = await ref.get();
      return snap.exists ? (snap.data().role || 'guest') : 'guest';
    }catch(_){
      return 'guest';
    }
  }
async function init(){
    if(!firebaseReady()){
      setMsg('Firebase ist nicht konfiguriert. Prüfe firebase-config.js');
      return;
    }

    try{
      // Initialisieren (idempotent)
      try{ window.firebase.app(); }catch(_){ window.firebase.initializeApp(window.firebaseConfig); }

      const auth = window.firebase.auth();
      // 🔐 Persistente Session erzwingen (wichtig für iOS/Safari)
      try {
        await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
      } catch(e) {
        console.warn('Persistence konnte nicht gesetzt werden', e);
      }
      let db = null;
      try{ db = window.firebase.firestore ? window.firebase.firestore() : null; }catch(_){ db = null; }

      const ORG_ID = (window.CLOUD_ORG_ID || 'doggystyle');

      async function ensureUserProfile(currentUser, preferredName){
        try{
          if(!db || !currentUser) return;
          const uid = currentUser.uid;
          const email = (currentUser.email || '').toLowerCase();
          const ref = db.collection('orgs').doc(ORG_ID).collection('users').doc(uid);
          const snap = await ref.get();
          if(snap.exists) return;
          const dn = (preferredName || '').trim() || (email.split('@')[0] || '');
          await ref.set({
            uid,
            email: currentUser.email || '',
            displayName: dn,
            role: 'customer',
            createdAt: Date.now()
          }, { merge: true });
        }catch(e){
          console.warn('ensureUserProfile failed', e);
        }
      }

      const regNameField = $('regNameField');
      const regNameInput = $('regName');
      const elEmail = $('loginEmail');
      const elPass  = $('loginPass');
      const btnLogin = $('btnLogin');
      const btnRegister = $('btnRegister');
      const btnForgot = $('btnForgot');

      let registerMode = false;
      function setRegisterMode(on){
        registerMode = !!on;
        if(regNameField){
          regNameField.style.display = registerMode ? '' : 'none';
        }
        if(!registerMode && regNameInput){
          regNameInput.value = '';
        }
      }
      setRegisterMode(false);

      async function doLogin(){
        const email = (elEmail.value || '').trim();
        const pass  = (elPass.value || '').trim();
        if(!email || !pass){ setMsg('Bitte E‑Mail und Passwort eingeben.'); return; }
        setMsg('Anmelden …');
        try{
          await auth.signInWithEmailAndPassword(email, pass);
          await ensureUserProfile(auth.currentUser, '');
          location.href = ((await getUserRole(auth, db)) === 'customer') ? 'customer.html' : 'app.html';
        }catch(e){
          const code = e && e.code ? String(e.code) : '';
          if(code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'){
            setMsg('E‑Mail oder Passwort ist falsch.');
          } else if(code === 'auth/too-many-requests'){
            setMsg('Zu viele Versuche. Bitte kurz warten oder Passwort zurücksetzen.');
          } else {
            setMsg('Anmelden fehlgeschlagen: ' + (code || e.message || e));
          }
        }
      }

      async function doRegister(){
        const email = (elEmail.value || '').trim();
        const pass  = (elPass.value || '').trim();
        const name  = (regNameInput ? (regNameInput.value || '').trim() : '');
        if(!email || !pass){ setMsg('Bitte E‑Mail und Passwort eingeben.'); return; }
        setMsg('Registrieren …');
        try{
          await auth.createUserWithEmailAndPassword(email, pass);
          await ensureUserProfile(auth.currentUser, name);
          location.href = ((await getUserRole(auth, db)) === 'customer') ? 'customer.html' : 'app.html';
        }catch(e){
          const code = e && e.code ? String(e.code) : '';
          if(code === 'auth/email-already-in-use'){
            setMsg('Diese E‑Mail ist schon registriert. Bitte anmelden oder Passwort zurücksetzen.');
          } else if(code === 'auth/weak-password'){
            setMsg('Passwort ist zu schwach (mindestens 6 Zeichen).');
          } else if(code === 'auth/invalid-email'){
            setMsg('Bitte eine gültige E‑Mail eingeben.');
          } else {
            setMsg('Registrierung fehlgeschlagen: ' + (code || e.message || e));
          }
        }
      }

      btnLogin.addEventListener('click', (e)=>{ e.preventDefault(); doLogin(); });

      btnRegister.addEventListener('click', (e)=>{
        e.preventDefault();
        if(!registerMode){
          setRegisterMode(true);
          setMsg('Registrieren: optional Name eintragen und erneut „Registrieren“ tippen.');
          try{ regNameInput && regNameInput.focus(); }catch(_){ }
          return;
        }
        doRegister();
      });

      // Enter-Taste: im Login-Modus anmelden
      elPass.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') doLogin(); });

      // Passwort-Reset
      if(btnForgot){
        btnForgot.addEventListener('click', async ()=>{
          try{
            const email = (elEmail.value || '').trim();
            if(!email){
              setMsg('Bitte zuerst die E‑Mail eintragen.');
              try{ elEmail.focus(); }catch(_){ }
              return;
            }
            await auth.sendPasswordResetEmail(email);
            setMsg('Passwort-Reset-Link wurde per E‑Mail gesendet.');
          }catch(e){
            const code = e && e.code ? String(e.code) : '';
            if(code === 'auth/user-not-found'){
              setMsg('Diese E‑Mail ist nicht registriert.');
            } else {
              setMsg('Passwort-Reset fehlgeschlagen: ' + (code || e.message || e));
            }
          }
        });
      }

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
