// firebase-config.js
// Central Firebase configuration + initialization (compat SDK).
// This file is intentionally safe to include before/after other modules, but MUST run after firebase-app-compat is loaded.

(function(){
  // Keep existing config values (edit here if needed)
  const firebaseConfig = {
    apiKey: "AIzaSyB62d6UoYlPRC3VlWyBJ70dArq0M2gPK88",
    authDomain: "doggy-style-workspace.firebaseapp.com",
    projectId: "doggy-style-workspace",
    storageBucket: "doggy-style-workspace.appspot.com",
    messagingSenderId: "1066192357280",
    appId: "1:1066192357280:web:3e53ba1cc3a2d73de6c25a"
  };

  // Expose config for debugging/diag
  window.DS_FIREBASE_CONFIG = firebaseConfig;

  function init(){
    try{
      if(!window.firebase || !firebase.initializeApp){
        // Firebase libs not loaded yet; try again shortly.
        setTimeout(init, 0);
        return;
      }
      // Initialize once
      if(!firebase.apps || !firebase.apps.length){
        firebase.initializeApp(firebaseConfig);
      }
      // Optional: expose Firestore instance (compat)
      try{
        if(firebase.firestore && !window.db){
          window.db = firebase.firestore();
        }
      }catch(_){}
      window.DS_FIREBASE_READY = true;
    }catch(err){
      console.error("DS_FIREBASE_INIT_ERROR", err);
      window.DS_FIREBASE_READY = false;
    }
  }

  init();
})();