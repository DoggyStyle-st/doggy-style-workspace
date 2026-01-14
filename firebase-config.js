/* firebase-config.js (ROOT)
   Provides window.firebaseConfig + initializes Firebase (compat) safely.
*/
(function(){
  // --- CONFIG (from Firebase console) ---
  window.firebaseConfig = {
    apiKey: "AIzaSyD7Os8yl8FEFquvv5nEj270-NaF1BA8IJ8",
    authDomain: "doggy-style-hundepension.firebaseapp.com",
    projectId: "doggy-style-hundepension",
    storageBucket: "doggy-style-hundepension.firebasestorage.app",
    messagingSenderId: "407371827200",
    appId: "1:407371827200:web:b51a856d20617dd9f070e5"
  };

  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }

  // If firebase compat libs are already present, init immediately; otherwise auth.js will retry.
  try{
    if (window.firebase && window.firebase.initializeApp) {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
        log("[firebase-config] initialized");
      } else {
        log("[firebase-config] already initialized");
      }
    } else {
      log("[firebase-config] firebase compat libs not yet loaded");
    }
  }catch(e){
    log("[firebase-config] init error:", e);
  }
})(); 
