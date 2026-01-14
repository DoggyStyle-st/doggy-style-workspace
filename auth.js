(function(){
  function byId(id){return document.getElementById(id);}
  function log(msg){console.log('[AUTH]', msg);}

  window.initAuth = function(){
    log('initAuth');
    var btn = byId('btnLogin');
    if(!btn){ log('btnLogin not found'); return; }

    btn.addEventListener('click', function(){
      var email = byId('loginEmail').value;
      var pass  = byId('loginPass').value;
      if(!email || !pass){ alert('Bitte E-Mail und Passwort eingeben'); return; }

      if(!window.firebase || !firebase.auth){
        alert('Firebase Auth nicht geladen');
        return;
      }

      firebase.auth().signInWithEmailAndPassword(email, pass)
        .then(function(){
          log('login ok');
          window.location.href = 'app.html';
        })
        .catch(function(err){
          alert(err.message);
        });
    });
  };
})();