// firebase-config.js
// Diese Datei wird von app.js als window.firebaseConfig / window.firebaseAdminEmails erwartet.
// Sie darf PUBLIC sein (Firebase Web Config), aber bitte KEINE privaten Schlüssel hier ablegen.

(function () {
  window.firebaseConfig = {
    apiKey: "AIzaSyA-HTcgwj8_8WKyUuCBp2TFkCWv_XkHE_M",
    authDomain: "doggy-style-hundepension.firebaseapp.com",
    projectId: "doggy-style-hundepension",
    storageBucket: "doggy-style-hundepension.firebasestorage.app",
    messagingSenderId: "980060343319",
    appId: "1:980060343319:web:2aa36499b357c93207017b"
  };

  // Admin‑Whitelist (für Rollen/Features). In app.js wird diese Liste verwendet.
  window.firebaseAdminEmails = [
    "info@wildwestallgaeu-alpaka.de",
    "r.boch@boch-plan.de"
  ];
})();
