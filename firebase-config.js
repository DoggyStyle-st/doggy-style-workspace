// Firebase Konfiguration (Doggy Style Workspace)

window.firebaseConfig = {
  apiKey: "AIzaSyD7Os8yl8FEFquvv5nEj270-NaF1BA8IJ8",
  authDomain: "doggy-style-hundepension.firebaseapp.com",
  projectId: "doggy-style-hundepension",
  storageBucket: "doggy-style-hundepension.firebasestorage.app",
  messagingSenderId: "407371827200",
  appId: "1:407371827200:web:b51a856d20617dd9f070e5"
};

window.firebaseOrgId = "doggystyle";

window.firebaseAdminEmails = [
  "raphael@boch-plan.de"
];

// 🔥 WICHTIG: INITIALISIERUNG
if (window.firebase && !firebase.apps.length) {
  firebase.initializeApp(window.firebaseConfig);
}

// Firestore & Auth global verfügbar machen
window.db = firebase.firestore();
window.auth = firebase.auth();
