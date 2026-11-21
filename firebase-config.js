// Firebase Konfiguration (Doggy Style Workspace)
// Hinweis: Diese Datei wird vor auth.js/app.js geladen.
// Weitere Mitarbeiter und Administratoren werden unter Einstellungen → Benutzer & Rollen zugeteilt.

window.firebaseConfig = {
  apiKey: "AIzaSyD7Os8yl8FEFquvv5nEj270-NaF1BA8IJ8",
  authDomain: "doggy-style-hundepension.firebaseapp.com",
  projectId: "doggy-style-hundepension",
  storageBucket: "doggy-style-hundepension.firebasestorage.app",
  messagingSenderId: "407371827200",
  appId: "1:407371827200:web:b51a856d20617dd9f070e5"
};

// frei wählbar (wird als "Mandant" / Hof-Ordner genutzt)
window.firebaseOrgId = "doggystyle";

// Admin-Zugänge: Inhaberin Angelika Boch und Mitarbeiter Raphael Boch
window.firebaseAdminEmails = [
  "raphael@boch-plan.de",
  "anschifessler@googlemail.com"
];

window.CLOUD_ORG_ID = window.firebaseOrgId;
