// firebase-config.js (compat, global)
// This file must NOT use ES module imports when served via <script>.
(function(){
  // >>> INSERT YOUR REAL CONFIG HERE (already provided by Raphael) <<<
  var firebaseConfig = {
    apiKey: "AIzaSyD7Os8yl8FEFquvv5nEj270-NaF1BA8IJ8",
    authDomain: "doggy-style-hundepension.firebaseapp.com",
    projectId: "doggy-style-hundepension",
    storageBucket: "doggy-style-hundepension.firebasestorage.app",
    messagingSenderId: "407371827200",
    appId: "1:407371827200:web:b51a856d20617dd9f070e5"
  };

  // Expose for debugging
  window.__FIREBASE_CONFIG = firebaseConfig;

  function init(){
    if (!window.firebase || !window.firebase.initializeApp) return false;
    try{
      // Avoid double-init
      if (firebase.apps && firebase.apps.length) return true;
      firebase.initializeApp(firebaseConfig);
      return true;
    }catch(e){
      console.error("FIREBASE_INIT_ERROR", e);
      return false;
    }
  }

  // Try now, and retry a few times in case scripts are still loading.
  var tries = 0;
  (function tick(){
    tries++;
    if (init()) return;
    if (tries < 20) setTimeout(tick, 50);
    else console.error("FIREBASE_INIT_TIMEOUT");
  })();
})();
