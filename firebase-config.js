// firebase-config.js (ANA037P9)
// Diese Datei enthält NUR die Projekt-Konfiguration + robustes Init (Compat SDK).
// Wichtig: Werte müssen zu deinem Firebase-Projekt passen.

(function () {
  // === Firebase Web Config (aus deiner Firebase Console) ===
  window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyD7Os8yl8FEFquvv5nEj270-NaF1BA8IJ8",
    authDomain: "doggy-style-hundepension.firebaseapp.com",
    projectId: "doggy-style-hundepension",
    storageBucket: "doggy-style-hundepension.firebasestorage.app",
    messagingSenderId: "407371827200",
    appId: "1:407371827200:web:b51a856d20617dd9f070e5"
  };

  // === Robust Init: wartet bis window.firebase (compat) verfügbar ist ===
  function tryInit() {
    try {
      if (!window.firebase || !window.firebase.initializeApp) return false;

      // Schon initialisiert?
      if (window.firebase.apps && window.firebase.apps.length) return true;

      window.firebase.initializeApp(window.FIREBASE_CONFIG);

      // kleine Guard-Flags für Debug
      window.__FIREBASE_READY__ = true;
      return true;
    } catch (e) {
      console.error("FIREBASE_INIT_ERROR", e);
      window.__FIREBASE_READY__ = false;
      return false;
    }
  }

  (function loop() {
    if (tryInit()) return;
    setTimeout(loop, 50);
  })();
})();
