// Sichtbarer Build-Zähler (Variante A)
// Build-Counter (sichtbar unten links in der App)
const APP_BUILD = "V10FIX6-A-ANA021";
window.addEventListener("error",(e)=>{console.error("APP_ERROR",e.error||e.message);});
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const LS_KEY="ds_workspace_test_optik_01";

// --- Datum (lokal) ohne UTC-Verschiebung ---
// Wichtig für Kalender/"Heute" auf iPad (sonst springt es abends auf den nächsten Tag).
function toISODateLocal(date = new Date()){
  const d = new Date(date);
  // Offset so korrigieren, dass toISOString() den lokalen Tag liefert
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}
const CAPACITY = {
  Tagesbetreuung: 13,
  Urlaubsbetreuung: 10
};

// === Dynamische Kapazitäten (Standard + Ausnahmen nach Zeitraum) ===
// Ausnahme-Objekt: { from:"YYYY-MM-DD", to:"YYYY-MM-DD", Tagesbetreuung: 8, Urlaubsbetreuung: 6, note:"Event" }
function getCapacity(type, dateISO){
  try{
    const caps = state && S.capacities;
    if(!caps || !caps.default) return (CAPACITY[type] || 0);
    const d = String(dateISO||"").slice(0,10);
    
    // Sonntag-Regel (Basis): falls gesetzt, gilt diese Kapazität am Sonntag
    try{
      const dt = new Date(d + "T00:00:00");
      if(dt && dt.getDay && dt.getDay() === 0){
        const sv = Number(caps.sundayTotal);
        if(Number.isFinite(sv) && sv >= 0) return sv;
      }
    }catch(_){}

const exs = Array.isArray(caps.exceptions) ? caps.exceptions : [];
    for(const ex of exs){
      if(!ex || !ex.from || !ex.to) continue;
      const from = String(ex.from).slice(0,10);
      const to   = String(ex.to).slice(0,10);
      if(d >= from && d <= to){
        const v = Number(ex[type]);
        if(Number.isFinite(v) && v >= 0) return v;
      }
    }
    const base = Number(caps.default[type]);
    return (Number.isFinite(base) && base >= 0) ? base : (CAPACITY[type] || 0);
  }catch(_){
    return (CAPACITY[type] || 0);
  }
}

// Für Plausibilitätswarnungen über einen Zeitraum: kleinste Kapazität im Zeitraum (sicherer als "ein Tag")
function getMinCapacityForRange(type, fromISO, toISO){
  const from = String(fromISO||"").slice(0,10);
  const to = String(toISO||"").slice(0,10);
  if(!from || !to) return getCapacity(type, from);
  const a = new Date(from);
  const b = new Date(to);
  if(isNaN(a) || isNaN(b)) return getCapacity(type, from);
  let minCap = Infinity;
  const cur = new Date(a);
  while(cur <= b){
    const d = toISODateLocal(cur);
    minCap = Math.min(minCap, getCapacity(type, d));
    cur.setDate(cur.getDate()+1);
    if(minCap === 0) break;
  }
  return (minCap === Infinity) ? getCapacity(type, from) : minCap;
}


/* ===== Weg 2B: Cloud Sync + Login (Firebase) =====
   - Wenn window.firebaseConfig gesetzt ist: Login anzeigen + State aus Cloud laden/syncen
   - Wenn nicht: App läuft wie bisher rein lokal/offline
*/
const CLOUD = {
  enabled: false,
  reason: '',
  app: null,
  auth: null,
  db: null,
  orgId: (window.firebaseOrgId || "doggystyle"),
  // Wenn true: bei jedem App-Start Login erzwingen (kein "eingeloggt bleiben")
  forceLoginAlways: false,
  adminEmails: (window.firebaseAdminEmails || []),
  user: null,
  role: "local", // local | guest | admin | staff | customer
  userProfile: null,
  _pushTimer: null,
  _lastRemoteStamp: 0,
  lastPushOkAt: 0,
  lastPushError: ""
};

const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  CUSTOMER: 'customer',
  GUEST: 'guest',
  LOCAL: 'local'
};

function isStaff(){
  return CLOUD.role === ROLES.ADMIN || CLOUD.role === ROLES.STAFF;
}

function can(action){
  const r = CLOUD.role;
  if(r === ROLES.ADMIN){
    return true;
  }
  if(r === ROLES.STAFF){
    // staff darf arbeiten, aber keine destruktiven/admin-only Aktionen
    return !['wipe_all','import_backup','manage_users'].includes(action);
  }
  if(r === ROLES.CUSTOMER){
    return ['customer_view','customer_edit','customer_submit'].includes(action);
  }
  return false;
}

const SYNC = {
  localSavedAt: 0,
  // echter Netz-Ping (iOS/WebKit): letzter erfolgreicher Roundtrip
  netLastOkAt: 0,
  cloudLastSeenAt: 0,
  cloudPending: false,
  cloudLastOkAt: 0,
  cloudLastError: "",
  _cloudFirstSnap: false
};

function fmtDT(ts){
  if(!ts) return "—";
  try{
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}.${mm}.${yy} ${hh}:${mi}`;
  }catch(_){ return "—"; }
}

async function performLogout(){
  try{ if(CLOUD && CLOUD.enabled && CLOUD.auth){ await CLOUD.auth.signOut(); } }catch(e){}
  try{ sessionStorage.removeItem("dstest_sw_reloaded"); }catch(e){}
  try{ location.href = "login.html"; }catch(e){}
}

function updateSyncUI(){
  const pill = document.getElementById('syncStatus');
  const userEl = document.getElementById('syncUser');
  const details = document.getElementById('syncDetails');
  const manualBtn = document.getElementById('manualSaveBtn');
  if(userEl){
    if(CLOUD.enabled && CLOUD.user){
      userEl.style.display = 'inline-flex';
      userEl.textContent = (CLOUD.user.email || 'eingeloggt');
    } else {
      try{ const ba=document.querySelector(".bottom-actions"); if(ba) ba.style.display="block"; }catch(e){}
      userEl.style.display = 'none';
      userEl.textContent = '';
    }
  }

  // iOS/WebKit: navigator.onLine ist teils falsch (insb. PWA). Deshalb zusätzlich einen echten Netz-Ping verwenden.
  const pingOnline = !!SYNC.netLastOkAt && (Date.now() - SYNC.netLastOkAt < 1000*45);
  const navOnline = (typeof navigator !== 'undefined') ? !!navigator.onLine : false;
  const netOnline = pingOnline || navOnline;
  const cloudOnline = !!SYNC.cloudLastOkAt && (Date.now() - SYNC.cloudLastOkAt < 1000*60*60*24*7);
  // iOS/Safari/PWA: navigator.onLine ist nicht immer zuverlässig -> UI-Status auf "effektiv online" stützen.
  const effectiveOnline = netOnline || cloudOnline;
  const uiOnline = effectiveOnline;
  try{ if(pill){ pill.classList.toggle('is-online', !!uiOnline); pill.classList.toggle('is-offline', !uiOnline); } }catch(e){}
  const localLine = `Lokal gespeichert: ${fmtDT(SYNC.localSavedAt)}`;

  // Verbindung (Internet/Cloud-Effektivität)
  const netLine = `Verbindung: ${uiOnline ? 'Online' : 'Offline'}`;

  let pillText = effectiveOnline ? 'Online' : 'Offline';
  let cloudLine = 'Cloud: aus';

  if(!cloudIsEnabled()){
    // Cloud nicht möglich (SDK fehlt) – das ist der Hauptgrund für "immer Offline" in der Wahrnehmung
    cloudLine = window.firebaseConfig ? 'Cloud: bereit (SDK nicht geladen)' : 'Cloud: aus';
    if(window.firebaseConfig && CLOUD.reason){
      cloudLine += ` · ${CLOUD.reason}`;
    }
  } else if(CLOUD.enabled){
    if(!CLOUD.user){
      pillText = `${uiOnline ? 'Online' : 'Offline'} · Cloud: Login nötig`;
      cloudLine = 'Cloud: nicht angemeldet';
    } else if(SYNC.cloudLastError){
      pillText = `${uiOnline ? 'Online' : 'Offline'} · Cloud: Fehler`;
      cloudLine = `Cloud Fehler: ${SYNC.cloudLastError}`;
    } else if(SYNC.cloudPending){
      pillText = `${uiOnline ? 'Online' : 'Offline'} · Cloud: Sync…`;
      cloudLine = `Cloud Sync: läuft (letztes OK ${fmtDT(SYNC.cloudLastOkAt)})`;
    } else {
      pillText = `${uiOnline ? 'Online' : 'Offline'} · Cloud: OK`;
      cloudLine = `Cloud zuletzt OK: ${fmtDT(SYNC.cloudLastOkAt)} · Server: ${fmtDT(SYNC.cloudLastSeenAt)}`;
    }
  }

  if(pill) pill.textContent = `${pillText} · ${fmtDT(SYNC.localSavedAt)}`;
  const dot=document.getElementById('syncDot');
  if(dot){ dot.classList.toggle('online', !!uiOnline); dot.classList.toggle('offline', !uiOnline); }
  if(details) details.textContent = `${localLine}\n${netLine}\n${cloudLine}`;

  // Manual cloud save: only enable when Cloud is active + logged in
  if(manualBtn){
    const ok = !!(CLOUD.enabled && CLOUD.user);
    // Wenn Cloud grundsätzlich nicht verfügbar: Button ausblenden (wirkt sonst "kaputt")
    if(!cloudIsEnabled()){
      manualBtn.style.display = 'none';
    } else {
      manualBtn.style.display = '';
      manualBtn.disabled = !ok;
      manualBtn.title = ok ? 'Jetzt sofort synchronisieren' : 'Cloud nicht aktiv oder nicht angemeldet';
      manualBtn.style.opacity = ok ? '1' : '0.55';
    }
  }
}

/* ===== Dokument/PDF Modal (PWA/iPad-friendly) ===== */
const DOCMOD = { url: null, filename: null };

// Mini Toast helper (kurzes Feedback bei Kopieren/Teilen)
let __toastTimer = null;
function showMiniToast(msg){
  try{
    let t = document.getElementById('miniToast');
    if(!t){
      t = document.createElement('div');
      t.id = 'miniToast';
      t.className = 'mini-toast';
      document.body.appendChild(t);
    }
    t.textContent = String(msg||'');
    t.classList.add('is-on');
    clearTimeout(__toastTimer);
    __toastTimer = setTimeout(()=> t.classList.remove('is-on'), 1400);
  }catch(_){/* ignore */}
}

function sanitizeFilename(name){
  const base = String(name||'Dokument').trim();
  // Keep it iOS/Windows friendly
  return base
    .replace(/[\\/:*?\"<>|]/g,'-')
    .replace(/\s+/g,'_')
    .replace(/_+/g,'_')
    .replace(/[^\w\-\.äöüÄÖÜß]/g,'')
    .slice(0, 80) || 'Dokument';
}

function suggestFilename(title){
  const t = String(title||'').toLowerCase();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  if(t.includes('monatsnachweis')) return `01_Monatsnachweis_${ym}.pdf`;
  if(t.includes('monats') && t.includes('export')) return `01_MonatsExport_${ym}.pdf`;
  if(t.includes('vertrag')) return `Betreuungsvertrag.pdf`;
  return `${sanitizeFilename(title||'Dokument')}.pdf`;
}
function initDocModal(){
  const modal = document.getElementById('docModal');
  if(!modal || modal.dataset.bound) return;
  modal.dataset.bound = '1';
  const close = ()=> closeDocModal();
  const btnClose = document.getElementById('docModalClose');
  const backdrop = document.getElementById('docModalBackdrop');
  const btnPrint = document.getElementById('docModalPrint');
  const btnOpen = document.getElementById('docModalOpen');
  const btnShare = document.getElementById('docModalShare');
  const meta = document.getElementById('docModalMeta');
  if(btnClose) btnClose.onclick = close;
  if(backdrop) backdrop.onclick = close;
  // Keyboard: ESC schließt, TAB bleibt im Modal
  document.addEventListener('keydown', (e)=>{
    if(!modal.classList.contains('is-open')) return;
    if(e.key==='Escape') { e.preventDefault(); close(); return; }
    if(e.key==='Tab'){
      const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const list = Array.from(focusables).filter(el=> !el.disabled && el.offsetParent!==null);
      if(!list.length) return;
      const first = list[0], last = list[list.length-1];
      const active = document.activeElement;
      if(e.shiftKey && active===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && active===last){ e.preventDefault(); first.focus(); }
    }
  });
  if(btnPrint) btnPrint.onclick = ()=>{
    try{
      const fr = document.getElementById('docModalFrame');
      if(fr && fr.contentWindow) fr.contentWindow.print();
    }catch(e){ alert('Drucken/Speichern ist auf diesem Gerät nicht verfügbar.'); }
  };
  if(btnOpen) btnOpen.onclick = ()=>{
    if(DOCMOD.url) window.open(DOCMOD.url, '_blank');
  };

  // Share (iOS/Android, wenn verfügbar)
  if(btnShare){
    const canShare = !!navigator.share;
    btnShare.style.display = canShare ? '' : 'none';
    btnShare.onclick = async ()=>{
      if(!navigator.share) return;
      try{
        // Für Blob-URLs teilen wir den Titel + Dateiname (iOS PWA kann Files teils nicht direkt)
        await navigator.share({
          title: document.getElementById('docModalTitle')?.textContent || 'Dokument',
          text: `Dateiname: ${DOCMOD.filename || ''}`
        });
        showMiniToast('Teilen geöffnet');
      }catch(_){ /* user cancelled */ }
    };
  }

  // Copy filename tip
  if(meta && !meta.dataset.bound){
    meta.dataset.bound = '1';
    meta.addEventListener('click', (e)=>{
      const t = e.target;
      if(t && t.id==='docModalCopyName'){
        const name = DOCMOD.filename || '';
        if(!name) return;
        try{
          navigator.clipboard?.writeText(name);
          showMiniToast('Dateiname kopiert');
          t.textContent = 'Kopiert ✓';
          setTimeout(()=>{ t.textContent = 'Kopieren'; }, 1200);
        }catch(_){
          alert(name);
        }
      }
    });
  }
}

function openDocModal(url, title, hint, filename){
  initDocModal();
  const modal = document.getElementById('docModal');
  const frame = document.getElementById('docModalFrame');
  const ttl = document.getElementById('docModalTitle');
  const h = document.getElementById('docModalHint');
  const meta = document.getElementById('docModalMeta');
  if(!modal || !frame) return;
  // Focus restore
  DOCMOD.__prevFocus = document.activeElement;
  // cleanup old
  if(DOCMOD.url){ try{ URL.revokeObjectURL(DOCMOD.url); }catch(_){ } }
  DOCMOD.url = url;
  DOCMOD.filename = filename || suggestFilename(title);
  if(ttl) ttl.textContent = title || 'Dokument';
  if(meta){
    const fn = escapeHtml(DOCMOD.filename);
    meta.innerHTML = `Dateiname‑Tipp: <code>${fn}</code> <button class="btn mini" type="button" id="docModalCopyName">Kopieren</button>`;
  }
  if(h) h.textContent = hint || 'Tipp: iPad/iPhone → „Drucken/Speichern“ → Teilen → „In Dateien sichern“. (So landet das PDF im gewünschten Ordner.)';
  frame.title = title || 'Dokument';
  frame.src = url;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
  // Focus first action for iPad keyboard users
  setTimeout(()=>{ document.getElementById('docModalClose')?.focus(); }, 0);
}

function closeDocModal(){
  const modal = document.getElementById('docModal');
  const frame = document.getElementById('docModalFrame');
  if(frame) frame.src = 'about:blank';
  if(modal){
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden','true');
  }
  document.body.style.overflow = '';
  // restore focus
  try{ DOCMOD.__prevFocus?.focus(); }catch(_){ }
  if(DOCMOD.url){ try{ URL.revokeObjectURL(DOCMOD.url); }catch(_){ } }
  DOCMOD.url = null;
  DOCMOD.filename = null;
}

function openHtmlInModal(title, html, hint){
  // Ensure title is present inside the document so iOS/print dialogs show a helpful name
  let content = String(html||'');
  if(!/<title>/i.test(content)){
    const safe = escapeHtml(title||'Dokument');
    content = content.replace(/<head>/i, `<head><title>${safe}</title>`);
  }
  const blob = new Blob([content], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  openDocModal(url, title, hint, suggestFilename(title));
}

function cloudIsEnabled(){
  // Cloud nur möglich, wenn Config vorhanden UND Firebase SDK geladen ist.
  // (In PWA offline wird das SDK über ServiceWorker gecached.)
  return !!(window.firebaseConfig && window.firebase && window.firebase.initializeApp && window.firebase.auth);
}

function showAuthGate(show){
  const el = document.getElementById("authGate");
  if(!el) return;
  el.style.display = show ? "flex" : "none";
}

function setAuthMsg(msg){
  const el = document.getElementById("authMsg");
  if(el) el.textContent = msg || "";
}

async function cloudInit(){
  if(!cloudIsEnabled()){
    // genauer Grund für UI
    if(window.firebaseConfig && (!window.firebase || !window.firebase.initializeApp)){
      CLOUD.reason = 'Firebase SDK nicht verfügbar (offline/blocked?)';
    } else if(window.firebaseConfig && window.firebase && !window.firebase.auth){
      CLOUD.reason = 'Firebase Auth SDK fehlt';
    } else {
      CLOUD.reason = '';
    }
    CLOUD.enabled = false;
    return false;
  }
  try{
    CLOUD.enabled = true;
    CLOUD.reason = '';
    // initializeApp nur einmal (sonst Fehler bei Navigation/Reload)
    CLOUD.app = (window.firebase.apps && window.firebase.apps.length)
      ? window.firebase.apps[0]
      : window.firebase.initializeApp(window.firebaseConfig);
    CLOUD.auth = window.firebase.auth();
    CLOUD.db = window.firebase.firestore();
    // Firestore Offline-Persistenz (A: Testmodus) – sorgt dafür, dass Daten auch nach Reload / ohne Netz bleiben
    try{ await CLOUD.db.enablePersistence({synchronizeTabs:true}); }catch(e){ /* ignore (z.B. multiple tabs / Safari restrictions) */ }

    // iOS/PWA: Persistenz IMMER auf LOCAL setzen (sonst springt man gerne wieder ins Login)
    try {
      if (CLOUD.auth && CLOUD.auth.setPersistence) {
        await CLOUD.auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
      }
    } catch(e) { /* ignore */ }
    return true;
  }catch(err){
    console.error("Firebase init failed", err);
    CLOUD.enabled = false;
    return false;
  }
}

function cloudStateRef(){
  // EIN zentraler Workspace-State pro Orga: orgs/{orgId}/meta/workspace_state
  if(!CLOUD.enabled) return null;
  return CLOUD.db.collection("orgs").doc(CLOUD.orgId).collection("meta").doc("workspace_state");
}

function cloudUsersCol(){
  return CLOUD.db.collection("orgs").doc(CLOUD.orgId).collection("users");
}

function cloudUserDoc(uid){
  return cloudUsersCol().doc(uid);
}

function cloudTasksCol(){
  return CLOUD.db.collection("orgs").doc(CLOUD.orgId).collection("tasks");
}

async function loadOrCreateUserProfile(user){
  if(!CLOUD.enabled || !user) return null;
  const uid = user.uid;
  const email = (user.email||"").toLowerCase();

  // Admin-Whitelist hat Vorrang
  const isAdminEmail = CLOUD.adminEmails.map(x=>String(x).toLowerCase()).includes(email);

  const ref = cloudUserDoc(uid);
  let snap = null;
  try{ snap = await ref.get(); }catch(e){ console.warn('User profile read failed', e); }

  if(!snap || !snap.exists){
    const role = isAdminEmail ? ROLES.ADMIN : ROLES.CUSTOMER;
    let pendingName = '';
    try{ pendingName = (localStorage.getItem('dstest_pending_name')||'').trim(); }catch(_){ }
    if(pendingName){ try{ localStorage.removeItem('dstest_pending_name'); }catch(_){ } }
    const displayName = pendingName || ((user.email||'').split('@')[0]||'');
    const profile = {
      uid,
      email: user.email||"",
      displayName,
      role,
      createdAt: Date.now()
    };
    try{ await ref.set(profile, {merge:true}); }catch(e){ console.warn('User profile create failed', e); }
    return profile;
  }

  const data = snap.data()||{};
  // falls jemand in Whitelist ist: immer admin
  if(isAdminEmail && data.role !== ROLES.ADMIN){
    try{ await ref.set({role: ROLES.ADMIN}, {merge:true}); }catch(_){ }
    data.role = ROLES.ADMIN;
  }
  return {
    uid,
    email: data.email || user.email || "",
    displayName: (data.displayName || ((user.email||'').split('@')[0]||'')),
    role: data.role || (isAdminEmail ? ROLES.ADMIN : ROLES.CUSTOMER),
    createdAt: data.createdAt || 0
  };
}

async function cloudLoadState(){
  if(!CLOUD.enabled) return null;
  const ref = cloudStateRef();
  if(!ref) return null;
  const snap = await ref.get();
  if(!snap.exists) return null;
  const data = snap.data();
  if(!data || !data.payload) return null;
  CLOUD._lastRemoteStamp = Number(data.updatedAt || 0);
  SYNC.cloudLastSeenAt = CLOUD._lastRemoteStamp;
  updateSyncUI();
  return data.payload;
}


// --- Robust Startup Sync Helpers ---
// In iOS/Safari kann es vorkommen, dass beim Reload der erste Firestore-Read leer/zu früh ist.
// Diese Helper sorgen dafür, dass Remote-State zuverlässig übernommen und lokal gespeichert wird.

function isStateEffectivelyEmpty(s){
  try{
    const pets = Array.isArray(s?.pets) ? s.pets.filter(x=>x && !x.isPlaceholder) : [];
    const customers = Array.isArray(s?.customers) ? s.customers.filter(x=>x) : [];
    const docs = Array.isArray(s?.docs) ? s.docs.filter(x=>x) : [];
    const dogs = Array.isArray(s?.dogs) ? s.dogs.filter(x=>x && !x.isPlaceholder) : [];
    return (pets.length===0 && customers.length===0 && docs.length===0 && dogs.length===0);
  }catch(_){
    return true;
  }
}


// --- Phase 1: Cloud-Datenfluss Merge-Strategie ---
// Ziel: Remote darf lokale Stammdaten (Hunde/Kunden) nicht "leer" überschreiben.
function _stampOf(it){
  if(!it) return 0;
  const v = (it._updatedAt ?? it.updatedAt ?? it.updated_at ?? it.modifiedAt ?? it.changedAt);
  if(typeof v === 'number' && isFinite(v)) return v;
  if(typeof v === 'string'){
    const n = Number(v);
    if(isFinite(n) && n>0) return n;
    const p = Date.parse(v);
    if(isFinite(p) && p>0) return p;
  }
  return 0;
}

function _mergeById(remoteArr, localArr){
  const m = new Map();
  for (const it of (remoteArr||[])) {
    if (it && it.id) m.set(it.id, it);
  }
  for (const it of (localArr||[])) {
    if (!it || !it.id) continue;
    const r = m.get(it.id);
    if (!r) { m.set(it.id, it); continue; }
    const rt = _stampOf(r);
    const lt = _stampOf(it);
    if (lt > rt) m.set(it.id, it);
  }
  return Array.from(m.values());
}

function _shallowMergeObj(a, b){
  if (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object' && !Array.isArray(b)){
    return { ...a, ...b };
  }
  return (a !== undefined) ? a : b;
}

function mergeStatePreferRemote(remoteRaw, localRaw){
  const remote = remoteRaw || {};
  const local = localRaw || {};
  const out = { ...local, ...remote };

  // Arrays: ID-basiert mergen (remote + lokale Ergänzungen, pro Item jüngeres gewinnt)
  const idArrays = [
    'customers','pets','dogs','stays','invoices','docs','meds','medications','hygieneLogs','tasks','worksheets','entries'
  ];
  for (const k of idArrays){
    if (Array.isArray(remote[k]) || Array.isArray(local[k])){
      out[k] = _mergeById(remote[k], local[k]);
    }
  }

  // Objekte: remote überschreibt, aber lokale Defaults bleiben erhalten
  const objKeys = ['settings','templates','company','meta','roles'];
  for (const k of objKeys){
    out[k] = _shallowMergeObj(remote[k], local[k]);
  }

  return out;
}
// --- /Merge-Strategie ---

function applyRemoteState(remote, remoteStamp, source){
  if(!remote) return false;
  try{
    // Merge: Remote ist nicht alleinige Wahrheit, lokale Stammdaten dürfen nicht verschwinden
    state = mergeStatePreferRemote(remote, state);
    // Falls der Remote-State keinen Stempel trägt: konservativ setzen
    if(remoteStamp && (!S._cloudUpdatedAt || Number(S._cloudUpdatedAt) < Number(remoteStamp))){
      S._cloudUpdatedAt = Number(remoteStamp);
    }
    ensureStateShape();
    ensureContractDefaults();
    migrateToV2();
    pruneInvoiceDocs();
    ensureDefaultDog();
    saveState(); // schreibt in localStorage + setzt _localUpdatedAt
    renderDogs();
    renderDocs();
    renderInvoiceList();
    // Home/Panel nicht erzwingen – wir lassen die aktuelle Ansicht
    try{ console.log("[SYNC] Applied remote state from", source||"unknown", "stamp", remoteStamp||0); }catch(_){ }
    return true;
  }catch(e){
    console.error("applyRemoteState failed", e);
    return false;
  }
}

async function cloudLoadStateWithRetry(maxTries=3){
  let lastErr = null;
  for(let i=0;i<maxTries;i++){
    try{
      const remote = await cloudLoadState();
      if(remote) return {remote, err:null};
    }catch(e){
      lastErr = e;
    }
    // kurzer Backoff – Safari/iOS braucht manchmal einen Tick nach Auth/Persistenz
    await new Promise(r=>setTimeout(r, 250 + i*250));
  }
  return {remote:null, err:lastErr};
}

// ANA-007: quick cloud "ping" so the status can turn Online right after login
async function cloudPing(timeoutMs=3500){
  if(!CLOUD.enabled || !CLOUD.user) return false;
  const ref = cloudStateRef();
  if(!ref) return false;

  const timeout = new Promise((_, reject)=>setTimeout(()=>reject(new Error('timeout')), timeoutMs));
  try{
    await Promise.race([ref.get(), timeout]); // even a missing doc counts as a successful cloud roundtrip
    SYNC.cloudLastOkAt = Date.now();
    SYNC.cloudLastError = '';
    updateSyncUI();
    return true;
  }catch(e){
    SYNC.cloudLastError = String(e && (e.message||e.code) || e);
    updateSyncUI();
    return false;
  }
}

// ANA016: echter Netz-Ping (gegen iOS/WebKit navigator.onLine-Bugs)
async function netPing(timeoutMs=2500){
  const timeout = new Promise((_, reject)=>setTimeout(()=>reject(new Error('timeout')), timeoutMs));
  try{
    // kleines, stabiles Asset – immer no-store, damit es wirklich ein Roundtrip ist
    const url = `manifest.json?ping=${Date.now()}`;
    const res = await Promise.race([
      fetch(url, { cache: 'no-store' }),
      timeout
    ]);
    if(res && res.ok){
      SYNC.netLastOkAt = Date.now();
      return true;
    }
    return false;
  }catch(e){
    return false;
  }
}

// ANA016: hält den Status nach Login stabil "Online"
function startOnlineWatchdog(){
  try{
    if(window.__dsOnlineWatchdog){ clearInterval(window.__dsOnlineWatchdog); }
  }catch(_){ }

  // sofort einmal markieren: nach erfolgreichem Login gilt die Sitzung als online
  try{ SYNC.cloudLastOkAt = Date.now(); SYNC.cloudLastError = ""; }catch(_){ }
  updateSyncUI();

  window.__dsOnlineWatchdog = setInterval(async ()=>{
    // wenn abgemeldet -> stoppen
    if(!(CLOUD && CLOUD.enabled && CLOUD.user)) return;
    try{ await netPing(); }catch(_){ }
    // Cloud-Ping ist optional: wenn SDK/Rules zicken, soll UI trotzdem "Online" zeigen, solange Netz ok
    try{ await cloudPing(2500); }catch(_){ }
    updateSyncUI();
  }, 15000);
}


function cloudPushQueued(){
  if(!CLOUD.enabled) return;
  clearTimeout(CLOUD._pushTimer);
  SYNC.cloudPending = true;
  updateSyncUI();
  CLOUD._pushTimer = setTimeout(()=>cloudPushNow().catch(console.error), 700);
}

// Alias: wird von saveState() verwendet (ältere Namen kompatibel halten)
function cloudSchedulePush(){
  try{ return cloudPushQueued(); }catch(e){ console.warn('cloudSchedulePush', e); }
}


async function cloudPushNow(){
  if(!CLOUD.enabled) return;
  if(!CLOUD.user) throw new Error("Nicht angemeldet");
  SYNC.cloudPending = true;
  updateSyncUI();
  const stamp = Date.now();
  // Marker im State, damit wir Remote-Updates sauber vergleichen können
  try{ S._cloudUpdatedAt = stamp; S._localUpdatedAt = stamp; }catch(_){/* ignore */}
  // last write wins (v1). Später: echtes Merge pro Objekt.
  try{
    const ref = cloudStateRef();
  if(!ref) return;
  await ref.set({
      payload: state,
      updatedAt: stamp,
      updatedBy: CLOUD.user.email || CLOUD.user.uid
    }, {merge: true});
    // C1: Wenn Push erfolgreich war, pending-Flags für Rechnungsstatus löschen
    try{
      if(Array.isArray(state?.invoices)){
        S.invoices.forEach(iv=>{ if(iv) iv._pendingStatusSync = false; });
      }
      saveState();
    }catch(_){ }

    CLOUD.lastPushOkAt = stamp;
    CLOUD.lastPushError = "";
    SYNC.cloudLastOkAt = stamp;
    SYNC.cloudLastError = "";
    SYNC.cloudPending = false;
  }catch(e){
    CLOUD.lastPushError = String(e?.message||e||"Cloud write failed");
    SYNC.cloudLastError = CLOUD.lastPushError;
    SYNC.cloudPending = false;
    throw e;
  }finally{
    updateSyncUI();
  }
}

/* ===== Rollen, Kundenportal & Aufgaben (Weg A) ===== */

function hideStaffUIForCustomer(){
  // Tabs / Panels umschalten
  try{
    const tabs = $$('.tabs .tab');
    tabs.forEach(btn=>{
      const t = btn.dataset.tab;
      if(t === 'customerPortal'){
        btn.style.display = 'none';
      } else {
        btn.style.display = 'none';
      }
    });
    const nav = document.querySelector('nav.tabs');
    if(nav) nav.style.display = 'none';
  }catch(_){ }
  try{
    // alle Panels verstecken außer customerPortal
    $$('.panel').forEach(p=>{ p.classList.remove('is-active'); p.style.display = 'none'; });
    const cp = document.getElementById('customerPortal');
    if(cp){ cp.style.display = ''; cp.classList.add('is-active'); }
  }catch(_){ }
}

function showStaffUI(){
  try{
    const nav = document.querySelector('nav.tabs');
    if(nav) nav.style.display = '';
    $$('.panel').forEach(p=>{ p.style.display = ''; });
    const cp = document.getElementById('customerPortal');
    if(cp){ cp.style.display = 'none'; cp.classList.remove('is-active'); }
  }catch(_){ }
  // Inbox nur für staff/admin
  try{
    const tabInbox = document.getElementById('tabInbox');
    if(tabInbox) tabInbox.style.display = isStaff() ? '' : 'none';
  }catch(_){ }

  // Kalender nur für staff/admin
  try{
    const tabCal = document.getElementById('tabCalendar');
    if(tabCal) tabCal.style.display = isStaff() ? '' : 'none';
  }catch(_){ }
}

async function initCustomerPortal(){
  hideStaffUIForCustomer();
  updateSyncUI();
  try{ await loadTemplates(); }catch(_){ }
  // Logout Button
  const btn = document.getElementById('btnCustomerLogout');
  if(btn) btn.onclick = async ()=>{ try{ await CLOUD.auth.signOut(); }catch(_){ } };

  // Live-Listener: offene Aufgaben für diesen Kunden
  const uid = CLOUD.user?.uid;
  if(!uid) return;

  const listEl = document.getElementById('customerTaskList');
  const subtitle = document.getElementById('customerPortalSubtitle');
  const editor = document.getElementById('customerTaskEditor');
  if(editor) editor.style.display = 'none';

  // Back
  const btnBack = document.getElementById('btnCustomerTaskBack');
  if(btnBack) btnBack.onclick = ()=>{
    if(editor) editor.style.display = 'none';
    if(listEl) listEl.style.display = '';
  };

  const q = cloudTasksCol().where('customerUid','==',uid).where('status','==','open').orderBy('createdAt','desc');
  q.onSnapshot((snap)=>{
    const tasks = [];
    snap.forEach(doc=>{ tasks.push({id: doc.id, ...doc.data()}); });
    renderCustomerTaskList(tasks);
    if(subtitle){
      subtitle.textContent = tasks.length ? 'Doggy Style Hundepension hat Aufgaben für dich.' : 'Aktuell liegen keine Aufgaben für dich vor.';
    }
  }, (err)=>{
    console.error('customer tasks listener', err);
    if(subtitle) subtitle.textContent = 'Fehler beim Laden der Aufgaben.';
  });

  function renderCustomerTaskList(tasks){
    if(!listEl) return;
    listEl.innerHTML = '';
    if(!tasks.length){
      listEl.innerHTML = `<div class="muted">— keine Aufgaben —</div>`;
      return;
    }
    tasks.forEach(t=>{
      const row = document.createElement('div');
      row.className = 'list-item';
      const when = t.createdAt ? fmtDT(t.createdAt) : '';
      row.innerHTML = `<div><strong>${escapeHtml(t.title||'Aufgabe')}</strong><small>${escapeHtml(t.templateId||'')}${when?(' · '+when):''}</small></div>`;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const btnOpen = document.createElement('button');
      btnOpen.className = 'smallbtn';
      btnOpen.textContent = 'Öffnen';
      btnOpen.onclick = ()=>openCustomerTask(t);
      actions.appendChild(btnOpen);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  let _draftTimer = null;
  async function openCustomerTask(task){
    if(!task || !task.templateId) return;
    const t = getTemplate(task.templateId);
    if(!t){ alert('Vorlage nicht gefunden.'); return; }

    if(listEl) listEl.style.display = 'none';
    if(editor) editor.style.display = '';
    const titleEl = document.getElementById('customerTaskTitle');
    const metaEl = document.getElementById('customerTaskMeta');
    const root = document.getElementById('customerTaskFormRoot');
    const hint = document.getElementById('customerTaskSaveHint');
    if(titleEl) titleEl.textContent = task.title || t.name || 'Aufgabe';
    if(metaEl) metaEl.textContent = `Formular: ${t.name||task.templateId}`;
    if(hint) hint.textContent = '';

    const working = {
      fields: (task.payloadDraft?.fields || task.payloadSubmitted?.fields || {}),
      meta: (task.payloadDraft?.meta || task.payloadSubmitted?.meta || {})
    };

    // Render
    if(root) root.innerHTML = '';
    const renderFieldSimple = (f, value, bucket)=>{
      const wrap=document.createElement('label');
      wrap.className='field'; wrap.style.minWidth='260px';
      wrap.dataset.key = f.key;
      wrap.innerHTML=`<span>${escapeHtml(f.label)}${f.required?" *":""}</span>`;
      let input;
      if(f.type==='textarea'){ input=document.createElement('textarea'); input.value=value||''; }
      else if(f.type==='select'){
        input=document.createElement('select');
        input.innerHTML=(f.options||[]).map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
        input.value=value || (f.options?.[0]||'');
      }
      else if(f.type==='checkbox'){ input=document.createElement('input'); input.type='checkbox'; input.checked=!!value; input.style.width='22px'; input.style.height='22px'; }
      else { input=document.createElement('input'); input.type=f.type||'text'; input.value=value||''; }
      input.dataset.key = f.key;
      input.oninput = ()=>{ bucket[f.key] = (f.type==='checkbox')?input.checked:input.value; scheduleDraftSave(); };
      input.onchange = ()=>{ bucket[f.key] = (f.type==='checkbox')?input.checked:input.value; scheduleDraftSave(); };
      wrap.appendChild(input);
      return wrap;
    };

    const build = ()=>{
      if(!root) return;
      root.innerHTML='';
      t.sections.forEach(sec=>{
        const card=document.createElement('div');
        card.className='card';
        card.innerHTML=`<h2>${escapeHtml(sec.title)}</h2>`;
        sec.fields.forEach(f=>card.appendChild(renderFieldSimple(f, working.fields[f.key], working.fields)));
        root.appendChild(card);
      });
      const metaCard=document.createElement('div');
      metaCard.className='card';
      metaCard.innerHTML=`<h2>Ort / Datum</h2>`;
      (t.meta||[]).forEach(f=>metaCard.appendChild(renderFieldSimple(f, working.meta[f.key], working.meta)));
      root.appendChild(metaCard);
    };
    build();

    const saveDraftNow = async ()=>{
      if(!CLOUD.user) return;
      const payloadDraft = { fields: working.fields, meta: working.meta };
      try{
        await cloudTasksCol().doc(task.id).set({
          payloadDraft,
          updatedAt: Date.now()
        }, {merge:true});
        if(hint) hint.textContent = `✅ Gespeichert: ${fmtDT(Date.now())}`;
      }catch(e){
        console.error('draft save', e);
        if(hint) hint.textContent = '❌ Speichern fehlgeschlagen (bitte später erneut versuchen).';
      }
    };

    const scheduleDraftSave = ()=>{
      clearTimeout(_draftTimer);
      _draftTimer = setTimeout(()=>saveDraftNow(), 600);
      if(hint) hint.textContent = '… speichert …';
    };

    // Submit
    const btnSubmit = document.getElementById('btnCustomerTaskSubmit');
    if(btnSubmit) btnSubmit.onclick = async ()=>{
      if(!confirm('Formular absenden? Danach kann es nicht mehr geändert werden.')) return;
      try{
        await cloudTasksCol().doc(task.id).set({
          payloadSubmitted: { fields: working.fields, meta: working.meta },
          status: 'submitted',
          submittedAt: Date.now(),
          updatedAt: Date.now()
        }, {merge:true});
        alert('✅ Danke! Formular wurde übermittelt.');
        if(editor) editor.style.display = 'none';
        if(listEl) listEl.style.display = '';
      }catch(e){
        console.error('submit', e);
        alert('❌ Absenden fehlgeschlagen: '+(e.message||e));
      }
    };
  }
}

async function initStaffFeatures(){
  showStaffUI();
  updateSyncUI();

  // Kalender Controls (Monat vor/zurück/heute)
  try{ wireCalendarControls(); }catch(e){ console.warn(e); }

  // Rechte in UI spiegeln
  try{
    const btnWipe = document.getElementById('btnWipe');
    if(btnWipe) btnWipe.style.display = can('wipe_all') ? '' : 'none';
    const btnImport = document.getElementById('btnBackupImport');
    if(btnImport) btnImport.style.display = can('import_backup') ? '' : 'none';
  }catch(_){ }

  // Admin Cards (Users + Task creation)
  const adminTaskCard = document.getElementById('adminTaskCard');
  const adminUserCard = document.getElementById('adminUserCard');
  if(adminTaskCard) adminTaskCard.style.display = isStaff() ? '' : 'none';
  if(adminUserCard) adminUserCard.style.display = (CLOUD.role === ROLES.ADMIN) ? '' : 'none';

  // Task creation (staff+admin)
  try{ await wireTaskCreation(); }catch(e){ console.warn(e); }
  // User management (admin)
  try{ if(CLOUD.role === ROLES.ADMIN) await wireUserManagement(); }catch(e){ console.warn(e); }
  // Inbox
  try{ await wireInbox(); }catch(e){ console.warn(e); }
}

async function wireTaskCreation(){
  const selCustomer = document.getElementById('taskCustomerSelect');
  const inpCustomerSearch = document.getElementById('taskCustomerSearch');
  const selTemplate = document.getElementById('taskTemplateSelect');
  const titleInput = document.getElementById('taskTitleInput');
  const btnCreate = document.getElementById('btnTaskCreate');
  const msgEl = document.getElementById('taskCreateMsg');
  const btnMoreCustomers = document.getElementById('btnCustomersMore');
  const customerCountEl = document.getElementById('taskCustomerCount');
  if(!selCustomer || !selTemplate || !btnCreate) return;

  // Templates laden (Vorlagen)
  try{
    await loadTemplates();
    const list = (TEMPLATES||[]);
    selTemplate.innerHTML = list.map(t=>{
      const id = t.id || t.templateId || t.name || '';
      const label = t.name || t.title || id || 'Vorlage';
      return `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
    }).join('');
  }catch(e){
    console.warn('templates load', e);
    selTemplate.innerHTML = '<option value="">(keine Vorlagen)</option>';
  }

  // Customers (mit Suche + "Mehr laden")
  let _allCustomers = [];
  let _custLastDoc = null;
  let _custHasMore = true;
  let _custLoading = false;
  const CUSTOMER_PAGE_SIZE = 200;

  const customerLabel = (u)=>{
    const dn = String(u.displayName||'').trim();
    const em = String(u.email||u.uid||'').trim();
    return dn ? `${dn} – ${em}` : em;
  };

  const renderCustomers = (q='')=>{
    const query = (q||'').trim().toLowerCase();
    const list = query ? _allCustomers.filter(u=>{
      const dn = String(u.displayName||'').toLowerCase();
      const em = String(u.email||u.uid||'').toLowerCase();
      return dn.includes(query) || em.includes(query);
    }) : _allCustomers;

    if(!list.length){
      selCustomer.innerHTML = '<option value="">Keine Treffer</option>';
    } else {
      selCustomer.innerHTML = list.map(u=>`<option value="${escapeHtml(u.uid)}">${escapeHtml(customerLabel(u))}</option>`).join('');
    }

    if(customerCountEl) customerCountEl.textContent = `${_allCustomers.length} geladen`;
    if(btnMoreCustomers) btnMoreCustomers.style.display = _custHasMore ? '' : 'none';
  };

  const loadCustomersPage = async (reset=false)=>{
    if(_custLoading) return;
    _custLoading = true;
    try{
      if(reset){
        _allCustomers = [];
        _custLastDoc = null;
        _custHasMore = true;
      }

      let q = cloudUsersCol()
        .where('role','==',ROLES.CUSTOMER)
        .orderBy('createdAt','desc')
        .limit(CUSTOMER_PAGE_SIZE);

      if(_custLastDoc) q = q.startAfter(_custLastDoc);

      const snap = await q.get();
      const docs = snap.docs || [];
      docs.forEach(d=>{
        const u = d.data()||{};
        if(!u.uid) u.uid = d.id;
        _allCustomers.push(u);
      });

      if(docs.length) _custLastDoc = docs[docs.length-1];
      _custHasMore = (docs.length === CUSTOMER_PAGE_SIZE);

      renderCustomers(inpCustomerSearch?.value || '');
    }catch(e){
      console.warn('customers page', e);
    }finally{
      _custLoading = false;
    }
  };

  await loadCustomersPage(true);

  if(inpCustomerSearch){
    inpCustomerSearch.addEventListener('input', ()=>renderCustomers(inpCustomerSearch.value));
  }
  if(btnMoreCustomers){
    btnMoreCustomers.addEventListener('click', (e)=>{ e.preventDefault(); loadCustomersPage(false); });
  }

  btnCreate.onclick = async ()=>{
    const customerUid = selCustomer.value;
    const templateId = selTemplate.value;
    const tpl = getTemplate(templateId);
    const title = (titleInput?.value||'').trim()
      || (tpl?.name ? (tpl.name+' – Ausfüllen') : 'Formular ausfüllen');

    if(!customerUid || !templateId){
      if(msgEl) msgEl.textContent = 'Bitte Kunde und Vorlage wählen.';
      return;
    }
    if(msgEl) msgEl.textContent = '… erstellt …';

    try{
      await cloudTasksCol().add({
        customerUid,
        templateId,
        title,
        status: 'open',
        createdAt: Date.now(),
        createdByUid: CLOUD.user?.uid || '',
        createdByEmail: CLOUD.user?.email || ''
      });
      if(msgEl) msgEl.textContent = '✅ Aufgabe freigegeben.';
      try{ titleInput.value=''; }catch(_){ }
    }catch(e){
      console.error(e);
      if(msgEl) msgEl.textContent = '❌ Fehler: '+(e.message||e);
    }
  };
}

async function wireUserManagement(){
  const listEl = document.getElementById('usersList');
  const btnRef = document.getElementById('btnUsersRefresh');
  const msgEl = document.getElementById('usersMsg');
  if(!listEl) return;

  const load = async ()=>{
    if(msgEl) msgEl.textContent = '… lädt …';
    try{
      const snap = await cloudUsersCol().orderBy('createdAt','desc').limit(200).get();
      const users = [];
      snap.forEach(d=>users.push({id:d.id, ...d.data()}));
      listEl.innerHTML = '';
      users.forEach(u=>{
        const row = document.createElement('div');
        row.className = 'list-item';
        const who = escapeHtml(u.email||u.uid||u.id);
        const when = u.createdAt ? fmtDT(u.createdAt) : '';
        row.innerHTML = `<div><strong>${who}</strong><small>${escapeHtml(u.role||'')}${when?(' · '+when):''}</small></div>`;
        const actions = document.createElement('div');
        actions.className = 'actions';
        const sel = document.createElement('select');
        sel.innerHTML = `
          <option value="admin">admin</option>
          <option value="staff">staff</option>
          <option value="customer">customer</option>
        `;
        sel.value = u.role || 'customer';
        sel.onchange = async ()=>{
          try{
            await cloudUserDoc(u.uid||u.id).set({role: sel.value}, {merge:true});
            if(msgEl) msgEl.textContent = '✅ Rolle gespeichert.';
          }catch(e){
            console.error(e);
            const code = e && (e.code || e.name) || '';
            if(code && String(code).includes('permission')){
              if(msgEl) msgEl.textContent = '❌ Keine Berechtigung (Rules). Admin darf Rollen setzen.';
            } else {
              if(msgEl) msgEl.textContent = '❌ Fehler: '+(e.message||e);
            }
          }
        };
        actions.appendChild(sel);
        row.appendChild(actions);
        listEl.appendChild(row);
      });
      if(msgEl) msgEl.textContent = users.length ? '' : '— keine Benutzer gefunden —';
    }catch(e){
      console.error(e);
      const code = e && (e.code || e.name) || '';
      if(code && String(code).includes('permission')){
        if(msgEl) msgEl.textContent = '❌ Laden fehlgeschlagen (permission-denied). Firestore-Regeln erlauben Admin/Staff das Lesen von orgs/doggystyle/users noch nicht.';
      } else {
        if(msgEl) msgEl.textContent = '❌ Laden fehlgeschlagen: ' + (e.message||e);
      }
    }
  };

  if(btnRef) btnRef.onclick = ()=>load().catch(e=>{ console.error(e); if(msgEl) msgEl.textContent='❌ Laden fehlgeschlagen.'; });
  await load();
}

async function wireInbox(){
  const listEl = document.getElementById('inboxList');
  const btnRef = document.getElementById('btnInboxRefresh');
  const detail = document.getElementById('inboxDetail');
  const btnBack = document.getElementById('btnInboxBack');
  const btnClose = document.getElementById('btnInboxClose');
  const btnAdopt = document.getElementById('btnInboxAdopt');
  const titleEl = document.getElementById('inboxDetailTitle');
  const metaEl = document.getElementById('inboxDetailMeta');
  const root = document.getElementById('inboxDetailFormRoot');
  if(!listEl) return;

  let currentTask = null;

  const renderList = (tasks)=>{
    listEl.innerHTML = '';
    if(!tasks.length){
      listEl.innerHTML = `<div class="muted">— keine Eingänge —</div>`;
      return;
    }
    tasks.forEach(t=>{
      const row = document.createElement('div');
      row.className = 'list-item';
      const when = t.submittedAt ? fmtDT(t.submittedAt) : '';
      row.innerHTML = `<div><strong>${escapeHtml(t.title||'Eingang')}</strong><small>${escapeHtml(t.customerEmail||t.customerUid||'')}${when?(' · '+when):''}</small></div>`;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const b = document.createElement('button');
      b.className='smallbtn';
      b.textContent='Öffnen';
      b.onclick = ()=>openDetail(t);
      actions.appendChild(b);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  };

  const loadSubmitted = async ()=>{
    const snap = await cloudTasksCol().where('status','==','submitted').orderBy('submittedAt','desc').limit(100).get();
    const tasks = [];
    snap.forEach(d=>tasks.push({id:d.id, ...d.data()}));
    // Emails der Kunden auflösen (best effort)
    const uids = Array.from(new Set(tasks.map(t=>t.customerUid).filter(Boolean)));
    const map = {};
    await Promise.all(uids.map(async uid=>{
      try{
        const us = await cloudUserDoc(uid).get();
        if(us.exists) map[uid] = us.data().email || uid;
      }catch(_){ }
    }));
    tasks.forEach(t=>t.customerEmail = map[t.customerUid]||'');
    renderList(tasks);
  };

  const openDetail = (task)=>{
    currentTask = task;
    if(detail) detail.style.display = '';
    if(listEl) listEl.style.display = 'none';
    if(titleEl) titleEl.textContent = task.title || 'Eingang';
    if(metaEl) metaEl.textContent = `Formular: ${task.templateId||''} · Kunde: ${task.customerEmail||task.customerUid||''} · Abgesendet: ${fmtDT(task.submittedAt||0)}`;
    if(root) root.innerHTML = '';
    const t = getTemplate(task.templateId);
    const payload = task.payloadSubmitted || task.payloadDraft || {fields:{},meta:{}};
    const fields = payload.fields || {};
    const meta = payload.meta || {};
    const renderFieldRO = (label, val)=>{
      const el = document.createElement('div');
      el.className='field';
      el.style.minWidth='260px';
      el.innerHTML = `<span>${escapeHtml(label)}</span><div class="sync-box" style="padding:10px">${escapeHtml(val==null?'' : String(val))}</div>`;
      return el;
    };
    if(t && root){
      t.sections.forEach(sec=>{
        const card=document.createElement('div');
        card.className='card';
        card.innerHTML=`<h2>${escapeHtml(sec.title)}</h2>`;
        sec.fields.forEach(f=>card.appendChild(renderFieldRO(f.label, fields[f.key])));
        root.appendChild(card);
      });
      const metaCard=document.createElement('div');
      metaCard.className='card';
      metaCard.innerHTML=`<h2>Ort / Datum</h2>`;
      (t.meta||[]).forEach(f=>metaCard.appendChild(renderFieldRO(f.label, meta[f.key])));
      root.appendChild(metaCard);
    }
  };

  if(btnBack) btnBack.onclick = ()=>{
    if(detail) detail.style.display = 'none';
    if(listEl) listEl.style.display = '';
  };
  if(btnClose) btnClose.onclick = async ()=>{
    if(!currentTask) return;
    if(!confirm('Eingang schließen? (Status = closed)')) return;
    await cloudTasksCol().doc(currentTask.id).set({status:'closed', closedAt: Date.now(), updatedAt: Date.now()}, {merge:true});
    if(detail) detail.style.display='none';
    if(listEl) listEl.style.display='';
    await loadSubmitted();
  };
  if(btnAdopt) btnAdopt.onclick = async ()=>{
    if(!currentTask) return;
    const payload = currentTask.payloadSubmitted || currentTask.payloadDraft;
    if(!payload){ alert('Kein Inhalt vorhanden.'); return; }
    const templateId = currentTask.templateId;
    const t = getTemplate(templateId);
    if(!t){ alert('Vorlage nicht gefunden.'); return; }
    // in Workspace als neues Dokument übernehmen
    const now = new Date().toISOString();
    const docObj = {
      id: uid(),
      templateId,
      templateName: t.name || templateId,
      title: currentTask.title || (t.name||'Dokument'),
      dogId: S.dogs?.[0]?.id || "",
      petId: "",
      customerId: "",
      fields: payload.fields || {},
      meta: payload.meta || {},
      signature: null,
      saved: false,
      versionOf: null,
      createdAt: now,
      updatedAt: now
    };
    ensureDocLinks(docObj);
    S.docs = S.docs || [];
    S.docs.unshift(docObj);
    saveState();
    renderDocs();
    // Eingang schließen
    try{ await cloudTasksCol().doc(currentTask.id).set({status:'closed', closedAt: Date.now(), adoptedDocId: docObj.id, updatedAt: Date.now()}, {merge:true}); }catch(_){ }
    alert('✅ Übernommen. Du findest das Dokument unter Aufenthalte.');
    if(detail) detail.style.display='none';
    if(listEl) listEl.style.display='';
    await loadSubmitted();
  };

  if(btnRef) btnRef.onclick = ()=>loadSubmitted().catch(console.error);
  await loadSubmitted();
}

// ===== PREISLOGIK & STAFFELUNGEN =====
const PRICE_RULES = {
  Tagesbetreuung: [
    { min: 30, price: 30 },
    { min: 14, price: 35 },
    { min: 7,  price: 37.5 },
    { min: 1,  price: 40 }
  ],
  Urlaubsbetreuung: [
    { min: 30, price: 35 },
    { min: 14, price: 40 },
    { min: 7,  price: 42.5 },
    { min: 1,  price: 45 }
  ]
};

function daysBetween(from, to){
  const ms = new Date(to) - new Date(from);
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// Feiertage Bayern (vereinfachte, praxisnahe Auswahl; Zeitraum-Berechnung offline)
function easterSunday(year){
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month-1, day));
}

function addDaysUTC(d, days){
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function formatYMD(d){
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const da = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

function bavariaHolidaysSet(year){
  const set = new Set();
  const easter = easterSunday(year);
  // Fixe Feiertage (Bayern)
  ["01-01","01-06","05-01","10-03","11-01","12-25","12-26"].forEach(md => set.add(`${year}-${md}`));
  // Mariä Himmelfahrt (15.08.) – regional in Bayern, hier pauschal als „Bayern“ geführt
  set.add(`${year}-08-15`);

  // Bewegliche Feiertage (über Ostern)
  set.add(formatYMD(addDaysUTC(easter, -2)));  // Karfreitag
  set.add(formatYMD(addDaysUTC(easter, 1)));   // Ostermontag
  set.add(formatYMD(addDaysUTC(easter, 39)));  // Christi Himmelfahrt
  set.add(formatYMD(addDaysUTC(easter, 50)));  // Pfingstmontag
  set.add(formatYMD(addDaysUTC(easter, 60)));  // Fronleichnam

  return set;
}

function countBavariaHolidaysBetween(from, to){
  // Iteration: [from, to) (to exklusiv) passend zu daysBetween()
  if(!from || !to) return 0;
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  if(!(start < end)) return 0;

  let count = 0;
  let cur = new Date(start.getTime());
  while(cur < end){
    const y = cur.getUTCFullYear();
    const hol = bavariaHolidaysSet(y);
    if(hol.has(formatYMD(cur))) count++;
    cur = addDaysUTC(cur, 1);
  }
  return count;
}


function updateAutoHolidayFields(){
  if(!currentDoc) return;
  const t = getTemplate(currentDoc.templateId);
  if(!t || t.id !== "hundeannahme") return;

  const from = currentDoc.meta?.von;
  const to = currentDoc.meta?.bis;
  const cnt = (from && to) ? countBavariaHolidaysBetween(from, to) : 0;

  // Immer automatisch – keine manuelle Auswahl
  currentDoc.fields = currentDoc.fields || {};
  currentDoc.fields.holiday_days = cnt || 0;

  // UI: Anzahl-Feld (falls vorhanden) befüllen & sperren
  const num = document.querySelector('input[data-key="holiday_days"]');
  if(num){
    num.value = String(currentDoc.fields.holiday_days || 0);
    num.disabled = true;
  }
}


function getPricePerDay(type, days){
  const rules = PRICE_RULES[type] || [];
  for(const r of rules){
    if(days >= r.min) return r.price;
  }
  return 0;
}

function calculateInvoicePricing(doc){
  const meta = doc.meta || {};
  const f = doc.fields || {};

  if(!meta.betreuung || !meta.von || !meta.bis){
    return null;
  }

  const days = daysBetween(meta.von, meta.bis);
  const daily = getPricePerDay(meta.betreuung, days);
  const base = days * daily;

  // Feiertags-Zuschlag: nur auf Feiertags-TAGE im Zeitraum, nicht auf den gesamten Aufenthalt
  const holidayDays = countBavariaHolidaysBetween(meta.von, meta.bis);
  const holidayValue = Math.round((holidayDays * daily * 0.10) * 100) / 100;

  let percentExtra = 0;
  let fixedExtra = 0;

  // Prozent-Aufschläge (auf Basisbetrag)
  if(f.special_times) percentExtra += 10;
  if(f.extra_care) percentExtra += 10;

  const percentValue = Math.round((base * (percentExtra / 100)) * 100) / 100;

  // Fixe Extras
  if(f.medication) fixedExtra += days * 2;
  if(f.walk_extra_count) fixedExtra += f.walk_extra_count * 15;
  if(f.bandage_count) fixedExtra += f.bandage_count * 2.5;
  if(f.grooming_count) fixedExtra += f.grooming_count * 5;

  fixedExtra = Math.round(fixedExtra * 100) / 100;

  const total = Math.round((base + holidayValue + percentValue + fixedExtra) * 100) / 100;

  doc.pricing = {
    days,
    daily,
    base,

    holidayDays,
    holidayValue,

    percentExtra,
    percentValue,

    fixedExtra,
    total
  };

  return doc.pricing;
}
// ===== ENDE PREISLOGIK =====
let state=loadState();
// Wichtig: State-Shape sofort sicherstellen, bevor irgendein Render läuft.
// Sonst kann renderDashboard()/renderRecent() bei frischem / teildefektem LocalStorage
// (z.B. nach Neustart/Reload) mit S.docs === undefined abbrechen und die komplette
// UI wirkt dann "eingefroren" (keine Handler werden mehr gebunden).
try{ ensureStateShape(); }catch(_){ }

// WICHTIG: Migration (legacy S.dogs -> S.customers/S.pets) muss auch
// im reinen LocalStorage-Betrieb passieren – nicht nur nach einem Cloud-Pull.
// Sonst ist nach Reload die Hunde/Kunden-Liste leer, obwohl Daten (legacy) vorhanden sind.
try{ migrateToV2(); }catch(_){ }
try{ ensureStateShape(); }catch(_){ }
const COMPANY = {
  name: "Doggy Style Hundepension",
  owner: "Raphael Boch",
  street: "Im Moos 4",
  zipCity: "88167 Stiefenhofen",
  phone: "0170 7313587",
  email: "info@doggy-style-hundepension.de",

  bank: {
    name: "Musterbank",
    iban: "DE00 0000 0000 0000 0000 00",
    bic: "MUSTERDEFFXXX"
  },

  tax: {
    vatId: "",        // falls vorhanden
    taxNumber: ""     // falls vorhanden
  },

  paymentTargetDays: 14
};;if(S.nextInvoiceNumber == null){
  S.nextInvoiceNumber = 1;
}renderDashboard();renderRecent();
try{ ensureStateShape(); }catch(_){ }
try{ initProfiSettingsBindings(); renderStaffSettings(); renderPolicySettings(); renderComplianceInSettings(); }catch(_){ }
function formatDateDE(dateStr){
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE");
}

function showPanel(id){
  document.querySelectorAll(".panel").forEach(p=>{
    p.classList.toggle("is-active", p.id === id);
  });

  // IMPORTANT: Each panel must trigger its renderer when activated.
  // Otherwise, after Reload/Login the panel can remain empty because its DOM
  // was never hydrated from state/cloud.
  if(id === "dogs"){
    try{ renderDogs(); }catch(_){ }
  }
  if(id === "invoices"){
    try{ renderInvoiceList(); }catch(_){ }
  }
  if(id === "contract"){
    renderContractPanel();
  }
  if(id === "workforms"){
    renderWorkformsPanel();
  }

  if(id === "hygiene"){
    renderHygienePanel();
  }

    if(id === "analytics"){
    renderAnalyticsPanel();
  }
if(id === "calendar"){
    renderCalendarPanel();
  }
  if(id === "settings"){
    try{
      initProfiSettingsBindings();
      renderStaffSettings();
      renderPolicySettings();
      renderComplianceInSettings();
      renderDocVersions();
    }catch(_){ }
  }
}

// ==== Dashboard / Schnellaktionen helpers ====
function selectTab(tabId){
  // activate tab button
  $$(".tab").forEach(b=>b.classList.toggle("is-active", b.dataset.tab===tabId));
  showPanel(tabId);
}

function wireQuickActions(){
  try{
    const btnNewStayTop = document.getElementById("btnNewStayTop");
    const btnNewStayOnPage = document.getElementById("btnNewStayOnPage");
    const btnQuickDogs = document.getElementById("btnQuickDogs");
    const btnQuickInvoices = document.getElementById("btnQuickInvoices");
    if(btnNewStayTop) btnNewStayTop.onclick = ()=>{ try{ createStay(); }catch(e){ selectTab("documents"); } };
    if(btnNewStayOnPage) btnNewStayOnPage.onclick = ()=>{ try{ createStay(); }catch(e){ selectTab("documents"); } };
    if(btnQuickDogs) btnQuickDogs.onclick = ()=>selectTab("dogs");
    // Schnellaktion "Rechnungen" darf nicht auf "Arbeitsblätter" springen.
    if(btnQuickInvoices) btnQuickInvoices.onclick = ()=>selectTab("invoices");
  }catch(e){
    console.error("wireQuickActions failed", e);
  }
}


function createStay(){
  // Aufenthalte sind im Tab "documents".
  // Wir wechseln dorthin und erstellen dann ein Dokument aus der Vorlage.
  try{
    selectTab("documents");

    // Warten bis der Tab sichtbar ist, dann Doc erzeugen.
    setTimeout(()=>{
      try{
        const preferred = "neueraufenthalt";
        const fallback = "hundeannahme";
        const hasPreferred = Array.isArray(state?.templates) && S.templates.some(t=>t.id===preferred);
        createDoc(hasPreferred ? preferred : fallback);
      }catch(err){
        console.error("createStay->createDoc failed", err);
        toast("Aufenthalt-Editor konnte nicht geöffnet werden (siehe Konsole).", 3500);
      }
    }, 0);
  }catch(e){
    console.error("createStay failed", e);
    toast("Aufenthalt-Editor konnte nicht geöffnet werden (siehe Konsole).", 3500);
  }
}


function openDogs(){ selectTab("dogs"); }
function openCustomers(){ selectTab("dogs"); } // Kunden sind im Hunde/Kunden Bereich
function openInvoices(){ selectTab("invoices"); }
function openWorkforms(){ selectTab("workforms"); }
function openHygiene(){ selectTab("hygiene"); }
function openHygieneTodo(){
  try{
    ensureStateShape();
    S.hygiene = S.hygiene || {};
    S.hygiene.ui = S.hygiene.ui || {};
    S.hygiene.ui.pendingOnly = true;
    saveState();
  }catch(e){ /* ignore */ }
  selectTab("hygiene");
}
function openMedication(){ selectTab("medication"); }

// Quicklink aus Aufenthalt -> Medikation (Hund vorauswählen)
function openMedicationForDogId(dogId, opts={}){
  try{
    ensureStateShape();
    const pet = getPetByDogId(dogId);
    if(pet && pet.id){
      S.medication = S.medication || {};
      S.medication.ui = S.medication.ui || {};
      S.medication.ui.selectedPetId = pet.id;
      saveState();
    }
    openMedication();
    setTimeout(()=>{
      try{ renderMedicationPanel(); }catch(_){ }
      if(opts.scrollToHealth){
        const card = document.getElementById('healthNotesCard');
        if(card) card.scrollIntoView({behavior:'smooth', block:'start'});
        const ta = document.getElementById('hnText');
        if(ta){ ta.focus(); }
      }
    }, 120);
  }catch(e){ console.warn('openMedicationForDogId failed', e); }
}

function renderStayQuickLinks(doc){
  const bar = document.getElementById('stayQuickLinks');
  const btnMed = document.getElementById('btnStayOpenMedication');
  const btnHn  = document.getElementById('btnStayAddHealthNote');
  if(!bar || !btnMed || !btnHn) return;
  if(!doc || doc.type === 'invoice'){
    bar.style.display = 'none';
    return;
  }
  // Nur sinnvoll, wenn ein Hund ausgewählt ist
  const did = (doc.dogId || document.getElementById('dogSelect')?.value || "");
  if(!did){ bar.style.display='none'; return; }
  bar.style.display = 'flex';

  if(!btnMed.dataset.bound){
    btnMed.onclick = ()=>{
      const dogId = document.getElementById('dogSelect')?.value || doc.dogId;
      if(!dogId){ alert('Bitte zuerst einen Hund auswählen.'); return; }
      openMedicationForDogId(dogId, {scrollToHealth:false});
    };
    btnMed.dataset.bound = '1';
  }
  if(!btnHn.dataset.bound){
    btnHn.onclick = ()=>{
      const dogId = document.getElementById('dogSelect')?.value || doc.dogId;
      if(!dogId){ alert('Bitte zuerst einen Hund auswählen.'); return; }
      openMedicationForDogId(dogId, {scrollToHealth:true});
    };
    btnHn.dataset.bound = '1';
  }
}

// ==== Dashboard renderer (Start) ====
function dashboardStatusText(ratio){
  if(!isFinite(ratio)) return "Ruhiger Tag";
  if(ratio < 0.6) return "Ruhiger Tag";
  if(ratio < 0.9) return "Gut ausgelastet";
  return "Fast voll";
}
function dashboardStatusColor(ratio){
  if(!isFinite(ratio)) return "#4caf50";
  if(ratio < 0.7) return "#4caf50";
  if(ratio < 0.9) return "#ffc107";
  return "#f44336";
}

function renderDashboard(){
  // Dashboard elements exist only on Start screen (home)
  const elDayVal = document.getElementById("todayDaycareValue");
  const elBoardVal = document.getElementById("todayBoardingValue");
  const elForecast = document.getElementById("forecastList");
  if(!elDayVal || !elBoardVal || !elForecast) return;

  const today = getNextDays(1)[0];
  const todayDayUsed = countOccupancy("Tagesbetreuung", today, today);
  const todayBoardUsed = countOccupancy("Urlaubsbetreuung", today, today);

  const dayMax = getCapacity("Tagesbetreuung", today);
  const boardMax = getCapacity("Urlaubsbetreuung", today);

  const dayRatio = dayMax ? (todayDayUsed/dayMax) : 0;
  const boardRatio = boardMax ? (todayBoardUsed/boardMax) : 0;

  elDayVal.textContent = `${todayDayUsed} / ${dayMax}`;
  elBoardVal.textContent = `${todayBoardUsed} / ${boardMax}`;

  const elDayText = document.getElementById("todayDaycareText");
  const elBoardText = document.getElementById("todayBoardingText");
  const elDayBar = document.getElementById("todayDaycareBar");
  const elBoardBar = document.getElementById("todayBoardingBar");

  if(elDayText) elDayText.textContent = dashboardStatusText(dayRatio);
  if(elBoardText) elBoardText.textContent = dashboardStatusText(boardRatio);

  if(elDayBar){
    elDayBar.style.width = `${Math.min(100, Math.max(0, dayRatio*100))}%`;
    elDayBar.style.background = dashboardStatusColor(dayRatio);
  }
  if(elBoardBar){
    elBoardBar.style.width = `${Math.min(100, Math.max(0, boardRatio*100))}%`;
    elBoardBar.style.background = dashboardStatusColor(boardRatio);
  }

  // Forecast next 14 days
  const days = getNextDays(14);
  elForecast.innerHTML = "";
  days.forEach(d=>{
    const dayUsed = countOccupancy("Tagesbetreuung", d, d);
    const boardUsed = countOccupancy("Urlaubsbetreuung", d, d);
    const dayR = dayMax ? (dayUsed/dayMax) : 0;
    const boardR = boardMax ? (boardUsed/boardMax) : 0;

    const row = document.createElement("div");
    row.className = "forecast-row";
    // compact date (dd.mm)
    const dt = new Date(d);
    const label = `${String(dt.getDate()).padStart(2,"0")}.${String(dt.getMonth()+1).padStart(2,"0")}`;

    row.innerHTML = `
      <div class="forecast-date">${label}</div>
      <div class="forecast-bar">
        <div class="forecast-icon">🐕</div>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.min(100,dayR*100)}%;background:${dashboardStatusColor(dayR)}"></div></div>
        <div class="forecast-count">${dayUsed}/${dayMax}</div>
      </div>
      <div class="forecast-bar">
        <div class="forecast-icon">🏡</div>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.min(100,boardR*100)}%;background:${dashboardStatusColor(boardR)}"></div></div>
        <div class="forecast-count">${boardUsed}/${boardMax}</div>
      </div>
    `;
    elForecast.appendChild(row);
  });

  // Warnings
  const warnings = [];
  // capacity warnings for next 14 days
  days.forEach(d=>{
    const dayUsed = countOccupancy("Tagesbetreuung", d, d);
    const boardUsed = countOccupancy("Urlaubsbetreuung", d, d);
    if(dayMax - dayUsed <= 1){
      warnings.push(`${formatDateDE(d)}: Tagesbetreuung fast voll (${dayUsed}/${dayMax})`);
    }
    if(boardMax - boardUsed <= 1){
      warnings.push(`${formatDateDE(d)}: Urlaubsbetreuung fast voll (${boardUsed}/${boardMax})`);
    }
  });
  // stays ending today
  const endingToday = S.docs.filter(doc=>doc.saved && doc.meta?.bis===today).length;
  if(endingToday>0) warnings.unshift(`${endingToday} Aufenthalt(e) enden heute`);

  // Medikamente: fällige Gaben heute
  try{
    const isoM = todayISO();
    const inCareM = getPetIdsInCare(isoM);
    const dueM = medDueOccurrences(isoM, (inCareM.length ? inCareM : null));
    const openM = dueM.filter(x=>!x.done).length;
    if(openM > 0) warnings.unshift(`💊 ${openM} Medikamenten‑Gabe(n) heute fällig${inCareM.length ? " (in Betreuung)" : ""}`);
  }catch(e){ /* ignore */ }

  // Gesundheitsnotizen heute (Info)
  try{
    const iso = todayISO();
    const notes = (S.medication?.healthNotes||[]).filter(n=>n && n.date===iso);
    if(notes.length>0) warnings.push(`🩺 ${notes.length} Gesundheitsnotiz(en) heute erfasst`);
  }catch(e){ /* ignore */ }

  const warnBox = document.getElementById("dashboardWarnings");
  if(warnBox){
    if(warnings.length){
      warnBox.style.display = "block";
      // Bei Medikamenten-Hinweis einen Direktlink anbieten
      const rows = warnings.slice(0,6).map(w=>{
        const isMed = String(w||"").includes("💊");
        const isHyg = String(w||"").includes("🧼") || String(w||"").toLowerCase().includes("hygiene");
        const btn = isMed ? `<button class="smallbtn" style="margin-left:8px" onclick="openMedication()">Öffnen</button>`
                  : isHyg ? `<button class="smallbtn" style="margin-left:8px" onclick="openHygiene()">Öffnen</button>`
                  : "";
        return `<div>⚠️ ${escapeHtml(w)} ${btn}</div>`;
      }).join("");
      warnBox.innerHTML = `<h3>Hinweise</h3><div class="warning-list">${rows}</div>`;
    }else{
      warnBox.style.display = "none";
      warnBox.innerHTML = "";
    }
  }

  // Hygiene Dashboard Card
  renderHygieneDashboard();
  // Medikamente Dashboard Card
  renderMedicationDashboard();
  // §11 Ampel
  renderComplianceDashboard();
}

/* ===== Hygiene & Reinigung ===== */
function todayISO(){
  return toISODateLocal(new Date());
}

function hygieneGetLogsForDate(iso){
  ensureStateShape();
  const logs = S.hygiene?.logs || [];
  return logs.filter(l => l.date === iso);
}

function hygieneTaskDueDate(task){
  if(!task) return null;
  const base = task.lastDone ? new Date(task.lastDone) : null;
  if(!base){
    // If never done, due immediately
    return new Date();
  }
  const due = new Date(base);
  due.setDate(due.getDate() + (task.intervalDays || 7));
  due.setHours(0,0,0,0);
  return due;
}

function hygieneTaskStatus(task){
  const due = hygieneTaskDueDate(task);
  const now = new Date(); now.setHours(0,0,0,0);
  if(!due) return {code:"ok", label:"—"};
  if(due.getTime() < now.getTime()) return {code:"overdue", label:"überfällig"};
  // due today or within 1 day -> due soon
  const diffDays = Math.round((due.getTime()-now.getTime())/86400000);
  if(diffDays <= 1) return {code:"due", label:"fällig"};
  return {code:"ok", label:"ok"};
}

function hygieneOverallStatus(){
  const iso = todayISO();
  const todayLogs = hygieneGetLogsForDate(iso);
  const hasAnyDoneToday = todayLogs.some(l => String(l.status||'').toLowerCase() === 'erledigt');
  const anyPendingToday = todayLogs.some(l => String(l.status||'').toLowerCase() === 'fällig');
  const tasks = S.hygiene?.weeklyTasks || [];
  const anyOverdue = tasks.some(t => hygieneTaskStatus(t).code === "overdue");
  const anyDue = tasks.some(t => hygieneTaskStatus(t).code === "due");

  if(!hasAnyDoneToday || anyOverdue || anyPendingToday) return {code:"red", label:"To‑do"};
  if(anyDue) return {code:"yellow", label:"Achtung"};
  return {code:"green", label:"OK"};
}

function hygieneStatusPill(el, status){
  if(!el) return;
  el.textContent = status.label;
  el.style.borderColor = "rgba(255,255,255,.14)";
  el.style.background = "rgba(255,255,255,.08)";
  if(status.code === "green"){
    el.style.background = "rgba(76,175,80,.18)";
    el.style.borderColor = "rgba(76,175,80,.35)";
  }
  if(status.code === "yellow"){
    el.style.background = "rgba(255,193,7,.18)";
    el.style.borderColor = "rgba(255,193,7,.35)";
  }
  if(status.code === "red"){
    el.style.background = "rgba(244,67,54,.18)";
    el.style.borderColor = "rgba(244,67,54,.35)";
  }
}

function renderHygieneDashboard(){
  const card = document.getElementById("hygieneDashboardCard");
  if(!card) return;
  ensureStateShape();
  const iso = todayISO();
  const logs = hygieneGetLogsForDate(iso);
  const status = hygieneOverallStatus();
  const meta = document.getElementById("hygieneTodayMeta");
  const pill = document.getElementById("hygieneTodayStatus");
  const hint = document.getElementById("hygieneTodayHint");
  if(meta) meta.textContent = `${new Date().toLocaleDateString('de-DE')} · ${logs.length} Eintrag(e)`;
  hygieneStatusPill(pill, status);
  if(hint){
    const overdue = (S.hygiene.weeklyTasks||[]).filter(t=>hygieneTaskStatus(t).code==="overdue").length;
    if(!logs.length) hint.innerHTML = `Heute noch nichts dokumentiert. <strong>Bitte kurz eintragen</strong> (z.B. Innenräume → Reinigung).`;
    else if(overdue) hint.innerHTML = `Es gibt <strong>${overdue}</strong> überfällige Wochenaufgabe(n). Bitte nachtragen.`;
    else hint.textContent = "Alles im grünen Bereich. Bei Bedarf weitere Einträge hinzufügen.";
  }
}


// 🧼 Auto-Trigger: erzeugt Hygiene-Einträge aus Hundeannahme/Aufenthalt, wenn Parasiten/Quarantäne gesetzt ist
function hygieneAutoFromStayDoc(doc){
  if(!doc) return;
  ensureStateShape();
  const tId = doc.templateId || doc.template || doc.templateName || "";
  if(String(tId).toLowerCase() !== "hundeannahme") return;

  const f = doc.fields || {};
  const meta = doc.meta || {};

  const paras = (f.parasiten_status || "").trim();
  const quarantine = !!f.quarantine_required;
  const reason = (f.quarantine_reason || "").trim();
  const infectiousConfirmed = (f.ev_gesund === true) || String(f.ev_gesund||'').toLowerCase()==='true' || String(f.ev_gesund||'').toLowerCase()==='on' || String(f.ev_gesund||'').toLowerCase()==='yes';

  // Trigger-Kriterien: Quarantäne ODER Parasitenstatus nicht "unauffällig"
  const parasTrigger = paras && paras.toLowerCase() !== "unauffällig";
  const infectiousTrigger = !infectiousConfirmed;
  if(!quarantine && !parasTrigger && !infectiousTrigger) return;

  // Hundename ermitteln (Pets bevorzugt)
  const dogId = doc.dogId;
  const pet = (S.pets||[]).find(p=>p.id===dogId) || (S.dogs||[]).find(d=>d.id===dogId);
  const dogName = (pet?.name || f.hund_name || "Unbekannt").trim();

  // Dedupe: pro Doc nur einmal je Typ
  const logs = S.hygiene.logs || [];
  const has = (kind)=>logs.some(l=>l?.source?.docId===doc.id && l?.source?.kind===kind);
  const date = todayISO();

  const baseNoteParts = [];
  if(dogName) baseNoteParts.push(`Hund: ${dogName}`);
  if(meta.von || meta.bis) baseNoteParts.push(`Aufenthalt: ${(meta.von||'')} – ${(meta.bis||'')}`.trim());
  if(parasTrigger) baseNoteParts.push(`Parasiten: ${paras}`);
  if(reason) baseNoteParts.push(`Hinweis: ${reason}`);

  const baseNote = baseNoteParts.join(" · ");

  // Eintrag 1: Quarantäne/Desinfektion
  if(quarantine && !has("auto-quarantine")){
    logs.push({
      id: uid(),
      date,
      area: "Quarantäne",
      action: "Desinfektion",
      status: "fällig",
      reason: null,
      staff: { preset: null, free: null },
      note: `Auto: Quarantäne gesetzt → bitte Durchführung abhaken. ${baseNote}`.trim(),
      createdAt: new Date().toISOString(),
      source: { kind: "auto-quarantine", docId: doc.id }
    });
  }

  // Eintrag 2: Parasiten-Sonderreinigung (Innen/Schlafplätze)
  if(parasTrigger && !has("auto-parasites")){
    logs.push({
      id: uid(),
      date,
      area: "Schlafplätze",
      action: "Grundreinigung",
      status: "fällig",
      reason: null,
      staff: { preset: null, free: null },
      note: `Auto: Parasitenstatus "${paras}" → Sonderreinigung fällig. ${baseNote}`.trim(),
      createdAt: new Date().toISOString(),
      source: { kind: "auto-parasites", docId: doc.id }
    });
  }

  // Eintrag 3: Ansteckende Krankheiten nicht bestätigt → Hinweis/Prüfung + ggf. Quarantäne
  if(infectiousTrigger && !has("auto-infectious")){
    logs.push({
      id: uid(),
      date,
      area: "Quarantäne",
      action: "Reinigung",
      status: "fällig",
      reason: null,
      staff: { preset: null, free: null },
      note: `Auto: „frei von ansteckenden Krankheiten“ NICHT bestätigt → bitte prüfen/Quarantäne erwägen und Maßnahmen dokumentieren. ${baseNote}`.trim(),
      createdAt: new Date().toISOString(),
      source: { kind: "auto-infectious", docId: doc.id }
    });
  }

  S.hygiene.logs = logs;
}

function renderHygienePanel(){
  ensureStateShape();

  // staff presets
  const presetSel = document.getElementById('hygStaffPreset');
  if(presetSel){
    const presets = S.hygiene.staffPresets || ["Raphael","Anschi"];
    presetSel.innerHTML = presets.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('') + `<option value="">—</option>`;
  }

  // pending-only filter
  const cbPending = document.getElementById('hygFilterPendingOnly');
  if(cbPending){
    cbPending.checked = !!(S.hygiene.ui && S.hygiene.ui.pendingOnly);
    if(!cbPending._bound){
      cbPending._bound = true;
      cbPending.onchange = ()=>{
        ensureStateShape();
        S.hygiene.ui = S.hygiene.ui || {};
        S.hygiene.ui.pendingOnly = !!cbPending.checked;
        saveState && saveState(); // falls vorhanden
        try{ localStorage.setItem('dstest_hyg_pendingOnly', String(S.hygiene.ui.pendingOnly)); }catch(e){}
        renderHygienePanel();
        renderHygieneDashboard();
      };
    }
  }

  // bind add button once
  const btnAdd = document.getElementById('btnHygieneAdd');
  if(btnAdd && !btnAdd._bound){
    btnAdd._bound = true;
    btnAdd.onclick = ()=>{
      const date = todayISO();
      const area = (document.getElementById('hygArea')?.value || '').trim();
      const action = (document.getElementById('hygAction')?.value || '').trim();
      const status = (document.getElementById('hygStatus')?.value || '').trim();
      const reason = (document.getElementById('hygReason')?.value || '').trim();
      const preset = (document.getElementById('hygStaffPreset')?.value || '').trim();
      const free = (document.getElementById('hygStaffFree')?.value || '').trim();
      const note = (document.getElementById('hygNote')?.value || '').trim();

      if(status === 'nicht durchgeführt' && !reason){
        alert('Bitte eine Begründung angeben, wenn nicht durchgeführt.');
        return;
      }

      const staff = { preset: preset || null, free: free || null };
      const doneBy = (free || preset || '').trim();
      if(!doneBy){
        alert('Bitte „Durchgeführt von“ auswählen oder eintragen.');
        return;
      }

      const entry = {
        id: uid(),
        date,
        area,
        action,
        status,
        reason: reason || null,
        staff,
        note: note || null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        _deleted: false
      };

      S.hygiene.logs.unshift(entry);
      saveState();

      // Reset small fields
      const r = document.getElementById('hygReason'); if(r) r.value='';
      const n = document.getElementById('hygNote'); if(n) n.value='';
      const f = document.getElementById('hygStaffFree'); if(f) f.value='';

      renderHygienePanel();
      renderHygieneDashboard();
    };
  }

  // status pill on panel
  hygieneStatusPill(document.getElementById('hygienePanelStatus'), hygieneOverallStatus());

  // today list
  const iso = todayISO();
  const logsToday = hygieneGetLogsForDate(iso);
  const pendingOnly = !!(S.hygiene.ui && S.hygiene.ui.pendingOnly);

  const countEl = document.getElementById('hygTodayCount');
  const logsShown = pendingOnly ? logsToday.filter(l=>String(l.status||'').toLowerCase()==='fällig') : logsToday;
  if(countEl) countEl.textContent = pendingOnly ? `${logsShown.length} fällig / ${logsToday.length} gesamt` : `${logsToday.length} Eintrag(e)`;
  const listEl = document.getElementById('hygTodayList');
  if(listEl){
    if(!logsShown.length){
      listEl.innerHTML = `<div class="item"><div><strong>Noch keine Einträge</strong><small>Tippe oben auf „Speichern“ nach dem Ausfüllen.</small></div></div>`;
    } else {
      listEl.innerHTML = logsShown.map(l=>{
        const who = (l.staff?.free || l.staff?.preset || '').trim();
        const sub = `${escapeHtml(l.area)} · ${escapeHtml(l.action)} · ${escapeHtml(l.status)}`;
        const extra = l.status === 'nicht durchgeführt' && l.reason ? ` · Grund: ${escapeHtml(l.reason)}` : '';
        const note = l.note ? `<small>📝 ${escapeHtml(l.note)}</small>` : '';
        const isPending = String(l.status||'').toLowerCase() === 'fällig';
        return `
          <div class="item">
            <div>
              <strong>${escapeHtml(who || '—')}</strong>
              <small>${sub}${extra}</small>
              ${note}
            </div>
            <div class="actions">
              ${isPending ? `<button class="smallbtn" onclick="completeHygieneLog('${l.id}')">✅</button>` : ''}
              <button class="smallbtn" onclick="editHygieneLog('${l.id}')">✏️</button>
            </div>
          </div>`;
      }).join('');
    }
  }

  // weekly list
  const weeklyEl = document.getElementById('hygWeeklyList');
  if(weeklyEl){
    const tasks = S.hygiene.weeklyTasks || [];
    weeklyEl.innerHTML = tasks.map(t=>{
      const st = hygieneTaskStatus(t);
      const last = t.lastDone ? new Date(t.lastDone).toLocaleDateString('de-DE') : '—';
      const badge = st.code === 'overdue' ? '🔴 überfällig' : (st.code === 'due' ? '🟡 fällig' : '🟢 ok');
      return `
        <div class="item">
          <div>
            <strong>${escapeHtml(t.title)}</strong>
            <small>Letztes Mal: ${escapeHtml(last)} · Intervall: ${t.intervalDays || 7} Tage · Status: ${badge}</small>
          </div>
          <div class="actions">
            <button class="smallbtn" onclick="markWeeklyTaskDone('${t.id}')">✅ erledigt</button>
          </div>
        </div>`;
    }).join('');
  }

  // export
  const btnExp = document.getElementById('btnHygieneExport');
  if(btnExp && !btnExp._bound){
    btnExp._bound = true;
    btnExp.onclick = ()=>exportHygienePDF();
  }
}

function completeHygieneLog(id){
  ensureStateShape();
  const log = (S.hygiene.logs||[]).find(x=>x.id===id);
  if(!log) return;
  // Staff aus Auswahl/Freitext übernehmen (wenn vorhanden)
  const preset = (document.getElementById('hygStaffPreset')?.value || '').trim();
  const free = (document.getElementById('hygStaffFree')?.value || '').trim();
  const staffName = (free || preset || '').trim();
  if(!staffName && !(log.staff?.free || log.staff?.preset)){
    const entered = prompt('Wer hat es durchgeführt? (Name)', '');
    if(entered === null) return;
    log.staff = { preset: null, free: (entered||'').trim() || null };
  } else if(staffName){
    log.staff = { preset: preset || null, free: free || null };
  }
  log.status = 'erledigt';
  log.updatedAt = new Date().toISOString();
  saveState();
  renderHygienePanel();
  renderHygieneDashboard();
}

function editHygieneLog(id){
  const log = (S.hygiene.logs||[]).find(x=>x.id===id);
  if(!log) return;
  const newNote = prompt('Notiz bearbeiten (leer lassen, um zu löschen):', log.note || '');
  if(newNote === null) return;
  log.note = (newNote || '').trim() || null;
  log.updatedAt = new Date().toISOString();
  saveState();
  renderHygienePanel();
  renderHygieneDashboard();
}

function markWeeklyTaskDone(taskId){
  const t = (S.hygiene.weeklyTasks||[]).find(x=>x.id===taskId);
  if(!t) return;
  const now = new Date();
  t.lastDone = now.toISOString();
  // create auto log entry (wer hat es gemacht? -> Auswahl + Freitext)
  const preset = (document.getElementById('hygStaffPreset')?.value || 'Raphael').trim();
  const free = (document.getElementById('hygStaffFree')?.value || '').trim();
  const staff = { preset: preset || null, free: free || null };
  S.hygiene.logs.unshift({
    id: uid(),
    date: todayISO(),
    area: "Außenbereich",
    action: "Grundreinigung",
    status: "erledigt",
    reason: null,
    staff,
    note: `Wochenaufgabe: ${t.title}`,
    createdAt: now.toISOString(),
    updatedAt: null,
    _deleted: false
  });
  saveState();
  renderHygienePanel();
  renderHygieneDashboard();
}

function exportHygienePDF(){
  ensureStateShape();
  const logs = (S.hygiene.logs||[]).slice().reverse();
  const from = prompt('Export ab Datum (YYYY-MM-DD), leer = letzter Monat:', '');
  let start;
  if(from && /^\d{4}-\d{2}-\d{2}$/.test(from)){
    start = new Date(from);
  } else {
    start = new Date();
    start.setMonth(start.getMonth()-1);
  }
  start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);

  const rows = logs.filter(l=>{
    const d = new Date(l.date);
    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  });

  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Hygiene-Export</title>
  <style>
    body{font-family:system-ui,-apple-system,Arial; padding:18px;}
    h1{margin:0 0 6px 0}
    .muted{color:#555;margin:0 0 14px 0}
    table{width:100%;border-collapse:collapse; font-size:12px}
    th,td{border:1px solid #ccc; padding:8px; vertical-align:top}
    th{background:#f3f3f3}
  </style></head><body>
  <h1>Hygiene- und Reinigungsnachweis</h1>
  <p class="muted">Hundepension Doggy Style – Angelika &amp; Raphael Boch · Zeitraum: ${start.toLocaleDateString('de-DE')} – ${end.toLocaleDateString('de-DE')}</p>
  <table>
    <thead><tr><th>Datum</th><th>Bereich</th><th>Maßnahme</th><th>Status</th><th>Begründung</th><th>Durchgeführt von</th><th>Notiz</th></tr></thead>
    <tbody>
      ${rows.map(l=>{
        const who = (l.staff?.free || l.staff?.preset || '').trim();
        return `<tr>
          <td>${escapeHtml(new Date(l.date).toLocaleDateString('de-DE'))}</td>
          <td>${escapeHtml(l.area||'')}</td>
          <td>${escapeHtml(l.action||'')}</td>
          <td>${escapeHtml(l.status||'')}</td>
          <td>${escapeHtml(l.reason||'')}</td>
          <td>${escapeHtml(who||'')}</td>
          <td>${escapeHtml(l.note||'')}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <script>window.print(); window.onafterprint=()=>window.close();</script>
  </body></html>`);
  w.document.close();
}


/* === MEDIKAMENTE & GESUNDHEIT (Etappe 2) ==============================
   - Dauerhafter Medikamentenplan pro Hund (Pet)
   - Tagesliste: fällig / gegeben / nicht gegeben (+ Begründung)
   - Gesundheitsnotizen (Tags + Freitext) exportfähig
====================================================================== */

function medISO(){ return toISODateLocal(new Date()); }

function medGetPets(){
  ensureStateShape();
  // Primär neue Struktur: pets
  if(Array.isArray(S.pets) && S.pets.length){
    return S.pets.filter(p=>p && p.id);
  }
  // Fallback legacy dogs
  ensureDefaultDog();
  return (S.dogs||[]).filter(d=>d && !d.isPlaceholder).map(d=>({
    id: d.id, name: d.name, customerId: null, _legacy: true
  }));
}

function medPetName(petId){
  const pets = medGetPets();
  const p = pets.find(x=>x.id===petId);
  return p ? (p.name || "Hund") : "Hund";
}

// Verknüpfung zu Aufenthalten: Welche Hunde sind an einem Tag in Betreuung?
function getPetIdsInCare(dateISO){
  try{
    ensureStateShape();
    const d = String(dateISO||"").slice(0,10);
    if(!d) return [];
    const set = new Set();
    for(const doc of (S.docs||[])){
      if(!doc || doc.type === 'invoice') continue;
      const from = String(doc.meta?.von||"").slice(0,10);
      const to = String(doc.meta?.bis||"").slice(0,10);
      if(!from || !to) continue;
      if(d < from || d > to) continue;
      let pid = String(doc.petId||"");
      if(!pid && doc.dogId){
        const pet = getPetByDogId(doc.dogId);
        pid = pet?.id || "";
      }
      if(pid) set.add(pid);
    }
    return Array.from(set);
  }catch(_){
    return [];
  }
}

function medInitUI(){
  ensureStateShape();

  // Presets in Selects
  const presets = S.medication.staffPresets || ["Raphael","Anschi"];

  const hnByPreset = document.getElementById("hnByPreset");
  if(hnByPreset && !hnByPreset.dataset.bound){
    hnByPreset.innerHTML = presets.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("") + `<option value="__other__">Andere…</option>`;
    hnByPreset.dataset.bound = "1";
  }

  const pendingOnly = document.getElementById("medPendingOnly");
  if(pendingOnly && !pendingOnly.dataset.bound){
    pendingOnly.checked = !!(S.medication.ui && S.medication.ui.pendingOnly);
    pendingOnly.onchange = ()=>{
      ensureStateShape();
      S.medication.ui.pendingOnly = !!pendingOnly.checked;
      try{ localStorage.setItem('dstest_med_pendingOnly', String(S.medication.ui.pendingOnly)); }catch(e){}
      saveState();
      renderMedicationPanel();
    };
    pendingOnly.dataset.bound = "1";
  }

  // Pet select
  const sel = document.getElementById("medPetSelect");
  if(sel && !sel.dataset.bound){
    sel.onchange = ()=>{
      ensureStateShape();
      S.medication.ui = S.medication.ui || {};
      S.medication.ui.selectedPetId = sel.value || "";
      saveState();
      renderMedicationPanel();
    };
    sel.dataset.bound = "1";
  }

  // Add medication
  const btnAdd = document.getElementById("btnMedAdd");
  if(btnAdd && !btnAdd.dataset.bound){
    btnAdd.onclick = ()=>{
      medAddPlanFromForm();
    };
    btnAdd.dataset.bound = "1";
  }

  // Add health note
  const btnHn = document.getElementById("btnHnAdd");
  if(btnHn && !btnHn.dataset.bound){
    btnHn.onclick = ()=>{
      medAddHealthNoteFromForm();
    };
    btnHn.dataset.bound = "1";
  }

  // Export
  const btnExp = document.getElementById("btnMedExport");
  if(btnExp && !btnExp.dataset.bound){
    btnExp.onclick = ()=> medExportPdf();
    btnExp.dataset.bound = "1";
  }
}

function medSelectedPetId(){
  ensureStateShape();
  return (S.medication.ui && S.medication.ui.selectedPetId) ? S.medication.ui.selectedPetId : "";
}

function medPopulatePetSelect(){
  const sel = document.getElementById("medPetSelect");
  if(!sel) return;
  const pets = medGetPets().slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de"));
  const cur = medSelectedPetId();
  const opts = [`<option value="">— Bitte wählen —</option>`]
    .concat(pets.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name||"Hund")}</option>`));
  sel.innerHTML = opts.join("");
  if(cur && pets.some(p=>p.id===cur)) sel.value = cur;
}

function medParseTimes(s){
  const raw = String(s||"").split(",").map(x=>x.trim()).filter(Boolean);
  const out = [];
  for(const t of raw){
    const m = t.match(/^(\d{1,2})[:.](\d{2})$/);
    if(!m) continue;
    const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2,'0');
    const mi = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2,'0');
    out.push(`${hh}:${mi}`);
  }
  // unique
  return Array.from(new Set(out));
}

function medAddPlanFromForm(){
  ensureStateShape();
  const petId = medSelectedPetId();
  if(!petId){
    alert("Bitte zuerst einen Hund auswählen.");
    return;
  }
  const name = (document.getElementById("medName")?.value || "").trim();
  const dose = (document.getElementById("medDose")?.value || "").trim();
  const unit = (document.getElementById("medUnit")?.value || "").trim();
  const times = medParseTimes(document.getElementById("medTimes")?.value || "");
  const notes = (document.getElementById("medNotes")?.value || "").trim();
  const approval = !!document.getElementById("medOwnerApproval")?.checked;

  if(!name){
    alert("Bitte Medikamentenname eingeben.");
    return;
  }
  if(!approval){
    alert("Bitte bestätigen: Freigabe des Halters liegt vor.");
    return;
  }
  if(times.length === 0){
    alert("Bitte mindestens eine Uhrzeit angeben (z. B. 08:00).");
    return;
  }

  const plan = {
    id: uid(),
    petId,
    name,
    dose,
    unit,
    times,
    notes,
    ownerApproval: true,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  S.medication.plans.unshift(plan);

  // reset form
  try{
    document.getElementById("medName").value = "";
    document.getElementById("medDose").value = "";
    document.getElementById("medUnit").value = "";
    document.getElementById("medTimes").value = "";
    document.getElementById("medNotes").value = "";
    document.getElementById("medOwnerApproval").checked = false;
  }catch(_){}

  saveState();
  renderMedicationPanel();
  renderMedicationDashboard();
}

function medPlansForPet(petId){
  ensureStateShape();
  return (S.medication.plans||[]).filter(p=>p && p.petId===petId);
}

function medRecordsFor(dateISO){
  ensureStateShape();
  const d = String(dateISO||"").slice(0,10);
  return (S.medication.records||[]).filter(r=>r && r.date===d);
}

function medHasRecord(petId, planId, dateISO, time){
  const d = String(dateISO||"").slice(0,10);
  return (S.medication.records||[]).some(r =>
    r && r.petId===petId && r.planId===planId && r.date===d && r.time===time
  );
}

function medDueOccurrences(dateISO, onlyPetIds=null){
  ensureStateShape();
  const d = String(dateISO||"").slice(0,10);
  const out = [];
  const petFilter = Array.isArray(onlyPetIds) && onlyPetIds.length ? new Set(onlyPetIds) : null;
  const pets = medGetPets().filter(p=> !petFilter || petFilter.has(p.id));
  for(const pet of pets){
    const plans = (S.medication.plans||[]).filter(p=>p && p.petId===pet.id && p.active !== false);
    for(const pl of plans){
      const times = Array.isArray(pl.times) ? pl.times : [];
      for(const t of times){
        const has = medHasRecord(pet.id, pl.id, d, t);
        out.push({
          key: `${pet.id}:${pl.id}:${d}:${t}`,
          petId: pet.id,
          petName: pet.name || "Hund",
          planId: pl.id,
          medName: pl.name || "Medikament",
          dose: pl.dose || "",
          unit: pl.unit || "",
          time: t,
          notes: pl.notes || "",
          done: has
        });
      }
    }
  }
  // sort by time then name
  out.sort((a,b)=>{
    const tcmp = String(a.time||"").localeCompare(String(b.time||""));
    if(tcmp) return tcmp;
    const ncmp = String(a.petName||"").localeCompare(String(b.petName||""),"de");
    if(ncmp) return ncmp;
    return String(a.medName||"").localeCompare(String(b.medName||""),"de");
  });
  return out;
}

function petIdsInCareOnDate(dateISO){
  try{
    ensureStateShape();
    const d = String(dateISO||"").slice(0,10);
    const set = new Set();
    const docs = (S.docs||[]).filter(x=>x && x.type!=="invoice");
    for(const doc of docs){
      const from = String(doc.meta?.von||"").slice(0,10);
      const to   = String(doc.meta?.bis||"").slice(0,10);
      if(!from || !to) continue;
      if(d < from || d > to) continue;
      const pid = doc.petId || getPetByDogId(doc.dogId)?.id || "";
      if(pid) set.add(pid);
    }
    return Array.from(set);
  }catch(_){ return []; }
}

function medStatusPill(el, status){
  if(!el) return;
  el.textContent = status.text || "—";
  el.classList.remove("warn");
  if(status.code === "overdue" || status.code === "due") el.classList.add("warn");
}

function medOverallStatus(opts={}){
  const iso = opts.dateISO ? String(opts.dateISO).slice(0,10) : medISO();
  const only = Array.isArray(opts.onlyPetIds) ? opts.onlyPetIds : null;
  const due = medDueOccurrences(iso, only);
  const open = due.filter(x=>!x.done).length;
  if(open === 0){
    return { code:"ok", text:"OK" };
  }
  return { code:"due", text:`${open} fällig` };
}

function renderMedicationDashboard(){
  const card = document.getElementById("medDashboardCard");
  if(!card) return;
  ensureStateShape();
  const iso = medISO();
  const inCare = getPetIdsInCare(iso);
  const due = medDueOccurrences(iso, (inCare.length ? inCare : null));
  const open = due.filter(x=>!x.done).length;

  const meta = document.getElementById("medTodayMeta");
  const pill = document.getElementById("medTodayStatus");
  const hint = document.getElementById("medTodayHint");
  const status = medOverallStatus({dateISO: iso, onlyPetIds: (inCare.length ? inCare : null)});
  medStatusPill(pill, status);

  if(meta) meta.textContent = (open===0)
    ? "Keine Gaben offen."
    : `${open} Gabe(n) offen${inCare.length ? " (nur Hunde in Betreuung)" : ""}.`;
  if(hint){
    hint.textContent = open===0
      ? "Alles erledigt – super. Gesundheitsnotizen kannst du jederzeit ergänzen."
      : "Bitte fällige Gaben abhaken (gegeben / nicht gegeben) – mit Begründung bei Abweichung.";
  }
}

function renderMedicationPanel(){
  ensureStateShape();
  medInitUI();
  medPopulatePetSelect();

  // restore pendingOnly from localStorage if present
  try{
    const cb = document.getElementById("medPendingOnly");
    if(cb) cb.checked = !!(S.medication.ui && S.medication.ui.pendingOnly);
  }catch(_){}

  const status = medOverallStatus();
  medStatusPill(document.getElementById("medPanelStatus"), status);

  renderMedicationDue();
  renderMedicationPlans();
  renderHealthNotes();

  renderMedicationDashboard();
}

function renderMedicationDue(){
  const iso = medISO();
  const due = medDueOccurrences(iso);
  const pendingOnly = !!(S.medication.ui && S.medication.ui.pendingOnly);
  const list = document.getElementById("medDueList");
  const meta = document.getElementById("medDueMeta");
  if(!list) return;

  const show = pendingOnly ? due.filter(x=>!x.done) : due;
  const open = due.filter(x=>!x.done).length;

  if(meta){
    meta.textContent = pendingOnly
      ? `${show.length} fällig · ${due.length} gesamt (heute)`
      : `${open} fällig · ${due.length} gesamt (heute)`;
  }

  list.innerHTML = "";
  if(show.length === 0){
    list.innerHTML = `<div class="muted">Keine fälligen Gaben.</div>`;
    return;
  }

  const presets = S.medication.staffPresets || ["Raphael","Anschi"];

  for(const it of show){
    const row = document.createElement("div");
    row.className = "item";
    const doneBadge = it.done ? `<span class="pill">✅ dokumentiert</span>` : `<span class="pill warn">⏳ fällig</span>`;
    row.innerHTML = `
      <div style="min-width:0;">
        <strong>${escapeHtml(it.petName)} · ${escapeHtml(it.medName)}</strong>
        <small>${escapeHtml(it.time)} ${escapeHtml((it.dose?(" · "+it.dose):""))}${escapeHtml((it.unit?(" "+it.unit):""))}${it.notes?(" · "+escapeHtml(it.notes)):""}</small>
      </div>
      <div class="actions" style="gap:6px; flex-wrap:wrap; justify-content:flex-end;">
        ${doneBadge}
        <select class="smallselect medByPreset">
          ${presets.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
          <option value="__other__">Andere…</option>
        </select>
        <input class="smallinput medByText" placeholder="Zusatz" style="width:120px; display:none;" />
        <button class="smallbtn primary" ${it.done?'disabled':''} data-act="given">✅ gegeben</button>
        <button class="smallbtn" ${it.done?'disabled':''} data-act="missed">❌ nicht</button>
      </div>
    `;

    const sel = row.querySelector(".medByPreset");
    const txt = row.querySelector(".medByText");
    if(sel && txt){
      sel.onchange = ()=>{
        if(sel.value === "__other__"){
          txt.style.display = "inline-flex";
          txt.focus();
        } else {
          txt.style.display = "none";
          txt.value = "";
        }
      };
    }

    const btnGiven = row.querySelector('[data-act="given"]');
    const btnMissed = row.querySelector('[data-act="missed"]');

    const onMark = (status)=>{
      const byPreset = (sel && sel.value && sel.value !== "__other__") ? sel.value : "";
      const byText = (txt && txt.style.display !== "none") ? (txt.value||"").trim() : "";
      let reason = "";
      if(status === "missed"){
        reason = prompt("Begründung (Pflicht, z. B. verweigert / erbrochen / Tierarzt):","") || "";
        if(!reason.trim()){
          alert("Begründung ist Pflicht, wenn nicht gegeben.");
          return;
        }
      }
      medAddRecord({
        petId: it.petId,
        planId: it.planId,
        date: iso,
        time: it.time,
        status: (status === "given") ? "gegeben" : "nicht_gegeben",
        reason: reason.trim(),
        byPreset,
        byText
      });
    };

    if(btnGiven) btnGiven.onclick = ()=>onMark("given");
    if(btnMissed) btnMissed.onclick = ()=>onMark("missed");

    list.appendChild(row);
  }
}

function medAddRecord({petId, planId, date, time, status, reason, byPreset, byText}){
  ensureStateShape();
  const iso = String(date||"").slice(0,10);
  if(medHasRecord(petId, planId, iso, time)){
    alert("Für diese Gabe existiert bereits ein Eintrag.");
    return;
  }
  const rec = {
    id: uid(),
    petId,
    planId,
    date: iso,
    time,
    status,
    reason: reason || "",
    byPreset: byPreset || "",
    byText: byText || "",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  S.medication.records.unshift(rec);
  saveState();
  renderMedicationPanel();
}

function renderMedicationPlans(){
  const petId = medSelectedPetId();
  const list = document.getElementById("medPlanList");
  if(!list) return;

  if(!petId){
    list.innerHTML = `<div class="muted">Bitte zuerst einen Hund auswählen.</div>`;
    return;
  }

  const plans = medPlansForPet(petId);
  list.innerHTML = "";
  if(plans.length === 0){
    list.innerHTML = `<div class="muted">Noch keine Medikamente hinterlegt.</div>`;
    return;
  }

  for(const pl of plans){
    const el = document.createElement("div");
    el.className = "item";
    const times = Array.isArray(pl.times) ? pl.times.join(", ") : "";
    const active = (pl.active !== false);
    el.innerHTML = `
      <div style="min-width:0;">
        <strong>${escapeHtml(pl.name||"Medikament")}</strong>
        <small>${escapeHtml([pl.dose, pl.unit].filter(Boolean).join(" "))}${times?(" · "+escapeHtml(times)):""}${pl.notes?(" · "+escapeHtml(pl.notes)):""}</small>
      </div>
      <div class="actions" style="gap:6px; flex-wrap:wrap;">
        <span class="pill ${active?'':'warn'}">${active?'aktiv':'inaktiv'}</span>
        <button class="smallbtn" data-t="toggle">${active?'Deaktivieren':'Aktivieren'}</button>
        <button class="smallbtn" data-t="del">Löschen</button>
      </div>
    `;
    el.querySelector('[data-t="toggle"]').onclick = ()=>{
      pl.active = !active;
      pl.updatedAt = Date.now();
      saveState();
      renderMedicationPanel();
    };
    el.querySelector('[data-t="del"]').onclick = ()=>{
      if(confirm("Medikament wirklich löschen? (Dokumentation bleibt erhalten, Plan wird entfernt)")){
        S.medication.plans = (S.medication.plans||[]).filter(x=>x.id!==pl.id);
        saveState();
        renderMedicationPanel();
      }
    };
    list.appendChild(el);
  }
}

function medAddHealthNoteFromForm(){
  ensureStateShape();
  const petId = medSelectedPetId();
  if(!petId){
    alert("Bitte zuerst einen Hund auswählen.");
    return;
  }
  const tags = Array.from(document.querySelectorAll(".hnTag")).filter(cb=>cb.checked).map(cb=>cb.value);
  const text = (document.getElementById("hnText")?.value || "").trim();
  if(!text){
    alert("Bitte eine kurze Notiz eingeben.");
    return;
  }
  const relatedToMeds = !!document.getElementById("hnRelatedMeds")?.checked;
  const ownerInformed = !!document.getElementById("hnOwnerInformed")?.checked;
  const byPresetSel = document.getElementById("hnByPreset");
  const byPreset = (byPresetSel && byPresetSel.value && byPresetSel.value !== "__other__") ? byPresetSel.value : "";
  const byText = (document.getElementById("hnByText")?.value || "").trim();

  const note = {
    id: uid(),
    petId,
    date: medISO(),
    tags,
    text,
    relatedToMeds,
    ownerInformed,
    byPreset,
    byText,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  S.medication.healthNotes.unshift(note);

  // reset
  try{
    document.getElementById("hnText").value = "";
    document.querySelectorAll(".hnTag").forEach(cb=>cb.checked=false);
    document.getElementById("hnRelatedMeds").checked = false;
    document.getElementById("hnOwnerInformed").checked = false;
    document.getElementById("hnByText").value = "";
  }catch(_){}

  saveState();
  renderMedicationPanel();
}

function renderHealthNotes(){
  const petId = medSelectedPetId();
  const list = document.getElementById("hnList");
  if(!list) return;

  // fill presets
  const presets = S.medication.staffPresets || ["Raphael","Anschi"];
  const sel = document.getElementById("hnByPreset");
  if(sel){
    sel.innerHTML = presets.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("") + `<option value="__other__">Andere…</option>`;
  }

  if(!petId){
    list.innerHTML = `<div class="muted">Bitte zuerst einen Hund auswählen.</div>`;
    return;
  }

  const notes = (S.medication.healthNotes||[]).filter(n=>n && n.petId===petId).slice(0,25);
  list.innerHTML = "";
  if(notes.length === 0){
    list.innerHTML = `<div class="muted">Noch keine Gesundheitsnotizen.</div>`;
    return;
  }
  for(const n of notes){
    const tags = (n.tags||[]).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(" ");
    const by = [n.byPreset, n.byText].filter(Boolean).join(" ");
    const flags = [
      n.relatedToMeds ? "💊 Medikation?" : "",
      n.ownerInformed ? "📞 Halter informiert" : ""
    ].filter(Boolean).join(" · ");
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div style="min-width:0;">
        <strong>${escapeHtml(formatDateDE(n.date))}</strong>
        <small>${tags} ${flags ? (" · "+escapeHtml(flags)) : ""}${by ? (" · "+escapeHtml(by)) : ""}</small>
        <div style="margin-top:6px;">${escapeHtml(n.text)}</div>
      </div>
      <div class="actions" style="gap:6px; flex-wrap:wrap;">
        <button class="smallbtn" data-del="1">Löschen</button>
      </div>
    `;
    el.querySelector('[data-del="1"]').onclick = ()=>{
      if(confirm("Notiz löschen? (nur wenn wirklich falsch)")){
        S.medication.healthNotes = (S.medication.healthNotes||[]).filter(x=>x.id!==n.id);
        saveState();
        renderMedicationPanel();
      }
    };
    list.appendChild(el);
  }
}

function medExportPdf(){
  ensureStateShape();
  const startStr = prompt("Export ab Datum (YYYY-MM-DD) – leer = letzter Monat:", "");
  const endStr = prompt("Export bis Datum (YYYY-MM-DD) – leer = heute:", "");
  const endISO = (endStr && endStr.trim()) ? endStr.trim().slice(0,10) : medISO();
  const end = new Date(endISO);
  const start = (startStr && startStr.trim())
    ? new Date(startStr.trim().slice(0,10))
    : (()=>{
        const d = new Date(end);
        d.setMonth(d.getMonth()-1);
        return d;
      })();

  const startISO = toISODateLocal(start);
  const petId = medSelectedPetId(); // optional: if set, filter export
  const pets = medGetPets();

  const plans = (S.medication.plans||[]).filter(p=>{
    if(!p) return false;
    if(petId && p.petId !== petId) return false;
    return true;
  });

  const records = (S.medication.records||[]).filter(r=>{
    if(!r) return false;
    if(petId && r.petId !== petId) return false;
    return (r.date >= startISO && r.date <= endISO);
  });

  const notes = (S.medication.healthNotes||[]).filter(n=>{
    if(!n) return false;
    if(petId && n.petId !== petId) return false;
    return (n.date >= startISO && n.date <= endISO);
  });

  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Medikation-Export</title>
  <style>
    body{font-family:system-ui,-apple-system,Arial; padding:18px;}
    h1{margin:0 0 6px 0}
    .muted{color:#555;margin:0 0 14px 0}
    table{width:100%;border-collapse:collapse; font-size:12px}
    th,td{border:1px solid #ccc; padding:8px; vertical-align:top}
    th{background:#f3f3f3}
    .pill{display:inline-block;border:1px solid #ddd;border-radius:999px;padding:2px 8px;margin:2px 4px 2px 0;font-size:11px;}
  </style></head><body>
  <h1>Medikamenten- &amp; Gesundheitsnachweis</h1>
  <p class="muted">Hundepension Doggy Style – Angelika &amp; Raphael Boch · Zeitraum: ${start.toLocaleDateString('de-DE')} – ${end.toLocaleDateString('de-DE')}</p>

  <h2>Medikamentenpläne</h2>
  <table>
    <thead><tr><th>Hund</th><th>Medikament</th><th>Dosis</th><th>Uhrzeiten</th><th>Hinweise</th><th>Status</th></tr></thead>
    <tbody>
      ${plans.map(p=>{
        const dog = medPetName(p.petId);
        const dose = [p.dose,p.unit].filter(Boolean).join(" ");
        const times = (p.times||[]).join(", ");
        const st = (p.active===false) ? "inaktiv" : "aktiv";
        return `<tr><td>${escapeHtml(dog)}</td><td>${escapeHtml(p.name||"")}</td><td>${escapeHtml(dose)}</td><td>${escapeHtml(times)}</td><td>${escapeHtml(p.notes||"")}</td><td>${escapeHtml(st)}</td></tr>`;
      }).join("")}
    </tbody>
  </table>

  <h2>Gaben-Protokoll</h2>
  <table>
    <thead><tr><th>Datum</th><th>Uhrzeit</th><th>Hund</th><th>Medikament</th><th>Status</th><th>Begründung</th><th>Durchgeführt von</th></tr></thead>
    <tbody>
      ${records.slice().reverse().map(r=>{
        const dog = medPetName(r.petId);
        const pl = (S.medication.plans||[]).find(p=>p.id===r.planId);
        const med = pl ? pl.name : "—";
        const by = [r.byPreset, r.byText].filter(Boolean).join(" ");
        const st = (r.status==="gegeben") ? "gegeben" : "nicht gegeben";
        return `<tr><td>${escapeHtml(formatDateDE(r.date))}</td><td>${escapeHtml(r.time||"")}</td><td>${escapeHtml(dog)}</td><td>${escapeHtml(med)}</td><td>${escapeHtml(st)}</td><td>${escapeHtml(r.reason||"")}</td><td>${escapeHtml(by)}</td></tr>`;
      }).join("")}
    </tbody>
  </table>

  <h2>Gesundheitsnotizen</h2>
  <table>
    <thead><tr><th>Datum</th><th>Hund</th><th>Tags</th><th>Notiz</th><th>Hinweise</th><th>Notiert von</th></tr></thead>
    <tbody>
      ${notes.slice().reverse().map(n=>{
        const dog = medPetName(n.petId);
        const tags = (n.tags||[]).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(" ");
        const flags = [
          n.relatedToMeds ? "Medikation?" : "",
          n.ownerInformed ? "Halter informiert" : ""
        ].filter(Boolean).join(" · ");
        const by = [n.byPreset, n.byText].filter(Boolean).join(" ");
        return `<tr><td>${escapeHtml(formatDateDE(n.date))}</td><td>${escapeHtml(dog)}</td><td>${tags}</td><td>${escapeHtml(n.text||"")}</td><td>${escapeHtml(flags)}</td><td>${escapeHtml(by)}</td></tr>`;
      }).join("")}
    </tbody>
  </table>

  <script>window.print();window.onafterprint=()=>window.close();</script>
  </body></html>`);
  w.document.close();
}


function formatDateDE(iso){
  const dt = new Date(iso);
  return dt.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
}

/* ===== Belegungskalender (Monatsansicht) ===== */
const CAL = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selectedDay: "",
  filters: { urlaub: true, tages: true }
};

function getCalFilters(){
  // Safety defaults
  if(!CAL.filters) CAL.filters = { urlaub:true, tages:true };
  // Wenn beides aus ist, erzwinge wieder beide an (sonst wirkt Kalender "leer")
  if(!CAL.filters.urlaub && !CAL.filters.tages){
    CAL.filters.urlaub = true; CAL.filters.tages = true;
  }
  return CAL.filters;
}

function applyCalFilterUI(){
  const f = getCalFilters();
  const btnU = document.getElementById('calFilterUrlaub');
  const btnT = document.getElementById('calFilterTages');
  if(btnU){
    btnU.classList.toggle('is-off', !f.urlaub);
    btnU.setAttribute('aria-pressed', String(!!f.urlaub));
    btnU.onclick = ()=>{ CAL.filters.urlaub = !CAL.filters.urlaub; applyCalFilterUI(); renderCalendarPanel(); if(CAL.selectedDay) renderCalendarDayDetail(CAL.selectedDay); };
  }
  if(btnT){
    btnT.classList.toggle('is-off', !f.tages);
    btnT.setAttribute('aria-pressed', String(!!f.tages));
    btnT.onclick = ()=>{ CAL.filters.tages = !CAL.filters.tages; applyCalFilterUI(); renderCalendarPanel(); if(CAL.selectedDay) renderCalendarDayDetail(CAL.selectedDay); };
  }
}

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }


function monthLabel(year, month){
  const d = new Date(year, month, 1);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function dateISO(d){
  return toISODateLocal(d);
}

function startOfCalendarGrid(year, month){
  // Grid beginnt am Montag der Woche, in der der 1. des Monats liegt
  const first = new Date(year, month, 1);
  const weekday = (first.getDay() + 6) % 7; // 0=Mo ... 6=So
  const start = new Date(first);
  start.setDate(first.getDate() - weekday);
  start.setHours(0,0,0,0);
  return start;
}

function renderCalendarPanel(){
  const grid = document.getElementById('calGrid');
  const title = document.getElementById('calMonthLabel');
  if(!grid || !title) return;

  title.textContent = monthLabel(CAL.year, CAL.month);
  applyCalFilterUI();

  // Header (Wochentage)
  const dows = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  grid.innerHTML = dows.map(x=>`<div class="cal-dow">${x}</div>`).join('');

  const start = startOfCalendarGrid(CAL.year, CAL.month);
  const todayIso = toISODateLocal(new Date());

  for(let i=0;i<42;i++){
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = dateISO(d);
    const inMonth = (d.getMonth() === CAL.month);
    const dayNum = d.getDate();

    const board = countForDay('Urlaubsbetreuung', iso);
    const dayc = countForDay('Tagesbetreuung', iso);
    const over = (board > getCapacity("Urlaubsbetreuung", iso)) || (dayc > getCapacity("Tagesbetreuung", iso));

    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (inMonth ? '' : ' is-other') + (iso===todayIso ? ' is-today':'') + (iso===CAL.selectedDay ? ' is-selected':'') + (over ? ' is-over':'');
    cell.dataset.day = iso;

    const f = getCalFilters();
    const freeU = getCapacity("Urlaubsbetreuung", iso) - board;
    const freeT = getCapacity("Tagesbetreuung", iso) - dayc;
    const uPct = clamp((board / Math.max(1,getCapacity("Urlaubsbetreuung", iso))) * 100, 0, 100);
    const tPct = clamp((dayc / Math.max(1,getCapacity("Tagesbetreuung", iso))) * 100, 0, 100);

    const badges = [];
    const bars = [];
    const freeParts = [];
    if(f.urlaub){
      badges.push(`<div class="cal-badge" title="Urlaubsbetreuung"><span>🏡 <strong>${board}</strong></span><span class="muted">/ ${getCapacity("Urlaubsbetreuung", iso)}</span></div>`);
      bars.push(`<div class="cal-bar" title="Urlaub: ${board}/${getCapacity("Urlaubsbetreuung", iso)}"><div class="fill" style="width:${uPct}%;"></div></div>`);
      freeParts.push(`🏡 ${Math.max(0, freeU)}`);
    }
    if(f.tages){
      badges.push(`<div class="cal-badge" title="Tagesbetreuung"><span>🐕 <strong>${dayc}</strong></span><span class="muted">/ ${getCapacity("Tagesbetreuung", iso)}</span></div>`);
      bars.push(`<div class="cal-bar" title="Tages: ${dayc}/${getCapacity("Tagesbetreuung", iso)}"><div class="fill" style="width:${tPct}%;"></div></div>`);
      freeParts.push(`🐕 ${Math.max(0, freeT)}`);
    }

    cell.innerHTML = `
      ${over ? `<div class="cal-warnchip" title="Über Kapazität">⚠️</div>` : ``}
      <div class="cal-date">${dayNum}</div>
      <div class="cal-badges">${badges.join('')}</div>
      <div class="cal-free">frei: ${freeParts.join(' · ')}</div>
      <div class="cal-bars">${bars.join('')}</div>
    `;

    cell.onclick = ()=>{
      CAL.selectedDay = iso;
      renderCalendarPanel();
      renderCalendarDayDetail(iso);
    };

    grid.appendChild(cell);
  }
}

function renderCalendarDayDetail(iso){
  const card = document.getElementById('calDayDetail');
  const title = document.getElementById('calDayTitle');
  const meta = document.getElementById('calDayMeta');
  const list = document.getElementById('calDayList');
  if(!card || !title || !meta || !list) return;

  const dt = new Date(iso);
  const label = dt.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });

  const board = countForDay('Urlaubsbetreuung', iso);
  const dayc = countForDay('Tagesbetreuung', iso);

  title.textContent = label;
  const f = getCalFilters();
  const freeU = getCapacity("Urlaubsbetreuung", iso) - board;
  const freeT = getCapacity("Tagesbetreuung", iso) - dayc;
  const parts = [];
  const freeParts = [];
  if(f.urlaub){ parts.push(`🏡 ${board}/${getCapacity("Urlaubsbetreuung", iso)}`); freeParts.push(`🏡 ${Math.max(0, freeU)} frei`); }
  if(f.tages){ parts.push(`🐕 ${dayc}/${getCapacity("Tagesbetreuung", iso)}`); freeParts.push(`🐕 ${Math.max(0, freeT)} frei`); }
  meta.textContent = `${parts.join(' · ')}  —  ${freeParts.join(' · ')}`;

  const stays = (S.docs||[]).filter(d=>{
    if(!d.saved) return false;
    if(d.type==='invoice') return false;
    if(!d.meta?.von || !d.meta?.bis) return false;
    const bt = d.meta?.betreuung||'';
    if(bt==='Urlaubsbetreuung' && !f.urlaub) return false;
    if(bt==='Tagesbetreuung' && !f.tages) return false;
    return (iso >= d.meta.von && iso <= d.meta.bis);
  }).slice().sort((a,b)=> String(a.meta?.von||'').localeCompare(String(b.meta?.von||'')));

  // Etappe 4: Medikamente pro Aufenthaltstag (Kalender-Tag-Detail)
  const stayPetIds = Array.from(new Set((stays||[]).map(s => (s.petId || s.dogId || "")).filter(Boolean)));
  const medOcc = (stayPetIds.length ? medDueOccurrences(iso, stayPetIds) : []);
  const medOpen = medOcc.filter(o=>!o.done);

  // Etappe 4.1: Filter im Tagdetail – nur fällige
  ensureStateShape();
  if(!S.medication.ui) S.medication.ui = {};
  if(typeof S.medication.ui.calDayPendingOnly !== 'boolean') S.medication.ui.calDayPendingOnly = false;
  const calPendingOnly = !!S.medication.ui.calDayPendingOnly;


  list.innerHTML = '';

  // Medikamente für den Tag anzeigen (falls es Pläne gibt)
  if(medOcc.length){
    const head = document.createElement('div');
    head.className = 'item';
    const openLabel = medOpen.length ? `<span class="pill warn" style="margin-left:8px;">${medOpen.length} fällig</span>` : `<span class="pill" style="margin-left:8px;">OK</span>`;
    head.innerHTML = `<div><strong>💊 Medikamente</strong>${openLabel}<small>Fälligkeiten für Hunde mit Aufenthalt</small></div>
                      <button class="btn" style="padding:8px 10px; font-size:12px;">Öffnen</button>`;
    const btn = head.querySelector('button');
    if(btn){
      btn.onclick = ()=>{
        try{
          // Öffnet den Medikamenten-Tab; Details werden dort erledigt
          openMedication();
          setTimeout(()=>{ try{ renderMedicationPanel(); }catch(_){ } }, 120);
        }catch(e){ console.warn(e); }
      };
    }
    list.appendChild(head);

    // Filterzeile (nur fällige)
    const filter = document.createElement('div');
    filter.className = 'item';
    filter.innerHTML = `
      <div style="min-width:0;">
        <small><label style="display:inline-flex; gap:8px; align-items:center; cursor:pointer;">
          <input type="checkbox" id="calMedPendingOnly" ${calPendingOnly ? 'checked' : ''} />
          nur fällige
        </label>
        <span class="muted" style="margin-left:10px;">${medOpen.length} fällig / ${medOcc.length} gesamt</span></small>
      </div>
    `;
    const cb = filter.querySelector('#calMedPendingOnly');
    if(cb){
      cb.onchange = ()=>{
        try{
          S.medication.ui.calDayPendingOnly = !!cb.checked;
          saveState();
        }catch(_){ }
        renderCalendarDayDetail(iso);
      };
    }
    list.appendChild(filter);

    const occToShow = calPendingOnly ? medOpen : medOcc;
    if(calPendingOnly && occToShow.length === 0){
      const none = document.createElement('div');
      none.className = 'muted';
      none.style.margin = '6px 0 2px';
      none.textContent = 'Keine fälligen Gaben.';
      list.appendChild(none);
    }

    occToShow.forEach(o=>{
      const it = document.createElement('div');
      it.className = 'item';
      const status = o.done ? '✅' : '⏳';
      const dose = [o.dose, o.unit].filter(Boolean).join(' ').trim();
      const note = o.notes ? ` · <span class="muted">${escapeHtml(o.notes)}</span>` : '';
      it.innerHTML = `<div><strong>${status} ${escapeHtml(o.petName||'Hund')}</strong>
                        <small>${escapeHtml(o.time||'')} · ${escapeHtml(o.medName||'Medikament')}${dose?` · ${escapeHtml(dose)}`:''}${note}</small>
                      </div>`;
      if(!o.done){
        it.classList.add('warn');
      }
      list.appendChild(it);
    });

    // kleine Trennung zur Aufenthaltsliste
    const sep = document.createElement('div');
    sep.className = 'muted';
    sep.style.margin = '6px 0 2px';
    sep.textContent = 'Aufenthalte';
    list.appendChild(sep);
  }

  if(!stays.length){
    list.innerHTML = `<div class="muted">Keine Aufenthalte an diesem Tag.</div>`;
  } else {
    stays.forEach(d=>{
      const item = document.createElement('div');
      item.className = 'item';
      const t = escapeHtml(d.title||'Aufenthalt');
      const typ = escapeHtml(d.meta?.betreuung||'');
      const range = `${escapeHtml(d.meta?.von||'')} – ${escapeHtml(d.meta?.bis||'')}`;
      item.innerHTML = `<div><strong>${t}</strong><small>${typ} · ${range}</small></div>`;

      const actions = document.createElement('div');
      actions.className = 'actions';
      const btn = document.createElement('button');
      btn.className = 'smallbtn';
      btn.textContent = 'Öffnen';
      btn.onclick = ()=>openDoc(d.id);
      actions.appendChild(btn);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }
  card.style.display = '';
}

function wireCalendarControls(){
  const prev = document.getElementById('btnCalPrev');
  const next = document.getElementById('btnCalNext');
  const today = document.getElementById('btnCalToday');
  const close = document.getElementById('btnCalCloseDay');
  if(prev) prev.onclick = ()=>{
    const d = new Date(CAL.year, CAL.month, 1);
    d.setMonth(d.getMonth()-1);
    CAL.year = d.getFullYear();
    CAL.month = d.getMonth();
    renderCalendarPanel();
  };
  if(next) next.onclick = ()=>{
    const d = new Date(CAL.year, CAL.month, 1);
    d.setMonth(d.getMonth()+1);
    CAL.year = d.getFullYear();
    CAL.month = d.getMonth();
    renderCalendarPanel();
  };
  if(today) today.onclick = ()=>{
    const d = new Date();
    CAL.year = d.getFullYear();
    CAL.month = d.getMonth();
    CAL.selectedDay = toISODateLocal(d);
    renderCalendarPanel();
    renderCalendarDayDetail(CAL.selectedDay);
  };
  if(close) close.onclick = ()=>{
    const card = document.getElementById('calDayDetail');
    if(card) card.style.display = 'none';
    CAL.selectedDay = '';
    renderCalendarPanel();
  };
}

$$(".tab").forEach(b=>b.addEventListener("click",()=>{
  $$(".tab").forEach(x=>x.classList.toggle("is-active",x===b));
  showPanel(b.dataset.tab);
}));

let templates=[];
function normalizeTemplate(t){
  // Unterstützt verschiedene Schemas (alt/neu):
  // - name/title
  // - sections[].fields[] (neu)
  // - fields[] (alt, ohne sections)
  // - meta[] (neu) oder metaFields[] (alt)
  if(!t || typeof t !== "object") return t;

  if(!t.name && t.title) t.name = t.title;
  if(!t.id && t.key) t.id = t.key;

  // 1) fields: id -> key (für beide Ebenen)
  if(Array.isArray(t.fields)){
    t.fields.forEach(f=>{
      if(f && !f.key && f.id) f.key = f.id;
    });
  }

  if(Array.isArray(t.sections)){
    t.sections.forEach(sec=>{
      if(Array.isArray(sec.fields)){
        sec.fields.forEach(f=>{
          if(f && !f.key && f.id) f.key = f.id;
        });
      } else {
        sec.fields = [];
      }
      if(!sec.title) sec.title = t.name || "Formular";
    });
  }

  // 2) Kompatibilität: wenn keine sections vorhanden sind, aber fields existieren → in eine Standard-Section packen
  if(!Array.isArray(t.sections) || !t.sections.length){
    const fld = Array.isArray(t.fields) ? t.fields : [];
    t.sections = [{ title: t.name || "Formular", fields: fld }];
  }

  // 3) meta: immer als Array vorhalten
  if(Array.isArray(t.meta)){
    // ok
  } else if(Array.isArray(t.metaFields)){
    t.meta = t.metaFields;
  } else if(t.meta && typeof t.meta === "object" && Array.isArray(t.meta.fields)){
    // seltenes Schema: meta: {fields:[...]}
    t.meta = t.meta.fields;
  } else {
    t.meta = [];
  }

  // meta fields: id -> key
  if(Array.isArray(t.meta)){
    t.meta.forEach(f=>{
      if(f && !f.key && f.id) f.key = f.id;
    });
  }

  // DS-GVO Note Alias (optional)
  if(!t.dsGvoNote && t.dsGVO) t.dsGvoNote = t.dsGVO;

  return t;
}

async function loadTemplates(){
  templates = [];
  const files = [
    // GitHub Pages ist case-sensitiv (Ordner + Dateiname). Daher probieren wir robuste Varianten.
    // Aufenthalte (Hundeannahme)
    {path: "templates/hundeannahme.json", label: "Hundeannahme"},
    {path: "templates/Hundeannahme.json", label: "Hundeannahme"},
    {path: "Templates/hundeannahme.json", label: "Hundeannahme"},
    {path: "Templates/Hundeannahme.json", label: "Hundeannahme"},
        // Neuer Aufenthalt (neues Template)
    {path: "templates/neueraufenthalt.json", label: "Neuer Aufenthalt"},
    {path: "templates/NeuerAufenthalt.json", label: "Neuer Aufenthalt"},
    {path: "Templates/neueraufenthalt.json", label: "Neuer Aufenthalt"},
    {path: "Templates/NeuerAufenthalt.json", label: "Neuer Aufenthalt"},
// Rechnungen
    {path: "templates/rechnung.json", label: "Rechnung"},
    {path: "templates/Rechnung.json", label: "Rechnung"},
    {path: "Templates/rechnung.json", label: "Rechnung"},
    {path: "Templates/Rechnung.json", label: "Rechnung"}
  ];

  for(const f of files){
    try{
      const res = await fetch(f.path, {cache: "no-store"});
      if(!res.ok) throw new Error(res.status);
      const t = normalizeTemplate(await res.json());
      if(!templates.some(x=>x.id===t.id)) templates.push(t);
    }catch(e){
      console.warn("Template konnte nicht geladen werden:", f.path, e);
    }
  }

  // Fallback: Wenn gar nichts geladen werden konnte, App trotzdem startbar lassen
  if(!templates.length){
    templates = [normalizeTemplate({
      id: "hundeannahme",
      name: "Hundeannahme",
      sections: [{ title: "Hundeannahme", fields: [] }],
      meta: [],
      dsGvoNote: ""
    })];
  }

  const sel = document.getElementById("templateSelect");
  if (sel) {
    sel.innerHTML = templates
      .map(t => `<option value="${t.id}">${escapeHtml(t.name || t.title || t.id)}</option>`)
      .join("");
  }
}
const getTemplate=id=>templates.find(t=>t.id===id);


function uid(){return Math.random().toString(16).slice(2)+Date.now().toString(16);}

// ===== ETAPPE 1: Datenmodell v2 + Migration (Kunden/Hunde/Aufenthalte/Rechnungen) =====

/* ===== Profi: Mitarbeiter, Vorlagen-Versionen, §11-Ampel, Monatsabschluss, Steuerberater-Export ===== */
function uniq(arr){
  const out=[]; const seen=new Set();
  (arr||[]).forEach(x=>{ const k=String(x||"").trim(); if(!k) return; if(seen.has(k)) return; seen.add(k); out.push(k); });
  return out;
}

function ensureProfiDefaults(){
  if(!state || typeof state !== 'object') return;

  // Kompatibilität: älterer Masterstand nutzt S.staff.people + S.compliance.docs/monthClosings.
  if(!S.staff || typeof S.staff !== 'object') S.staff = {};
  if(!Array.isArray(S.staff.people)) S.staff.people = [];
  if(!Array.isArray(S.staff.presets)) S.staff.presets = ["Raphael","Anschi"];
  // Raphael/Anschi immer vorhanden
  const ensure = (name)=>{
    if(!name) return;
    let p = S.staff.people.find(x=>x && x.name===name);
    if(!p){ S.staff.people.push({id: uid(), name, role:"", active:true, createdAt:Date.now()}); }
    else if(typeof p.active !== 'boolean') p.active = true;
  };
  S.staff.presets.forEach(ensure);

  // Alias für die neuen UI-Helper
  S.staff.list = S.staff.people;
  if(typeof S.staff.nextId !== 'number') S.staff.nextId = 1;

  // Versionierung & Monatsabschluss: über S.compliance
  if(!S.compliance || typeof S.compliance !== 'object') S.compliance = {};
  if(!S.compliance.docs || typeof S.compliance.docs !== 'object') S.compliance.docs = {};
  const today = toISODateLocal(new Date());
  const ensureDoc = (key, title)=>{
    if(!S.compliance.docs[key] || typeof S.compliance.docs[key] !== 'object'){
      S.compliance.docs[key] = { title, version:"1.0", lastChanged: today, history: [] };
    }
    if(!Array.isArray(S.compliance.docs[key].history)) S.compliance.docs[key].history = [];
  };
  ensureDoc('hygiene', 'Hygieneplan');
  ensureDoc('brand', 'Brandfall- & Evakuierungskonzept');
  ensureDoc('notfall', 'Notfallplan');
  ensureDoc('contract', 'Betreuungsvertrag');
  S.compliance.monthClosings = Array.isArray(S.compliance.monthClosings) ? S.compliance.monthClosings : [];
}

function getActiveStaffNames(){
  ensureProfiDefaults();
  return uniq((S.staff.list||[]).filter(s=>s && s.active!==false).map(s=>s.name));
}

function staffSelectOptions(selected){
  const names = getActiveStaffNames();
  const sel = String(selected||'');
  const opts = names.map(n=>`<option value="${escapeHtml(n)}" ${n===sel?'selected':''}>${escapeHtml(n)}</option>`).join('');
  return `<option value="">(Auswahl)</option>${opts}`;
}

function complianceItem(label, status, detail){
  const pillClass = status==='green' ? '' : (status==='yellow' ? 'warn' : 'danger');
  const icon = status==='green' ? '🟢' : (status==='yellow' ? '🟡' : '🔴');
  return {label, status, detail, icon, pillClass};
}

function computeCompliance(){
  ensureStateShape();
  ensureProfiDefaults();
  const today = todayISO();

  // Hygiene: offene Einträge heute oder überfällige Wochenaufgaben
  const hygLogs = (S.hygiene?.logs||[]);
  const openHygToday = hygLogs.filter(l=>l && l.date===today && l.status==='pending').length;
  const weekly = (S.hygiene?.weeklyTasks||[]);
  const overdueWeekly = weekly.filter(t=>{
    const last = t?.lastDone ? String(t.lastDone).slice(0,10) : '';
    if(!last) return true;
    try{
      const dLast = new Date(last);
      const dNow = new Date(today);
      const diff = Math.floor((dNow-dLast)/(1000*60*60*24));
      return diff > Number(t.intervalDays||7);
    }catch(_){ return true; }
  }).length;
  let hygStatus='green';
  let hygDetail='Alles aktuell.';
  if(openHygToday>0 || overdueWeekly>0){
    hygStatus = (overdueWeekly>0) ? 'red' : 'yellow';
    hygDetail = `${openHygToday} offen heute, ${overdueWeekly} Wochenaufgabe(n) überfällig.`;
  }

  // Medikation: fällige Gaben heute (nur Hunde in Betreuung)
  let medStatus='green', medDetail='Keine fälligen Gaben.';
  try{
    const inCare = getPetIdsInCare(today);
    const due = medDueOccurrences(today, (inCare.length ? inCare : null));
    const open = due.filter(x=>!x.done).length;
    if(open>0){ medStatus='yellow'; medDetail = `${open} Gabe(n) fällig.`; }
  }catch(e){ /* ignore */ }

  // Verträge: aktive Aufenthalte ohne unterschriebenen Vertrag
  let conStatus='green', conDetail='Für aktive Aufenthalte liegt ein Vertrag vor.';
  try{
    const activeStays = (S.docs||[]).filter(d=>d && d.type==='hundeannahme' && d.saved && d.meta?.von && d.meta?.bis && (today>=d.meta.von && today<=d.meta.bis));
    const missing = activeStays.filter(d=>!d.contractSigned && !(d.signatures && d.signatures.halter)).length;
    if(missing>0){ conStatus='yellow'; conDetail = `${missing} aktiv ohne (vollständige) Unterschrift.`; }
  }catch(e){ }

  // Notfall/Brand: Vorlage vorhanden (Versionen gesetzt)
  const docs = S.compliance?.docs || {};
  const fireOk = !!docs.brand?.version;
  const emergOk = !!docs.notfall?.version;
  let nfStatus='green', nfDetail='Vorlagen vorhanden.';
  if(!fireOk || !emergOk){ nfStatus='red'; nfDetail='Notfall/Brand Vorlagen fehlen.'; }

  const items = [
    complianceItem('Hygiene', hygStatus, hygDetail),
    complianceItem('Medikation', medStatus, medDetail),
    complianceItem('Verträge', conStatus, conDetail),
    complianceItem('Notfall/Brand', nfStatus, nfDetail)
  ];
  const worst = items.reduce((a,i)=>{
    const rank = (s)=> s==='red'?3 : (s==='yellow'?2:1);
    return rank(i.status)>rank(a)?i.status:a;
  }, 'green');
  return {today, items, worst};
}

function renderComplianceDashboard(){
  const card = document.getElementById('complianceDashboardCard');
  if(!card) return;
  const meta = document.getElementById('complianceMeta');
  const pill = document.getElementById('complianceStatus');
  const list = document.getElementById('complianceList');
  const c = computeCompliance();
  if(meta) meta.textContent = `Stand: ${formatDateDE(c.today)} · Tipp: Monat abschließen = Nachweis + Backup`;
  if(pill){
    pill.textContent = c.worst==='green' ? 'OK' : (c.worst==='yellow'?'Achtung':'Handlungsbedarf');
    pill.classList.toggle('warn', c.worst==='yellow');
    pill.classList.toggle('danger', c.worst==='red');
  }
  if(list){
    list.innerHTML = c.items.map(i=>`
      <div class="list-row">
        <div>
          <strong>${i.icon} ${escapeHtml(i.label)}</strong>
          <div class="muted" style="margin-top:4px">${escapeHtml(i.detail||'')}</div>
        </div>
        <span class="pill ${i.pillClass}">${i.status==='green'?'OK':(i.status==='yellow'?'fällig':'überfällig')}</span>
      </div>
    `).join('');
  }
}

function renderComplianceInSettings(){
  const el = document.getElementById('complianceSettingsList');
  if(!el) return;
  const c = computeCompliance();
  el.innerHTML = c.items.map(i=>`
    <div class="list-row">
      <div>
        <strong>${i.icon} ${escapeHtml(i.label)}</strong>
        <div class="muted" style="margin-top:4px">${escapeHtml(i.detail||'')}</div>
      </div>
      <span class="pill ${i.pillClass}">${i.status==='green'?'OK':(i.status==='yellow'?'fällig':'überfällig')}</span>
    </div>
  `).join('');
}

function renderStaffSettings(){
  const list = document.getElementById('staffList');
  if(!list) return;
  ensureProfiDefaults();
  list.innerHTML = (S.staff.list||[]).map(s=>{
    const active = s.active!==false;
    return `<div class="list-row">
      <div>
        <strong>${escapeHtml(s.name||'')}</strong>
        <div class="muted" style="margin-top:4px">${escapeHtml(s.role||'')}</div>
      </div>
      <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">
        <button class="smallbtn" onclick="profiEditStaff('${escapeHtml(s.id)}')">Bearbeiten</button>
        <button class="smallbtn ${active?'warn':'primary'}" onclick="profiToggleStaff('${escapeHtml(s.id)}')">${active?'Deaktivieren':'Aktivieren'}</button>
      </div>
    </div>`;
  }).join('') || `<div class="muted">Keine Mitarbeitenden.</div>`;
}

function profiAddStaff(){
  ensureProfiDefaults();
  const name = (document.getElementById('staffNameInput')?.value||'').trim();
  const role = (document.getElementById('staffRoleInput')?.value||'').trim();
  if(!name){ alert('Bitte Name eingeben.'); return; }
  const id = `staff_${S.staff.nextId++}`;
  S.staff.list.push({id, name, role, active:true, createdAt:Date.now()});
  // in Modul-Presets synchronisieren
  const names = getActiveStaffNames();
  S.hygiene.staffPresets = uniq([...(S.hygiene.staffPresets||[]), ...names]);
  S.medication.staffPresets = uniq([...(S.medication.staffPresets||[]), ...names]);
  saveState();
  document.getElementById('staffNameInput').value='';
  document.getElementById('staffRoleInput').value='';
  renderStaffSettings();
  // Refresh panels that use presets
  try{ renderHygienePanel(); }catch(_){ }
  try{ renderMedicationPanel(); }catch(_){ }
}

function profiToggleStaff(id){
  ensureProfiDefaults();
  const s = (S.staff.list||[]).find(x=>x.id===id);
  if(!s) return;
  s.active = !(s.active!==false);
  // Presets neu setzen
  const names = getActiveStaffNames();
  S.hygiene.staffPresets = uniq([...(S.hygiene.staffPresets||[]).filter(n=>names.includes(n)), ...names]);
  S.medication.staffPresets = uniq([...(S.medication.staffPresets||[]).filter(n=>names.includes(n)), ...names]);
  saveState();
  renderStaffSettings();
}

function profiEditStaff(id){
  ensureProfiDefaults();
  const s = (S.staff.list||[]).find(x=>x.id===id);
  if(!s) return;
  const newName = prompt('Name ändern (wirkt nur für zukünftige Auswahlen):', s.name||'');
  if(newName==null) return;
  const nn = String(newName).trim();
  if(nn) s.name = nn;
  const newRole = prompt('Rolle (optional):', s.role||'');
  if(newRole!=null) s.role = String(newRole).trim();
  // Presets neu aufbauen
  const names = getActiveStaffNames();
  S.hygiene.staffPresets = uniq([...(S.hygiene.staffPresets||[]), ...names]);
  S.medication.staffPresets = uniq([...(S.medication.staffPresets||[]), ...names]);
  saveState();
  renderStaffSettings();
}

function renderPolicySettings(){
  const el = document.getElementById('policyList');
  if(!el) return;
  ensureProfiDefaults();
  const cur = S.compliance.docs;
  const rows = [
    {k:'hygiene', label:'Hygieneplan'},
    {k:'notfall', label:'Notfallplan'},
    {k:'brand', label:'Brandfall & Evakuierung'},
    {k:'contract', label:'Betreuungsvertrag'}
  ].map(r=>{
    const v = cur[r.k]?.version || '1.0';
    const dt = cur[r.k]?.lastChanged ? escapeHtml(cur[r.k].lastChanged) : '—';
    return `<div class="list-row">
      <div>
        <strong>${escapeHtml(r.label)}</strong>
        <div class="muted" style="margin-top:4px">Version ${escapeHtml(v)} · geändert: ${escapeHtml(dt)}</div>
      </div>
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <button class="smallbtn" onclick="openPolicyDoc('${escapeHtml(r.k)}')">Öffnen</button>
        <button class="smallbtn" onclick="profiBumpPolicy('${escapeHtml(r.k)}')">Neue Version</button>
      </div>
    </div>`;
  }).join('');
  const count = Object.values(S.compliance.docs||{}).reduce((a,d)=>a+((d&&Array.isArray(d.history))?d.history.length:0),0);
  el.innerHTML = rows + `<div class="hint" style="margin-top:10px">Archiv: ${count} Eintrag(e). (Inhalt bleibt in der App unverändert; Versionierung dient dem Nachweis.)</div>`;
}

function bumpVersionStr(v){
  const m = String(v||'1.0').split('.').map(x=>parseInt(x,10));
  const a = Number.isFinite(m[0])?m[0]:1;
  const b = Number.isFinite(m[1])?m[1]:0;
  return `${a}.${b+1}`;
}

function profiBumpPolicy(key){
  ensureProfiDefaults();
  const note = prompt('Änderung kurz beschreiben (für Archiv):','');
  if(note==null) return;
  const doc = S.compliance.docs[key] || {title:key, version:'1.0', lastChanged:toISODateLocal(new Date()), history:[]};
  const toV = bumpVersionStr(doc.version);
  doc.history = Array.isArray(doc.history) ? doc.history : [];
  doc.history.push({fromVersion:doc.version, toVersion:toV, changedAt:toISODateLocal(new Date()), note:String(note||'').trim()});
  doc.version = toV;
  doc.lastChanged = toISODateLocal(new Date());
  S.compliance.docs[key] = doc;
  saveState();
  renderPolicySettings();
  renderComplianceDashboard();
  renderComplianceInSettings();
}

// Öffnen/Bearbeiten der Vorlagen (revisionssicher über Versionssprung)
const POLICY_DEFAULTS = {
  hygiene: `Hygieneplan (Kurzvorlage)\n\n- Reinigungs-/Desinfektionsplan je Bereich\n- Frequenzen (täglich/wöchentlich/monatlich)\n- Mittel & Dosierung\n- Durchführung/Verantwortung\n- Dokumentation im Hygiene-Modul\n\nHinweis: Diese Vorlage kannst du an euren Betrieb anpassen. Änderungen immer über „Neue Version“ dokumentieren.`,
  notfall: `Notfallplan (Kurzvorlage)\n\n- Tierarzt (Adresse/Telefon)\n- Nächste Klinik\n- Verantwortlichkeiten (Raphael / Anschi / Mitarbeitende)\n- Ablauf bei Verletzung/akutem Notfall\n- Transport & Sicherung\n- Dokumentation (Gesundheitsnotizen + ggf. Fotos)`,
  brand: `Brandfall & Evakuierung (Kurzvorlage)\n\n- Sammelplatz & Fluchtwege\n- Prioritäten: Menschen → Hunde → Dokumente\n- Leinen/Boxen bereit\n- Feuerwehr informieren\n- Dokumentation der Evakuierung (Zeit, Anzahl, Beteiligte)`,
  contract: `Betreuungsvertrag (Kurzvorlage)\n\n- Halterdaten\n- Hundedaten\n- Zeitraum & Leistung\n- Notfallregelung & Vollmacht\n- Medikationsfreigabe\n- Unterschriften (Halter / Betrieb)\n\nHinweis: Die vollständige, unterschriebene Version wird pro Aufenthalt im Bereich „Aufenthalte/Betreuungsvertrag“ abgelegt.`
};

function getPolicyContent(key){
  ensureProfiDefaults();
  const doc = S.compliance?.docs?.[key] || {};
  const txt = (doc.content!=null) ? String(doc.content) : (POLICY_DEFAULTS[key] || '');
  return txt;
}

function ensurePolicyModal(){
  if(document.getElementById('policyModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'policyModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;display:none;';
  wrap.innerHTML = `
    <div id="policyModalBackdrop" style="position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);"></div>
    <div style="position:absolute;inset:14px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(20,20,22,.92);box-shadow:0 18px 60px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);flex-wrap:wrap;">
        <div style="font-weight:900;letter-spacing:.2px;max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" id="policyModalTitle">Vorlage</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn" type="button" id="policyModalEdit">✍️ Neue Version & bearbeiten</button>
          <button class="btn" type="button" id="policyModalSave" style="display:none">💾 Speichern</button>
          <button class="btn danger" type="button" id="policyModalClose">✕ Schließen</button>
        </div>
      </div>
      <textarea id="policyModalText" style="flex:1;width:100%;border:0;resize:none;padding:14px;background:rgba(255,255,255,.06);color:var(--text);font:13px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;outline:none;white-space:pre-wrap;overflow-wrap:anywhere;" readonly></textarea>
      <div class="hint" style="margin:10px 12px 12px 12px;">Hinweis: Änderungen bitte immer über „Neue Version & bearbeiten“ – so bleibt alles revisionssicher.</div>
    </div>`;
  document.body.appendChild(wrap);

  const close = ()=>{
    wrap.style.display = 'none';
    document.body.style.overflow = '';
  };
  wrap.querySelector('#policyModalBackdrop').onclick = close;
  wrap.querySelector('#policyModalClose').onclick = close;
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
}

let _policyCurrentKey = null;
function openPolicyDoc(key){
  ensurePolicyModal();
  ensureProfiDefaults();
  _policyCurrentKey = key;
  const doc = S.compliance.docs[key] || {title:key, version:'1.0'};
  const title = `${doc.title || key} · Version ${doc.version || '1.0'}`;
  const wrap = document.getElementById('policyModal');
  const ttl = document.getElementById('policyModalTitle');
  const ta = document.getElementById('policyModalText');
  const btnEdit = document.getElementById('policyModalEdit');
  const btnSave = document.getElementById('policyModalSave');
  if(ttl) ttl.textContent = title;
  if(ta){ ta.value = getPolicyContent(key); ta.readOnly = true; }
  if(btnSave) btnSave.style.display = 'none';
  if(btnEdit) btnEdit.style.display = 'inline-flex';
  if(btnEdit && !btnEdit.dataset.bound){
    btnEdit.dataset.bound = '1';
    btnEdit.onclick = ()=>{
      if(!_policyCurrentKey) return;
      const note = prompt('Änderung kurz beschreiben (für Archiv):','');
      if(note==null) return;
      // Versionssprung + Archiv
      const k = _policyCurrentKey;
      const d = S.compliance.docs[k] || {title:k, version:'1.0', lastChanged:toISODateLocal(new Date()), history:[]};
      const toV = bumpVersionStr(d.version);
      d.history = Array.isArray(d.history) ? d.history : [];
      d.history.push({fromVersion:d.version, toVersion:toV, changedAt:toISODateLocal(new Date()), note:String(note||'').trim()});
      d.version = toV;
      d.lastChanged = toISODateLocal(new Date());
      S.compliance.docs[k] = d;
      // Editor öffnen
      if(ta){ ta.readOnly = false; ta.focus(); }
      if(btnSave) btnSave.style.display = 'inline-flex';
      btnEdit.style.display = 'none';
      if(ttl) ttl.textContent = `${d.title || k} · Version ${d.version}`;
      saveState();
      renderPolicySettings();
      renderComplianceDashboard();
      renderComplianceInSettings();
    };
  }
  const saveBtn = document.getElementById('policyModalSave');
  if(saveBtn && !saveBtn.dataset.bound){
    saveBtn.dataset.bound = '1';
    saveBtn.onclick = ()=>{
      if(!_policyCurrentKey) return;
      const k = _policyCurrentKey;
      const d = S.compliance.docs[k] || {title:k, version:'1.0'};
      d.content = (ta ? String(ta.value||'') : '').trim();
      S.compliance.docs[k] = d;
      saveState();
      if(ta) ta.readOnly = true;
      saveBtn.style.display = 'none';
      const eBtn = document.getElementById('policyModalEdit');
      if(eBtn) eBtn.style.display = 'inline-flex';
      renderPolicySettings();
      alert('Gespeichert (revisionssicher über neue Version).');
    };
  }
  wrap.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function downloadBlob(filename, blob){
  const a=document.createElement('a');
  const url=URL.createObjectURL(blob);
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 400);
}

function exportMonthJson(){
  const today = new Date();
  const ym = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  downloadBlob(`02_MonatsBackup_${ym}.json`, blob);
}

function buildMonthReportHtml(monthISO){
  const ym = monthISO;
  const c = computeCompliance();
  const from = `${ym}-01`;
  const to = `${ym}-31`;
  const hyg = (S.hygiene?.logs||[]).filter(l=>l && l.date>=from && l.date<=to);
  const medRec = (S.medication?.records||[]).filter(r=>r && r.date>=from && r.date<=to);
  const hn = (S.medication?.healthNotes||[]).filter(n=>n && n.date>=from && n.date<=to);
  const stays = (S.docs||[]).filter(d=>d && d.saved && d.meta?.von && d.meta?.von>=from && d.meta?.von<=to);

  const rows = (arr, cols)=> arr.map(x=>`<tr>${cols.map(c=>`<td>${escapeHtml(String((typeof c==='function'?c(x):x[c])??''))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}">—</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Monatsnachweis ${escapeHtml(ym)}</title>
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:24px} h1,h2{margin:0 0 10px} .meta{color:#555;margin:0 0 16px} table{width:100%;border-collapse:collapse;margin:10px 0 18px} th,td{border:1px solid #ddd;padding:8px;font-size:12px} th{background:#f4f4f4;text-align:left} .pill{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #bbb;font-size:12px} .warn{border-color:#d8a000} .danger{border-color:#c00} </style></head><body>
  <h1>Doggy Style – Monatsnachweis ${escapeHtml(ym)}</h1>
  <p class="meta">Erstellt: ${escapeHtml(new Date().toLocaleString('de-DE'))} · Betrieb: ${escapeHtml(COMPANY.name)} · Adresse: ${escapeHtml(COMPANY.street)}, ${escapeHtml(COMPANY.zipCity)}</p>

  <h2>§11‑Ampel (Stand heute)</h2>
  <table><tr><th>Bereich</th><th>Status</th><th>Detail</th></tr>
    ${c.items.map(i=>`<tr><td>${escapeHtml(i.label)}</td><td><span class="pill ${i.pillClass}">${escapeHtml(i.icon)} ${escapeHtml(i.status)}</span></td><td>${escapeHtml(i.detail||'')}</td></tr>`).join('')}
  </table>

  <h2>01_Aufenthalte (Start im Monat)</h2>
  <table><tr><th>Von</th><th>Bis</th><th>Hund</th><th>Betreuung</th></tr>
    ${rows(stays, [x=>x.meta?.von||'', x=>x.meta?.bis||'', x=>(getPet(x.dogId||'')?.name||''), x=>x.meta?.betreuung||''])}
  </table>

  <h2>03_Medikation (Gaben-Protokoll)</h2>
  <table><tr><th>Datum</th><th>Uhrzeit</th><th>Hund</th><th>Medikament</th><th>Status</th><th>Begründung</th><th>Von</th></tr>
    ${rows(medRec, ['date','time', x=>(getPet(x.petId||'')?.name||''), 'medName','status','reason','by'])}
  </table>

  <h2>03_Gesundheit (Notizen)</h2>
  <table><tr><th>Datum</th><th>Hund</th><th>Tags</th><th>Notiz</th><th>Von</th></tr>
    ${rows(hn, ['date', x=>(getPet(x.petId||'')?.name||''), x=>(Array.isArray(x.tags)?x.tags.join(', '):''), 'text','by'])}
  </table>

  <h2>04_Hygiene (Protokoll)</h2>
  <table><tr><th>Datum</th><th>Bereich</th><th>Maßnahme</th><th>Status</th><th>Von</th><th>Notiz</th></tr>
    ${rows(hyg, ['date','area','action','status','by','note'])}
  </table>

  <p class="meta"><strong>Backup‑Hinweis:</strong> Speichere diese PDF und das Monats‑JSON (02_MonatsBackup_...) extern in <em>Dateien/DoggyStyle/Export</em>.</p>
  </body></html>`;
}

function monthClose(){
  ensureProfiDefaults();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const c = computeCompliance();
  S.compliance.monthClosings.push({ym, closedAt:Date.now(), complianceWorst:c.worst});
  saveState();
  const html = buildMonthReportHtml(ym);
  openHtmlInModal(`Monatsnachweis ${ym}`, html, 'Schließen mit ✕. iPad/iPhone → „Drucken/Speichern“ → Teilen → „In Dateien sichern“ (am besten: Dateien/DoggyStyle/Export).');
  const msg = document.getElementById('monthCloseMsg');
  if(msg) msg.textContent = `Monat ${ym} abgeschlossen – Vorschau geöffnet (Drucken/Speichern = PDF).`;
}

function taxExportMonth(){
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const html = buildMonthReportHtml(ym);
  openHtmlInModal(`Monats‑Export ${ym}`, html, 'Tipp: iPad/iPhone → „Drucken/Speichern“ → Teilen → „In Dateien sichern“ → Dateien/DoggyStyle/Export.');
  const msg = document.getElementById('taxExportMsg');
  if(msg) msg.textContent = `PDF‑Report für ${ym} geöffnet (Dateiname‑Tipp: 01–05 in Dateien sortieren).`;
}

function initProfiSettingsBindings(){
  const add = document.getElementById('btnStaffAdd');
  if(add && !add.dataset.bound){ add.dataset.bound='1'; add.onclick = profiAddStaff; }
  const ref = document.getElementById('btnComplianceRefresh');
  if(ref && !ref.dataset.bound){ ref.dataset.bound='1'; ref.onclick = ()=>{ renderComplianceDashboard(); renderComplianceInSettings(); }; }
  const mc = document.getElementById('btnMonthClose');
  if(mc && !mc.dataset.bound){ mc.dataset.bound='1'; mc.onclick = monthClose; }
  const t1 = document.getElementById('btnTaxExportMonth');
  if(t1 && !t1.dataset.bound){ t1.dataset.bound='1'; t1.onclick = taxExportMonth; }
  const t2 = document.getElementById('btnTaxExportJSON');
  if(t2 && !t2.dataset.bound){ t2.dataset.bound='1'; t2.onclick = exportMonthJson; }
}

function ensureStateShape(){
  // Basis-Defaults (ohne UID-Erzeugung, damit es beim ersten Load robust bleibt)
  if(!state || typeof state !== "object") return;
  if(typeof S.schemaVersion !== "number") S.schemaVersion = 1;

  // Profi-Defaults (Mitarbeiter, Versionen, Monatsabschlüsse)
  try{ ensureProfiDefaults(); }catch(_){ }

  S.dogs = Array.isArray(S.dogs) ? S.dogs : [];
  S.docs = Array.isArray(S.docs) ? S.docs : [];

  S.customers = Array.isArray(S.customers) ? S.customers : [];
  S.pets = Array.isArray(S.pets) ? S.pets : [];
  S.stays = Array.isArray(S.stays) ? S.stays : [];
  S.worklogs = Array.isArray(S.worklogs) ? S.worklogs : [];
  S.invoices = Array.isArray(S.invoices) ? S.invoices : [];

  // Hygiene & Reinigung
  if(!S.hygiene || typeof S.hygiene !== "object") S.hygiene = {};
  S.hygiene.logs = Array.isArray(S.hygiene.logs) ? S.hygiene.logs : [];
  S.hygiene.weeklyTasks = Array.isArray(S.hygiene.weeklyTasks) ? S.hygiene.weeklyTasks : [];
  S.hygiene.staffPresets = Array.isArray(S.hygiene.staffPresets) ? S.hygiene.staffPresets : ["Raphael","Anschi"];
  // Sync Presets mit Mitarbeiterliste (Raphael/Anschi + weitere)
  try{ S.hygiene.staffPresets = uniq([...(S.hygiene.staffPresets||[]), ...getActiveStaffNames()]); }catch(_){ }
  // UI preferences
  if(!S.hygiene.ui || typeof S.hygiene.ui !== "object") S.hygiene.ui = {};
  if(typeof S.hygiene.ui.pendingOnly !== "boolean") S.hygiene.ui.pendingOnly = false;
  // Restore filter preference from localStorage (optional)
  try{
    const v = localStorage.getItem('dstest_hyg_pendingOnly');
    if(v === 'true') S.hygiene.ui.pendingOnly = true;
    if(v === 'false') S.hygiene.ui.pendingOnly = false;
  }catch(e){}



  // Default Wochenaufgaben (nur einmal anlegen)
  if(S.hygiene.weeklyTasks.length === 0){
    S.hygiene.weeklyTasks = [
      { id: "wk_outdoor_disinfect", title: "Desinfektion Außenbereich", intervalDays: 7, lastDone: null },
      { id: "wk_runs_deepclean", title: "Grundreinigung Ausläufe", intervalDays: 7, lastDone: null },
      { id: "wk_toilet_areas", title: "Desinfektion Toilettenbereiche", intervalDays: 7, lastDone: null },
      { id: "wk_quarantine_zone", title: "Kontrolle/Reinigung Quarantänezone", intervalDays: 7, lastDone: null }
    ];
  }

  // Medikamente & Gesundheit
  if(!S.medication || typeof S.medication !== "object") S.medication = {};
  S.medication.plans = Array.isArray(S.medication.plans) ? S.medication.plans : [];
  S.medication.records = Array.isArray(S.medication.records) ? S.medication.records : [];
  S.medication.healthNotes = Array.isArray(S.medication.healthNotes) ? S.medication.healthNotes : [];
  S.medication.staffPresets = Array.isArray(S.medication.staffPresets) ? S.medication.staffPresets : ["Raphael","Anschi"];

  // Presets mit aktuiver Mitarbeiterliste synchronisieren (Raphael/Anschi fest, weitere aus Einstellungen)
  try{
    const names = getActiveStaffNames();
    S.hygiene.staffPresets = uniq([...(S.hygiene.staffPresets||[]), ...names]);
    S.medication.staffPresets = uniq([...(S.medication.staffPresets||[]), ...names]);
  }catch(_){ }
  try{ S.medication.staffPresets = uniq([...(S.medication.staffPresets||[]), ...getActiveStaffNames()]); }catch(_){ }
  if(!S.medication.ui || typeof S.medication.ui !== "object") S.medication.ui = {};
  if(typeof S.medication.ui.pendingOnly !== "boolean") S.medication.ui.pendingOnly = false;
  if(typeof S.medication.ui.selectedPetId !== "string") S.medication.ui.selectedPetId = "";
  try{
    const v = localStorage.getItem('dstest_med_pendingOnly');
    if(v === 'true') S.medication.ui.pendingOnly = true;
    if(v === 'false') S.medication.ui.pendingOnly = false;
  }catch(e){}

  
  // Mitarbeiter (global) – Voreinstellung: Raphael & Anschi
  if(!S.staff || typeof S.staff !== "object") S.staff = {};
  S.staff.people = Array.isArray(S.staff.people) ? S.staff.people : [];
  if(!Array.isArray(S.staff.presets)) S.staff.presets = ["Raphael","Anschi"];
  // Ensure presets always included as active people
  const ensurePerson = (name)=>{
    if(!name) return;
    const exists = S.staff.people.find(p=>p && p.name===name);
    if(!exists) S.staff.people.push({ id: uid("stf"), name, active: true, createdAt: Date.now() });
    else if(exists && typeof exists.active !== "boolean") exists.active = true;
  };
  S.staff.presets.forEach(ensurePerson);
  // Backward-compat: keep hygiene/medication presets in sync
  if(!S.hygiene.staffPresets || !Array.isArray(S.hygiene.staffPresets)) S.hygiene.staffPresets = ["Raphael","Anschi"];
  if(!S.medication.staffPresets || !Array.isArray(S.medication.staffPresets)) S.medication.staffPresets = ["Raphael","Anschi"];
  // Merge unique presets
  const mergedPresets = Array.from(new Set([...(S.staff.presets||[]), ...(S.hygiene.staffPresets||[]), ...(S.medication.staffPresets||[])]));
  S.staff.presets = mergedPresets;
  S.hygiene.staffPresets = mergedPresets;
  S.medication.staffPresets = mergedPresets;

  // Compliance / Versionierung
  if(!S.compliance || typeof S.compliance !== "object") S.compliance = {};
  if(!S.compliance.docs || typeof S.compliance.docs !== "object") S.compliance.docs = {};
  const _nowISO = toISODateLocal(new Date());
  const ensureDoc = (key, title)=>{
    if(!S.compliance.docs[key] || typeof S.compliance.docs[key] !== "object"){
      S.compliance.docs[key] = { title, version: "1.0", lastChanged: _nowISO, history: [] };
    }else{
      if(!S.compliance.docs[key].title) S.compliance.docs[key].title = title;
      if(!S.compliance.docs[key].version) S.compliance.docs[key].version = "1.0";
      if(!S.compliance.docs[key].lastChanged) S.compliance.docs[key].lastChanged = _nowISO;
      if(!Array.isArray(S.compliance.docs[key].history)) S.compliance.docs[key].history = [];
    }
  };
  ensureDoc("hygiene", "Hygieneplan");
  ensureDoc("brand", "Brandfall- & Evakuierungskonzept");
  ensureDoc("notfall", "Notfallplan");
  ensureDoc("contract", "Betreuungsvertrag");
  S.compliance.monthClosings = Array.isArray(S.compliance.monthClosings) ? S.compliance.monthClosings : [];

S._legacy = (S._legacy && typeof S._legacy === "object") ? S._legacy : {};
  S._legacy.dogIdToCustomerId = (S._legacy.dogIdToCustomerId && typeof S._legacy.dogIdToCustomerId === "object") ? S._legacy.dogIdToCustomerId : {};
  S._legacy.dogIdToPetId = (S._legacy.dogIdToPetId && typeof S._legacy.dogIdToPetId === "object") ? S._legacy.dogIdToPetId : {};
  S._legacy.docIdToStayId = (S._legacy.docIdToStayId && typeof S._legacy.docIdToStayId === "object") ? S._legacy.docIdToStayId : {};
  S._legacy.docIdToInvoiceId = (S._legacy.docIdToInvoiceId && typeof S._legacy.docIdToInvoiceId === "object") ? S._legacy.docIdToInvoiceId : {};

  // Vertrag
  S.contract = (S.contract && typeof S.contract === "object") ? S.contract : null;
  S.contractSignatures = Array.isArray(S.contractSignatures) ? S.contractSignatures : [];

  // Rechnungsnummer beibehalten
  if(typeof S.nextInvoiceNumber !== "number"){
    S.nextInvoiceNumber = 1;
  }
  // Kapazitäten (dynamisch nach Zeitraum, rückwirkend) – Standard + Ausnahmen
  if(!S.capacities || typeof S.capacities !== "object"){
    S.capacities = {
      default: { Tagesbetreuung: CAPACITY.Tagesbetreuung, Urlaubsbetreuung: CAPACITY.Urlaubsbetreuung },
      exceptions: []
    };
  } else {
    if(!S.capacities.default || typeof S.capacities.default !== "object"){
      S.capacities.default = { Tagesbetreuung: CAPACITY.Tagesbetreuung, Urlaubsbetreuung: CAPACITY.Urlaubsbetreuung };
    }
    if(!Array.isArray(S.capacities.exceptions)) S.capacities.exceptions = [];
    if(typeof S.capacities.default.Tagesbetreuung !== "number") S.capacities.default.Tagesbetreuung = CAPACITY.Tagesbetreuung;
    if(typeof S.capacities.default.Urlaubsbetreuung !== "number") S.capacities.default.Urlaubsbetreuung = CAPACITY.Urlaubsbetreuung;
  }
}


function ensureContractDefaults(){
  if(!S.contract || typeof S.contract !== "object"){
    S.contract = {
      title: "Betreuungsvertrag für Hunde",
      provider: "Doggy Style Hundepension",
      version: "v1.0",
      validFrom: "2025-12-27",
      text: DEFAULT_CONTRACT_TEXT,
      updatedAt: new Date().toISOString()
    };
  }
  if(!Array.isArray(S.contractSignatures)) S.contractSignatures = [];
}

// Vertragstext (v1.0) – App-geeignet (ohne Beträge)
const DEFAULT_CONTRACT_TEXT = `
<h4>1. Vertragsgegenstand</h4>
<p>Der Betreiber übernimmt die zeitweise Betreuung des vom Hundehalter angegebenen Hundes im Rahmen einer Tages- oder Urlaubsbetreuung. Die Betreuung erfolgt nach bestem Wissen und Gewissen sowie unter Beachtung des Tierschutzes und der betrieblichen Abläufe.</p>

<h4>2. Pflichten des Hundehalters</h4>
<ul>
  <li>Der Hund ist gesund; es liegen keine ansteckenden Krankheiten vor.</li>
  <li>Der Impfstatus ist altersgerecht und aktuell.</li>
  <li>Bekannte Verhaltensauffälligkeiten, gesundheitliche Besonderheiten oder Medikamentengaben wurden vollständig und wahrheitsgemäß angegeben.</li>
  <li>Der Hund ist haftpflichtversichert.</li>
</ul>
<p>Falschangaben können zum sofortigen Abbruch der Betreuung führen.</p>

<h4>3. Gesundheitszustand &amp; Verantwortung</h4>
<p>Der Betreiber ist berechtigt, den Hund bei Auffälligkeiten von der Betreuung auszuschließen oder den Halter zur Abholung aufzufordern. Der Betreiber entscheidet im Sinne des Tierschutzes und der Sicherheit aller Hunde.</p>

<h4>4. Haftung &amp; Haftungsausschluss</h4>
<p>Die Betreuung erfolgt auf eigenes Risiko des Hundehalters. Der Betreiber haftet nicht für Verletzungen oder Erkrankungen, die durch typisches Hundeverhalten (z. B. Rangordnung, Spiel, Stress) entstehen, für Schäden durch andere betreute Hunde sowie für Verlust/Beschädigung persönlicher Gegenstände. Eine Haftung besteht nur bei Vorsatz oder grober Fahrlässigkeit.</p>

<h4>5. Läufige Hündinnen</h4>
<p><strong>5.1 Grundsatz:</strong> Läufige Hündinnen werden grundsätzlich nicht betreut.</p>
<p><strong>5.2 Beginn während des Aufenthalts:</strong> Beginnt eine Hündin während des Aufenthalts läufig zu werden, ist der Hundehalter verpflichtet, die Hündin unverzüglich abzuholen, oder der Betreiber entscheidet im Einzelfall über das weitere Vorgehen.</p>
<p><strong>5.3 Einzelfallentscheidung:</strong> In Ausnahmefällen kann die Betreuung nach ausdrücklicher Einzelfallentscheidung des Betreibers fortgeführt werden. Dabei kann zusätzlicher Betreuungsaufwand entstehen, ein Aufpreis erhoben werden oder der Aufenthalt vorzeitig beendet werden. Ein Anspruch des Hundehalters auf Fortführung besteht nicht.</p>
<p><strong>5.4 Haftung:</strong> Der Betreiber übernimmt keine Haftung für Stress-/Verhaltensreaktionen anderer Hunde oder betriebsbedingte Einschränkungen im Zusammenhang mit der Läufigkeit.</p>
<p><strong>5.5 Falschangaben:</strong> Wird Läufigkeit verschwiegen oder falsch angegeben, behält sich der Betreiber vor, den Aufenthalt sofort abzubrechen, zusätzliche Kosten geltend zu machen und zukünftige Betreuungen abzulehnen.</p>

<h4>6. Tierarzt &amp; Notfall</h4>
<p>Der Betreiber ist berechtigt, bei akuten gesundheitlichen Problemen einen Tierarzt aufzusuchen. Die entstehenden Kosten trägt der Hundehalter. Der Betreiber bemüht sich, den Hundehalter vorab zu informieren, sofern dies möglich ist.</p>

<h4>7. Ausschluss von der Betreuung</h4>
<p>Der Betreiber kann die Betreuung jederzeit beenden, wenn eine Gefahr für andere Hunde oder Menschen besteht, der Hund erheblich gestresst ist, falsche Angaben gemacht wurden oder betriebliche/tierschutzrechtliche Gründe dies erfordern.</p>

<h4>8. Datenschutz</h4>
<p>Personen- und tierbezogene Daten werden ausschließlich zur Vertragsabwicklung und gemäß den geltenden Datenschutzbestimmungen verarbeitet. Es gilt die Datenschutzerklärung des Betreibers.</p>

<h4>9. Schlussbestimmungen</h4>
<p>Änderungen oder Ergänzungen dieses Vertrags bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Regelungen unberührt.</p>

<h4>10. Digitale Zustimmung</h4>
<p>Mit der digitalen Unterschrift bestätigt der Hundehalter, den Vertrag vollständig gelesen zu haben, den Inhalt zu akzeptieren und die Angaben wahrheitsgemäß gemacht zu haben. Ort/Datum wird automatisch erfasst.</p>
`;

function migrateToV2(){
  // Migration ist bewusst "additiv": wir verlieren NICHTS aus S.dogs/S.docs,
  // sondern spiegeln alles zusätzlich sauber in customers/pets/stays/invoices.
  if(S.schemaVersion >= 2) return;

  ensureStateShape();
  ensureContractDefaults();

  const dogIdToCustomerId = {};
  const dogIdToPetId = {};
  const docIdToStayId = {};
  const docIdToInvoiceId = {};

  // --- 1) dogs[] -> customers[] + pets[] ---
  const customerIndex = new Map(); // key -> customerId
  const customers = [];
  const pets = [];

  (S.dogs||[]).forEach(d=>{
    if(!d || d.isPlaceholder) return;

    const owner = String(d.owner||"").trim();
    const phone = String(d.phone||"").trim();
    const dogName = String(d.name||"").trim();

    // Key: (owner + phone) – falls owner fehlt, trotzdem stabil
    const key = (owner.toLowerCase()+"|"+phone.toLowerCase()).trim();

    let customerId = customerIndex.get(key);
    if(!customerId){
      customerId = "c_"+uid();
      customerIndex.set(key, customerId);
      customers.push({
        id: customerId,
        name: owner || "(ohne Name)",
        street: "",
        zip: "",
        city: "",
        phone: phone,
        email: "",
        note: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const petId = "p_"+uid();
    pets.push({
      id: petId,
      customerId,
      name: dogName || "(ohne Name)",
      breed: "",
      birthdate: "",
      chip: false,
      chipNumber: "",
      vet: "",
      emergencyContact: "",
      note: d.note || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    dogIdToCustomerId[d.id] = customerId;
    dogIdToPetId[d.id] = petId;
  });

  // --- 2) docs[] -> stays[] + invoices[] (Spiegelung) ---
  const stays = [];
  const invoices = [];

  (S.docs||[]).forEach(doc=>{
    if(!doc || !doc.id) return;

    if(doc.type === "invoice"){
      const invId = "i_"+doc.id; // stabil/ableitbar
      docIdToInvoiceId[doc.id] = invId;

      invoices.push({
        id: invId,
        customerId: dogIdToCustomerId[doc.dogId] || "",
        petId: dogIdToPetId[doc.dogId] || "",
        stayId: "", // später: Aufenthalt-ID, wenn Rechnung eindeutig aus Aufenthalt erzeugt wird
        sourceDocId: doc.sourceDocId || "",
        invoiceNumber: doc.invoiceNumber || "",
        invoiceDate: doc.invoiceDate || "",
        period: doc.period || { from:"", to:"" },
        items: doc.items || null, // falls später vorhanden
        pricing: doc.pricing || null, // kompatibel mit Bestand
        total: doc.total || doc.amount || null,
        status: doc.status || doc.paymentStatus || "offen",
        createdAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt || new Date().toISOString()
      });

      return;
    }

    // normale Template-Dokumente (z.B. Hundeannahme)
    if(doc.templateId){
      const stayId = "s_"+doc.id;
      docIdToStayId[doc.id] = stayId;

      stays.push({
        id: stayId,
        petId: dogIdToPetId[doc.dogId] || "",
        customerId: dogIdToCustomerId[doc.dogId] || "",
        type: (doc.meta && doc.meta.betreuung) ? String(doc.meta.betreuung).toLowerCase() : "",
        from: doc.meta?.von || "",
        to: doc.meta?.bis || "",
        fields: doc.fields || {},
        meta: doc.meta || {},
        signature: doc.signature || null,
        status: doc.saved ? "closed" : "open",
        docId: doc.id, // Rückverweis
        createdAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt || new Date().toISOString()
      });
    }
  });

  // Nur setzen, wenn wir tatsächlich etwas erzeugt haben – sonst nichts überschreiben.
  if(customers.length) S.customers = customers;
  if(pets.length) S.pets = pets;
  if(stays.length) S.stays = stays;
  if(invoices.length) S.invoices = invoices;

  S._legacy.dogIdToCustomerId = dogIdToCustomerId;
  S._legacy.dogIdToPetId = dogIdToPetId;
  S._legacy.docIdToStayId = docIdToStayId;
  S._legacy.docIdToInvoiceId = docIdToInvoiceId;

  S.schemaVersion = 2;
  saveState();
}


function pruneInvoiceDocs(){
  // Variante A: Rechnungen gehören ausschließlich in S.invoices (Rechnungs-Tab),
  // nicht in S.docs (Aufenthalte). Damit bleibt "Aufenthalte" übersichtlich.
  if(!Array.isArray(S.docs)) S.docs = [];
  const invDocs = S.docs.filter(d=>d && d.type==="invoice");
  if(invDocs.length){
    S.worklogs = Array.isArray(S.worklogs) ? S.worklogs : [];
  S.invoices = Array.isArray(S.invoices) ? S.invoices : [];
    invDocs.forEach(inv=>{
      if(!S.invoices.some(x=>x.id===inv.id)){
        S.invoices.push(inv);
      }
    });
    S.docs = S.docs.filter(d=>!(d && d.type==="invoice"));
  }
}
// ===== ETAPPE 2 Helpers (Customer/Pet Editor) =====
const cpEdit = { mode: "new", petId: "" };

function getCustomer(id){
  return (S.customers||[]).find(c=>c.id===id) || null;
}
function getPet(id){
  return (S.pets||[]).find(p=>p.id===id) || null;
}

function setCustomerFieldsDisabled(disabled){
  ["c_name","c_phone","c_email","c_street","c_zip","c_city","c_em_name","c_em_phone","c_pickup_auth","c_note"].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.disabled=!!disabled;
  });
}

function refreshCustomerSelect(){
  const sel = document.getElementById("customerSelect");
  if(!sel) return;
  const customers = (S.customers||[]).slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de"));
  sel.innerHTML = customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name||"Kunde")}${c.phone?(" · "+escapeHtml(c.phone)):""}</option>`).join("");
}

function clearCpEditor(){
  ["c_name","c_phone","c_email","c_street","c_zip","c_city","c_em_name","c_em_phone","c_pickup_auth","c_note","p_name","p_breed","p_chipNumber","p_vet","p_vetPhone","p_food","p_feeding","p_compat","p_note","p_allergies","p_meds","p_behavior"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value="";
  });
  const bd=document.getElementById("p_birthdate"); if(bd) bd.value="";
  const cs=document.getElementById("p_chipStatus"); if(cs) cs.value="";
  const use=document.getElementById("useExistingCustomer"); if(use) use.checked=false;
  const hint=document.getElementById("cpHint"); if(hint) hint.textContent="";
  setCustomerFieldsDisabled(false);
}

function fillCpEditorForPet(pet){
  const c = getCustomer(pet.customerId);
  if(c){
    $("#c_name").value = c.name||"";
    $("#c_phone").value = c.phone||"";
    $("#c_email").value = c.email||"";
    $("#c_street").value = c.street||"";
    $("#c_zip").value = c.zip||"";
    $("#c_city").value = c.city||"";
    $("#c_em_name").value = c.emergencyName||"";
    $("#c_em_phone").value = c.emergencyPhone||"";
    $("#c_pickup_auth").value = c.pickupAuth||"";
    $("#c_note").value = c.note||"";
  }
  $("#p_name").value = pet.name||"";
  $("#p_breed").value = pet.breed||"";
  $("#p_birthdate").value = pet.birthdate||"";
  const cs=document.getElementById("p_chipStatus");
  if(cs) cs.value = pet.chip ? "yes" : "no";
  $("#p_chipNumber").value = pet.chipNumber||"";
  $("#p_vet").value = pet.vet||"";
  $("#p_vetPhone").value = pet.vetPhone||"";
  $("#p_allergies").value = pet.allergies||"";
  $("#p_meds").value = pet.meds||"";
  $("#p_food").value = pet.food||"";
  $("#p_feeding").value = pet.feeding||"";
  $("#p_compat").value = pet.compat||"";
  $("#p_behavior").value = pet.behavior||"";
  $("#p_note").value = pet.note||"";
}

function openCpEditor(mode, petId){
  ensureStateShape();
  ensureContractDefaults();
  cpEdit.mode = mode || "new";
  cpEdit.petId = petId || "";

  const box = document.getElementById("cpEditor");
  if(box) box.style.display="block";
  const title = document.getElementById("cpEditorTitle");
  if(title) title.textContent = (mode==="edit") ? "Kunde & Hund bearbeiten" : "Kunde & Hund anlegen";

  refreshCustomerSelect();
  clearCpEditor();

  // Toggle handler
  const use = document.getElementById("useExistingCustomer");
  if(use){
    use.onchange = ()=>{
      const useExisting = use.checked;
      setCustomerFieldsDisabled(useExisting);
    };
  }

  if(mode==="edit" && petId){
    const pet = getPet(petId);
    if(pet){
      // Bei Edit: bestehenden Kunden nutzen + auswählen
      const useExisting = document.getElementById("useExistingCustomer");
      if(useExisting) useExisting.checked = true;
      refreshCustomerSelect();
      const sel = document.getElementById("customerSelect");
      if(sel) sel.value = pet.customerId || "";
      setCustomerFieldsDisabled(false); // beim Edit darfst du den Kunden auch korrigieren
      fillCpEditorForPet(pet);
    }
  } else {
    // New: wenn Kunden vorhanden, Auswahl anbieten, aber standardmäßig aus
    setCustomerFieldsDisabled(false);
  }

  const list = document.getElementById("dogList");
  if(list) list.scrollIntoView({behavior:"smooth", block:"start"});
}

function closeCpEditor(){
  const box = document.getElementById("cpEditor");
  if(box) box.style.display="none";
  clearCpEditor();
}

function upsertLegacyDogForPet(pet, customer){
  ensureDefaultDog();
  if(!pet) return;

  // 1) Existierendes Legacy-Dog finden (Mapping)
  let dogId = null;
  const map = S._legacy?.dogIdToPetId || {};
  for(const did of Object.keys(map)){
    if(map[did] === pet.id){ dogId = did; break; }
  }

  // 2) Falls nicht vorhanden: neu anlegen
  if(!dogId){
    dogId = "d_"+uid();
    S.dogs.push({ id: dogId, name: pet.name||"", owner: customer?.name||"", phone: customer?.phone||"", note: pet.note||"" });
  }

  // 3) Update Legacy-Dog
  const d = (S.dogs||[]).find(x=>x.id===dogId);
  if(d){
    d.name = pet.name || d.name;
    d.owner = (customer?.name ?? d.owner) || "";
    d.phone = (customer?.phone ?? d.phone) || "";
    d.note = pet.note || d.note || "";
  }

  // 4) Mapping aktualisieren
  S._legacy = S._legacy || {};
  S._legacy.dogIdToPetId = S._legacy.dogIdToPetId || {};
  S._legacy.dogIdToCustomerId = S._legacy.dogIdToCustomerId || {};
  S._legacy.dogIdToPetId[dogId] = pet.id;
  S._legacy.dogIdToCustomerId[dogId] = pet.customerId;

  return dogId;
}

// ===== ETAPPE 3 Helpers: Hund auswählen -> Halter automatisch =====
function getPetByDogId(dogId){
  ensureStateShape();
  ensureContractDefaults();
  const pid = S._legacy?.dogIdToPetId?.[dogId] || "";
  return pid ? getPet(pid) : null;
}
function getCustomerByDogId(dogId){
  ensureStateShape();
  ensureContractDefaults();
  const cid = S._legacy?.dogIdToCustomerId?.[dogId] || "";
  return cid ? getCustomer(cid) : null;
}
function getLegacyDogIdForPet(petId){
  ensureStateShape();
  ensureContractDefaults();
  const map = S._legacy?.dogIdToPetId || {};
  for(const did of Object.keys(map)){
    if(map[did] === petId) return did;
  }
  return "";
}
function ensureDocLinks(doc){
  if(!doc) return;
  ensureStateShape();
  ensureContractDefaults();
  // Falls noch alte docs ohne petId/customerId existieren: aus dogId ableiten
  if(!doc.petId && doc.dogId) doc.petId = S._legacy?.dogIdToPetId?.[doc.dogId] || "";
  if(!doc.customerId && doc.dogId) doc.customerId = S._legacy?.dogIdToCustomerId?.[doc.dogId] || "";
}
function updateDocCustomerPetFromDogId(doc){
  if(!doc || !doc.dogId) return;
  // Immer konsistent halten: dogId -> (customerId, petId)
  const dogId = doc.dogId;
  const pet = getPetByDogId(dogId);
  const cust = getCustomerByDogId(dogId);
  if(pet) doc.petId = pet.id;
  if(cust) doc.customerId = cust.id;
  // Fallback auf legacy mapping
  if(!doc.petId) doc.petId = S._legacy?.dogIdToPetId?.[dogId] || doc.petId || "";
  if(!doc.customerId) doc.customerId = S._legacy?.dogIdToCustomerId?.[dogId] || doc.customerId || "";
}

function renderCustomerInfoForDogId(dogId){
  const box = document.getElementById("customerInfo");
  if(!box) return;
  const pet = getPetByDogId(dogId);
  const cust = getCustomerByDogId(dogId);
  if(!pet && !cust){ box.textContent = ""; return; }

  const parts = [];
  if(cust){
    const addr = [cust.street, [cust.zip, cust.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    parts.push(`${cust.name||""}${cust.phone?" · "+cust.phone:""}${cust.email?" · "+cust.email:""}`.trim());
    if(addr) parts.push(addr);
  }
  if(pet){
    const chip = pet.chip ? (`Chip: ${pet.chipNumber||"ja"}`) : "kein Chip";
    const breed = pet.breed ? ` · ${pet.breed}` : "";
    parts.push(`${pet.name||"Hund"}${breed} · ${chip}`);
  }
  box.textContent = parts.filter(Boolean).join(" | ");
}


function autofillHundeannahmeFieldsFromMaster(dogId, { overwrite = false } = {}){
  if(!currentDoc) return;
  const t = getTemplate(currentDoc.templateId);
  if(!t) return;

  // Nur für Templates, die diese Keys haben (Hundeannahme)
  const wants = new Set(["halter_name","halter_adresse","halter_telefon","halter_email","halter_notfall","hund_name","hund_rasse","hund_geburt","hund_chip"]);
  const hasAny = Array.isArray(t.sections) && t.sections.some(sec => (sec.fields||[]).some(f => wants.has(f.key)));
  if(!hasAny) return;

  const pet = getPetByDogId(dogId);
  const cust = getCustomerByDogId(dogId);

  // Mapping: Stamm -> Formular
  const addr = cust ? [cust.street||"", [cust.zip, cust.city].filter(Boolean).join(" ")].filter(Boolean).join("\n") : "";
  const map = {
    halter_name: cust?.name || "",
    halter_adresse: addr,
    halter_telefon: cust?.phone || "",
    halter_email: cust?.email || "",
    halter_notfall: (cust ? [cust.emergencyName, cust.emergencyPhone].filter(Boolean).join(" · ") : "") || (pet?.emergencyContact || ""),
    hund_name: pet?.name || "",
    hund_rasse: pet?.breed || "",
    hund_geburt: pet?.birthdate || "",
    hund_chip: pet?.chipNumber || ""
  };

  // Smart-Overwrite:
  // Wenn vorher schon automatisch befüllt wurde und der Hund gewechselt wird,
  // überschreiben wir NUR die Felder, die noch exakt den alten Auto-Wert haben.
  const autoMeta = currentDoc.meta || (currentDoc.meta = {});
  const prevAutoDogId = autoMeta._autoDogId || "";
  let prevAutoMap = null;
  if(!overwrite && prevAutoDogId && prevAutoDogId !== dogId){
    try { prevAutoMap = JSON.parse(autoMeta._autoSnapshot || "null"); } catch(e){ prevAutoMap = null; }
  }

  let touched = false;

  Object.entries(map).forEach(([key, val]) => {
    const inp = document.querySelector(`#formRoot [data-key="${key}"]`);
    if(!inp) return;

    if(!overwrite){
      // Wenn wir einen Hund-Wechsel haben: nur überschreiben, wenn Feld noch alter Auto-Wert ist
      if(prevAutoMap && Object.prototype.hasOwnProperty.call(prevAutoMap, key)){
        const cur = (inp.dataset.ftype==="checkbox") ? String(!!inp.checked) : String(inp.value||"");
        const old = (inp.dataset.ftype==="checkbox") ? String(!!prevAutoMap[key]) : String(prevAutoMap[key] ?? "");
        if(cur !== old){
          return; // Nutzer hat manuell geändert -> nicht überschreiben
        }
      } else {
        // sonst: nur befüllen, wenn leer
        const isEmpty = (inp.dataset.ftype==="checkbox") ? (!inp.checked) : (String(inp.value||"").trim()==="");
        if(!isEmpty) return;
      }
    }

    if(inp.dataset.ftype==="checkbox"){
      inp.checked = !!val;
    } else {
      inp.value = val;
    }
    touched = true;
  });

  // Auto-Snapshot merken, damit Hundwechsel sauber funktioniert
  autoMeta._autoDogId = dogId || "";
  try { autoMeta._autoSnapshot = JSON.stringify(map); } catch(e){}

  if(touched) dirty = true;
}


// ===== Ende Etappe 1 =====
function escapeHtml(s){return String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function overlaps(aFrom, aTo, bFrom, bTo){
  return !(aTo < bFrom || aFrom > bTo);
}

function countOccupancy(type, from, to, excludeDocId){
  return S.docs.filter(d=>{
    if(!d.saved) return false;
    if(d.id === excludeDocId) return false;
    if(d.meta?.betreuung !== type) return false;
    if(!d.meta?.von || !d.meta?.bis) return false;

    return overlaps(d.meta.von, d.meta.bis, from, to);
  }).length;
}
function getNextDays(n){
  const days = [];
  const d = new Date();

  for(let i = 0; i < n; i++){
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    days.push(toISODateLocal(x));
  }

  return days;
}
function countForDay(type, day){
  return S.docs.filter(d=>{
    if(!d.saved) return false;
    if(d.meta?.betreuung !== type) return false;
    if(!d.meta?.von || !d.meta?.bis) return false;

    return day >= d.meta.von && day <= d.meta.bis;
  }).length;
}
function countToday(type){
  const today = toISODateLocal(new Date());
  return countForDay(type, today);
}
function renderTodayStatus(){
  const el = document.getElementById("todayStatus");
  if(!el) return;

  const u = countToday("Urlaubsbetreuung");
  const t = countToday("Tagesbetreuung");

  el.innerHTML = `
    <div class="status-cards">
      <div class="status-card">
        <strong>Urlaubsbetreuung</strong><br>
        ${u} / ${getCapacity("Urlaubsbetreuung", today)} Hunde
      </div>
      <div class="status-card">
        <strong>Tagesbetreuung</strong><br>
        ${t} / ${getCapacity("Tagesbetreuung", today)} Hunde
      </div>
    </div>
  `;
}
function renderOccupancy(){
  const el = document.getElementById("occupancy");
  if(!el) return;

  const days = getNextDays(14);

  el.innerHTML = `
    <table class="occ-table">
      <thead>
        <tr>
          <th>Datum</th>
          <th>Urlaubsbetreuung</th>
          <th>Tagesbetreuung</th>
        </tr>
      </thead>
      <tbody>
        ${days.map(day=>{
          const u = countForDay("Urlaubsbetreuung", day);
          const t = countForDay("Tagesbetreuung", day);
          return `
            <tr>
              <td>${formatDateDE(day)}</td>
              <td>${u} / ${getCapacity("Urlaubsbetreuung", day)}</td>
              <td>${t} / ${getCapacity("Tagesbetreuung", day)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}
function getInvoices(){
  ensureStateShape();
  ensureContractDefaults();
  return (S.invoices||[]).slice().sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""));
}

function getInvoiceById(id){
  ensureStateShape();
  ensureContractDefaults();
  return (S.invoices||[]).find(x=>x.id===id) || null;
}

function resolveInvoiceParties(inv){
  ensureStateShape();
  ensureContractDefaults();
  const cust = inv?.customerId ? getCustomer(inv.customerId) : (inv?.dogId ? getCustomerByDogId(inv.dogId) : null);
  const pet  = inv?.petId ? getPet(inv.petId) : (inv?.dogId ? getPetByDogId(inv.dogId) : null);
  const legacyDog = inv?.dogId ? (S.dogs||[]).find(d=>d.id===inv.dogId) : null;
  return { cust, pet, legacyDog };
}

function formatCustomerLine(cust, legacyDog){
  const name = cust?.name || legacyDog?.owner || "";
  const phone = cust?.phone || legacyDog?.phone || "";
  const email = cust?.email || "";
  const parts = [name, phone, email].filter(Boolean);
  return parts.join(" · ");
}
function formatCustomerAddressBlock(cust){
  if(!cust) return "";
  const l1 = cust.name || "";
  const l2 = cust.street || "";
  const l3 = [cust.zip, cust.city].filter(Boolean).join(" ");
  return [l1,l2,l3].filter(Boolean).map(escapeHtml).join("<br>");
}
function renderInvoiceList(){
  const el = document.getElementById("invoiceList");
  if(!el) return;

  const invoices = getInvoices();

  const actionBar = `
    <div class="row" style="gap:10px;flex-wrap:wrap;margin:10px 0 14px">
      <button class="btn" onclick="openFreeInvoiceForm()">➕ Freie Rechnung</button>
    </div>
  `;

  if(!invoices.length){
    el.innerHTML = actionBar + "<p class='muted'>Noch keine Rechnungen vorhanden.</p>";
    const view = document.getElementById("invoiceView");
    if(view) view.innerHTML = "";
    return;
  }

  el.innerHTML = actionBar + `
    <table class="invoice-table">
      <thead>
        <tr>
          <th>Nr.</th>
          <th>Kunde / Hund</th>
          <th>Zeitraum</th>
          <th>Betrag</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${invoices.map(inv=>`
          <tr onclick="openInvoice('${inv.id}')">
            <td>${inv.invoiceNumber || "-"}</td>
            <td>${escapeHtml((resolveInvoiceParties(inv).cust?.name || resolveInvoiceParties(inv).legacyDog?.owner || "—"))} · ${escapeHtml((resolveInvoiceParties(inv).pet?.name || resolveInvoiceParties(inv).legacyDog?.name || "—"))}</td>
            <td>${escapeHtml(inv.period?.from||"")} – ${escapeHtml(inv.period?.to||"")}</td>
            <td>${(inv.pricing?.total||0).toFixed(2)} €</td>
            <td>${escapeHtml(inv.status||"")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
function openInvoice(id){
  const inv = getInvoiceById(id);
  if(!inv) return;

  const el = document.getElementById("invoiceView");
  if(!el) return;

  const {cust, pet, legacyDog} = resolveInvoiceParties(inv);
  const custLine = escapeHtml(formatCustomerLine(cust, legacyDog) || "—");
  const petLine = escapeHtml(pet?.name || (legacyDog?.name||"—"));

  el.innerHTML = `
    <div class="card">
      <div class="row between" style="gap:10px;flex-wrap:wrap">
        <h3 style="margin:0">Rechnung</h3>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="smallbtn" onclick="setInvoiceStatus('${inv.id}','open')">Offen</button>
          <button class="smallbtn" onclick="setInvoiceStatus('${inv.id}','paid')">Bezahlt</button>
          <button class="smallbtn" onclick="setInvoiceStatus('${inv.id}','cancelled')">Storniert</button>
        </div>
      </div>

      <p class="muted" style="margin-top:6px">
        <strong>Nr.:</strong> ${escapeHtml(inv.invoiceNumber||"-")} ·
        <strong>Datum:</strong> ${escapeHtml(new Date(inv.invoiceDate||Date.now()).toLocaleDateString("de-DE"))} ·
        <strong>Status:</strong> ${escapeHtml(inv.status||"")}
      </p>

      <p><strong>Kunde:</strong> ${custLine}<br>
         <strong>Hund:</strong> ${petLine}
      </p>

      <p><strong>Zeitraum:</strong>
        ${escapeHtml(inv.period?.from||"")} – ${escapeHtml(inv.period?.to||"")}
      </p>

      ${(()=>{ 
        const isFree = !inv.sourceDocId;
        const lines = [];
        const baseLabel = isFree ? "Betrag" : "Grundpreis";
        lines.push(`<p>${baseLabel}: ${inv.pricing.basePrice.toFixed(2)} €</p>`);
        if(!isFree && (inv.pricing.percentExtra||0)!==0){
          lines.push(`<p>Zuschläge (%): ${inv.pricing.percentExtra.toFixed(2)} €</p>`);
        }
        if(!isFree && (inv.pricing.fixedExtra||0)!==0){
          lines.push(`<p>Zuschläge (fix): ${inv.pricing.fixedExtra.toFixed(2)} €</p>`);
        }
        if(isFree && (inv.note||"").trim()){
          lines.push(`<p><strong>Beschreibung:</strong> ${escapeHtml(inv.note.trim())}</p>`);
        }
        return lines.join("");
      })()}


      <hr>
      <h3 style="margin:10px 0 8px">Gesamt: ${inv.pricing.total.toFixed(2)} €</h3>

      <button class="btn" onclick="printInvoice('${inv.id}')">🖨️ Rechnung drucken / PDF</button>
    </div>
  `;
}
function setInvoiceStatus(id, status){
  const inv = getInvoiceById(id);
  if(!inv) return;

  const now = Date.now();
  inv.status = status;
  // Für Merge/Synchronisierung: numerischer Timestamp + ISO für Anzeige
  inv._updatedAt = now;
  inv.statusUpdatedAt = now;
  inv.updatedAt = new Date(now).toISOString();

  // Offline-Änderung merken, damit beim nächsten Online-Sync nichts verloren geht
  const netOnline = (typeof navigator !== 'undefined') ? !!navigator.onLine : false;
  inv._pendingStatusSync = !!(CLOUD.enabled && CLOUD.user && !netOnline);

  saveState();

  // Wenn online + Cloud aktiv: Sync anstoßen (C1: nur Status/Metadaten, aber wir pushen den State)
  if(CLOUD.enabled && CLOUD.user && netOnline){
    try{ cloudSchedulePush(); }catch(_){ }
  }

  openInvoice(id);
  renderInvoiceList();
}

// ===== ETAPPE 4: Freie Rechnung (Kunde/Hund auswählen statt tippen) =====
function openFreeInvoiceForm(){
  ensureStateShape();
  ensureContractDefaults();
  const view = document.getElementById("invoiceView");
  if(!view) return;

  const customers = (S.customers||[]).slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"","de"));
  const hasCustomers = customers.length>0;

  const today = toISODateLocal(new Date());

  view.innerHTML = `
    <div class="card">
      <div class="row between" style="gap:10px;flex-wrap:wrap">
        <h3 style="margin:0">Freie Rechnung</h3>
        <button class="smallbtn" onclick="document.getElementById('invoiceView').innerHTML=''">Schließen</button>
      </div>

      ${hasCustomers ? "" : "<p class='muted'>Noch kein Kundenstamm vorhanden. Bitte zuerst unter Hunde/Kunden einen Kunden & Hund anlegen.</p>"}

      <div class="row" style="gap:12px;flex-wrap:wrap;margin-top:10px">
        <label class="field" style="min-width:260px">
          <span>Kunde *</span>
          <select id="freeInvCustomer" onchange="renderFreeInvoicePetOptions()">
            <option value="">— Bitte auswählen —</option>
            ${customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name||"Kunde")}</option>`).join("")}
          </select>
        </label>

        <label class="field" style="min-width:260px">
          <span>Hund (optional)</span>
          <select id="freeInvPet">
            <option value="">—</option>
          </select>
        </label>
      </div>

      <div class="row" style="gap:12px;flex-wrap:wrap">
        <label class="field" style="min-width:200px">
          <span>Von</span>
          <input id="freeInvFrom" type="date" value="${today}">
        </label>
        <label class="field" style="min-width:200px">
          <span>Bis</span>
          <input id="freeInvTo" type="date" value="${today}">
        </label>
      </div>

      <div class="row" style="gap:12px;flex-wrap:wrap">
        <label class="field" style="min-width:260px">
          <span>Beschreibung</span>
          <input id="freeInvNote" type="text" placeholder="z.B. Gutschein / Training / Sonstiges">
        </label>
        <label class="field" style="min-width:200px">
          <span>Betrag (€) *</span>
          <input id="freeInvAmount" type="text" inputmode="decimal" placeholder="0,00">
        </label>
      </div>

      <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px">
        <button class="btn" onclick="createFreeInvoice()">🧾 Rechnung erstellen</button>
      </div>
    </div>
  `;

  renderFreeInvoicePetOptions();
}

function renderFreeInvoicePetOptions(){
  ensureStateShape();
  ensureContractDefaults();
  const customerId = document.getElementById("freeInvCustomer")?.value || "";
  const petSel = document.getElementById("freeInvPet");
  if(!petSel) return;

  const pets = (S.pets||[]).filter(p=>p.customerId===customerId).slice()
    .sort((a,b)=>(a.name||"").localeCompare(b.name||"","de"));

  petSel.innerHTML = `<option value="">—</option>` + pets.map(p=>`<option value="${p.id}">${escapeHtml(p.name||"Hund")}</option>`).join("");
}

function ensureLegacyDogForPetId(petId, customerId){
  ensureStateShape();
  ensureContractDefaults();
  if(!petId || !customerId) return "";

  const map = S._legacy?.dogIdToPetId || {};
  for(const dogId of Object.keys(map)){
    if(map[dogId] === petId) return dogId;
  }

  const pet = getPet(petId);
  const cust = getCustomer(customerId);

  const dogId = uid();
  S.dogs = S.dogs || [];
  S.dogs.push({
    id: dogId,
    name: pet?.name || "Hund",
    owner: cust?.name || "",
    phone: cust?.phone || "",
    note: ""
  });

  S._legacy.dogIdToPetId[dogId] = petId;
  S._legacy.dogIdToCustomerId[dogId] = customerId;
  return dogId;
}

function createFreeInvoice(){
  ensureStateShape();
  ensureContractDefaults();
  const customerId = document.getElementById("freeInvCustomer")?.value || "";
  const petId = document.getElementById("freeInvPet")?.value || "";
  const from = document.getElementById("freeInvFrom")?.value || "";
  const to = document.getElementById("freeInvTo")?.value || "";
  const note = (document.getElementById("freeInvNote")?.value || "").trim();
  const amountRaw = (document.getElementById("freeInvAmount")?.value || "0").trim();
  const amount = parseFloat(amountRaw.replace(",", "."));

  if(!customerId){ alert("Bitte Kunde auswählen."); return; }
  if(!(amount>0)){ alert("Bitte einen Betrag > 0 eingeben."); return; }

  const year = new Date().getFullYear();
  const number = String(S.nextInvoiceNumber).padStart(4, "0");
  const dogId = petId ? ensureLegacyDogForPetId(petId, customerId) : "";

  const invoice = {
    id: uid(),
    type: "invoice",

    sourceDocId: "", // freie Rechnung
    dogId,

    customerId,
    petId,

    period: { from: from || "", to: to || "" },

    pricing: {
      basePrice: amount,
      percentExtra: 0,
      fixedExtra: 0,
      total: amount
    },

    status: "draft",
    note,

    invoiceNumber: `${year}-${number}`,
    invoiceDate: new Date().toISOString(),

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  S.worklogs = Array.isArray(S.worklogs) ? S.worklogs : [];
  S.invoices = Array.isArray(S.invoices) ? S.invoices : [];
  S.invoices.push(invoice);

  S.nextInvoiceNumber++;

  saveState();
  renderInvoiceList();
  openInvoice(invoice.id);
}

function printInvoice(id){
  const inv = getInvoiceById(id);
  if(!inv) return;

  const {cust, pet, legacyDog} = resolveInvoiceParties(inv);

  const recipient = formatCustomerAddressBlock(cust) || escapeHtml(cust?.name || legacyDog?.owner || "—");
  const recipientSub = [
    (cust?.phone || legacyDog?.phone) ? `Tel: ${escapeHtml(cust?.phone || legacyDog?.phone)}` : "",
    cust?.email ? `Mail: ${escapeHtml(cust.email)}` : "",
    (pet?.name || legacyDog?.name) ? `Hund: ${escapeHtml(pet?.name || legacyDog?.name)}` : "",
    (pet?.chip || (pet?.chipNumber)) ? `Chip: ${escapeHtml(pet?.chipNumber || "ja")}` : ""
  ].filter(Boolean).join("<br>");

  const w = window.open("", "_blank");
  w.document.write(`
<html>
<head>
  <title>Rechnung</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    h1 { margin-top: 26px; }
    .header { margin-bottom: 20px; display:flex; justify-content:space-between; gap:20px; }
    .block { font-size: 12px; color: #111; line-height:1.35; }
    .company { font-size: 12px; color: #444; text-align:right; line-height:1.35; }
    .small { font-size: 12px; color: #444; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    td, th { border: 1px solid #ccc; padding: 8px; }
    th { background: #f5f5f5; }
    .right { text-align: right; }
    .muted { color:#666; font-size:11px; }
  </style>
</head>
<body>

  <div class="header">
    <div class="block">
      ${recipient}<br>
      <span class="muted">${recipientSub}</span>
    </div>
    <div class="company">
      <strong>${COMPANY.name}</strong><br>
      ${COMPANY.owner}<br>
      ${COMPANY.street}<br>
      ${COMPANY.zipCity}<br>
      Tel: ${COMPANY.phone}<br>
      ${COMPANY.email}<br>
      ${COMPANY.tax.vatId ? "USt-ID: " + COMPANY.tax.vatId + "<br>" : ""}
      ${COMPANY.tax.taxNumber ? "Steuernr.: " + COMPANY.tax.taxNumber + "<br>" : ""}
    </div>
  </div>

  <h1>Rechnung</h1>
  <p class="small">
    <strong>Rechnungsnummer:</strong> ${inv.invoiceNumber || "-"}<br>
    <strong>Rechnungsdatum:</strong> ${new Date(inv.invoiceDate||Date.now()).toLocaleDateString("de-DE")}<br>
    ${(()=>{ const f=String(inv.period?.from||""); const to=String(inv.period?.to||""); if(!f && !to) return ""; return `<strong>Leistungszeitraum:</strong> ${escapeHtml(f)} – ${escapeHtml(to)}<br>`; })()}
  </p>

  <table>
    <tr>
      <th>Position</th>
      <th class="right">Betrag</th>
    </tr>
    <tr>
      <td>${!inv.sourceDocId ? ("Betrag" + ((inv.note||"").trim()? "<br><span class=\"small\">"+escapeHtml(inv.note.trim())+"</span>":"")) : "Grundpreis"}</td>
      <td class="right">${inv.pricing.basePrice.toFixed(2)} €</td>
    </tr>
    ${inv.pricing.holidayExtra && inv.pricing.holidayExtra>0 ? `
    <tr>
      <td>Feiertagszuschlag (10% • ${inv.pricing.holidayDays||0} Tag(e))</td>
      <td class="right">${inv.pricing.holidayExtra.toFixed(2)} €</td>
    </tr>` : ``}

    <tr>
      <td>Zuschläge (%)</td>
      <td class="right">${inv.pricing.percentExtra.toFixed(2)} €</td>
    </tr>
    <tr>
      <td>Zuschläge (fix)</td>
      <td class="right">${inv.pricing.fixedExtra.toFixed(2)} €</td>
    </tr>
    <tr>
      <th>Gesamt</th>
      <th class="right">${inv.pricing.total.toFixed(2)} €</th>
    </tr>
  </table>

  <p class="small" style="margin-top:18px">
    Bitte überweise den Rechnungsbetrag unter Angabe der Rechnungsnummer auf folgendes Konto:<br>
    <strong>${COMPANY.bank.name}</strong><br>
    IBAN: ${COMPANY.bank.iban}<br>
    BIC: ${COMPANY.bank.bic}<br>
    <br>
    Vielen Dank!
  </p>

  <script>
    window.print();
    window.onafterprint = () => window.close();
  </script>

</body>
</html>
  `);

  w.document.close();
}
function loadState(){try{const raw=localStorage.getItem(LS_KEY);return raw?JSON.parse(raw):{dogs:[],docs:[]};}catch{return {dogs:[],docs:[]};}}
function saveState(){
  try{
    S._localUpdatedAt = Date.now();
    localStorage.setItem(LS_KEY,JSON.stringify(state));
  }catch(e){
    console.error("Local save failed", e);
  }
  SYNC.localSavedAt = (state && S._localUpdatedAt) ? S._localUpdatedAt : Date.now();
  updateSyncUI();
  // Cloud Sync (Weg 2B): Änderungen nach außen spiegeln
  if(CLOUD.enabled && CLOUD.user) cloudSchedulePush();
}

function ensureDefaultDog(){
  if(!S.dogs || S.dogs.length===0){
    S.dogs=[{id:uid(),name:"— Bitte auswählen —",owner:"",phone:"",isPlaceholder:true}];
  }
}
function syncDogSelect(){
  ensureDefaultDog();
  $("#dogSelect").innerHTML=S.dogs.map(d=>{
    const label=d.isPlaceholder?d.name:`${d.owner?d.owner+" – ":""}${d.name}`;
    return `<option value="${d.id}">${escapeHtml(label)}</option>`;
  }).join("");
}
function renderDogs(){
  // Etappe 2: primär pets/customers anzeigen, fallback auf legacy dogs
  ensureStateShape();
  ensureContractDefaults();
  const list = $("#dogList");
  if(!list) return;
  list.innerHTML = "";

  const pets = (S.pets||[]).slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de"));

  if(pets.length){
    pets.forEach(p=>{
      const c = getCustomer(p.customerId);
      const el = document.createElement("div");
      el.className = "item";
      const chipTxt = p.chip ? (` · Chip: ${escapeHtml(p.chipNumber||"ja")}`) : "";
      const badge = contractBadge(p.customerId, p.id);
      el.innerHTML = `<div><strong>${escapeHtml(p.name||"Hund")}</strong><small>${escapeHtml(c?.name||"")} · ${escapeHtml(c?.phone||"")}${chipTxt}${badge}</small></div>
        <div class="actions"><button class="smallbtn" data-e="1">Bearbeiten</button><button class="smallbtn" data-d="1">Löschen</button></div>`;
      el.querySelector('[data-e="1"]').onclick = ()=>openCpEditor("edit", p.id);
      el.querySelector('[data-d="1"]').onclick = ()=>{
        if(confirm("Hund wirklich löschen? (Aufenthalte/Rechnungen bleiben als Historie bestehen)")){
          S.pets = S.pets.filter(x=>x.id!==p.id);
          // legacy dog nicht automatisch löschen (Sicherheit), aber Mapping entfernen
          for(const dogId of Object.keys(S._legacy?.dogIdToPetId||{})){
            if(S._legacy.dogIdToPetId[dogId]===p.id){
              delete S._legacy.dogIdToPetId[dogId];
              delete S._legacy.dogIdToCustomerId[dogId];
            }
          }
          saveState(); renderDogs(); syncDogSelect();
        }
      };
      list.appendChild(el);
    });
  } else {
    // fallback legacy
    ensureDefaultDog();
    const dogs = S.dogs.filter(d=>!d.isPlaceholder);
    dogs.forEach(d=>{
      const el=document.createElement("div");
      el.className="item";
      el.innerHTML=`<div><strong>${escapeHtml(d.name)}</strong><small>${escapeHtml(d.owner||"")} · ${escapeHtml(d.phone||"")}</small></div>
        <div class="actions"><button class="smallbtn" data-e="1">Bearbeiten</button><button class="smallbtn" data-d="1">Löschen</button></div>`;
      el.querySelector('[data-e="1"]').onclick=()=>openCpEditor("new"); // legacy fallback: einfach neu anlegen
      el.querySelector('[data-d="1"]').onclick=()=>{
        if(confirm("Hund/Kunde wirklich löschen?")){
          S.dogs=S.dogs.filter(x=>x.id!==d.id);
          saveState(); renderDogs();
        }
      };
      list.appendChild(el);
    });
    if(!dogs.length) list.innerHTML=`<div class="muted">Noch keine Hunde/Kunden angelegt.</div>`;
  }

  refreshCustomerSelect();
  syncDogSelect();
}

$("#btnAddDog").addEventListener("click",()=>openCpEditor("new"));

$("#btnCpCancel").addEventListener("click",()=>closeCpEditor());

$("#btnCpSave").addEventListener("click",()=>{
  ensureStateShape();
  ensureContractDefaults();

  const mode = cpEdit.mode;
  const useExisting = $("#useExistingCustomer").checked && (S.customers||[]).length>0;

  let customer = null;
  let customerId = "";

  if(useExisting && $("#customerSelect").value){
    customerId = $("#customerSelect").value;
    customer = getCustomer(customerId);
  } else {
    const name = $("#c_name").value.trim();
    if(!name){ alert("Bitte Kundennamen eintragen."); return; }
    const phone = $("#c_phone").value.trim();
    if(!phone){ alert("Bitte eine Telefonnummer eintragen."); return; }
    customer = {
      id: uid(),
      name,
      phone: $("#c_phone").value.trim(),
      email: $("#c_email").value.trim(),
      street: $("#c_street").value.trim(),
      zip: $("#c_zip").value.trim(),
      city: $("#c_city").value.trim(),
      emergencyName: $("#c_em_name").value.trim(),
      emergencyPhone: $("#c_em_phone").value.trim(),
      pickupAuth: $("#c_pickup_auth").value.trim(),
      note: $("#c_note").value.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    S.customers.push(customer);
    customerId = customer.id;
  }

  const petName = $("#p_name").value.trim();
  if(!petName){ alert("Bitte Hundename eintragen."); return; }
  const csNew = $("#p_chipStatus").value;
  if(!csNew){ alert("Bitte bei „Gechippt?“ Ja oder Nein wählen."); return; }
  const chipNew = (csNew==="yes");
  const chipNrNew = $("#p_chipNumber").value.trim();
  if(chipNew && !chipNrNew){ alert("Bitte die Chipnummer eintragen."); return; }

  if(mode==="edit" && cpEdit.petId){
    const pet = getPet(cpEdit.petId);
    if(!pet){ alert("Hund nicht gefunden."); return; }

    // Update customer (wenn Felder aktiv / edit)
    if(customer && customer.id){
      customer.name = $("#c_name").value.trim() || customer.name;
      customer.phone = $("#c_phone").value.trim();
      if(!customer.phone){ alert("Bitte eine Telefonnummer eintragen."); return; }
      customer.email = $("#c_email").value.trim();
      customer.street = $("#c_street").value.trim();
      customer.zip = $("#c_zip").value.trim();
      customer.city = $("#c_city").value.trim();
      customer.emergencyName = $("#c_em_name").value.trim();
      customer.emergencyPhone = $("#c_em_phone").value.trim();
      customer.pickupAuth = $("#c_pickup_auth").value.trim();
      customer.note = $("#c_note").value.trim();
      customer.updatedAt = Date.now();
    }

    pet.customerId = customerId || pet.customerId;
    pet.name = petName;
    pet.breed = $("#p_breed").value.trim();
    pet.birthdate = $("#p_birthdate").value;
    const cs = $("#p_chipStatus").value;
    if(!cs){ alert("Bitte bei „Gechippt?“ Ja oder Nein wählen."); return; }
    pet.chip = (cs==="yes");
    pet.chipNumber = $("#p_chipNumber").value.trim();
    if(pet.chip && !pet.chipNumber){ alert("Bitte die Chipnummer eintragen."); return; }
    pet.vet = $("#p_vet").value.trim();
    pet.vetPhone = $("#p_vetPhone").value.trim();
    pet.allergies = $("#p_allergies").value.trim();
    pet.meds = $("#p_meds").value.trim();
    pet.food = $("#p_food").value.trim();
    pet.feeding = $("#p_feeding").value.trim();
    pet.compat = $("#p_compat").value.trim();
    pet.behavior = $("#p_behavior").value.trim();
    pet.note = $("#p_note").value.trim();
    pet.updatedAt = Date.now();

    upsertLegacyDogForPet(pet, getCustomer(pet.customerId));
    saveState();
    closeCpEditor();
    renderDogs();
    return;
  }

  // mode new: create pet
  const pet = {
    id: uid(),
    customerId,
    name: petName,
    breed: $("#p_breed").value.trim(),
    birthdate: $("#p_birthdate").value,
    chip: chipNew,
    chipNumber: chipNrNew,
    vet: $("#p_vet").value.trim(),
    vetPhone: $("#p_vetPhone").value.trim(),
    allergies: $("#p_allergies").value.trim(),
    meds: $("#p_meds").value.trim(),
    food: $("#p_food").value.trim(),
    feeding: $("#p_feeding").value.trim(),
    compat: $("#p_compat").value.trim(),
    behavior: $("#p_behavior").value.trim(),
    note: $("#p_note").value.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  S.pets.push(pet);

  upsertLegacyDogForPet(pet, getCustomer(customerId));

  S.schemaVersion = Math.max(S.schemaVersion||1, 2);
  saveState();
  closeCpEditor();
  renderDogs();
});


function renderDocs(){
  const list=$("#docList");
  list.innerHTML="";
  const docs=(S.docs||[]).filter(d=>d.type!=="invoice").slice().sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""));
  docs.forEach(d=>list.appendChild(docItem(d)));
  if(!docs.length) list.innerHTML=`<div class="muted">Noch keine Aufenthalte erstellt.</div>`;
  renderRecent();
}
function renderRecent(){
  const list=$("#recentList");
  const docs=(S.docs||[]).filter(d=>d.type!=="invoice").slice().sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||"")).slice(0,3);
  list.innerHTML="";
  docs.forEach(d=>list.appendChild(docItem(d)));
  if(!docs.length) list.innerHTML=`<div class="muted">Noch keine Aufenthalte.</div>`;
}
function docItem(d){
  const el=document.createElement("div");
  el.className="item";
  const dt=new Date(d.updatedAt).toLocaleString("de-DE");
  const subtitle = `${escapeHtml(d.templateName||"")}${d.saved ? " · abgeschlossen" : " · offen"} · zuletzt: ${dt}`;
  const actions = document.createElement("div");
  actions.className = "actions";

  const btnOpen = document.createElement("button");
  btnOpen.className = "smallbtn";
  btnOpen.textContent = "Öffnen";
  btnOpen.onclick = ()=>openDoc(d.id);

  const btnPdf = document.createElement("button");
  btnPdf.className = "smallbtn";
  btnPdf.textContent = "PDF";
  btnPdf.onclick = ()=>{openDoc(d.id); setTimeout(()=>printDoc(),150);};

  const btnDelete = document.createElement("button");
  btnDelete.className = "smallbtn";
  btnDelete.textContent = "Löschen";
  btnDelete.onclick = ()=>{
    if(confirm("Aufenthalt wirklich löschen?")){
      S.docs=S.docs.filter(x=>x.id!==d.id);
      saveState(); renderDocs();
    }
  };

  actions.appendChild(btnOpen);
  actions.appendChild(btnPdf);

  // Abschluss: Schnell neuen Aufenthalt als Kopie anlegen
  if(d.saved){
    const btnNew = document.createElement("button");
    btnNew.className = "smallbtn";
    btnNew.textContent = "➕ Neuer Aufenthalt";
    btnNew.onclick = ()=>{
      createStayFromExisting(d.id);
    };
    actions.appendChild(btnNew);
  }

  actions.appendChild(btnDelete);

  el.innerHTML = `<div><strong>${escapeHtml(d.title||"Aufenthalt")}</strong><small>${subtitle}</small></div>`;
  el.appendChild(actions);
  return el;
}

function createStayFromExisting(docId){
  const src = (S.docs||[]).find(x=>x.id===docId);
  if(!src) return;

  const t = getTemplate(src.templateId);
  const now = new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(src));

  copy.id = uid();
  copy.saved = false;
  copy.signature = null;
  copy.versionOf = null;

  // Zeitraum/Meta neu
  copy.meta = copy.meta || {};
  copy.meta.von = "";
  copy.meta.bis = "";
  // Betreuungstyp mitnehmen (spart Klicks)
  copy.meta.betreuung = src.meta?.betreuung || "";

  // Preis neu berechnen wenn Zeitraum gesetzt wird
  delete copy.pricing;

  copy.createdAt = now;
  copy.updatedAt = now;
  copy.title = (t?.name || src.title || "Aufenthalt");

  S.docs.unshift(copy);
  saveState();
  openDoc(copy.id);
}
$("#btnNewDoc").addEventListener("click",()=>createDoc($("#templateSelect").value));
function createDoc(tid){
  const t=getTemplate(tid);
  if(!t){
    try{
      const ids = (Array.isArray(globalThis.templates)?globalThis.templates:[]).map(x=>x&&x.id).filter(Boolean).join(", ");
      toast("Vorlage nicht gefunden: "+tid+(ids?(" (geladen: "+ids+")"):""));
    }catch(_){
      toast("Vorlage nicht gefunden: "+tid);
    }
    return;
  }
  ensureStateShape();
  ensureContractDefaults();
  // Etappe 3: Standardauswahl = erster Hund aus neuem Stamm (falls vorhanden)
  let defaultDogId = S.dogs?.[0]?.id || "";
  if((S.pets||[]).length){
    const pet = S.pets[0];
    const legacyDogId = getLegacyDogIdForPet(pet.id);
    if(legacyDogId){
      defaultDogId = legacyDogId;
    } else {
      const cust = getCustomer(pet.customerId);
      defaultDogId = upsertLegacyDogForPet(pet, cust) || defaultDogId;
    }
  }
  const now = new Date().toISOString();
  const docObj={id:uid(),templateId:t.id,templateName:t.name,title:t.name,dogId:defaultDogId,petId:"",customerId:"",fields:{},signature: null,saved: false,
versionOf: null,meta: {
  betreuung: "",
  von: "",
  bis: ""
},createdAt:now,updatedAt:now};
  ensureDocLinks(docObj);
  S.docs=S.docs||[];
  S.docs.unshift(docObj);
  saveState();
  openDoc(docObj.id);
}

let currentDoc=null, dirty=false;
function normalizeMeta(doc){
  doc.meta = doc.meta || {};
  doc.meta.betreuung = doc.meta.betreuung || "";
  doc.meta.von = doc.meta.von || "";
  doc.meta.bis = doc.meta.bis || "";
}
function renderVersions(doc){
  const box = document.getElementById("versionBox");
  if(!box) return;

  const versions = getDocumentVersions(doc);

  if(versions.length <= 1){
    box.innerHTML = "<strong>Versionen:</strong> Nur diese Version vorhanden.";
    return;
  }

  box.innerHTML = `
    <strong>Versionen:</strong>
    <ul style="margin:6px 0 0 16px">
      ${versions.map((v,i)=>`
        <li>
          ${v.id === doc.id ? "➡️ <strong>" : ""}
          Version ${i+1}
          (${new Date(v.createdAt).toLocaleString("de-DE")})
          ${v.saved ? "✔️" : "✏️"}
          ${v.id === doc.id ? "</strong>" : ""}
        </li>
      `).join("")}
    </ul>
  `;
}
function openDoc(id){
  try{
updateCreateInvoiceButton();
  currentDoc=(S.docs||[]).find(d=>d.id===id);
  if(!currentDoc) return;
  ensureDocLinks(currentDoc);
  updateDocCustomerPetFromDogId(currentDoc);
normalizeMeta(currentDoc);
  $("#editorTitle").textContent=currentDoc.title||"Dokument";
  $("#editorMeta").textContent=currentDoc.templateName;
  $("#docName").value=currentDoc.title||"";
  syncDogSelect();
  $("#dogSelect").value=currentDoc.dogId||S.dogs?.[0]?.id||"";
  renderCustomerInfoForDogId($("#dogSelect").value);
  try{
    renderEditor(currentDoc);
  }catch(e){
    console.error("openDoc/renderEditor failed", e);
    const root = document.getElementById("formRoot");
    if(root){
      root.innerHTML = `
        <div class="card">
          <h2 style="color:#ff6b6b">Editor-Fehler</h2>
          <p class="muted">Der Aufenthalts-Editor konnte nicht gerendert werden. Das ist meist ein Vorlagen-Formatproblem oder ein JavaScript-Fehler.</p>
          <pre style="white-space:pre-wrap; word-break:break-word; font-size:12px; opacity:.9">${escapeHtml(String(e && (e.stack||e.message||e)))}</pre>
          <p class="muted">Bitte Screenshot davon schicken – dann fixen wir es gezielt.</p>
        </div>
      `;
    }
    try{ toast("Editor-Fehler: "+(e?.message||e)); }catch(_){}
  }
  updateContractWarnBanner(currentDoc);
  try{ autofillHundeannahmeFieldsFromMaster($("#dogSelect").value, { overwrite:false }); }catch(_){}
  try{ renderVersions(currentDoc); }catch(_){}

  // Quicklinks im Aufenthalt (Medikation/Gesundheit)
  try{ renderStayQuickLinks(currentDoc); }catch(e){ console.warn('renderStayQuickLinks failed', e); }

  try{ $("#dsGvoText").textContent=getTemplate(currentDoc.templateId)?.dsGvoNote||""; }catch(_){}
  dirty=false;
  showPanel("editor");
  window.scrollTo({top:0,behavior:"smooth"});

  }catch(e){
    console.error("openDoc failed", e);
    const root = document.getElementById("formRoot");
    if(root){
      const msg = String(e && (e.stack||e.message||e));
      root.innerHTML = `
        <div class="card">
          <h2 style="color:#ff6b6b">Editor-Fehler (openDoc)</h2>
          <p class="muted">Der Editor konnte nicht geöffnet werden. Das ist meist ein DOM-/State-Problem oder ein JavaScript-Fehler, der vor dem Rendern auftritt.</p>
          <pre style="white-space:pre-wrap; word-break:break-word; opacity:.9">${escapeHtml(msg)}</pre>
          <p class="muted">Bitte Screenshot davon schicken – dann fixen wir es gezielt.</p>
        </div>
      `;
    }
    try{ toast("Editor-Fehler: "+(e?.message||e)); }catch(_){}
  }
}

function renderForm(docObj){
  const root=$("#formRoot"); root.innerHTML="";
  const t=getTemplate(docObj.templateId);
  t.sections.forEach(sec=>{
    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`<h2>${escapeHtml(sec.title)}</h2>`;
    sec.fields.forEach(f=>card.appendChild(renderField(f, docObj.fields[f.key], docObj)));
    root.appendChild(card);
  });
  const meta=document.createElement("div");
  meta.className="card";
  meta.innerHTML=`<h2>Ort / Datum</h2>`;
  t.meta.forEach(f=>meta.appendChild(renderField(f, docObj.meta[f.key], docObj)));
  root.appendChild(meta);
  updateAutoHolidayFields();
const sigCard = document.createElement("div");
sigCard.className = "card";

const sig = docObj.signature;

sigCard.innerHTML = `
  <h2>Unterschrift</h2>
  ${
    sig
      ? `<p class="muted">
           ✔ Unterschrieben am ${new Date(sig.signedAt).toLocaleString("de-DE")}
         </p>`
      : `<button id="btnSignatureOpen" class="primary">
           ✍️ Unterschrift erfassen
         </button>`
  }
`;

root.appendChild(sigCard);

  // Betreuungsvertrag – aus Aufenthalt erzeugen/öffnen
  const contractCard = document.createElement("div");
  contractCard.className = "card";
  if(docObj.dogId){
    contractCard.innerHTML = `
      <h2>Betreuungsvertrag</h2>
      <p class="muted">Erzeuge/öffne den Vertrag automatisch für den ausgewählten Hund.</p>
      <button id="btnContractFromStay" class="btn">📄 Betreuungsvertrag öffnen</button>
    `;
  }else{
    contractCard.innerHTML = `
      <h2>Betreuungsvertrag</h2>
      <p class="muted">Bitte zuerst einen Hund auswählen, dann kannst du den Vertrag erzeugen.</p>
    `;
  }
  root.appendChild(contractCard);

}
function renderField(f,value,docObj){
  const wrap=document.createElement("label");
  wrap.className="field"; wrap.style.minWidth="260px";
  wrap.innerHTML=`<span>${escapeHtml(f.label)}${f.required?" *":""}</span>`;
  let input;
  if(f.type==="textarea"){ input=document.createElement("textarea"); input.value=value||""; }
  else if(f.type==="select"){ input=document.createElement("select"); input.innerHTML=(f.options||[]).map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join(""); input.value=value||(f.options?.[0]||""); }
  else if(f.type==="checkbox"){ input=document.createElement("input"); input.type="checkbox"; input.checked=!!value; input.style.width="22px"; input.style.height="22px"; }
  else { input=document.createElement("input"); input.type=f.type||"text"; input.value=value||""; }
  input.dataset.key=f.key; input.dataset.ftype=f.type;
  input.oninput = () => {
  if (currentDoc.saved) {
    forkDocument();
  }
  dirty = true;
};

input.onchange = () => {
  if (currentDoc.saved) {
    forkDocument();
  }
  dirty = true;
  // Auto-Feiertage neu berechnen, wenn Zeitraum geändert wird
  if(f && (f.key==="von" || f.key==="bis")){
    try { updateAutoHolidayFields(); } catch(e){}
  }
};
if (currentDoc.saved) {
  input.disabled = true;
}
  // readonly/auto fields (z.B. Feiertage)
  if(f.readonly){
    input.disabled = true;
    input.classList.add("is-readonly");
  }
  
wrap.appendChild(input);
  return wrap;
}

$("#dogSelect").addEventListener("change", () => {
  if (currentDoc.saved) {
    forkDocument();
  }
  // Etappe 3: Halter-/Hund-Info anzeigen + doc verknüpfen
  currentDoc.dogId = $("#dogSelect").value;
  ensureDocLinks(currentDoc);
  updateDocCustomerPetFromDogId(currentDoc);
  renderCustomerInfoForDogId(currentDoc.dogId);
  updateContractWarnBanner(currentDoc);
  autofillHundeannahmeFieldsFromMaster(currentDoc.dogId, { overwrite:false });
  try{ renderStayQuickLinks(currentDoc); }catch(e){}
  dirty = true;
});

$("#btnSave").addEventListener("click",()=>saveCurrent(true));
$("#btnClose").addEventListener("click",()=>{
  if(dirty && !confirm("Änderungen sind nicht gespeichert. Schließen?")) return;
  $$(".tab").forEach((t,i)=>t.classList.toggle("is-active", i===0));
  showPanel("home");
  renderDocs();
});

function collectForm(){
  const t=getTemplate(currentDoc.templateId);
  const fields={}, meta={};
  $$("#formRoot [data-key]").forEach(inp=>{
    const key=inp.dataset.key, type=inp.dataset.ftype;
    const val=(type==="checkbox")?inp.checked:inp.value;
    if(t.meta.some(m=>m.key===key)) meta[key]=val; else fields[key]=val;
  });
  return {fields, meta};
}
function validate(docObj,t){
  const errs=[];
  // Etappe 3: Hund muss gewählt sein (nicht Placeholder)
  const d = (S.dogs||[]).find(x=>x.id===docObj.dogId);
  if(!docObj.dogId || (d && d.isPlaceholder)) errs.push("Hund");
  t.sections.forEach(sec=>sec.fields.forEach(f=>{
    if(!f.required) return;
    const v=docObj.fields[f.key];
    if(f.type==="checkbox"){ if(!v) errs.push(f.label); }
    else { if(!v || String(v).trim()==="") errs.push(f.label); }
  }));
  t.meta.forEach(f=>{ if(f.required){const v=docObj.meta[f.key]; if(!v||String(v).trim()==="") errs.push(f.label);} });
  if(!docObj.signature || !docObj.signature.dataUrl)
  errs.push("Unterschrift");
  return errs;
}
function updateCreateInvoiceButton(){
  const btn = document.getElementById("btnCreateInvoice");
  if(btn) btn.style.display = "none";

// Sync currentDoc with current form inputs WITHOUT saving/re-rendering.
// This prevents losing typed values when opening overlays (e.g., signature, contract).
function syncCurrentDocFromForm(){
  if(!currentDoc) return;
  // If editor UI isn't present, nothing to sync.
  const nameEl = document.getElementById("docName");
  const dogEl  = document.getElementById("dogSelect");
  if(!nameEl || !dogEl) return;

  const t = getTemplate(currentDoc.templateId);
  if(!t) return;

  const { fields, meta } = collectForm();
  currentDoc.title = (nameEl.value || "").trim() || currentDoc.templateName || currentDoc.title || "Dokument";
  currentDoc.dogId = dogEl.value || currentDoc.dogId || "";
  ensureDocLinks(currentDoc);
  currentDoc.fields = fields;
  currentDoc.meta = meta;

  // pricing logic (keep consistent with saveCurrent)
  if (currentDoc.meta?.betreuung && currentDoc.meta?.von && currentDoc.meta?.bis) {
    calculateInvoicePricing(currentDoc);
  }

  dirty = true;
}
}

function saveCurrent(alertOk){
updateCreateInvoiceButton();
  if(!currentDoc) return false;
  const t=getTemplate(currentDoc.templateId);
  const {fields, meta}=collectForm();
  currentDoc.title=$("#docName").value.trim()||currentDoc.templateName;
  currentDoc.dogId=$("#dogSelect").value;
  ensureDocLinks(currentDoc);
  currentDoc.fields=fields;
currentDoc.meta=meta;

// 🔢 Preislogik anwenden
if (currentDoc.meta?.betreuung && currentDoc.meta?.von && currentDoc.meta?.bis) {
  calculateInvoicePricing(currentDoc);
}

  currentDoc.meta=meta;
$("#docName").disabled = currentDoc.saved;
$("#dogSelect").disabled = currentDoc.saved;
  
  const errs=validate(currentDoc,t);
  if(errs.length){
    alert("Bitte noch ausfüllen/abhaken:\n\n• "+errs.join("\n• "));
    return false;
  }
const type = currentDoc.meta.betreuung;
const from = currentDoc.meta.von;
const to   = currentDoc.meta.bis;

const used = countOccupancy(type, from, to, currentDoc.id);
const limit = getMinCapacityForRange(type, from, to);

if (used >= limit) {
  alert(
    `⚠️ Achtung:\n\n` +
    `${used} von ${limit} Plätzen für "${type}" ` +
    `im Zeitraum ${from} – ${to} sind bereits belegt.`
  );
}
if (!currentDoc.signature){
  alert("Bitte unterschreiben");
  return false;
}
  currentDoc.saved = true;                             // 🔐 Dokument abschließen
currentDoc.updatedAt = new Date().toISOString();

// 🧾 Variante A: Rechnung automatisch beim Abschließen erstellen
if(currentDoc.pricing){
  const exists = (S.invoices||[]).some(x=>x.sourceDocId===currentDoc.id);
  if(!exists){
    createInvoiceFromDoc(currentDoc);
  }
}
     // sauberer Zeitstempel

// 🧼 Auto-Trigger: Quarantäne/Parasiten aus Aufenthalt ins Hygieneprotokoll schreiben
try{ hygieneAutoFromStayDoc(currentDoc); }catch(e){ console.warn('hygieneAutoFromStayDoc failed', e); }

saveState();renderDashboard(); renderTodayStatus();                                         // EINMAL speichern
dirty = false;

$("#editorTitle").textContent = currentDoc.title;
if(alertOk) alert("Gespeichert");
renderDocs();

return true;

}
function createInvoiceFromDoc(doc){
  if(!doc || !doc.pricing) return;

  const year = new Date().getFullYear();
  const number = String(S.nextInvoiceNumber).padStart(4, "0");

  const invoice = {
    id: uid(),
    type: "invoice",

    sourceDocId: doc.id,
    dogId: doc.dogId,

    // Etappe 4: Verknüpfung zum Kundenstamm (für Druck/Archiv)
    customerId: (doc.customerId || getCustomerByDogId(doc.dogId)?.id || ""),
    petId: (doc.petId || getPetByDogId(doc.dogId)?.id || ""),

    period: {
      from: doc.meta.von,
      to: doc.meta.bis
    },

    pricing: {
      // Basis: Tage * Tagespreis
      basePrice: Number(doc.pricing.base || 0),

      // Feiertagszuschlag: 10% nur auf Feiertags-TAGE
      holidayDays: Number(doc.pricing.holidayDays || 0),
      holidayExtra: Number(doc.pricing.holidayValue || 0),

      // Prozent-/Fixzuschläge (als Beträge)
      percentExtra: Number(doc.pricing.percentValue || 0),
      fixedExtra: Number(doc.pricing.fixedExtra || 0),

      total: Number(doc.pricing.total || 0)
    },

    status: "draft",

    invoiceNumber: `${year}-${number}`,
    invoiceDate: new Date().toISOString(),

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  S.worklogs = Array.isArray(S.worklogs) ? S.worklogs : [];
  S.invoices = Array.isArray(S.invoices) ? S.invoices : [];
  S.invoices.push(invoice);
  S.nextInvoiceNumber++;

  saveState();
  renderInvoiceList();
}
function forkDocument() {
  if (!currentDoc || !currentDoc.saved) return;

  const originalId = currentDoc.versionOf || currentDoc.id;

  const fork = JSON.parse(JSON.stringify(currentDoc));

  fork.id = uid();
  fork.saved = false;
  fork.versionOf = originalId;
  fork.createdAt = new Date().toISOString();
  fork.updatedAt = fork.createdAt;

  // neue Version → neue Unterschrift erforderlich
  fork.signature = null;

  S.docs.unshift(fork);
  currentDoc = fork;

  saveState();
}
function getDocumentVersions(doc){
  const rootId = doc.versionOf || doc.id;

  return (S.docs || [])
    .filter(d => d.id === rootId || d.versionOf === rootId)
    .sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
}

// ===== Overlay-Signatur (Weg A) =====
function openSignatureOverlay(onDone){
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center";
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:14px;padding:12px;width:92%;max-width:560px">
      <canvas id="sigCanvas" style="width:100%;height:180px;background:#fff;border:1px solid #ccc;border-radius:10px"></canvas>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="sigClear">Löschen</button>
        <button id="sigCancel">Abbrechen</button>
        <button id="sigOk">Übernehmen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow="hidden";

  const canvas=overlay.querySelector("#sigCanvas");
  const ctx=canvas.getContext("2d");
  const ratio=Math.max(window.devicePixelRatio||1,1);
  const w=canvas.clientWidth,h=canvas.clientHeight;
  canvas.width=w*ratio; canvas.height=h*ratio;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.lineWidth=2.5; ctx.lineCap="round";

  let draw=false,lx=0,ly=0;
  const pos=e=>{
    const r=canvas.getBoundingClientRect();
    const p=e.touches?e.touches[0]:e;
    return {x:p.clientX-r.left,y:p.clientY-r.top};
  };
  const start=e=>{draw=true;({x:lx,y:ly}=pos(e)); e.preventDefault();};
  const move=e=>{
    if(!draw) return;
    const p=pos(e);
    ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(p.x,p.y); ctx.stroke();
    lx=p.x; ly=p.y; e.preventDefault();
  };
  const end=()=>draw=false;

  canvas.addEventListener("mousedown",start);
  canvas.addEventListener("mousemove",move);
  window.addEventListener("mouseup",end);
  canvas.addEventListener("touchstart",start,{passive:false});
  canvas.addEventListener("touchmove",move,{passive:false});
  canvas.addEventListener("touchend",end);

  overlay.querySelector("#sigClear").onclick=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
  overlay.querySelector("#sigCancel").onclick=close;
  overlay.querySelector("#sigOk").onclick=()=>{onDone(canvas.toDataURL("image/png")); close();};

  function close(){document.body.style.overflow=""; overlay.remove();}
}

document.addEventListener("click",(e)=>{

  // Unterschrift im Aufenthalt erfassen (ohne Form-Reset)
  if(e.target && e.target.id==="btnSignatureOpen"){
    e.preventDefault();
    syncCurrentDocFromForm(); // <- wichtige Zeile: typed values in currentDoc übernehmen
    openSignatureOverlay(data=>{
      if(!currentDoc) return;
      currentDoc.signature = {
        dataUrl: data,
        signedAt: new Date().toISOString(),
        dogId: currentDoc.dogId || null
      };
      dirty = true;
      saveState(); // persist immediately
      renderForm(currentDoc); // now safe (uses synced currentDoc)
    });
    return;
  }

  // Betreuungsvertrag aus aktuellem Aufenthalt öffnen
  if(e.target && e.target.id==="btnContractFromStay"){
    e.preventDefault();
    if(!currentDoc){ alert("Kein Aufenthalt geöffnet."); return; }
    syncCurrentDocFromForm();
    openContractFromStay(currentDoc);
    return;
  }

});

$("#btnPrint").addEventListener("click",()=>printDoc());
function printDoc(){
  if(!currentDoc) return;
  if(!saveCurrent(false)) return;
  const t=getTemplate(currentDoc.templateId);
  const dog=S.dogs.find(d=>d.id===currentDoc.dogId) || null;
  const html=buildPrintHtml(currentDoc,t,dog);
  openHtmlInModal('Druckvorschau', html, 'Schließen mit ✕. Für PDF: Drucken/Speichern → „Als PDF“ → in Dateien speichern.');
}

function buildPrintHtml(docObj,t,dog){
  const dt=new Date(docObj.updatedAt).toLocaleString("de-DE");
  const dogLine=dog && !dog.isPlaceholder ? `${dog.owner?escapeHtml(dog.owner)+" – ":""}${escapeHtml(dog.name)}` : "—";
  const sigImg = docObj.signature
  ? `<img class="sig" src="${docObj.signature.dataUrl}" alt="Unterschrift" />`
  : "";
  let out=`<div class="head"><div><h1>${escapeHtml(docObj.title||t.name)}</h1><div class="meta">Hund/Kunde: ${dogLine} · Stand: ${dt}</div></div><img class="logo" src="assets/logo.png" /></div>`;
  t.sections.forEach(sec=>{
    out+=`<h2>${escapeHtml(sec.title)}</h2><table>`;
    sec.fields.forEach(f=>{
      let v=docObj.fields[f.key];
      if(f.type==="checkbox") v=v?"Ja":"Nein";
      out+=`<tr><td class="k">${escapeHtml(f.label)}</td><td class="v">${escapeHtml(String(v??""))}</td></tr>`;
    });
    out+=`</table>`;
  });
  out+=`<h2>Ort / Datum</h2><table><tr><td class="k">Ort / Datum</td><td class="v">${escapeHtml(docObj.meta.ort_datum||"")}</td></tr></table>`;
  out+=`<h2>Unterschrift Hundehalter</h2><div class="sigbox">${sigImg}</div>`;
  out+=`<h2>Datenschutz (DSGVO)</h2><p class="note">${escapeHtml(t.dsGvoNote||"")}</p>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(docObj.title||"Dokument")}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Arial,sans-serif;margin:28px;color:#111}
.head{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:18px}
.logo{height:44px}
h1{margin:0;font-size:20px}
.meta{color:#555;font-size:12px;margin-top:2px}
h2{margin:18px 0 8px;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:12px}
td{padding:8px 10px;border:1px solid #ddd;vertical-align:top}
td.k{width:38%;background:#fafafa;font-weight:700}
.sigbox{border:1px solid #ddd;border-radius:12px;height:120px;display:flex;align-items:center;justify-content:center;background:#fff}
.sig{max-height:105px;max-width:95%}
.note{font-size:11px;color:#444;line-height:1.35}
@media print{body{margin:16mm}}
</style></head><body>${out}</body></html>`;
}

function doBackupExport(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  const stamp = toISODateLocal(new Date());
  a.href=URL.createObjectURL(blob);
  a.download=`DoggyStyleWorkspace_Backup_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const _btnExportAll = $("#btnExportAll");
if(_btnExportAll) _btnExportAll.addEventListener("click", doBackupExport);

const _btnBackupExport = document.getElementById('btnBackupExport');
if(_btnBackupExport) _btnBackupExport.addEventListener('click', doBackupExport);


const _btnMonthExport = document.getElementById('btnMonthExport');
if(_btnMonthExport) _btnMonthExport.addEventListener('click', exportMonthBundle);

const _btnMonthClose = document.getElementById('btnMonthClose');
if(_btnMonthClose) _btnMonthClose.addEventListener('click', closeMonth);

const _btnSteuerExport = document.getElementById('btnSteuerExport');
if(_btnSteuerExport) _btnSteuerExport.addEventListener('click', showSteuerberaterExportInfo);

const _btnExportMonthNow = document.getElementById('btnExportMonthNow');
if(_btnExportMonthNow) _btnExportMonthNow.addEventListener('click', exportMonthBundle);

const _btnExportSteuerNow = document.getElementById('btnExportSteuerNow');
if(_btnExportSteuerNow) _btnExportSteuerNow.addEventListener('click', showSteuerberaterExportInfo);

const _btnStaffAdd = document.getElementById('btnStaffAdd');
if(_btnStaffAdd) _btnStaffAdd.addEventListener('click', ()=>{
  ensureStateShape();
  const inp = document.getElementById('staffNewName');
  const name = inp && inp.value ? inp.value.trim() : "";
  if(!name) return alert("Bitte Name eingeben.");
  S.staff.people.push({ id: uid("stf"), name, active: true, createdAt: Date.now() });
  if(inp) inp.value="";
  syncStaffPresets();
  saveState();
  renderStaffSettings();
  renderAll();
});

const _btnDocVersionsEdit = document.getElementById('btnDocVersionsEdit');
if(_btnDocVersionsEdit) _btnDocVersionsEdit.addEventListener('click', ()=>{
  alert("Tipp: Nutze „Version erhöhen“ bei den Dokumenten. Alte Versionen werden automatisch archiviert.");
});


const _btnBackupImport = document.getElementById('btnBackupImport');
const _fileBackupImport = document.getElementById('fileBackupImport');

if(_btnBackupImport && _fileBackupImport){
  _btnBackupImport.addEventListener('click', ()=> _fileBackupImport.click());
  _fileBackupImport.addEventListener('change', async (ev)=>{
    const file = ev.target.files && ev.target.files[0];
    if(!file) return;
    try{
      const txt = await file.text();
      const data = JSON.parse(txt);
      if(!data || typeof data !== 'object') throw new Error('Ungültiges Backup.');
      if(!confirm('Backup importieren? Dies überschreibt den aktuellen Stand (lokal + Cloud).')) return;
      state = data;
      ensureStateShape();
      ensureContractDefaults();
      migrateToV2();
      pruneInvoiceDocs();
      ensureDefaultDog();
      saveState();
      renderDogs();
      renderDocs();
      renderInvoiceList();
      alert('✅ Backup importiert.');
    }catch(e){
      console.error(e);
      alert('❌ Import fehlgeschlagen: '+(e.message||e));
    }finally{
      try{ _fileBackupImport.value = ''; }catch(_){ }
    }
  });
}

$("#btnWipe").addEventListener("click",()=>{
  if(!confirm("Wirklich alle lokalen Daten löschen?")) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
});

async function boot(){
  await loadTemplates();
  ensureStateShape();
  ensureContractDefaults();
  migrateToV2();
  pruneInvoiceDocs();
  ensureDefaultDog();
  saveState();
  renderDogs();
  renderDocs();
  renderInvoiceList();
  showPanel("home");
}


let __BOOT_DONE = false;
async function bootOnce(){
  if(__BOOT_DONE) return;
  __BOOT_DONE = true;
  await boot();
}

async function startApp(){
  // UI wiring (auch im Offline-Modus)
  try{ wireQuickActions(); }catch(e){}
  // 1) Wenn Cloud aktiviert: Login + Sync
  const cloudOk = await cloudInit();
  if(!cloudOk){
    showAuthGate(false);
    await bootOnce();
    return;
  }

  // Option C: immer Login erzwingen (Session bei jedem Start beenden)
  if(CLOUD.forceLoginAlways){
    try{ await CLOUD.auth.signOut(); }catch(e){}
    showAuthGate(true);
  }


  // Login UI wiring
  const btnLogin = document.getElementById("btnLogin");
  const btnRegister = document.getElementById("btnRegister");
  const btnLogout = document.getElementById("btnLogout");
  const btnLogoutApp = document.getElementById("btnLogoutApp");
  const btnLogoutBottom = document.getElementById("btnLogoutBottom");
  const btnNewStayTop = document.getElementById("btnNewStayTop");
  const btnNewStayOnPage = document.getElementById("btnNewStayOnPage");
  const btnQuickDogs = document.getElementById("btnQuickDogs");
  const btnQuickInvoices = document.getElementById("btnQuickInvoices");
  const btnQuickSettings = document.getElementById("btnQuickSettings");
  const loginEmail = document.getElementById("loginEmail");
  const loginPass = document.getElementById("loginPass");

  if(btnLogin) btnLogin.onclick = async ()=>{
    setAuthMsg("");
    try{
      await CLOUD.auth.signInWithEmailAndPassword((loginEmail?.value||"").trim(), loginPass?.value||"");
    }catch(e){
      console.error(e);
      setAuthMsg(e.message||"Login fehlgeschlagen");
      try{ alert('Login fehlgeschlagen: '+(e.code||e.message||e)); }catch(_){ }
    }
  };
  if(btnRegister) btnRegister.onclick = async ()=>{
    setAuthMsg("");
    try{
      await CLOUD.auth.createUserWithEmailAndPassword((loginEmail?.value||"").trim(), loginPass?.value||"");
      setAuthMsg("Account erstellt. Bitte anmelden.");
    }catch(e){
      console.error(e);
      setAuthMsg(e.message||"Registrierung fehlgeschlagen");
      try{ alert('Registrierung fehlgeschlagen: '+(e.code||e.message||e)); }catch(_){ }
    }
  };
  if(btnLogout) btnLogout.onclick = async ()=>{
    await CLOUD.auth.signOut();
  };
  if(btnLogoutApp) btnLogoutApp.onclick = async ()=>{
    try{ await CLOUD.auth.signOut(); }catch(e){}
  };
  if(btnLogoutBottom) btnLogoutBottom.onclick = ()=>performLogout();
  if(btnNewStayTop) btnNewStayTop.onclick = ()=>{ try{ createStay(); }catch(e){ selectTab("documents"); } };
  if(btnNewStayOnPage) btnNewStayOnPage.onclick = ()=>{ try{ createStay(); }catch(e){ selectTab("documents"); } };
  if(btnQuickDogs) btnQuickDogs.onclick = ()=>selectTab("dogs");
  if(btnQuickInvoices) btnQuickInvoices.onclick = ()=>selectTab("workforms");
  if(btnQuickSettings) btnQuickSettings.onclick = ()=>selectTab("settings");


  // Auth state
  CLOUD.auth.onAuthStateChanged(async (user)=>{
    CLOUD.user = user || null;
    if(!user){
      try{ const ba=document.querySelector(".bottom-actions"); if(ba) ba.style.display="none"; }catch(e){}

      CLOUD.role = 'guest';
      try{ if(btnLogoutApp) btnLogoutApp.style.display = 'none'; }catch(e){}
      try{ if(btnLogout) btnLogout.style.display = 'none'; }catch(e){}
      updateSyncUI();
      // In dieser Version gibt es kein Login-Overlay mehr. Wenn nicht eingeloggt: auf Login-Seite umleiten.
      try{
        const p = (location && location.pathname) ? location.pathname.toLowerCase() : '';
        // local/offline Nutzung erlauben: nicht hart auf login umleiten
        // if(!p.endsWith('login.html')) location.href = 'login.html';
      }catch(e){}
      
    try{ if(btnLogout) btnLogout.style.display = 'inline-flex'; }catch(e){}
return;
    }

    // Login bei jedem Start erzwingen: wird beim Start durch signOut() erzwungen (kein Auto-Logout nach erfolgreichem Login)

    // Rolle (v2): aus Firestore (mit Whitelist-Override)
    try{
      CLOUD.userProfile = await loadOrCreateUserProfile(user);
      CLOUD.role = (CLOUD.userProfile && CLOUD.userProfile.role) ? CLOUD.userProfile.role : ROLES.STAFF;
    }catch(e){
      console.warn('Role load failed, fallback to staff', e);
      CLOUD.role = ROLES.STAFF;
    }

    // Kunden-Portal: kein Workspace-State, keine Tabs
    if(CLOUD.role === ROLES.CUSTOMER){
      try{ await initCustomerPortal(); }catch(e){ console.error(e); }
      return;
    }

    showAuthGate(false);
    if(btnLogout) btnLogout.style.display = "inline-block";

    // ANA-007: Cloud-Ping direkt nach erfolgreichem Login (Status sofort Online möglich)
    try{ await cloudPing(); }catch(e){}

    // ANA016: Online-Status nach Login sofort setzen und durch Watchdog stabil halten
    try{ startOnlineWatchdog(); }catch(e){}

    if(btnLogoutApp) btnLogoutApp.style.display = "inline-block";
    updateSyncUI();
    if(btnLogoutApp) btnLogoutApp.style.display = "inline-block";

    // staff/admin Features (Rollen, Aufgaben, Inbox)
    try{ await initStaffFeatures(); }catch(e){ console.warn(e); }

    // Sync UI initial
    // WICHTIG: Cloud-Ping / erster Snapshot setzt cloudLastOkAt bereits.
    // NICHT mit 0 überschreiben (sonst bleibt die UI "Offline" bis zum ersten Push).
    try{
      const prevOk = Number(SYNC.cloudLastOkAt || 0);
      const pushOk = Number(CLOUD.lastPushOkAt || 0);
      SYNC.cloudLastOkAt = Math.max(prevOk, pushOk);
      const pushErr = String(CLOUD.lastPushError || "");
      if(pushErr) SYNC.cloudLastError = pushErr;
    }catch(_){
      // Fallback: never reset to 0
      const pushOk = Number(CLOUD.lastPushOkAt || 0);
      if(pushOk) SYNC.cloudLastOkAt = pushOk;
      const pushErr = String(CLOUD.lastPushError || "");
      if(pushErr) SYNC.cloudLastError = pushErr;
    }
    updateSyncUI();

    
// Erstes Boot lokal (stellt state sicher), dann Remote zuverlässig einspielen
await bootOnce();

// Echtzeit-Listener (robust, inkl. erstem Snapshot)
// Wichtig: Listener so früh wie möglich setzen, damit der initiale State auch bei iOS/Safari sicher kommt.
try{
  if(CLOUD._unsubWorkspace){ try{ CLOUD._unsubWorkspace(); }catch(_){ } }
}catch(_){ }
try{
  const ref = cloudStateRef();
  if(ref && ref.onSnapshot){
    CLOUD._unsubWorkspace = ref.onSnapshot((snap)=>{
      // Auto-Online: sobald wir irgendeinen Snapshot-Callback bekommen, gilt Cloud als erreichbar
      if(!SYNC._cloudFirstSnap){
        SYNC._cloudFirstSnap = true;
        SYNC.cloudPending = false;
        SYNC.cloudLastOkAt = Date.now();
        SYNC.cloudLastError = "";
        updateSyncUI();
      }

      if(!snap || !snap.exists) return;
      const data = snap.data() || {};
      const stamp = Number(data.updatedAt || 0);
      if(stamp){ SYNC.cloudLastSeenAt = stamp; updateSyncUI(); }

      const remotePayload = data.payload || null;
      const localUpdated = Number(state && S._localUpdatedAt || 0);
      const localCloudStamp = Number(state && S._cloudUpdatedAt || 0);
      const localEmpty = isStateEffectivelyEmpty(state);

      // Falls lokal leer (z.B. LocalStorage von iOS geleert) -> Remote sofort übernehmen.
      if(localEmpty && remotePayload){
        applyRemoteState(remotePayload, stamp, "snapshot-initial");
        return;
      }

      // Wenn wir lokal neuere Änderungen haben (noch nicht gepusht): Remote nicht drüberbügeln
      if(localUpdated && stamp && stamp <= localUpdated) return;
      if(stamp && stamp <= localCloudStamp) return;

      // Nicht unsere eigene Änderung nochmal einspielen (aber nur, wenn lokal NICHT leer ist)
      if(!localEmpty && CLOUD.user && (data.updatedBy === (CLOUD.user.email||CLOUD.user.uid))) return;

      if(remotePayload){
        applyRemoteState(remotePayload, stamp, "snapshot");
      }
    });
  }
}catch(e){
  console.warn("Workspace onSnapshot failed", e);
}

// Initialer Remote-Read (mit Retry) + Merge-Entscheidung
try{
  const {remote, err} = await cloudLoadStateWithRetry(3);

  const localUpdated = Number(state && S._localUpdatedAt || 0);
  const localCloudStamp = Number(state && S._cloudUpdatedAt || 0);

  if(!remote){
    // Kein Remote gefunden oder Read zu früh/fehlgeschlagen -> bei lokalem Inhalt einmalig pushen
    const hasLocalData =
      (Array.isArray(S.pets) && S.pets.filter(p=>p && !p.isPlaceholder).length>0) ||
      (Array.isArray(S.customers) && S.customers.length>0) ||
      (Array.isArray(S.docs) && S.docs.length>0) ||
      (Array.isArray(S.dogs) && S.dogs.filter(d=>d && !d.isPlaceholder).length>0);

    if(hasLocalData && CLOUD.user){
      try{ await cloudPushNow(); }catch(e){ console.warn('Initial cloud push failed', e); }
    } else if(err){
      console.warn("Initial cloud read failed (no remote), continuing local", err);
    }
  } else {
    const remoteUpdated = Number(remote._cloudUpdatedAt || CLOUD._lastRemoteStamp || 0);
    const localEmpty = isStateEffectivelyEmpty(state);

    // Wenn lokal leer: Remote immer übernehmen
    if(localEmpty){
      applyRemoteState(remote, remoteUpdated, "initial-read-empty-local");
    } else if(localUpdated && localUpdated > remoteUpdated){
      // Lokal ist neuer -> lokal behalten und pushen
      if(CLOUD.user){
        try{ cloudSchedulePush(); }catch(_){ }
      }
    } else if(remoteUpdated && remoteUpdated >= localCloudStamp){
      // Remote ist neuer/gleich -> übernehmen
      applyRemoteState(remote, remoteUpdated, "initial-read");
      // Auto-Online: initialer Cloud-Read erfolgreich
      try{ SYNC.cloudPending = false; SYNC.cloudLastOkAt = Date.now(); SYNC.cloudLastError = ""; updateSyncUI(); }catch(e){}

    }
  }
}catch(e){
  console.error("Cloud load failed", e);
  try{ SYNC.cloudPending = false; SYNC.cloudLastError = String(e && (e.code||e.message) || e || "Cloud load failed"); updateSyncUI(); }catch(_e){}
  setAuthMsg("Cloud Sync konnte nicht geladen werden. App läuft lokal weiter.");
}
  });
}


  // Option C (iPad/PWA): auch beim "Wieder-Öffnen" (ohne Reload) Login erzwingen
  if (CLOUD.forceLoginAlways) {
    let _forcing = false;
    const forceLoginNow = async () => {
      if (_forcing) return;
      _forcing = true;
      try {
        const u = CLOUD.auth && CLOUD.auth.currentUser;
        if (u) {
          await CLOUD.auth.signOut();
        }
      } catch (e) { /* ignore */ }
      try { showAuthGate(true); } catch(e) {}
      _forcing = false;
    };

        let __wasHidden = document.hidden;
// Wenn die App wieder in den Vordergrund kommt (iPad PWA lädt oft nicht neu)
    window.addEventListener("pageshow", () => { forceLoginNow(); });
document.addEventListener("visibilitychange", () => {
      const nowHidden = document.hidden;
      if (__wasHidden && !nowHidden) forceLoginNow();
      __wasHidden = nowHidden;
    });
}


// Manuelles Speichern (Einstellungen)
(function bindManualSave(){
  const btn = document.getElementById("manualSaveBtn");
  const info = document.getElementById("manualSaveStatus");
  if(!btn) return;
  btn.addEventListener("click", async ()=>{
    try{
      if(info) info.textContent = "Speichere…";
      // erzwingt sofortigen Cloud-Push (ohne 700ms Debounce)
      await cloudPushNow();
      if(info) info.textContent = "✅ In Cloud gespeichert";
      setTimeout(()=>{ if(info) info.textContent=""; }, 2500);
    }catch(e){
      if(info) info.textContent = "❌ Cloud-Speichern fehlgeschlagen";
      console.error(e);
      setTimeout(()=>{ if(info) info.textContent=""; }, 3500);
    }
  });
})();

// Start
startApp().catch(console.error);
// UI: Sync-Status regelmäßig auffrischen (auch bei Tab-Wechsel/PWA)
setInterval(()=>{ try{ updateSyncUI(); }catch(_){ } }, 1500);
window.addEventListener('online', ()=>{
  try{ updateSyncUI(); }catch(_){ }
  // C1: Falls Rechnungs-Statusänderungen offline erfolgt sind, jetzt automatisch syncen
  try{
    const pending = Array.isArray(state?.invoices) && S.invoices.some(iv=>iv && iv._pendingStatusSync);
    if(pending && CLOUD.enabled && CLOUD.user){
      setTimeout(()=>{ try{ cloudSchedulePush(); }catch(_){ } }, 300);
    }
  }catch(_){ }
});
window.addEventListener('offline', ()=>{ try{ updateSyncUI(); }catch(_){ } });

/* ===== B2.2a Freier Rechnungs-Editor ===== */
function renderInvoiceEditorB2(doc){
  // ===== B2.2c Rechnungsnummer (Pflichtfeld) =====

  // ===== B2.3 Zahlungsstatus =====
  if(!doc.paymentStatus){
    doc.paymentStatus = "offen"; // offen | bezahlt | storniert
  }

  if(!doc.invoiceNumber || String(doc.invoiceNumber).trim()===""){
    const year = new Date().getFullYear();
    const count = (S.docs||[]).filter(d=>d.type==="invoice").length + 1;
    doc.invoiceNumber = `${year}-${String(count).padStart(4,"0")}`;
  }

  const root = document.getElementById("formRoot");
  if(!root) return;

  // Basisfelder
  doc.items = Array.isArray(doc.items) ? doc.items : [];
  doc.date = doc.date || toISODateLocal(new Date());

  function recalc(){
    let net = 0;
    doc.items.forEach(it=>{
      const q = Number(it.qty)||0;
      const p = Number(it.unitPrice)||0;
      it.sum = Math.round(q*p*100)/100;
      net += it.sum;
    });
    doc.net = Math.round(net*100)/100;
    doc.tax = Math.round(doc.net*0.19*100)/100;
    doc.total = Math.round((doc.net+doc.tax)*100)/100;
  }

  function redraw(){
    recalc();
    renderInvoiceEditorB2(doc);
  }

  recalc();

  root.innerHTML = `
    <h2>Freie Rechnung</h2>
    <label class="field"><span>Rechnungsnummer *</span>
      <input id="invoiceNumberInput" required />
    </label>
    <label class="field"><span>Zahlungsstatus</span>
      <select id="paymentStatusSelect">
        <option value="offen">offen</option>
        <option value="bezahlt">bezahlt</option>
        <option value="storniert">storniert</option>
      </select>
    </label>
    <p><strong>Datum:</strong> ${doc.date}</p>

    <table class="invoice-table">
      <thead>
        <tr>
          <th>Position</th>
          <th>Menge</th>
          <th>Einzelpreis</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="invItems"></tbody>
    </table>

    <button id="addInvItem">+ Position hinzufügen</button>
    <hr>
    <p>Netto: ${doc.net.toFixed(2)} €</p>
    <p>MwSt (19%): ${doc.tax.toFixed(2)} €</p>
    <p><strong>Brutto: ${doc.total.toFixed(2)} €</strong></p>
  `;

  const numInput = document.getElementById("invoiceNumberInput");
  const paySel = document.getElementById("paymentStatusSelect");
  if(paySel){
    paySel.value = doc.paymentStatus || "offen";
    paySel.onchange = e=>{ doc.paymentStatus = e.target.value; };
  }

  if(numInput){
    numInput.value = doc.invoiceNumber;
    numInput.oninput = e=>{ doc.invoiceNumber = e.target.value.trim(); };
  }
const tbody = document.getElementById("invItems");
  doc.items.forEach((it,i)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input value="${it.text||""}"></td>
      <td><input type="number" step="1" value="${it.qty||1}"></td>
      <td><input type="number" step="0.01" value="${it.unitPrice||0}"></td>
      <td><button>x</button></td>
    `;
    const inputs = tr.querySelectorAll("input");
    inputs[0].oninput=e=>{it.text=e.target.value;};
    inputs[1].oninput=e=>{it.qty=e.target.value; redraw();};
    inputs[2].oninput=e=>{it.unitPrice=e.target.value; redraw();};
    tr.querySelector("button").onclick=()=>{doc.items.splice(i,1); redraw();};
    tbody.appendChild(tr);
  });

  document.getElementById("addInvItem").onclick=()=>{
    doc.items.push({text:"", qty:1, unitPrice:0});
    redraw();
  };
}
/* ===== Ende B2.2a ===== */


// ===== AKTIVER Editor-Switch (B2.x) =====
function renderEditor(doc){
  const template = getTemplate(doc.templateId);
  if(!template){
    toast("Vorlage nicht gefunden");
    return;
  }

  // 📄 Rechnung aus Betreuung → Anzeige
  if(template.id === "rechnung" && doc.sourceDocId){
    openInvoice(doc.id);
    return;
  }

  // 📄 Rechnung Editor (falls genutzt)
if(template.id === "rechnung"){
  renderInvoiceEditorB2(doc);
  return;
}

  // 🐶 Standard-Dokumente (z. B. Hundeannahme)
  try{
    if(typeof safeRenderEditor === 'function') safeRenderEditor(template, doc);
    else renderForm(doc);
  }catch(e){
    console.error('renderEditor failed', e);
    try{ toast('Editor-Fehler: '+(e?.message||e)); }catch(_){ }
  }
}

function renderInvoiceEditor(doc, template){
  const root = document.getElementById("formRoot");
  if(!root) return;

  root.innerHTML = "";

  const data = doc.fields || {};
  doc.fields = data;

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = "<h2>Rechnung</h2>";
  root.appendChild(card);

  template.fields.forEach(field=>{
    const wrap = document.createElement("label");
    wrap.className = "field";
    wrap.style.minWidth = "260px";

    wrap.innerHTML = `<span>${escapeHtml(field.label)}</span>`;

    let input;
    if(field.type === "select"){
      input = document.createElement("select");
      field.options.forEach(o=>{
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        input.appendChild(opt);
      });
      input.value = data[field.key] || field.options[0].value;
      input.onchange = ()=>{ data[field.key] = input.value; };
    } else {
      input = document.createElement("input");
      input.type = field.type || "text";
      input.value = data[field.key] || "";
      input.oninput = ()=>{ data[field.key] = input.value; };
    }

    wrap.appendChild(input);
    card.appendChild(wrap);
  });

  const price = document.createElement("div");
  price.className = "card";
  price.innerHTML = `
    <h2>Gesamtbetrag</h2>
    <strong id="invoiceTotal">
      ${doc.pricing?.total?.toFixed(2) || "0.00"} €
    </strong>
  `;
  root.appendChild(price);
}

function updatePriceBlock(){
  const el=document.getElementById("total-price");
  if(el) el.textContent="wird berechnet…";
}
// ===== Ende B1 =====


// ===== Phase C: Safe Editor Wrapper =====
function safeRenderEditor(template, doc){
  try{
    if(template && Array.isArray(template.sections)){
      renderSectionsEditor(template, doc);
    } else {
      renderForm(doc);
    }
  } catch(e){
    console.error("Editor-Fehler:", e);
    const root = document.getElementById("formRoot");
    if(root){
      root.innerHTML = "<p style='color:red'>Dieses Dokument kann derzeit nicht angezeigt werden.</p>";
    }
  }
}


/* ===== Rechnung: Cent-basierte Rechenlogik ===== */
function calculateInvoiceTotals(invoice){
  if(!invoice || invoice.type !== "rechnung") return invoice;
  let netto = 0;
  (invoice.positionen || []).forEach(pos => {
    const menge = Number(pos.menge || 0);
    const preis = Number(pos.einzelpreisCent || 0);
    netto += menge * preis;
  });
  const mwst = Math.round(netto * 0.19);
  const brutto = netto + mwst;
  invoice.summen = {
    nettoCent: netto,
    mwstCent: mwst,
    bruttoCent: brutto
  };
  return invoice;
}

function formatEuroFromCent(cent){
  const v = Number(cent||0) / 100;
  return v.toFixed(2).replace(".", ",") + " €";
}


// ===== Contract (Etappe 7B) =====
function getContractSignature(customerId, petId){
  const v = S.contract?.version || "";
  return (S.contractSignatures||[]).find(s=>s.customerId===customerId && s.petId===petId && s.contractVersion===v) || null;
}
function hasValidContract(customerId, petId){
  return !!getContractSignature(customerId, petId);
}
function contractBadge(customerId, petId){
  if(!customerId || !petId) return "";
  return hasValidContract(customerId, petId) ? " · Vertrag: 🟢" : " · Vertrag: 🔴";
}

function updateContractWarnBanner(doc){
  const box = document.getElementById("contractWarnBanner");
  if(!box) return;

  // Standard: aus
  box.style.display = "none";
  box.innerHTML = "";

  if(!doc) return;

  // nur bei Aufenthalten (hundeannahme)
  const isStay = (doc.templateId === "hundeannahme" || doc.templateName === "Hundeannahme" || doc.type === "stay");
  if(!isStay) return;

  const customerId = doc.customerId || "";
  const petId = doc.petId || "";
  if(!customerId || !petId) return;

  const valid = hasValidContract(customerId, petId);

  box.style.display = "flex";
  box.innerHTML = valid ? `
    <div>✅ <strong>Betreuungsvertrag gültig.</strong> Du kannst den Vertrag jederzeit als PDF speichern.</div>
    <div class="btnrow">
      <button class="btn" type="button" id="btnPdfContract">📄 PDF</button>
      <button class="btn ghost" type="button" id="btnGoContract">Vertrag ansehen</button>
    </div>
  ` : `
    <div>⚠️ <strong>Betreuungsvertrag fehlt oder ist veraltet.</strong> Bitte vor Beginn unterschreiben lassen.</div>
    <div class="btnrow">
      <button class="btn" type="button" id="btnGoContract">Zum Vertrag</button>
      <button class="btn ghost" type="button" id="btnPdfContract" disabled title="PDF erst nach gültiger Unterschrift verfügbar">📄 PDF</button>
    </div>
  `;

  const go = document.getElementById("btnGoContract");
  if(go){
    go.onclick = ()=>{ selectTab("contract"); window.scrollTo({top:0,behavior:"smooth"}); };
  }

  const pdf = document.getElementById("btnPdfContract");
  if(pdf && valid){
    pdf.onclick = ()=>{ openContractPdfWindow(customerId, petId); };
  }
}


function openContractPdfWindow(customerId, petId){
  ensureContractDefaults();
  const c = S.contract;
  const sig = getContractSignature(customerId, petId);
  if(!c || !sig){ alert("Für diese Auswahl liegt keine gültige Unterschrift vor."); return; }
  const customer = getCustomer(customerId) || {};
  const pet = getPet(petId) || {};
  const signedAt = new Date(sig.signedAt || new Date().toISOString()).toLocaleString("de-DE");

  const html = `<!doctype html>
  <html lang="de"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(c.title||"Betreuungsvertrag")} – PDF</title>
  <style>
    body{font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif; margin:24px; color:#111;}
    .head{display:flex; align-items:center; gap:14px; margin-bottom:14px;}
    .logo{width:64px; height:64px; object-fit:contain;}
    .meta{color:#444; font-size:13px;}
    .doc{margin-top:14px; line-height:1.45;}
    h1{font-size:18px; margin:0;}
    h2{font-size:15px; margin:18px 0 8px;}
    .sig{margin-top:22px; padding-top:12px; border-top:1px solid #ddd;}
    .sigrow{display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap;}
    .sigimg{width:320px; max-width:100%; border:1px solid #ddd; border-radius:10px; padding:6px;}
    .small{font-size:12px; color:#444;}
    @media print{ body{margin:10mm;} }
  </style>
  </head><body>
    <div class="head">
      <img class="logo" src="assets/logo.png" alt="Doggy Style"/>
      <div>
        <h1>${escapeHtml(c.title||"Betreuungsvertrag")}</h1>
        <div class="meta">${escapeHtml(c.provider||"Doggy Style Hundepension")} · Version ${escapeHtml(c.version||"v1.0")} · Gültig ab ${escapeHtml(formatDateDE(c.validFrom||"2025-12-27"))}</div>
        <div class="meta">Kunde: ${escapeHtml((customer.name||"")+" "+(customer.lastName||"")).trim() || escapeHtml(customer.email||"")} · Hund: ${escapeHtml(pet.name||"")}</div>
        <div class="meta">Adresse: ${escapeHtml(formatCustomerAddress(customer) || "—")}</div>
      </div>
    </div>

    <div class="doc">${c.text || DEFAULT_CONTRACT_TEXT}</div>

    <div class="sig">
      <h2>Digitale Unterschrift</h2>
      <div class="sigrow">
        <div>
          <div class="small">Unterschrieben am: <strong>${escapeHtml(signedAt)}</strong></div>
          <div class="small">Vertragsversion: <strong>${escapeHtml(sig.contractVersion)}</strong></div>
        </div>
        <img class="sigimg" src="${sig.signatureDataUrl}" alt="Unterschrift"/>
      </div>
      <p class="small">Hinweis: Speichern als PDF über „Drucken“ (Teilen → Drucken / als PDF sichern) je nach Gerät.</p>
    </div>

  </body></html>`;

  openHtmlInModal('Betreuungsvertrag (Vorschau)', html, 'Schließen mit ✕. Für PDF: Drucken/Speichern → „Als PDF“ → in Dateien ablegen.');
}

function renderContractPanel(){
  ensureContractDefaults();
  const t = $("#contractText");
  const titleEl = $("#contractTitle");
  const metaEl = $("#contractMeta");
  if(!t) return;

  const c = S.contract;
  titleEl.textContent = c.title || "Betreuungsvertrag";
  metaEl.textContent = `${c.provider || "Doggy Style Hundepension"} · Version ${c.version} · Gültig ab ${formatDateDE(c.validFrom||"2025-12-27")}`;
  t.innerHTML = c.text || DEFAULT_CONTRACT_TEXT;

  // Admin box
  const isAdmin = (CLOUD.role === "admin");
  const adminBox = $("#contractAdminBox");
  if(adminBox) adminBox.style.display = isAdmin ? "block" : "none";
  if(isAdmin){
    const edit = $("#contractEditText");
    if(edit && !edit.value) edit.value = c.text || DEFAULT_CONTRACT_TEXT;
    const btnReset = $("#contractResetEdit");
    if(btnReset) btnReset.onclick = ()=>{ if(edit) edit.value = c.text || DEFAULT_CONTRACT_TEXT; };
    const btnPub = $("#contractPublish");
    if(btnPub) btnPub.onclick = ()=>{
      if(!edit) return;
      const newText = String(edit.value||"").trim();
      if(newText.length < 200){ alert("Bitte einen vollständigen Vertragstext einfügen."); return; }
      // bump minor version: v1.0 -> v1.1
      const m = String(c.version||"v1.0").match(/^v(\d+)\.(\d+)$/);
      let major=1, minor=0;
      if(m){ major=parseInt(m[1],10); minor=parseInt(m[2],10); }
      minor += 1;
      c.version = `v${major}.${minor}`;
      c.text = newText;
      c.updatedAt = new Date().toISOString();
      S.contract = c;
      saveState();
      alert(`Neue Version veröffentlicht: ${c.version}. Kunden müssen neu unterschreiben.`);
      renderContractPanel();
    };
  }

  // customer/pet selects
  const cs = $("#contractCustomerSelect");
  const ps = $("#contractPetSelect");
  const customers = (S.customers||[]).slice().sort((a,b)=>String(a.lastName||"").localeCompare(String(b.lastName||""),"de"));
  cs.innerHTML = customers.map(x=>`<option value="${x.id}">${escapeHtml((x.lastName? x.lastName+', ':'') + (x.firstName||''))}</option>`).join("") || `<option value="">(keine Kunden)</option>`;

  function fillPets(){
    const cid = cs.value;
    const pets = (S.pets||[]).filter(p=>p.customerId===cid).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de"));
    ps.innerHTML = pets.map(p=>`<option value="${p.id}">${escapeHtml(p.name||"Hund")}</option>`).join("") || `<option value="">(keine Hunde)</option>`;
    updateSignedInfo();
  }

  cs.onchange = fillPets;
  fillPets();

  // Wenn ein Hund gewählt wird, Kunde automatisch übernehmen (falls verknüpft)
  ps.onchange = ()=>{
    const selectedPetId = ps.value;
    const pet = getPet(selectedPetId);
    const targetCustomerId = pet ? (pet.customerId || "") : "";
    if(targetCustomerId && cs.value !== targetCustomerId){
      cs.value = targetCustomerId;
      fillPets();
      ps.value = selectedPetId; // Auswahl beibehalten
    }
    updateSignedInfo();
  };


  // signature pad
  initContractSignaturePad();
  $("#contractSigClear").onclick = ()=>{ clearContractSig(); };
  const pdfBtn = document.getElementById("contractPdfBtn");
  if(pdfBtn){
    pdfBtn.onclick = ()=>{
      const customerId = cs.value;
      const petId = ps.value;
      if(!customerId || !petId){ alert("Bitte Kunde und Hund auswählen."); return; }
      const s = getContractSignature(customerId, petId);
      if(!s){ alert("Für diese Auswahl liegt noch keine gültige Unterschrift vor."); return; }
      openContractPdfWindow(customerId, petId);
    };
  }

  $("#contractSignBtn").onclick = ()=>{
    const customerId = cs.value;
    const petId = ps.value;
    if(!customerId || !petId){ alert("Bitte Kunde und Hund auswählen."); return; }
    const chk = $("#contractAcceptChk");
    if(!chk.checked){ alert("Bitte zuerst bestätigen, dass du den Vertrag gelesen und akzeptiert hast."); return; }
    const dataUrl = getContractSigData();
    if(!dataUrl){ alert("Bitte unterschreiben (Unterschriftsfeld)."); return; }

    // Save signature
    const sig = {
      id: uid(),
      customerId, petId,
      contractVersion: S.contract.version,
      signedAt: new Date().toISOString(),
      signatureDataUrl: dataUrl
    };

    // Replace existing for this combo/version
    S.contractSignatures = (S.contractSignatures||[]).filter(s=>!(s.customerId===customerId && s.petId===petId && s.contractVersion===sig.contractVersion));
    S.contractSignatures.push(sig);
    saveState();
    clearContractSig();
    chk.checked = false;
    updateSignedInfo();
    $("#contractStatusBanner").textContent = "✅ Vertrag gespeichert.";
    setTimeout(()=>{ const b=$("#contractStatusBanner"); if(b) b.textContent=""; }, 1500);
    // refresh lists where badges appear
    renderDogs();
  };

  function updateSignedInfo(){
    const customerId = cs.value;
    const petId = ps.value;
    const info = $("#contractSignedInfo");
    const s = getContractSignature(customerId, petId);
    if(!info) return;
    if(s){
      info.innerHTML = `🟢 Gültig unterschrieben am ${new Date(s.signedAt).toLocaleString("de-DE")} (Version ${escapeHtml(s.contractVersion)})`;
    }else{
      info.innerHTML = `🔴 Noch keine gültige Unterschrift für Version ${escapeHtml(S.contract.version)}.`;
    }
  }
}

// --- Signature Pad (inline) ---
let _contractSig = {canvas:null, ctx:null, drawing:false, hasInk:false, last:null};

// Öffnet den Betreuungsvertrag direkt aus einem Aufenthalt heraus.
// Verknüpft automatisch Kunde + Hund anhand der Aufenthaltsauswahl.
function openContractFromStay(doc){
  if(!doc){ alert("Kein Aufenthalt."); return; }

  // In der App ist doc.dogId i.d.R. die Legacy-Dog-ID (aus der Hundeauswahl im Editor).
  const legacyDogId = doc.dogId || "";
  if(!legacyDogId){
    alert("Bitte zuerst einen Hund auswählen und speichern (oder zumindest im Formular auswählen).");
    return;
  }

  // Mapping Legacy-Dog -> Pet/Customer (neue Datenstruktur)
  const petObj = getPetByDogId(legacyDogId) || getPet(legacyDogId); // fallback falls dogId schon petId ist
  const customerObj = getCustomerByDogId(legacyDogId) || (petObj ? getCustomer(petObj.customerId) : null);

  const petId = petObj ? petObj.id : "";
  const customerId = customerObj ? customerObj.id : (petObj && petObj.customerId ? petObj.customerId : (doc.customerId || ""));

  if(!petId){
    alert("Zu diesem Hund ist kein interner Hunde-Datensatz (Pets) verknüpft. Bitte im Bereich Hunde/Kunden den Hund einem Kunden zuordnen.");
    return;
  }
  if(!customerId){
    alert("Zu diesem Hund ist kein Kunde verknüpft. Bitte im Bereich Hunde/Kunden den Hund einem Kunden zuordnen.");
    return;
  }

  // Merken am Dokument (hilft für spätere Auswertungen)
  doc.meta = doc.meta || {};
  doc.meta.contractCustomerId = customerId;
  doc.meta.contractPetId = petId;
  dirty = true;
  saveState();

  // Öffnen & vorauswählen
  selectTab("contract");
  renderContractPanel();

  const cs = document.getElementById("contractCustomerSelect");
  const ps = document.getElementById("contractPetSelect");

  if(cs){
    cs.value = customerId;
    // trigger onchange to fill pets list
    if(typeof cs.onchange === "function") cs.onchange();
  }
  if(ps){
    ps.value = petId;
    if(typeof ps.onchange === "function") ps.onchange();
  }

  updateSignedInfo();

  // UI polish: acceptance unchecked (owner should tick)
  const chk = document.getElementById("contractAcceptChk");
  if(chk) chk.checked = false;
}

function initContractSignaturePad(){
  const canvas = document.getElementById("contractSig");
  if(!canvas) return;
  if(_contractSig.canvas === canvas) return;
  _contractSig.canvas = canvas;
  _contractSig.ctx = canvas.getContext("2d");
  clearContractSig();

  const getPos = (e)=>{
    const rect = canvas.getBoundingClientRect();
    const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return {x:(pt.clientX-rect.left)*(canvas.width/rect.width), y:(pt.clientY-rect.top)*(canvas.height/rect.height)};
  };

  const start = (e)=>{
    e.preventDefault();
    _contractSig.drawing=true;
    _contractSig.last=getPos(e);
  };
  const move = (e)=>{
    if(!_contractSig.drawing) return;
    e.preventDefault();
    const p=getPos(e);
    const ctx=_contractSig.ctx;
    ctx.strokeStyle="rgba(255,255,255,0.92)";
    ctx.lineWidth=3;
    ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(_contractSig.last.x,_contractSig.last.y);
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
    _contractSig.last=p;
    _contractSig.hasInk=true;
  };
  const end = (e)=>{
    if(!_contractSig.drawing) return;
    e.preventDefault();
    _contractSig.drawing=false;
  };

  canvas.addEventListener("pointerdown", start, {passive:false});
  canvas.addEventListener("pointermove", move, {passive:false});
  canvas.addEventListener("pointerup", end, {passive:false});
  canvas.addEventListener("pointercancel", end, {passive:false});
  canvas.addEventListener("touchstart", start, {passive:false});
  canvas.addEventListener("touchmove", move, {passive:false});
  canvas.addEventListener("touchend", end, {passive:false});
}

function clearContractSig(){
  if(!_contractSig.canvas || !_contractSig.ctx) return;
  const c=_contractSig.canvas, ctx=_contractSig.ctx;
  ctx.clearRect(0,0,c.width,c.height);
  // subtle grid
  ctx.fillStyle="rgba(0,0,0,0.18)";
  ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle="rgba(255,255,255,0.10)";
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(20, c.height-28);
  ctx.lineTo(c.width-20, c.height-28);
  ctx.stroke();
  _contractSig.hasInk=false;
}

function getContractSigData(){
  if(!_contractSig.canvas || !_contractSig.hasInk) return null;
  return _contractSig.canvas.toDataURL("image/png");
}

// ==== Arbeitsblätter (Etappe 9) ====
let _wfSig = { canvas:null, ctx:null, isDown:false, hasInk:false };

function wfTodayKey(){
  return formatYMD(new Date());
}
function wfUserLabel(){
  const u = (CLOUD.user && CLOUD.user.email) ? CLOUD.user.email : "unbekannt";
  return u;
}
function wfNewId(){ return "wf_"+uid(); }

function initWfSignaturePad(canvas, clearBtn){
  _wfSig.canvas = canvas;
  _wfSig.ctx = canvas.getContext("2d");
  _wfSig.isDown = false;
  _wfSig.hasInk = false;

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,.92)";
    ctx.fillStyle = "rgba(0,0,0,0)";
  }
  resize();
  window.addEventListener("resize", resize);

  function pos(e){
    const r = canvas.getBoundingClientRect();
    if(e.touches && e.touches[0]){
      return {x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top};
    }
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  }
  function start(e){
    e.preventDefault();
    _wfSig.isDown = true;
    const p = pos(e);
    _wfSig.ctx.beginPath();
    _wfSig.ctx.moveTo(p.x, p.y);
  }
  function move(e){
    if(!_wfSig.isDown) return;
    e.preventDefault();
    const p = pos(e);
    _wfSig.ctx.lineTo(p.x, p.y);
    _wfSig.ctx.stroke();
    _wfSig.hasInk = true;
  }
  function end(e){
    if(!_wfSig.isDown) return;
    e.preventDefault();
    _wfSig.isDown = false;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  canvas.addEventListener("touchstart", start, {passive:false});
  canvas.addEventListener("touchmove", move, {passive:false});
  window.addEventListener("touchend", end, {passive:false});

  if(clearBtn){
    clearBtn.addEventListener("click", ()=>{
      const r = canvas.getBoundingClientRect();
      _wfSig.ctx.clearRect(0,0,r.width,r.height);
      _wfSig.hasInk = false;
    });
  }
}
function wfSigDataUrl(){
  if(!_wfSig.canvas || !_wfSig.hasInk) return null;
  return _wfSig.canvas.toDataURL("image/png");
}

function wfArchiveAdd(entry){
  S.worklogs.unshift(entry);
  cloudSchedulePush();
}

function wfOpenPdf(html){
  openHtmlInModal('Dokument (Vorschau)', html, 'Schließen mit ✕. Für PDF: Drucken/Speichern → „Als PDF“ → in Dateien ablegen.');
}

function wfPdfTemplate(title, bodyHtml){
  const css = `
    <style>
      @page{ size:A4; margin:16mm; }
      body{ font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif; color:#111; }
      h1{ font-size:18px; margin:0 0 8px; }
      .meta{ font-size:12px; color:#333; margin-bottom:10px; }
      .box{ border:1px solid #bbb; padding:10px; border-radius:10px; margin:10px 0; }
      .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
      .k{ font-size:12px; color:#444; }
      .v{ font-size:13px; font-weight:600; }
      .sig img{ width: 220px; height:auto; border:1px solid #999; border-radius:8px; background:#fff; }
      .muted{ color:#666; font-size:12px; }
      table{ width:100%; border-collapse:collapse; }
      td,th{ border:1px solid #ccc; padding:6px; font-size:12px; text-align:left; }
    </style>
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${css}</head><body>${bodyHtml}</body></html>`;
}

function renderWorkformsPanel(){
  const host = document.getElementById("workformsView");
  if(!host) return;

  // bind buttons once
  const b1 = document.getElementById("wfBtnHygiene");
  const b2 = document.getElementById("wfBtnShift");
  const b3 = document.getElementById("wfBtnIncident");
  const b4 = document.getElementById("wfBtnArchive");
  const b5 = document.getElementById("wfBtnTodayPrint");

  if(b1 && !b1._bound){ b1._bound=true; b1.addEventListener("click", ()=>wfShowHygiene()); }
  if(b2 && !b2._bound){ b2._bound=true; b2.addEventListener("click", ()=>wfShowShift()); }
  if(b3 && !b3._bound){ b3._bound=true; b3.addEventListener("click", ()=>wfShowIncident()); }
  if(b4 && !b4._bound){ b4._bound=true; b4.addEventListener("click", ()=>wfShowArchive()); }
  if(b5 && !b5._bound){ b5._bound=true; b5.addEventListener("click", ()=>wfTodayPrint()); }

  // default view
  if(!host.dataset.view){
    wfShowArchive(true);
  }
}

function wfShowHygiene(){
  const host = document.getElementById("workformsView");
  host.dataset.view="hygiene";
  const today = wfTodayKey();
  host.innerHTML = `
    <div class="wf-form">
      <h3>Hygiene-Nachweis (${today})</h3>
      <div class="muted">Täglich · Unterschrift Pflicht · Abschluss = Archivierung</div>
      <div class="wf-row" style="margin-top:10px">
        <label class="field"><input type="checkbox" id="wfHygClean"> Reinigung durchgeführt</label>
        <label class="field"><input type="checkbox" id="wfHygDis"> Desinfektion durchgeführt</label>
        <label class="field"><input type="checkbox" id="wfHygSep"> Trennung eingehalten</label>
      </div>
      <div style="margin-top:10px">
        <label class="field" style="display:block">
          Besonderheiten / Abweichungen (optional)
          <textarea id="wfHygNotes" rows="3" style="width:100%"></textarea>
        </label>
      </div>
      <div style="margin-top:10px">
        <div class="muted">Unterschrift</div>
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
          <canvas id="wfSigCanvas" style="width:320px;max-width:100%;height:120px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18)"></canvas>
          <button class="btn" id="wfSigClear" type="button">Löschen</button>
        </div>
      </div>
      <div class="wf-actions">
        <button class="btn primary" id="wfHygClose" type="button">Abschließen & bestätigen</button>
        <button class="btn" id="wfHygPdf" type="button">PDF</button>
      </div>
      <div class="muted" style="margin-top:8px">Verantwortlich: ${wfUserLabel()}</div>
    </div>
  `;
  initWfSignaturePad(document.getElementById("wfSigCanvas"), document.getElementById("wfSigClear"));

  document.getElementById("wfHygClose").onclick = ()=> wfCloseHygiene();
  document.getElementById("wfHygPdf").onclick = ()=> wfPreviewPdf("hygiene");
}

function wfCloseHygiene(){
  const clean = document.getElementById("wfHygClean").checked;
  const dis = document.getElementById("wfHygDis").checked;
  const sep = document.getElementById("wfHygSep").checked;
  const notes = (document.getElementById("wfHygNotes").value||"").trim();
  const sig = wfSigDataUrl();
  if(!sig){ alert("Bitte unterschreiben."); return; }
  if(!clean || !dis || !sep){
    if(!confirm("Nicht alle Punkte sind abgehakt. Trotzdem abschließen?")) return;
  }
  const entry = {
    id: wfNewId(),
    type: "hygiene",
    date: wfTodayKey(),
    createdAt: new Date().toISOString(),
    createdBy: wfUserLabel(),
    data: { clean, dis, sep, notes },
    signature: sig
  };
  wfArchiveAdd(entry);
  alert("Hygiene-Nachweis archiviert.");
  wfShowArchive();
}

function wfShowShift(){
  const host = document.getElementById("workformsView");
  host.dataset.view="shift";
  const today = wfTodayKey();
  host.innerHTML = `
    <div class="wf-form">
      <h3>Übergabe / Schichtblatt (${today})</h3>
      <div class="muted">Unterschrift Pflicht · Abschluss = Archivierung</div>
      <div style="margin-top:10px">
        <label class="field" style="display:block">
          Heute aufgefallen
          <textarea id="wfShiftToday" rows="4" style="width:100%"></textarea>
        </label>
      </div>
      <div style="margin-top:10px">
        <label class="field" style="display:block">
          Morgen beachten
          <textarea id="wfShiftTomorrow" rows="4" style="width:100%"></textarea>
        </label>
      </div>
      <div style="margin-top:10px">
        <div class="muted">Unterschrift</div>
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
          <canvas id="wfSigCanvas" style="width:320px;max-width:100%;height:120px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18)"></canvas>
          <button class="btn" id="wfSigClear" type="button">Löschen</button>
        </div>
      </div>
      <div class="wf-actions">
        <button class="btn primary" id="wfShiftClose" type="button">Abschließen & bestätigen</button>
        <button class="btn" id="wfShiftPdf" type="button">PDF</button>
      </div>
      <div class="muted" style="margin-top:8px">Verantwortlich: ${wfUserLabel()}</div>
    </div>
  `;
  initWfSignaturePad(document.getElementById("wfSigCanvas"), document.getElementById("wfSigClear"));
  document.getElementById("wfShiftClose").onclick = ()=> wfCloseShift();
  document.getElementById("wfShiftPdf").onclick = ()=> wfPreviewPdf("shift");
}

function wfCloseShift(){
  const todayText = (document.getElementById("wfShiftToday").value||"").trim();
  const tomorrowText = (document.getElementById("wfShiftTomorrow").value||"").trim();
  const sig = wfSigDataUrl();
  if(!sig){ alert("Bitte unterschreiben."); return; }
  const entry = {
    id: wfNewId(),
    type: "shift",
    date: wfTodayKey(),
    createdAt: new Date().toISOString(),
    createdBy: wfUserLabel(),
    data: { today: todayText, tomorrow: tomorrowText },
    signature: sig
  };
  wfArchiveAdd(entry);
  alert("Schichtblatt archiviert.");
  wfShowArchive();
}

function wfShowIncident(){
  const host = document.getElementById("workformsView");
  host.dataset.view="incident";
  const now = new Date();
  host.innerHTML = `
    <div class="wf-form">
      <h3>Ereignisprotokoll</h3>
      <div class="muted">Nur bei Bedarf · Unterschrift Pflicht · Abschluss = Archivierung</div>

      <div class="wf-row" style="margin-top:10px">
        <label class="field">Hund
          <select id="wfIncDog" style="width:100%"></select>
        </label>
        <label class="field">Halter
          <input id="wfIncOwner" type="text" style="width:100%" placeholder="automatisch (wenn bekannt)"/>
        </label>
      </div>

      <div class="wf-row" style="margin-top:10px">
        <label class="field">Art des Ereignisses
          <select id="wfIncType" style="width:100%">
            <option value="verletzung">Verletzung</option>
            <option value="erkrankung">Erkrankung</option>
            <option value="auseinandersetzung">Auseinandersetzung</option>
            <option value="entlaufen">Entlaufen / Ausbruch</option>
            <option value="tierarzt">Tierarzt / Behandlung</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
        </label>
        <label class="field">Datum/Uhrzeit
          <input id="wfIncWhen" type="text" style="width:100%" value="${now.toLocaleString("de-DE")}"/>
        </label>
      </div>

      <div style="margin-top:10px">
        <label class="field" style="display:block">
          Beschreibung des Vorfalls
          <textarea id="wfIncDesc" rows="4" style="width:100%"></textarea>
        </label>
      </div>

      <div style="margin-top:10px">
        <label class="field" style="display:block">
          Getroffene Maßnahmen
          <textarea id="wfIncActions" rows="4" style="width:100%"></textarea>
        </label>
      </div>

      <div style="margin-top:10px">
        <label class="field" style="display:block">
          Besonderheiten (optional)
          <textarea id="wfIncNotes" rows="3" style="width:100%"></textarea>
        </label>
      </div>

      <div style="margin-top:10px">
        <div class="muted">Unterschrift</div>
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
          <canvas id="wfSigCanvas" style="width:320px;max-width:100%;height:120px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18)"></canvas>
          <button class="btn" id="wfSigClear" type="button">Löschen</button>
        </div>
      </div>

      <div class="wf-actions">
        <button class="btn primary" id="wfIncClose" type="button">Abschließen & bestätigen</button>
        <button class="btn" id="wfIncPdf" type="button">PDF</button>
      </div>
      <div class="muted" style="margin-top:8px">Verantwortlich: ${wfUserLabel()}</div>
    </div>
  `;

  // populate dog list from state
  const sel = document.getElementById("wfIncDog");
  sel.innerHTML = `<option value="">— auswählen —</option>` + (S.dogs||[]).map(d=>`<option value="${d.id}">${escapeHtml(d.name||"Hund")}</option>`).join("");
  sel.onchange = ()=>{
    const dog = (S.dogs||[]).find(d=>d.id===sel.value);
    const owner = dog ? (getCustomer(dog.customerId)?.name || "") : "";
    document.getElementById("wfIncOwner").value = owner;
  };

  initWfSignaturePad(document.getElementById("wfSigCanvas"), document.getElementById("wfSigClear"));
  document.getElementById("wfIncClose").onclick = ()=> wfCloseIncident();
  document.getElementById("wfIncPdf").onclick = ()=> wfPreviewPdf("incident");
}

function wfCloseIncident(){
  const dogId = document.getElementById("wfIncDog").value || null;
  const owner = (document.getElementById("wfIncOwner").value||"").trim();
  const incType = document.getElementById("wfIncType").value;
  const when = (document.getElementById("wfIncWhen").value||"").trim();
  const desc = (document.getElementById("wfIncDesc").value||"").trim();
  const actions = (document.getElementById("wfIncActions").value||"").trim();
  const notes = (document.getElementById("wfIncNotes").value||"").trim();
  const sig = wfSigDataUrl();
  if(!sig){ alert("Bitte unterschreiben."); return; }
  if(!desc){ alert("Bitte eine kurze Beschreibung eintragen."); return; }

  const entry = {
    id: wfNewId(),
    type: "incident",
    date: wfTodayKey(),
    createdAt: new Date().toISOString(),
    createdBy: wfUserLabel(),
    data: { dogId, owner, incType, when, desc, actions, notes },
    signature: sig
  };
  wfArchiveAdd(entry);
  alert("Ereignisprotokoll archiviert.");
  wfShowArchive();
}

function wfShowArchive(silent){
  const host = document.getElementById("workformsView");
  host.dataset.view="archive";
  const items = S.worklogs || [];
  const rows = items.map(it=>{
    const title = it.type==="hygiene" ? "Hygiene-Nachweis" : (it.type==="shift" ? "Schichtblatt" : "Ereignisprotokoll");
    const date = it.date || "";
    const by = it.createdBy || "";
    return `
      <div class="wf-archive-item">
        <div>
          <div><strong>${title}</strong></div>
          <div class="meta">${escapeHtml(date)} · ${escapeHtml(by)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" type="button" data-wf-open="${it.id}">Anzeigen</button>
          <button class="btn" type="button" data-wf-pdf="${it.id}">PDF</button>
        </div>
      </div>
    `;
  }).join("");

  host.innerHTML = `
    <div class="wf-form">
      <h3>Archiv Arbeitsblätter</h3>
      <div class="muted">Abgeschlossene Nachweise – unveränderbar</div>
      <div style="margin-top:10px">${rows || '<div class="muted">Noch keine Einträge.</div>'}</div>
    </div>
  `;

  host.querySelectorAll("[data-wf-open]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-wf-open");
      wfShowEntry(id);
    });
  });
  host.querySelectorAll("[data-wf-pdf]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-wf-pdf");
      wfEntryPdf(id);
    });
  });

  if(!silent){
    // nothing
  }
}

function wfShowEntry(id){
  const it = (S.worklogs||[]).find(x=>x.id===id);
  if(!it) return;
  const host = document.getElementById("workformsView");
  const title = it.type==="hygiene" ? "Hygiene-Nachweis" : (it.type==="shift" ? "Übergabe / Schichtblatt" : "Ereignisprotokoll");
  const meta = `${it.date||""} · ${it.createdBy||""}`;
  let body = "";
  if(it.type==="hygiene"){
    body = `
      <div class="box">
        <div class="grid">
          <div><div class="k">Reinigung</div><div class="v">${it.data.clean ? "Ja" : "Nein"}</div></div>
          <div><div class="k">Desinfektion</div><div class="v">${it.data.dis ? "Ja" : "Nein"}</div></div>
          <div><div class="k">Trennung eingehalten</div><div class="v">${it.data.sep ? "Ja" : "Nein"}</div></div>
        </div>
        <div class="muted" style="margin-top:8px">Besonderheiten: ${escapeHtml(it.data.notes||"—")}</div>
      </div>
    `;
  } else if(it.type==="shift"){
    body = `
      <div class="box">
        <div class="k">Heute aufgefallen</div>
        <div class="v">${escapeHtml(it.data.today||"—")}</div>
      </div>
      <div class="box">
        <div class="k">Morgen beachten</div>
        <div class="v">${escapeHtml(it.data.tomorrow||"—")}</div>
      </div>
    `;
  } else {
    body = `
      <div class="box">
        <div class="grid">
          <div><div class="k">Hund</div><div class="v">${escapeHtml((getPet(it.data.dogId||"")?.name)||"—")}</div></div>
          <div><div class="k">Halter</div><div class="v">${escapeHtml(it.data.owner||"—")}</div></div>
        </div>
        <div style="margin-top:8px" class="muted">Art: ${escapeHtml(it.data.incType||"")} · Zeitpunkt: ${escapeHtml(it.data.when||"")}</div>
      </div>
      <div class="box">
        <div class="k">Beschreibung</div>
        <div class="v">${escapeHtml(it.data.desc||"")}</div>
      </div>
      <div class="box">
        <div class="k">Maßnahmen</div>
        <div class="v">${escapeHtml(it.data.actions||"")}</div>
      </div>
      <div class="box">
        <div class="k">Besonderheiten</div>
        <div class="v">${escapeHtml(it.data.notes||"—")}</div>
      </div>
    `;
  }
  host.innerHTML = `
    <div class="wf-form">
      <h3>${title}</h3>
      <div class="muted">${escapeHtml(meta)}</div>
      ${body}
      <div class="box sig">
        <div class="k">Unterschrift</div>
        <img src="${it.signature}" alt="Unterschrift"/>
      </div>
      <div class="wf-actions">
        <button class="btn" type="button" id="wfBack">Zurück</button>
        <button class="btn" type="button" id="wfPdf">PDF</button>
      </div>
    </div>
  `;
  document.getElementById("wfBack").onclick = ()=> wfShowArchive(true);
  document.getElementById("wfPdf").onclick = ()=> wfEntryPdf(id);
}

function wfEntryPdf(id){
  const it = (S.worklogs||[]).find(x=>x.id===id);
  if(!it) return;
  const title = it.type==="hygiene" ? "Hygiene-Nachweis" : (it.type==="shift" ? "Übergabe / Schichtblatt" : "Ereignisprotokoll");
  const body = `
    <h1>${title}</h1>
    <div class="meta">Datum: ${escapeHtml(it.date||"")} · Verantwortlich: ${escapeHtml(it.createdBy||"")}<br/>Erstellt: ${escapeHtml(it.createdAt||"")}</div>
    ${(() => {
      if(it.type==="hygiene"){
        return `<div class="box">
          <table>
            <tr><th>Punkt</th><th>Status</th></tr>
            <tr><td>Reinigung durchgeführt</td><td>${it.data.clean?"Ja":"Nein"}</td></tr>
            <tr><td>Desinfektion durchgeführt</td><td>${it.data.dis?"Ja":"Nein"}</td></tr>
            <tr><td>Trennung eingehalten</td><td>${it.data.sep?"Ja":"Nein"}</td></tr>
          </table>
          <div class="muted" style="margin-top:8px">Besonderheiten/Abweichungen: ${escapeHtml(it.data.notes||"—")}</div>
        </div>`;
      }
      if(it.type==="shift"){
        return `<div class="box"><div class="k">Heute aufgefallen</div><div class="v">${escapeHtml(it.data.today||"—")}</div></div>
                <div class="box"><div class="k">Morgen beachten</div><div class="v">${escapeHtml(it.data.tomorrow||"—")}</div></div>`;
      }
      return `<div class="box">
        <div class="grid">
          <div><div class="k">Hund</div><div class="v">${escapeHtml((getPet(it.data.dogId||"")?.name)||"—")}</div></div>
          <div><div class="k">Halter</div><div class="v">${escapeHtml(it.data.owner||"—")}</div></div>
        </div>
        <div class="muted" style="margin-top:8px">Art: ${escapeHtml(it.data.incType||"")} · Zeitpunkt: ${escapeHtml(it.data.when||"")}</div>
      </div>
      <div class="box"><div class="k">Beschreibung</div><div class="v">${escapeHtml(it.data.desc||"")}</div></div>
      <div class="box"><div class="k">Maßnahmen</div><div class="v">${escapeHtml(it.data.actions||"")}</div></div>
      <div class="box"><div class="k">Besonderheiten</div><div class="v">${escapeHtml(it.data.notes||"—")}</div></div>`;
    })()}
    <div class="box sig">
      <div class="k">Unterschrift</div>
      <img src="${it.signature}" alt="Unterschrift"/>
    </div>
    <div class="muted">Dokument ist nach Abschluss unveränderbar (Archiv).</div>
  `;
  wfOpenPdf(wfPdfTemplate(title, body));
}

function wfPreviewPdf(kind){
  // preview current unsaved form
  const title = kind==="hygiene" ? "Hygiene-Nachweis" : (kind==="shift" ? "Übergabe / Schichtblatt" : "Ereignisprotokoll");
  const sig = wfSigDataUrl();
  const baseMeta = `<div class="meta">Datum: ${escapeHtml(wfTodayKey())} · Verantwortlich: ${escapeHtml(wfUserLabel())}</div>`;
  let body = `<h1>${title}</h1>${baseMeta}<div class="muted">Vorschau (noch nicht archiviert)</div>`;
  if(kind==="hygiene"){
    const clean=document.getElementById("wfHygClean")?.checked;
    const dis=document.getElementById("wfHygDis")?.checked;
    const sep=document.getElementById("wfHygSep")?.checked;
    const notes=(document.getElementById("wfHygNotes")?.value||"").trim();
    body += `<div class="box"><table>
      <tr><th>Punkt</th><th>Status</th></tr>
      <tr><td>Reinigung durchgeführt</td><td>${clean?"Ja":"Nein"}</td></tr>
      <tr><td>Desinfektion durchgeführt</td><td>${dis?"Ja":"Nein"}</td></tr>
      <tr><td>Trennung eingehalten</td><td>${sep?"Ja":"Nein"}</td></tr>
    </table><div class="muted" style="margin-top:8px">Besonderheiten/Abweichungen: ${escapeHtml(notes||"—")}</div></div>`;
  } else if(kind==="shift"){
    const t=(document.getElementById("wfShiftToday")?.value||"").trim();
    const m=(document.getElementById("wfShiftTomorrow")?.value||"").trim();
    body += `<div class="box"><div class="k">Heute aufgefallen</div><div class="v">${escapeHtml(t||"—")}</div></div>
             <div class="box"><div class="k">Morgen beachten</div><div class="v">${escapeHtml(m||"—")}</div></div>`;
  } else {
    const dogId=document.getElementById("wfIncDog")?.value||"";
    const owner=(document.getElementById("wfIncOwner")?.value||"").trim();
    const incType=document.getElementById("wfIncType")?.value||"";
    const when=(document.getElementById("wfIncWhen")?.value||"").trim();
    const desc=(document.getElementById("wfIncDesc")?.value||"").trim();
    const actions=(document.getElementById("wfIncActions")?.value||"").trim();
    const notes=(document.getElementById("wfIncNotes")?.value||"").trim();
    body += `<div class="box"><div class="grid">
      <div><div class="k">Hund</div><div class="v">${escapeHtml((getPet(dogId)?.name)||"—")}</div></div>
      <div><div class="k">Halter</div><div class="v">${escapeHtml(owner||"—")}</div></div>
    </div><div class="muted" style="margin-top:8px">Art: ${escapeHtml(incType)} · Zeitpunkt: ${escapeHtml(when)}</div></div>
    <div class="box"><div class="k">Beschreibung</div><div class="v">${escapeHtml(desc||"—")}</div></div>
    <div class="box"><div class="k">Maßnahmen</div><div class="v">${escapeHtml(actions||"—")}</div></div>
    <div class="box"><div class="k">Besonderheiten</div><div class="v">${escapeHtml(notes||"—")}</div></div>`;
  }
  body += `<div class="box sig"><div class="k">Unterschrift</div>${sig?`<img src="${sig}" alt="Unterschrift"/>`:`<div class="muted">— noch keine Unterschrift —</div>`}</div>`;
  wfOpenPdf(wfPdfTemplate(title, body));
}

function wfTodayPrint(){
  // simple: reuse existing today dashboard pdf builder if present; otherwise fallback
  // build a minimal overview from stays
  const today = wfTodayKey();
  const staysToday = (S.stays||[]).filter(s=>{
    const from = s.fromDate || s.startDate || s.betreuungVon || "";
    const to = s.toDate || s.endDate || s.betreuungBis || "";
    if(!from || !to) return false;
    return (today >= from && today <= to);
  });
  const rows = staysToday.map(s=>{
    const dog = getPet(s.dogId||"") || {};
    const cust = getCustomer(s.customerId||dog.customerId||"") || {};
    return `<tr><td>${escapeHtml(dog.name||"")}</td><td>${escapeHtml(cust.name||"")}</td><td>${escapeHtml(s.type||s.betreuungsart||"")}</td></tr>`;
  }).join("");
  const body = `
    <h1>Heute – Übersicht (${escapeHtml(today)})</h1>
    <div class="meta">Erstellt: ${new Date().toLocaleString("de-DE")} · Verantwortlich: ${escapeHtml(wfUserLabel())}</div>
    <div class="box">
      <table>
        <tr><th>Hund</th><th>Halter</th><th>Betreuung</th></tr>
        ${rows || '<tr><td colspan="3">Keine Aufenthalte gefunden.</td></tr>'}
      </table>
    </div>
    <div class="box">
      <h2 style="font-size:14px;margin:0 0 6px">Übergabe / Schichtblatt</h2>
      <div class="muted">Hinweis: Schichtblatt bitte in der App ausfüllen & abschließen, um es zu archivieren.</div>
      <div style="margin-top:8px;border:1px dashed #aaa;padding:10px;border-radius:10px">
        <div class="k">Heute aufgefallen</div><div style="height:60px"></div>
        <div class="k">Morgen beachten</div><div style="height:60px"></div>
        <div class="k">Unterschrift</div><div style="height:60px"></div>
      </div>
    </div>
  `;
  wfOpenPdf(wfPdfTemplate("Heute drucken", body));
}
try{
  const bb=document.getElementById('buildBadge');
  if(bb){
    const v = new URLSearchParams(location.search).get('v');
    bb.textContent = `Build: ${APP_BUILD}${v ? ` · ?v=${v}` : ''}`;
  }
}catch(e){}
// Export helper for inline HTML onclick handlers
try{ window.createStay = createStay; }catch(e){}

// V10FIX6_INVOICE_DEFAULTS
function applyInvoiceDateDefaults(form){
  try{
    const today = new Date().toISOString().slice(0,10);
    const von = form.querySelector('[name="von"]');
    const bis = form.querySelector('[name="bis"]');
    const rechnungsdatum = form.querySelector('[name="rechnungsdatum"]');
    if(von && !von.value) von.value = today;
    if(bis && bis.value === "" && rechnungsdatum && von){
      rechnungsdatum.value = von.value;
    }
  }catch(e){}
}


/* ===== Auswertungen (Variante 1: Tabs Allgemein / Rechnungen) ===== */
(function(){
  try {
  const S = window.state || {};

  function _qs(id){ return document.getElementById(id); }
  function _fmtEUR(v){
    try{
      const n = Number(v||0);
      return n.toLocaleString('de-DE',{minimumFractionDigits:2, maximumFractionDigits:2}) + " €";
    }catch(_){ return (v||0) + " €"; }
  }
  function _toDateOnlyISO(d){
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }
  function _parseISODate(s){
    if(!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function _startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function _endOfDay(d){ const x = new Date(d); x.setHours(23,59,59,999); return x; }
  function _getInvoices(){
    try{
      if(typeof state !== "undefined" && Array.isArray(S.invoices)) return S.invoices;
    }catch(_){}
    return [];
  }
  function _getInvTotal(inv){
    if(!inv) return 0;
    if(inv.totals && inv.totals.total != null) return Number(inv.totals.total)||0;
    if(inv.total != null) return Number(inv.total)||0;
    if(inv.amount != null) return Number(inv.amount)||0;
    return 0;
  }
  function _normStatus(s){
    const v = String(s||"").toLowerCase();
    if(v==="paid" || v==="bezahlt") return "paid";
    if(v==="canceled" || v==="cancelled" || v==="storniert") return "canceled";
    if(v==="open" || v==="offen") return "open";
    if(v==="draft") return "open"; // draft behandeln wir wie offen
    return v || "open";
  }
  function _invDate(inv){
    const d = _parseISODate(inv.invoiceDate || inv.date || inv.createdAt || inv.updatedAt);
    return d || new Date(0);
  }
  function _invNr(inv){ return inv.invoiceNumber || inv.nr || inv.number || ""; }
  function _invKundeHund(inv){
    // best effort: Kunde / Hund aus Feldern oder IDs
    let kunde = inv.customerName || inv.kundeName || "";
    let hund = inv.petName || inv.hundName || "";
    try{
      // falls helper existieren
      if(!kunde && typeof getCustomerById==="function" && inv.customerId){
        const c = getCustomerById(inv.customerId);
        if(c) kunde = c.name || c.title || "";
      }
      if(!hund && typeof getPetById==="function" && inv.petId){
        const p = getPetById(inv.petId);
        if(p) hund = p.name || p.title || "";
      }
    }catch(_){}
    const a = (kunde||"").trim();
    const b = (hund||"").trim();
    if(a && b) return `${a} · ${b}`;
    if(a) return a;
    if(b) return b;
    return (inv.customerId||"") + (inv.petId?(" · "+inv.petId):"");
  }

  // State für Filter
  const ANA = {
    range: "month",
    from: null,
    to: null,
    status: "all"
  };

  function _applyPresetRange(kind){
    const now = new Date();
    let from, to;
    if(kind==="today"){
      from = _startOfDay(now); to = _endOfDay(now);
    }else if(kind==="week"){
      const day = now.getDay(); // 0=So
      const diff = (day===0?6:day-1); // Mo=0
      from = _startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate()-diff));
      to = _endOfDay(new Date(from.getFullYear(), from.getMonth(), from.getDate()+6));
    }else if(kind==="month"){
      from = _startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      to = _endOfDay(new Date(now.getFullYear(), now.getMonth()+1, 0));
    }else if(kind==="lastmonth"){
      from = _startOfDay(new Date(now.getFullYear(), now.getMonth()-1, 1));
      to = _endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    }else if(kind==="year"){
      from = _startOfDay(new Date(now.getFullYear(), 0, 1));
      to = _endOfDay(new Date(now.getFullYear(), 11, 31));
    }else{
      return;
    }
    ANA.range = kind;
    ANA.from = from;
    ANA.to = to;
    const fromEl = _qs("anaInvFrom");
    const toEl = _qs("anaInvTo");
    if(fromEl) fromEl.value = _toDateOnlyISO(from);
    if(toEl) toEl.value = _toDateOnlyISO(to);
  }

  function _filterInvoices(){
    const all = _getInvoices();
    const from = ANA.from ? _startOfDay(ANA.from) : null;
    const to = ANA.to ? _endOfDay(ANA.to) : null;
    return all.filter(inv=>{
      const d = _invDate(inv);
      if(from && d < from) return false;
      if(to && d > to) return false;
      if(ANA.status && ANA.status!=="all"){
        return _normStatus(inv.status) === ANA.status;
      }
      return true;
    });
  }

  function renderInvoiceAnalytics(){
    const invs = _filterInvoices();
    let paidSum=0, openSum=0, canceledSum=0;
    let paidCnt=0, openCnt=0, canceledCnt=0;
    invs.forEach(inv=>{
      const st = _normStatus(inv.status);
      const t = _getInvTotal(inv);
      if(st==="paid"){ paidSum += t; paidCnt++; }
      else if(st==="canceled"){ canceledSum += t; canceledCnt++; }
      else { openSum += t; openCnt++; }
    });

    const paidSumEl=_qs("anaInvPaidSum");
    const openSumEl=_qs("anaInvOpenSum");
    const cancSumEl=_qs("anaInvCanceledSum");
    const totCntEl=_qs("anaInvTotalCount");
    const paidCntEl=_qs("anaInvPaidCount");
    const openCntEl=_qs("anaInvOpenCount");
    const cancCntEl=_qs("anaInvCanceledCount");
    const rangeEl=_qs("anaInvRangeLabel");

    if(paidSumEl) paidSumEl.textContent = _fmtEUR(paidSum);
    if(openSumEl) openSumEl.textContent = _fmtEUR(openSum);
    if(cancSumEl) cancSumEl.textContent = _fmtEUR(canceledSum);
    if(totCntEl) totCntEl.textContent = String(invs.length);
    if(paidCntEl) paidCntEl.textContent = `${paidCnt} Belege`;
    if(openCntEl) openCntEl.textContent = `${openCnt} Belege`;
    if(cancCntEl) cancCntEl.textContent = `${canceledCnt} Belege`;

    if(rangeEl){
      const f = ANA.from ? _toDateOnlyISO(ANA.from) : "–";
      const t = ANA.to ? _toDateOnlyISO(ANA.to) : "–";
      rangeEl.textContent = `Zeitraum: ${f} bis ${t} (Rechnungsdatum)`;
    }

    // Tabelle
    const tbody = _qs("anaInvTable")?.querySelector("tbody");
    if(tbody){
      const rows = invs
        .slice()
        .sort((a,b)=>_invDate(a)-_invDate(b))
        .map(inv=>{
          const d = _invDate(inv);
          const dateStr = d.toLocaleDateString('de-DE');
          const nr = _invNr(inv);
          const kh = _invKundeHund(inv);
          const amt = _fmtEUR(_getInvTotal(inv));
          const st = _normStatus(inv.status);
          const stLabel = (st==="paid"?"paid":(st==="canceled"?"canceled":"open"));
          const openFn = (typeof openInvoice==="function") ? `openInvoice('${inv.id}')` : '';
          return `<tr style="cursor:${openFn?'pointer':'default'}" ${openFn?`onclick="${openFn}"`:''}>
            <td>${dateStr}</td>
            <td>${nr}</td>
            <td>${kh}</td>
            <td style="text-align:right;">${amt}</td>
            <td>${stLabel}</td>
          </tr>`;
        }).join("");
      tbody.innerHTML = rows || `<tr><td colspan="5" class="muted">Keine Rechnungen im Zeitraum.</td></tr>`;
    }
  }

  function generateInvoicePdfReport(){
    const invsAll = _getInvoices();
    const from = ANA.from ? _startOfDay(ANA.from) : null;
    const to = ANA.to ? _endOfDay(ANA.to) : null;

    // Für PDF-Report: immer alle Status im Zeitraum (unabhängig vom Tabellen-Statusfilter)
    const invs = invsAll.filter(inv=>{
      const d = _invDate(inv);
      if(from && d < from) return false;
      if(to && d > to) return false;
      return true;
    }).slice().sort((a,b)=>_invDate(a)-_invDate(b));

    const sums = {paid:{sum:0,cnt:0}, open:{sum:0,cnt:0}, canceled:{sum:0,cnt:0}};
    invs.forEach(inv=>{
      const st=_normStatus(inv.status);
      const t=_getInvTotal(inv);
      if(st==="paid"){ sums.paid.sum+=t; sums.paid.cnt++; }
      else if(st==="canceled"){ sums.canceled.sum+=t; sums.canceled.cnt++; }
      else { sums.open.sum+=t; sums.open.cnt++; }
    });

    const f = ANA.from ? _toDateOnlyISO(ANA.from) : "";
    const t = ANA.to ? _toDateOnlyISO(ANA.to) : "";
    const created = new Date();
    const createdStr = created.toLocaleString('de-DE');

    function section(title, rowsHtml){
      if(!rowsHtml) return "";
      return `<h3 style="margin:18px 0 6px 0;">${title}</h3>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #bbb; padding:6px 4px;">Datum</th>
              <th style="text-align:left; border-bottom:1px solid #bbb; padding:6px 4px;">Nr.</th>
              <th style="text-align:left; border-bottom:1px solid #bbb; padding:6px 4px;">Kunde</th>
              <th style="text-align:left; border-bottom:1px solid #bbb; padding:6px 4px;">Hund</th>
              <th style="text-align:left; border-bottom:1px solid #bbb; padding:6px 4px;">Leistungszeitraum</th>
              <th style="text-align:right; border-bottom:1px solid #bbb; padding:6px 4px;">Betrag</th>
              <th style="text-align:left; border-bottom:1px solid #bbb; padding:6px 4px;">Beschreibung</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    }

    function makeRows(filterStatus){
      const sel = invs.filter(inv=>_normStatus(inv.status)===filterStatus);
      if(!sel.length) return "";
      return sel.map(inv=>{
        const d=_invDate(inv).toLocaleDateString('de-DE');
        const nr=_invNr(inv);
        let kunde="", hund="";
        try{
          const kh=_invKundeHund(inv);
          if(kh.includes("·")){
            const parts=kh.split("·").map(x=>x.trim());
            kunde=parts[0]||""; hund=parts[1]||"";
          }else{
            kunde=kh; hund="";
          }
        }catch(_){}
        const lz = (inv.periodFrom && inv.periodTo) ? `${inv.periodFrom} – ${inv.periodTo}` : (inv.period || inv.leistungszeitraum || "");
        const amt=_fmtEUR(_getInvTotal(inv));
        const desc = (inv.description || inv.note || inv.desc || "").toString().replace(/\n/g," ");
        return `<tr>
          <td style="border-bottom:1px solid #e5e5e5; padding:6px 4px;">${d}</td>
          <td style="border-bottom:1px solid #e5e5e5; padding:6px 4px;">${nr}</td>
          <td style="border-bottom:1px solid #e5e5e5; padding:6px 4px;">${kunde}</td>
          <td style="border-bottom:1px solid #e5e5e5; padding:6px 4px;">${hund}</td>
          <td style="border-bottom:1px solid #e5e5e5; padding:6px 4px;">${lz}</td>
          <td style="border-bottom:1px solid #e5e5e5; padding:6px 4px; text-align:right;">${amt}</td>
          <td style="border-bottom:1px solid #e5e5e5; padding:6px 4px;">${desc}</td>
        </tr>`;
      }).join("");
    }

    const html = `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"/>
<title>Rechnungsübersicht</title>
<style>
  @page { margin: 18mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color:#111; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; }
  .logo { height: 50px; }
  .kpis { margin-top:12px; display:flex; gap:14px; flex-wrap:wrap; }
  .kpi { border:1px solid #ddd; border-radius:10px; padding:10px 12px; min-width:180px; }
  .kpi .t { font-size:12px; color:#555; }
  .kpi .v { font-size:18px; font-weight:700; margin-top:4px; }
  .muted { color:#666; font-size:12px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin:0;">Rechnungsübersicht</h1>
      <div class="muted">Zeitraum: ${f} bis ${t} (Rechnungsdatum)</div>
      <div class="muted">Erstellt am: ${createdStr}</div>
      <div class="muted">Betrieb: Doggy Style Hundepension</div>
    </div>
    <div style="text-align:right;">
      <img class="logo" src="assets/logo.png" alt="Logo"/>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="t">Umsatz bezahlt</div><div class="v">${_fmtEUR(sums.paid.sum)}</div><div class="muted">${sums.paid.cnt} Belege</div></div>
    <div class="kpi"><div class="t">Offen</div><div class="v">${_fmtEUR(sums.open.sum)}</div><div class="muted">${sums.open.cnt} Belege</div></div>
    <div class="kpi"><div class="t">Storniert</div><div class="v">${_fmtEUR(sums.canceled.sum)}</div><div class="muted">${sums.canceled.cnt} Belege</div></div>
    <div class="kpi"><div class="t">Anzahl gesamt</div><div class="v">${invs.length}</div><div class="muted">&nbsp;</div></div>
  </div>

  ${section("Bezahlt", makeRows("paid"))}
  ${section("Offen", makeRows("open"))}
  ${section("Storniert", makeRows("canceled"))}

  <script>
    window.onload = () => { setTimeout(()=>{ window.print(); }, 250); };
  </script>
</body></html>`;

    const w = window.open("", "_blank");
    if(!w){ alert("Popup blockiert – bitte Popups erlauben."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function showAnaSubTab(which){
    const gen = _qs("analyticsGeneral");
    const inv = _qs("analyticsInvoices");
    const bGen = _qs("anaTabGeneral");
    const bInv = _qs("anaTabInvoices");
    if(gen) gen.style.display = (which==="general") ? "" : "none";
    if(inv) inv.style.display = (which==="invoices") ? "" : "none";
    // simple active style
    if(bGen) bGen.style.opacity = (which==="general") ? "1" : "0.6";
    if(bInv) bInv.style.opacity = (which==="invoices") ? "1" : "0.6";
    if(which==="invoices"){
      // default range
      if(!ANA.from || !ANA.to) _applyPresetRange("month");
      renderInvoiceAnalytics();
    }
  }

  function initAnalyticsInvoiceUI(){
    const bGen=_qs("anaTabGeneral");
    const bInv=_qs("anaTabInvoices");
    if(bGen && !bGen.__bound){
      bGen.__bound=true;
      bGen.addEventListener("click", ()=>showAnaSubTab("general"));
    }
    if(bInv && !bInv.__bound){
      bInv.__bound=true;
      bInv.addEventListener("click", ()=>showAnaSubTab("invoices"));
    }

    document.querySelectorAll('[data-ana-range]').forEach(btn=>{
      if(btn.__bound) return;
      btn.__bound=true;
      btn.addEventListener('click', ()=>{
        _applyPresetRange(btn.getAttribute('data-ana-range'));
        renderInvoiceAnalytics();
      });
    });

    document.querySelectorAll('[data-ana-status]').forEach(btn=>{
      if(btn.__bound) return;
      btn.__bound=true;
      btn.addEventListener('click', ()=>{
        ANA.status = btn.getAttribute('data-ana-status') || "all";
        renderInvoiceAnalytics();
      });
    });

    const applyBtn=_qs("anaInvApply");
    if(applyBtn && !applyBtn.__bound){
      applyBtn.__bound=true;
      applyBtn.addEventListener('click', ()=>{
        const f=_qs("anaInvFrom")?.value;
        const t=_qs("anaInvTo")?.value;
        ANA.from = f ? new Date(f+"T00:00:00") : null;
        ANA.to = t ? new Date(t+"T00:00:00") : null;
        ANA.range = "custom";
        renderInvoiceAnalytics();
      });
    }

    const pdfBtn=_qs("anaInvPdf");
    if(pdfBtn && !pdfBtn.__bound){
      pdfBtn.__bound=true;
      pdfBtn.addEventListener('click', generateInvoicePdfReport);
    }
  }

  // Falls bisher nicht vorhanden: Render-Funktion für Auswertungen
  if(typeof window.renderAnalyticsPanel !== "function"){
    window.renderAnalyticsPanel = function(){
      initAnalyticsInvoiceUI();
      // Standard: Allgemein
      showAnaSubTab("general");
    };
  } else {
    // existiert bereits – wir hängen unsere UI trotzdem an
    const _old = window.renderAnalyticsPanel;
    window.renderAnalyticsPanel = function(){
      try{ _old(); }catch(_){}
      initAnalyticsInvoiceUI();
      showAnaSubTab("general");
    };
  }
})();

// =========================
// Kapazität – Settings Bindings (Phase A, stabiler ANA016-Stand)
// =========================
function initCapacitySettingsBindings(){
  try{
    const card = document.getElementById("capacityCard");
    if(!card || card.dataset.bound) return;
    card.dataset.bound = "1";

    const elTotal = document.getElementById("capTotalDefault");
    const elOver  = document.getElementById("capOvernightMax");
    const elSun   = document.getElementById("capSundayTotal");
    const elNoAD  = document.getElementById("capSundayNoArrDep");
    const btnSave = document.getElementById("btnCapacitySave");

    // Defaults (falls noch nichts gesetzt)
    const caps = (S.capacities = S.capacities || {});
    caps.default = caps.default || {};
    if(caps.default["Tagesbetreuung"] == null) caps.default["Tagesbetreuung"] = (CAPACITY["Tagesbetreuung"] || 13);
    if(caps.default["Urlaubsbetreuung"] == null) caps.default["Urlaubsbetreuung"] = (CAPACITY["Urlaubsbetreuung"] || 10);
    if(caps.sundayTotal == null) caps.sundayTotal = 10;
    if(caps.sundayNoArrivalDeparture == null) caps.sundayNoArrivalDeparture = true;

    // UI füllen
    if(elTotal) elTotal.value = String(caps.default["Tagesbetreuung"] ?? "");
    if(elOver)  elOver.value  = String(caps.default["Urlaubsbetreuung"] ?? "");
    if(elSun)   elSun.value   = String(caps.sundayTotal ?? "");
    if(elNoAD)  elNoAD.checked = !!caps.sundayNoArrivalDeparture;

    const save = ()=>{
      try{
        const vTotal = Number(elTotal && elTotal.value);
        const vOver  = Number(elOver && elOver.value);
        const vSun   = Number(elSun && elSun.value);

        if(Number.isFinite(vTotal) && vTotal >= 0) caps.default["Tagesbetreuung"] = Math.round(vTotal);
        if(Number.isFinite(vOver)  && vOver  >= 0) caps.default["Urlaubsbetreuung"] = Math.round(vOver);
        if(Number.isFinite(vSun)   && vSun   >= 0) caps.sundayTotal = Math.round(vSun);

        caps.sundayNoArrivalDeparture = !!(elNoAD && elNoAD.checked);

        saveState();
        try{ showMiniToast("Kapazität gespeichert."); }catch(_){}
      }catch(_e){
        try{ showMiniToast("Kapazität konnte nicht gespeichert werden."); }catch(__){}
      }
    };

    if(btnSave && !btnSave.dataset.bound){
      btnSave.dataset.bound = "1";
      btnSave.onclick = save;
    }
  }catch(_){}
}

// Init-Profi-Settings erweitern, ohne bestehende Logik zu verändern
(function(){
  try{
    const _old = initProfiSettingsBindings;
    if(typeof _old === "function"){
      initProfiSettingsBindings = function(){
        try{ _old(); }catch(_){}
        try{ initCapacitySettingsBindings(); }catch(_){}
      };
    }
  }catch(_){}
})();



  // Analytics render hook (V2)
  if (panelId === "analytics" && typeof window.renderAnalyticsPanel === "function") {
    try { window.renderAnalyticsPanel(); } catch(e) { console.warn("renderAnalyticsPanel failed", e); }
  }

// =========================
// PHASE_B_ANALYTICS (ANA016) – Dashboard + Belegung (Hook-Fix)
// =========================
(function(){
  let __anaPhaseBHooked = false;

  function pad2(n){ return String(n).padStart(2,"0"); }
  function iso(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }

  function dateRange(fromISO, toISO){
    const res=[];
    try{
      let d=new Date(fromISO+"T00:00:00");
      const end=new Date(toISO+"T00:00:00");
      while(d<=end){
        res.push(d.toISOString().slice(0,10));
        d.setDate(d.getDate()+1);
      }
    }catch(_){}
    return res;
  }

  function getStaysArray(){
    // Support multiple historical shapes
    return (window.state && (S.stays || S.aufenthalte || S.Aufenthalte || [])) || [];
  }

  function isOvernightStay(s){
    const t = String(s.type || s.betreuungsart || s.art || "").toLowerCase();
    return t.includes("urlaub") || t.includes("übernacht") || t.includes("overnight");
  }

  function stayDates(s){
    const from = (s.fromDate||s.startDate||s.von||s.checkIn||s.betreuungVon||"").slice(0,10);
    const to   = (s.toDate||s.endDate||s.bis||s.checkOut||s.betreuungBis||"").slice(0,10);
    return {from,to};
  }

  function countDogsByDay(dateISO){
    let total=0, overnight=0;
    const arr=getStaysArray();
    arr.forEach(s=>{
      const {from,to}=stayDates(s);
      if(!from||!to) return;
      // day counts if dateISO in [from, to)  (nights model)
      if(dateISO>=from && dateISO<to){
        total++;
        if(isOvernightStay(s)) overnight++;
      }
    });
    return {total, overnight};
  }

  function readCapacitySettings(){
    // Prefer settings stored by Settings panel. Fall back to defaults.
    const cap = (window.state && (S.capacity || S.capacities || S.settings?.capacity || {})) || {};
    const totalDefault = Number(cap.totalDefault ?? cap.total ?? cap.totalMoSa ?? 13) || 13;
    const overnightMax = Number(cap.overnightMax ?? cap.overnight ?? 10) || 10;
    const sundayTotal  = Number(cap.sundayTotal ?? cap.sunday?.total ?? 10) || 10;
    const sundayNoAD   = (cap.sundayNoArrivalDeparture ?? cap.sunday?.noArrivalDeparture);
    return { totalDefault, overnightMax, sundayTotal, sundayNoAD: !!sundayNoAD };
  }

  function capacityForDay(dateISO){
    const { totalDefault, sundayTotal } = readCapacitySettings();
    try{
      const d=new Date(dateISO+"T00:00:00");
      if(d.getDay()===0) return sundayTotal; // Sunday
    }catch(_){}
    return totalDefault;
  }

  function ensureDefaultDates(){
    const preset = document.getElementById("anaRangePreset");
    const fromEl = document.getElementById("anaFrom");
    const toEl   = document.getElementById("anaTo");
    if(!preset || !fromEl || !toEl) return;

    if(fromEl.value && toEl.value) return;

    const now = new Date();
    let from, to;
    const val = preset.value || "month";
    if(val === "last30"){
      to = now;
      from = new Date(now); from.setDate(from.getDate()-29);
    } else if(val === "year"){
      from = new Date(now.getFullYear(),0,1);
      to   = new Date(now.getFullYear(),11,31);
    } else {
      from = startOfMonth(now);
      to   = endOfMonth(now);
    }
    fromEl.value = iso(from);
    toEl.value   = iso(to);
  }

  function renderDashboard(fromISO, toISO){
    const days=dateRange(fromISO,toISO);
    let ist=0, max=0, peak=0, peakON=0;
    days.forEach(d=>{
      const c=capacityForDay(d);
      const cnt=countDogsByDay(d);
      ist += cnt.total;
      max += c;
      peak = Math.max(peak, cnt.total);
      peakON = Math.max(peakON, cnt.overnight);
    });
    const { overnightMax } = readCapacitySettings();
    const pct = max>0 ? Math.round((ist/max)*100) : 0;

    const el=document.getElementById("anaViewDashboard");
    if(!el) return;

    // Build marker (visual)
    el.setAttribute("data-build","ANA020");

    const warn = peakON > overnightMax ? `<div class="muted" style="margin-top:6px;">Hinweis: Overnight-Peak ${peakON} über Limit ${overnightMax}.</div>` : "";

    el.innerHTML = `
      <div class="row" style="gap:10px; flex-wrap:wrap;">
        <div class="card" style="min-width:220px;">
          <div class="muted">Auslastung (Hundetage)</div>
          <div style="font-size:34px; font-weight:800; margin-top:4px;">${pct}%</div>
          <div class="muted">${ist} / ${max}</div>
        </div>
        <div class="card" style="min-width:200px;">
          <div class="muted">Spitzentag gesamt</div>
          <div style="font-size:34px; font-weight:800; margin-top:4px;">${peak}</div>
        </div>
        <div class="card" style="min-width:220px;">
          <div class="muted">Spitzentag Übernachtung</div>
          <div style="font-size:34px; font-weight:800; margin-top:4px;">${peakON} / ${overnightMax}</div>
          ${warn}
        </div>
      </div>`;
  }

  function renderOccupancy(fromISO, toISO){
    const days=dateRange(fromISO,toISO);
    let sumPct=0;
    days.forEach(d=>{
      const c=capacityForDay(d);
      const cnt=countDogsByDay(d);
      sumPct += c>0 ? (cnt.total/c) : 0;
    });
    const avg = days.length ? Math.round((sumPct/days.length)*100) : 0;
    const level = avg<40 ? "ruhig" : (avg<70 ? "normal" : "hoch");

    const el=document.getElementById("anaViewOccupancy");
    if(!el) return;
    el.innerHTML = `
      <div class="row" style="gap:10px; flex-wrap:wrap;">
        <div class="card" style="min-width:240px;">
          <div class="muted">Ø Auslastung pro Tag</div>
          <div style="font-size:34px; font-weight:800; margin-top:4px;">${avg}%</div>
          <div class="muted">Einstufung: <strong>${level}</strong></div>
        </div>
      </div>`;
  }

  window.renderAnalyticsPanel = function(){
    ensureDefaultDates();
    const from = document.getElementById("anaFrom")?.value;
    const to   = document.getElementById("anaTo")?.value;
    if(!from||!to) return;
    renderDashboard(from,to);
    renderOccupancy(from,to);
  };

  function hook(){
    if(__anaPhaseBHooked) return;
    const btn = document.getElementById("anaApply");
    const preset = document.getElementById("anaRangePreset");
    const dashBtn = document.getElementById("anaViewBtnDashboard");
    const occBtn  = document.getElementById("anaViewBtnOccupancy");

    if(!btn || !preset) return;

    btn.addEventListener("click", ()=>{
      ensureDefaultDates();
      setTimeout(()=>{ try{ window.renderAnalyticsPanel(); }catch(e){ console.warn(e);} }, 0);
    });

    preset.addEventListener("change", ()=>{
      // clear dates to recalc then render
      const fromEl=document.getElementById("anaFrom");
      const toEl=document.getElementById("anaTo");
      if(fromEl) fromEl.value="";
      if(toEl) toEl.value="";
      ensureDefaultDates();
      setTimeout(()=>{ try{ window.renderAnalyticsPanel(); }catch(e){ console.warn(e);} }, 0);
    });

    if(dashBtn) dashBtn.addEventListener("click", ()=>setTimeout(()=>window.renderAnalyticsPanel(), 0));
    if(occBtn)  occBtn.addEventListener("click", ()=>setTimeout(()=>window.renderAnalyticsPanel(), 0));

    // initial render once when analytics is first visible
    setTimeout(()=>{ try{ window.renderAnalyticsPanel(); }catch(e){ console.warn(e);} }, 250);

    __anaPhaseBHooked = true;
  }

  // Poll until Analytics elements exist (since panels are swapped dynamically)
  const t = setInterval(()=>{
    try{
      if(document.getElementById("anaApply") && document.getElementById("anaViewDashboard")){
        hook();
        clearInterval(t);
      }
    }catch(_){}
  }, 300);
  } catch(e){ console.warn('PHASE_B_ANALYTICS failed', e); }
})();;

// ANA020 marker
window.__ANA_BUILD_MARKER = "ANA020_PHASEB";
