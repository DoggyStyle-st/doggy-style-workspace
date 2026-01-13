// firebase-config.js (compat-style)
// IMPORTANT: no ES-module "import" here, otherwise Safari/GitHub Pages will break.
window.firebaseConfig = {
  apiKey: "AIzaSyD7Os8yl8FEFquvv5nEj270-NaF1BA8IJ8",
  authDomain: "doggy-style-hundepension.firebaseapp.com",
  projectId: "doggy-style-hundepension",
  storageBucket: "doggy-style-hundepension.firebasestorage.app",
  messagingSenderId: "407371827200",
  appId: "1:407371827200:web:b51a856d20617dd9f070e5"
};

// If firebase compat is present, initialize exactly once.
try {
  if (window.firebase && window.firebase.apps && window.firebase.apps.length === 0) {
    window.firebase.initializeApp(window.firebaseConfig);
  }
} catch (e) {
  // app_init/app.js will show the error in UI if needed
  console.error("FIREBASE_INIT_ERROR", e);
}
