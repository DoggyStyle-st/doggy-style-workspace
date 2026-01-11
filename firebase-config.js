// firebase-config.js
// WICHTIG: Hier gehören DEINE Firebase Keys rein.
// Diese Datei wird von app.html geladen und muss im Repo liegen.
// Du kannst hier die Werte aus Firebase Console -> Projekteinstellungen -> Allgemein -> "Firebase SDK Snippet (Konfiguration)" eintragen.

window.FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

// Kompatibilität (ältere Builds):
window.firebaseConfig = window.FIREBASE_CONFIG;
