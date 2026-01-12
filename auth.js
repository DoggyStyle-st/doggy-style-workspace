// ANA037 Phase 2 — auth.js (compat, iPad-safe)
(() => {
  const BUILD = "ANA037P2";

  const $ = (id) => document.getElementById(id);
  const setMsg = (t) => { const el = $("authMsg"); if (el) el.textContent = t || ""; };
  const setBuild = () => { const b = $("buildBadge"); if (b) b.textContent = BUILD; };

  function ensureFirebase() {
    // waits for compat SDK + config
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function poll() {
        try {
          if (window.firebase && typeof firebase.initializeApp === "function" && window.firebaseConfig) {
            // init once
            if (!firebase.apps || firebase.apps.length === 0) {
              firebase.initializeApp(window.firebaseConfig);
            }
            resolve(firebase);
            return;
          }
        } catch (e) { /* ignore */ }
        if (Date.now() - started > 8000) {
          reject(new Error("Firebase SDK nicht bereit (Timeout)"));
          return;
        }
        setTimeout(poll, 60);
      })();
    });
  }

  async function doLogin(email, pass) {
    const fb = await ensureFirebase();
    return fb.auth().signInWithEmailAndPassword(email, pass);
  }

  async function doRegister(email, pass) {
    const fb = await ensureFirebase();
    return fb.auth().createUserWithEmailAndPassword(email, pass);
  }

  async function doForgot(email) {
    const fb = await ensureFirebase();
    return fb.auth().sendPasswordResetEmail(email);
  }

  function bind() {
    setBuild();

    const form = $("loginForm");
    const btnLogin = $("btnLogin");
    const btnReg = $("btnRegister");
    const btnForgot = $("btnForgot");
    const emailEl = $("loginEmail");
    const passEl = $("loginPass");

    if (!form || !emailEl || !passEl) return false;

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      setMsg("");

      const email = (emailEl.value || "").trim();
      const pass = (passEl.value || "").trim();

      if (!email || !pass) {
        setMsg("Bitte E‑Mail und Passwort eingeben.");
        return;
      }

      // UX
      if (btnLogin) btnLogin.disabled = true;

      try {
        await doLogin(email, pass);
        // Hard cache bust to avoid stale app.html
        location.href = "./app.html?v=" + Date.now();
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        setMsg("Login fehlgeschlagen: " + msg);
      } finally {
        if (btnLogin) btnLogin.disabled = false;
      }
    });

    if (btnReg) btnReg.addEventListener("click", async () => {
      setMsg("");
      const email = (emailEl.value || "").trim();
      const pass = (passEl.value || "").trim();
      if (!email || !pass) { setMsg("Für Registrierung E‑Mail + Passwort eingeben."); return; }
      btnReg.disabled = true;
      try {
        await doRegister(email, pass);
        setMsg("Registriert. Du kannst dich jetzt anmelden.");
      } catch (e) {
        setMsg("Registrierung fehlgeschlagen: " + ((e && e.message) ? e.message : String(e)));
      } finally {
        btnReg.disabled = false;
      }
    });

    if (btnForgot) btnForgot.addEventListener("click", async () => {
      setMsg("");
      const email = (emailEl.value || "").trim();
      if (!email) { setMsg("Bitte E‑Mail für Passwort-Reset eingeben."); return; }
      btnForgot.disabled = true;
      try {
        await doForgot(email);
        setMsg("Reset-E‑Mail wurde gesendet (wenn die Adresse existiert).");
      } catch (e) {
        setMsg("Reset fehlgeschlagen: " + ((e && e.message) ? e.message : String(e)));
      } finally {
        btnForgot.disabled = false;
      }
    });

    return true;
  }

  // bind now or after DOM ready
  if (!bind()) {
    document.addEventListener("DOMContentLoaded", () => { bind(); }, { once: true });
  }
})();
