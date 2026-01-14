(function(){
  function byId(id){ return document.getElementById(id); }
  function setMsg(t, ok){
    var el = byId('authMsg');
    if(!el) return;
    el.textContent = t || '';
    el.style.color = ok ? '#0a0' : '#a00';
  }
  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }

  function ensureFirebaseInit(){
    try{
      if(!window.firebase || !firebase.initializeApp) return false;
      if(!window.firebaseConfig){
        log('[AUTH] firebaseConfig fehlt');
        return false;
      }
      if(!firebase.apps || !firebase.apps.length){
        firebase.initializeApp(window.firebaseConfig);
        log('[AUTH] firebase.initializeApp ok');
      }
      return true;
    }catch(e){
      log('[AUTH] init error', e);
      return false;
    }
  }

  function bind(){
    var btn = byId('btnLogin');
    if(!btn){ setMsg('Login UI fehlt (btnLogin)', false); return false; }

    // Nur einmal binden
    if(btn.__bound) return true;
    btn.__bound = true;

    btn.addEventListener('click', function(){
      var email = (byId('loginEmail') && byId('loginEmail').value || '').trim();
      var pass  = (byId('loginPass')  && byId('loginPass').value  || '');

      if(!email || !pass){
        setMsg('Bitte E-Mail und Passwort eingeben', false);
        return;
      }

      if(!ensureFirebaseInit()){
        setMsg('Firebase noch nicht bereit…', false);
        // kurzer Retry
        setTimeout(function(){
          if(!ensureFirebaseInit()){
            setMsg('Firebase nicht geladen (Script/Cache?)', false);
            return;
          }
          doLogin(email, pass);
        }, 400);
        return;
      }

      doLogin(email, pass);
    });

    setMsg('Bereit', true);
    return true;
  }

  function doLogin(email, pass){
    try{
      if(!firebase.auth){ setMsg('Firebase Auth fehlt', false); return; }
      setMsg('Anmelden…', true);
      firebase.auth().signInWithEmailAndPassword(email, pass)
        .then(function(){
          setMsg('Login OK – weiter…', true);
          window.location.href = 'app.html';
        })
        .catch(function(err){
          setMsg((err && err.message) ? err.message : 'Login fehlgeschlagen', false);
        });
    }catch(e){
      setMsg('Login Fehler: ' + (e && e.message ? e.message : String(e)), false);
    }
  }

  // Auto-init
  function boot(){
    // wir binden sofort; wenn Firebase noch nicht da ist, ist das egal – der Click macht Retry
    bind();
    // zusätzlich: falls der User sofort klickt bevor defer fertig ist, versuchen wir nachzuladen
    setTimeout(function(){ ensureFirebaseInit(); }, 300);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }

  // Optionaler Hook für app.js (falls genutzt)
  window.initAuth = function(){ boot(); };
  window.showLogin = function(){ /* noop – login.html ist die Login-Seite */ };
})();