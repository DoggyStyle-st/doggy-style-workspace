// firebase-init.js (renamed from firebase-config.js)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD7Os8yl8FEFquvv5nEj270-NaF1BA8IJ8",
  authDomain: "doggy-style-hundepension.firebaseapp.com",
  projectId: "doggy-style-hundepension",
  storageBucket: "doggy-style-hundepension.firebasestorage.app",
  messagingSenderId: "407371827200",
  appId: "1:407371827200:web:b51a856d20617dd9f070e5"
};

export const ORG_ID = "doggystyle";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
