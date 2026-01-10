/* ANA035_MINLOGIN – Minimal Login / Firebase Init Diagnose
   Erwartet: firebase-config.js setzt window.FIREBASE_CONFIG = { apiKey, authDomain, projectId, ... }
*/

(() => {
  const BUILD = "ANA035_MINLOGIN";
  const $ = (id) => document.getElementById(id);

  const el = {
    dot: $("dotStatus"),
    status: $("txtStatus"),
    clock: $("txtClock"),
    build: $("buildTag"),
    email: $("email"),
    pass: $("pass"),
    btnLogin: $("btnLogin"),
    btnLogout: $("btnLogout"),
    btnWho: $("btnWho"),
    btnTest: $("btnTest"),
    kvSdk: $("kvSdk"),
    kvProject: $("kvProject"),
    kvAuthDomain: $("kvAuthDomain"),
    kvUser: $("kvUser"),
    kvErr: $("kvErr"),
    log: $("log"),
    btnCopy: $("btnCopy"),
    btnClear: $("btnClear"),
  };

  el.build.textContent = BUILD;

  const nowStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const log = (msg, level = "info") => {
    const line = `[${nowStr()}] ${level.toUpperCase()}: ${msg}`;
    console.log(line);
    el.log.textContent += line + "\n";
    el.log.scrollTop = el.log.scrollHeight;
  };

  const setStatus = (mode, extra = "") => {
    // mode: offline | warn | online
    el.dot.classList.remove("good", "warn");
    if (mode === "online") el.dot.classList.add("good");
    if (mode === "warn") el.dot.classList.add("warn");
    const base = mode === "online" ? "Online" : (mode === "warn" ? "Warnung" : "Offline");
    el.status.textContent = `Status: ${base}${extra ? " – " + extra : ""}`;
  };

  const setErr = (e) => {
    const msg = (e && (e.code || e.message)) ? `${e.code || ""} ${e.message || ""}`.trim() : String(e);
    el.kvErr.textContent = msg || "–";
  };

  const tickClock = () => { el.clock.textContent = nowStr(); };
  setInterval(tickClock, 500);
  tickClock();

  // Buttons
  el.btnClear.addEventListener("click", () => { el.log.textContent = ""; log("Log geleert."); });
  el.btnCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el.log.textContent || "");
      log("Log in Zwischenablage kopiert.");
    } catch (e) {
      log("Clipboard nicht verfügbar (Safari kann blocken). Bitte Log markieren & kopieren.", "warn");
    }
  });

  // --- 1) Basic sanity checks
  log(`Start ${BUILD}…`);

  // Check Firebase SDK
  if (!window.firebase) {
    setStatus("offline", "firebase SDK fehlt");
    el.kvSdk.textContent = "❌ window.firebase fehlt";
    log("Firebase SDK wurde nicht geladen. Prüfe Internet / Script-URLs.", "error");
    return;
  }
  el.kvSdk.textContent = "✅ firebase (compat) vorhanden";
  log("Firebase SDK geladen ✅");

  // Check config
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || typeof cfg !== "object") {
    setStatus("offline", "Config fehlt");
    el.kvProject.textContent = "❌";
    el.kvAuthDomain.textContent = "❌";
    el.kvErr.textContent = "FIREBASE_CONFIG fehlt";
    log("window.FIREBASE_CONFIG fehlt. Prüfe firebase-config.js (muss window.FIREBASE_CONFIG = {...} setzen).", "error");
    return;
  }
  el.kvProject.textContent = cfg.projectId || "(kein projectId)";
  el.kvAuthDomain.textContent = cfg.authDomain || "(kein authDomain)";
  log(`Config gefunden: projectId=${cfg.projectId || "?"}`);

  // --- 2) Initialize app (idempotent)
  let app;
  try {
    const existing = firebase.apps && firebase.apps.length ? firebase.apps[0] : null;
    app = existing || firebase.initializeApp(cfg);
    log(existing ? "Firebase App bereits initialisiert (reuse)." : "Firebase initializeApp OK.");
    setStatus("warn", "Init OK – Auth prüfen");
  } catch (e) {
    setStatus("offline", "Init fehlgeschlagen");
    setErr(e);
    log(`initializeApp Fehler: ${(e && e.message) ? e.message : e}`, "error");
    return;
  }

  // Auth + Firestore
  let auth, db;
  try {
    auth = firebase.auth();
    db = firebase.firestore();
    log("auth() & firestore() OK.");
  } catch (e) {
    setStatus("offline", "Auth/DB init fail");
    setErr(e);
    log(`auth/firestore init Fehler: ${(e && e.message) ? e.message : e}`, "error");
    return;
  }

  const renderUser = (u) => {
    if (u) {
      el.kvUser.textContent = `${u.email || "(ohne email)"} | uid=${u.uid}`;
      el.btnLogout.disabled = false;
      el.btnLogin.disabled = true;
      setStatus("online", u.email || "eingeloggt");
    } else {
      el.kvUser.textContent = "–";
      el.btnLogout.disabled = true;
      el.btnLogin.disabled = false;
      setStatus("warn", "nicht eingeloggt");
    }
  };

  // Listener
  try {
    auth.onAuthStateChanged((user) => {
      log(user ? `onAuthStateChanged: ✅ ${user.email}` : "onAuthStateChanged: ❌ kein User");
      renderUser(user);
    }, (e) => {
      setErr(e);
      log(`onAuthStateChanged error: ${(e && e.message) ? e.message : e}`, "error");
    });
  } catch (e) {
    setErr(e);
    log(`onAuthStateChanged Setup Fehler: ${(e && e.message) ? e.message : e}`, "error");
  }

  // Login
  el.btnLogin.addEventListener("click", async () => {
    const email = (el.email.value || "").trim();
    const pass = el.pass.value || "";
    el.kvErr.textContent = "–";
    if (!email || !pass) {
      setStatus("warn", "E-Mail/Passwort fehlt");
      log("Bitte E-Mail und Passwort eingeben.", "warn");
      return;
    }
    el.btnLogin.disabled = true;
    setStatus("warn", "Login läuft…");
    log(`Login attempt: ${email}`);
    try {
      const cred = await auth.signInWithEmailAndPassword(email, pass);
      log(`Login OK: ${cred.user && cred.user.email ? cred.user.email : "user"}`);
      // onAuthStateChanged macht Rest
    } catch (e) {
      setErr(e);
      setStatus("offline", "Login fehlgeschlagen");
      const code = e && e.code ? e.code : "";
      log(`Login Fehler ${code}: ${(e && e.message) ? e.message : e}`, "error");
      el.btnLogin.disabled = false;
    }
  });

  // Logout
  el.btnLogout.addEventListener("click", async () => {
    el.kvErr.textContent = "–";
    setStatus("warn", "Logout…");
    log("Logout…");
    try {
      await auth.signOut();
      log("Logout OK.");
      // onAuthStateChanged macht Rest
    } catch (e) {
      setErr(e);
      log(`Logout Fehler: ${(e && e.message) ? e.message : e}`, "error");
    }
  });

  // Who am I
  el.btnWho.addEventListener("click", () => {
    const u = auth.currentUser;
    log(u ? `currentUser: ${u.email} uid=${u.uid}` : "currentUser: null");
  });

  // Firestore test (reads a simple doc)
  el.btnTest.addEventListener("click", async () => {
    el.kvErr.textContent = "–";
    const u = auth.currentUser;
    if (!u) {
      setStatus("warn", "Bitte erst einloggen");
      log("Firestore-Test: nicht eingeloggt.", "warn");
      return;
    }
    setStatus("warn", "Firestore-Test…");
    log("Firestore-Test: lese /__health/ping …");
    try {
      const docRef = db.collection("__health").doc("ping");
      const snap = await docRef.get();
      if (!snap.exists) {
        log("Firestore-Test: Dokument existiert NICHT (das ist OK). Rechte/Rules prüfen.", "warn");
      } else {
        log("Firestore-Test: Dokument:", "info");
        log(JSON.stringify(snap.data(), null, 2));
      }
      setStatus("online", "Firestore-Test fertig");
    } catch (e) {
      setErr(e);
      setStatus("offline", "Firestore-Test fehlgeschlagen");
      log(`Firestore Fehler ${e && e.code ? e.code : ""}: ${(e && e.message) ? e.message : e}`, "error");
    }
  });

  // Helpful: expose quick diagnostics
  window.__ANA035 = {
    build: BUILD,
    cfg,
    firebase,
    auth,
    db,
    log,
  };

  log("Ready. Gib E-Mail+Passwort ein und drücke Anmelden.");
})();
