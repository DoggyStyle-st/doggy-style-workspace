/* ANA037 auth.js (ES5)
   Provides: window.initAuth(), window.showLogin(), window.DSAuth.*
   Works with Firebase compat (9.6.11). No async/await.
*/
(function(){
  'use strict';

  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }
  function warn(){ try{ console.warn.apply(console, arguments); }catch(e){} }

  function ensureFirebaseInit(){
    try{
      if(!window.firebaseConfig){
        warn('[auth] firebaseConfig missing (firebase-config.js not loaded)');
        return false;
      }
      if(!window.firebase || !window.firebase.initializeApp){
        return false;
      }
      if(!firebase.apps || !firebase.apps.length){
        firebase.initializeApp(window.firebaseConfig);
        log('[auth] firebase initialized');
      }
      return true;
    }catch(e){
      warn('[auth] init error', e);
      return false;
    }
  }

  function ensureAuth(){
    try{
      if(!ensureFirebaseInit()) return null;
      if(!firebase.auth) return null;
      return firebase.auth();
    }catch(e){
      warn('[auth] auth missing', e);
      return null;
    }
  }

  function friendlyError(err){
    if(!err) return '';
    var c = err.code || '';
    var m = err.message || String(err);
    if(c === 'auth/invalid-email') return 'E-Mail ungültig.';
    if(c === 'auth/user-not-found') return 'Benutzer nicht gefunden.';
    if(c === 'auth/wrong-password') return 'Passwort falsch.';
    if(c === 'auth/too-many-requests') return 'Zu viele Versuche – bitte später erneut.';
    return m;
  }

  function showLogin(){
    try{
      var p = (location.pathname||'').toLowerCase();
      if(p.indexOf('login.html') !== -1) return;
    }catch(e){}
    location.href = './login.html';
  }

  function initAuth(opts){
    opts = opts || {};
    var tries = 0;
    function tick(){
      tries++;
      var auth = ensureAuth();
      if(!auth){
        if(tries < 40) return setTimeout(tick, 100);
        warn('[auth] firebase/auth not ready (timeout)');
        if(opts.onError) opts.onError('Firebase/Auth nicht bereit.');
        return;
      }

      try{
        auth.onAuthStateChanged(function(user){
          if(user){
            window.__AUTH_USER = user;
            if(opts.onAuthed) opts.onAuthed(user);
          } else {
            if(opts.mode === 'login'){
              if(opts.onNotAuthed) opts.onNotAuthed();
            } else {
              showLogin();
              if(opts.onNotAuthed) opts.onNotAuthed();
            }
          }
        }, function(err){
          var msg = friendlyError(err);
          if(opts.onError) opts.onError(msg);
        });
      }catch(e){
        if(opts.onError) opts.onError(friendlyError(e));
      }
    }
    tick();
  }

  window.DSAuth = window.DSAuth || {};

  window.DSAuth.login = function(email, pass, cb){
    cb = cb || function(){};
    var auth = ensureAuth();
    if(!auth) return cb('Firebase/Auth nicht bereit.');
    auth.signInWithEmailAndPassword(email, pass)
      .then(function(){ cb(null); })
      .catch(function(err){ cb(friendlyError(err)); });
  };

  window.DSAuth.register = function(email, pass, cb){
    cb = cb || function(){};
    var auth = ensureAuth();
    if(!auth) return cb('Firebase/Auth nicht bereit.');
    auth.createUserWithEmailAndPassword(email, pass)
      .then(function(){ cb(null); })
      .catch(function(err){ cb(friendlyError(err)); });
  };

  window.DSAuth.resetPassword = function(email, cb){
    cb = cb || function(){};
    var auth = ensureAuth();
    if(!auth) return cb('Firebase/Auth nicht bereit.');
    auth.sendPasswordResetEmail(email)
      .then(function(){ cb(null); })
      .catch(function(err){ cb(friendlyError(err)); });
  };

  window.DSAuth.logout = function(cb){
    cb = cb || function(){};
    var auth = ensureAuth();
    if(!auth) return cb('Firebase/Auth nicht bereit.');
    auth.signOut().then(function(){ cb(null); }).catch(function(err){ cb(friendlyError(err)); });
  };

  window.initAuth = initAuth;
  window.showLogin = showLogin;
})();
