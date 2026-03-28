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
      const email = String(u.email || '').trim().toLowerCase();
      const adminEmails = Array.isArray(window.firebaseAdminEmails) ? window.firebaseAdminEmails.map(x=>String(x||'').trim().toLowerCase()) : [];
      if(email && adminEmails.includes(email)) return 'admin';
      const ORG_ID = (window.CLOUD_ORG_ID || window.firebaseOrgId || 'doggystyle');
      const ref = db.collection('orgs').doc(ORG_ID).collection('users').doc(u.uid);
      const snap = await ref.get();
      if(!snap.exists) return 'customer';
      const data = snap.data() || {};
      const role = String(data.role || '').trim().toLowerCase();
      return role || 'customer';
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
        // Fallback: SESSION (stabiler als DEFAULT auf manchen iOS/Safari Setups)
        try{ await auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION); }catch(_){ }
      }
      let db = null;
      try{ db = window.firebase.firestore ? window.firebase.firestore() : null; }catch(_){ db = null; }

      const ORG_ID = (window.CLOUD_ORG_ID || 'doggystyle');


      async function ensureUserProfile(currentUser, preferredName){
        try{
          if(!db || !currentUser) return;
          const uid = currentUser.uid;
          const email = (currentUser.email || '').toLowerCase();
          const adminEmails = Array.isArray(window.firebaseAdminEmails) ? window.firebaseAdminEmails.map(x=>String(x||'').trim().toLowerCase()) : [];
          const isAdminEmail = !!(email && adminEmails.includes(email));
          const ref = db.collection('orgs').doc(ORG_ID).collection('users').doc(uid);
          const snap = await ref.get();
          const existing = snap.exists ? (snap.data() || {}) : {};
          const existingName = String(existing.displayName || existing.name || existing.fullName || '').trim();
          const dn = (preferredName || '').trim() || existingName || (currentUser.displayName || '').trim() || (email.split('@')[0] || '');
          const existingRole = String(existing.role || '').trim().toLowerCase();
          const role = isAdminEmail ? 'admin' : (existingRole || 'customer');
          const payload = {
            uid,
            email: currentUser.email || '',
            displayName: dn,
            name: dn,
            fullName: dn,
            role,
            updatedAt: Date.now()
          };
          if(!snap.exists){
            payload.createdAt = Date.now();
          }
          await ref.set(payload, { merge: true });
          try{ if(currentUser && dn && currentUser.updateProfile && String(currentUser.displayName||'').trim() !== dn){ await currentUser.updateProfile({ displayName: dn }); } }catch(_){ }
          try{ if(dn){ localStorage.setItem('dstest_pending_name', dn); } }catch(_){ }
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

      async function goAfterAuth(email){
        const role = await getUserRole(auth, db);
        const lowerEmail = String(email || (auth.currentUser && auth.currentUser.email) || '').trim().toLowerCase();
        let target = (role === 'customer')
          ? 'customer.html'
          : ('app.html?login_email=' + encodeURIComponent(lowerEmail));
        try{
          const url = new URL(location.href);
          const raw = String(url.searchParams.get('return_to') || sessionStorage.getItem('ds_auth_required_return_to') || '').trim();
          if(raw && !/^https?:/i.test(raw) && !raw.startsWith('//')){
            target = raw;
          }
          try{ sessionStorage.removeItem('ds_auth_required_return_to'); }catch(_){ }
        }catch(_){ }
        location.href = target;
      }

      function setRegisterMode(on){
        registerMode = !!on;
        if(regNameField){
          regNameField.style.display = '';
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
          const cred = await auth.signInWithEmailAndPassword(email, pass);
          // Merke E-Mail für UI-Fallback (falls iOS Auth-Restore verzögert)
          try{ localStorage.setItem('ds_last_email', email.toLowerCase()); }catch(_){ }
          try{ localStorage.setItem('last_email', email.toLowerCase()); }catch(_){ }
          try{ sessionStorage.setItem('ds_last_email', email.toLowerCase()); }catch(_){ }
          // iPad/Safari handoff: Credentials nur kurzfristig in sessionStorage für app.html hinterlegen
          try{ sessionStorage.setItem('ds_handoff_email', email.toLowerCase()); }catch(_){ }
          try{ sessionStorage.setItem('ds_handoff_pass', pass); }catch(_){ }
          try{ sessionStorage.setItem('ds_handoff_ts', String(Date.now())); }catch(_){ }
          // Warten bis der Auth-State im Login-Tab stabil ist
          try{ await auth.currentUser.getIdToken(true); }catch(_){ }
          await new Promise((resolve)=>{
            let done=false; let unsub=null;
            const fin=()=>{ if(done) return; done=true; try{unsub&&unsub();}catch(_){ } resolve(); };
            const t=setTimeout(fin, 1200);
            try{ unsub = auth.onAuthStateChanged((u)=>{ if(u && cred && cred.user && u.uid===cred.user.uid){ clearTimeout(t); fin(); } }); }catch(_){ }
          });
          await ensureUserProfile(auth.currentUser, '');
          await goAfterAuth(email);
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
          const cred = await auth.createUserWithEmailAndPassword(email, pass);
          try{ localStorage.setItem('ds_last_email', email.toLowerCase()); }catch(_){ }
          try{ localStorage.setItem('last_email', email.toLowerCase()); }catch(_){ }
          try{ sessionStorage.setItem('ds_last_email', email.toLowerCase()); }catch(_){ }
          try{ sessionStorage.setItem('ds_handoff_email', email.toLowerCase()); }catch(_){ }
          try{ sessionStorage.setItem('ds_handoff_pass', pass); }catch(_){ }
          try{ sessionStorage.setItem('ds_handoff_ts', String(Date.now())); }catch(_){ }
          try{ await auth.currentUser.getIdToken(true); }catch(_){ }
          await new Promise((resolve)=>{
            let done=false; let unsub=null;
            const fin=()=>{ if(done) return; done=true; try{unsub&&unsub();}catch(_){ } resolve(); };
            const t=setTimeout(fin, 1200);
            try{ unsub = auth.onAuthStateChanged((u)=>{ if(u && cred && cred.user && u.uid===cred.user.uid){ clearTimeout(t); fin(); } }); }catch(_){ }
          });
          await ensureUserProfile(auth.currentUser, name);
          await goAfterAuth(email);
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
            const basePath = (()=>{ try{ return location.pathname.replace(/[^/]*$/, "/" ); }catch(e){ return "/"; } })();
            const actionCodeSettings = { url: location.origin + basePath + "pwreset.html", handleCodeInApp: true };
            await auth.sendPasswordResetEmail(email, actionCodeSettings);
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
