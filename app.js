window.addEventListener("error",(e)=>{console.error("APP_ERROR",e.error||e.message);});
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const LS_KEY="ds_workspace_v1";
const CAPACITY = {
  Tagesbetreuung: 13,
  Urlaubsbetreuung: 10
};

/* ===== Weg 2B: Cloud Sync + Login (Firebase) =====
   - Wenn window.firebaseConfig gesetzt ist: Login anzeigen + State aus Cloud laden/syncen
   - Wenn nicht: App läuft wie bisher rein lokal/offline
*/
const CLOUD = {
  enabled: false,
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
  cloudLastSeenAt: 0,
  cloudPending: false,
  cloudLastOkAt: 0,
  cloudLastError: ""
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

function updateSyncUI(){
  const pill = document.getElementById('syncStatus');
  const userEl = document.getElementById('syncUser');
  const details = document.getElementById('syncDetails');
  if(userEl){
    if(CLOUD.enabled && CLOUD.user){
      userEl.style.display = 'inline-flex';
      userEl.textContent = (CLOUD.user.email || 'eingeloggt');
    } else {
      userEl.style.display = 'none';
      userEl.textContent = '';
    }
  }

  const localLine = `Lokal gespeichert: ${fmtDT(SYNC.localSavedAt)}`;

  let pillText = 'Offline';
  let cloudLine = 'Cloud: aus';
  if(CLOUD.enabled){
    if(!CLOUD.user){
      pillText = 'Cloud: Login nötig';
      cloudLine = 'Cloud: nicht angemeldet';
    } else if(SYNC.cloudLastError){
      pillText = 'Cloud: Fehler';
      cloudLine = `Cloud Fehler: ${SYNC.cloudLastError}`;
    } else if(SYNC.cloudPending){
      pillText = 'Cloud: synchronisiert…';
      cloudLine = `Cloud Sync: läuft (letztes OK ${fmtDT(SYNC.cloudLastOkAt)})`;
    } else {
      pillText = `Cloud: OK (${fmtDT(SYNC.cloudLastOkAt)})`;
      cloudLine = `Cloud zuletzt OK: ${fmtDT(SYNC.cloudLastOkAt)} · Letzter Stand vom Server: ${fmtDT(SYNC.cloudLastSeenAt)}`;
    }
  }

  if(pill) pill.textContent = `${pillText} · ${fmtDT(SYNC.localSavedAt)}`;
  if(details) details.textContent = `${localLine}\n${cloudLine}`;
}

function cloudIsEnabled(){
  return !!(window.firebaseConfig && window.firebase && window.firebase.initializeApp);
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
  if(!cloudIsEnabled()) return false;
  try{
    CLOUD.enabled = true;
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
  // Weg 2 (sauber): EIN gemeinsamer Workspace-State pro Org.
  // Keine user/{uid}/meta Dokumente mehr nötig.
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
    try{ pendingName = (localStorage.getItem('ds_pending_name')||'').trim(); }catch(_){ }
    if(pendingName){ try{ localStorage.removeItem('ds_pending_name'); }catch(_){ } }
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

  // Weg 2 (sauber): Wenn noch kein Workspace-State existiert, initialisieren wir ihn automatisch
  // mit dem aktuellen lokalen Stand. Dadurch ist kein manuelles Anlegen von Dokumenten nötig.
  if(!snap.exists){
    const stamp = Date.now();
    try{ state._cloudUpdatedAt = stamp; }catch(_){/* ignore */}
    await ref.set({
      payload: state,
      updatedAt: stamp,
      updatedBy: (CLOUD.user?.email || CLOUD.user?.uid || "init")
    }, {merge: true});
    CLOUD._lastRemoteStamp = stamp;
    SYNC.cloudLastSeenAt = stamp;
    SYNC.cloudLastOkAt = stamp;
    SYNC.cloudLastError = "";
    updateSyncUI();
    return state;
  }

  const data = snap.data();
  if(!data || !data.payload) return null;
  CLOUD._lastRemoteStamp = Number(data.updatedAt || 0);
  SYNC.cloudLastSeenAt = CLOUD._lastRemoteStamp;
  updateSyncUI();
  return data.payload;
}

function cloudSchedulePush(){
  if(!CLOUD.enabled) return;
  clearTimeout(CLOUD._pushTimer);
  SYNC.cloudPending = true;
  updateSyncUI();
  CLOUD._pushTimer = setTimeout(()=>cloudPushNow().catch(console.error), 700);
}

async function cloudPushNow(){
  if(!CLOUD.enabled) return;
  if(!CLOUD.user) return;
  SYNC.cloudPending = true;
  updateSyncUI();
  const stamp = Date.now();
  // Marker im State, damit wir Remote-Updates sauber vergleichen können
  try{ state._cloudUpdatedAt = stamp; }catch(_){/* ignore */}
  // last write wins (v1). Später: echtes Merge pro Objekt.
  try{
    const ref = cloudStateRef();
  if(!ref) return;
  await ref.set({
      payload: state,
      updatedAt: stamp,
      updatedBy: CLOUD.user.email || CLOUD.user.uid
    }, {merge: true});
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
      dogId: state.dogs?.[0]?.id || "",
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
    state.docs = state.docs || [];
    state.docs.unshift(docObj);
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
let state=loadState();const COMPANY = {
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
};;if(state.nextInvoiceNumber == null){
  state.nextInvoiceNumber = 1;
}renderDashboard();renderRecent();
function formatDateDE(dateStr){
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE");
}

function showPanel(id){
  document.querySelectorAll(".panel").forEach(p=>{
    p.classList.toggle("is-active", p.id === id);
  });

  if(id === "invoices"){
    renderInvoiceList();
  }
  if(id === "contract"){
    renderContractPanel();
  }
  if(id === "workforms"){
    renderWorkformsPanel();
  }

  if(id === "calendar"){
    renderCalendarPanel();
  }
}

// ==== Dashboard / Schnellaktionen helpers ====
function selectTab(tabId){
  // activate tab button
  $$(".tab").forEach(b=>b.classList.toggle("is-active", b.dataset.tab===tabId));
  showPanel(tabId);
}

function createStay(){
  // Neuer Aufenthalt (Hundeannahme)
  const sel = document.getElementById("templateSelect");
  const btn = document.getElementById("btnNewDoc");
  if(sel){
    // try to select hundeannahme template
    const opt = Array.from(sel.options).find(o => (o.value||"").toLowerCase().includes("hundeannahme") || (o.textContent||"").toLowerCase().includes("hundeannahme"));
    if(opt) sel.value = opt.value;
  }
  if(btn) btn.click();
  else selectTab("documents");
}

function openDogs(){ selectTab("dogs"); }
function openCustomers(){ selectTab("dogs"); } // Kunden sind im Hunde/Kunden Bereich
function openInvoices(){ selectTab("invoices"); }
function openWorkforms(){ selectTab("workforms"); }

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

  const dayMax = CAPACITY.Tagesbetreuung;
  const boardMax = CAPACITY.Urlaubsbetreuung;

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
  const endingToday = state.docs.filter(doc=>doc.saved && doc.meta?.bis===today).length;
  if(endingToday>0) warnings.unshift(`${endingToday} Aufenthalt(e) enden heute`);

  const warnBox = document.getElementById("dashboardWarnings");
  if(warnBox){
    if(warnings.length){
      warnBox.style.display = "block";
      warnBox.innerHTML = `<h3>Hinweise</h3><div class="warning-list">${warnings.slice(0,6).map(w=>`<div>⚠️ ${escapeHtml(w)}</div>`).join("")}</div>`;
    }else{
      warnBox.style.display = "none";
      warnBox.innerHTML = "";
    }
  }
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
  return d.toISOString().slice(0,10);
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
  const todayIso = new Date().toISOString().slice(0,10);

  for(let i=0;i<42;i++){
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = dateISO(d);
    const inMonth = (d.getMonth() === CAL.month);
    const dayNum = d.getDate();

    const board = countForDay('Urlaubsbetreuung', iso);
    const dayc = countForDay('Tagesbetreuung', iso);
    const over = (board > CAPACITY.Urlaubsbetreuung) || (dayc > CAPACITY.Tagesbetreuung);

    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (inMonth ? '' : ' is-other') + (iso===todayIso ? ' is-today':'') + (iso===CAL.selectedDay ? ' is-selected':'') + (over ? ' is-over':'');
    cell.dataset.day = iso;

    const f = getCalFilters();
    const freeU = CAPACITY.Urlaubsbetreuung - board;
    const freeT = CAPACITY.Tagesbetreuung - dayc;
    const uPct = clamp((board / CAPACITY.Urlaubsbetreuung) * 100, 0, 100);
    const tPct = clamp((dayc / CAPACITY.Tagesbetreuung) * 100, 0, 100);

    const badges = [];
    const bars = [];
    const freeParts = [];
    if(f.urlaub){
      badges.push(`<div class="cal-badge" title="Urlaubsbetreuung"><span>🏡 <strong>${board}</strong></span><span class="muted">/ ${CAPACITY.Urlaubsbetreuung}</span></div>`);
      bars.push(`<div class="cal-bar" title="Urlaub: ${board}/${CAPACITY.Urlaubsbetreuung}"><div class="fill" style="width:${uPct}%;"></div></div>`);
      freeParts.push(`🏡 ${Math.max(0, freeU)}`);
    }
    if(f.tages){
      badges.push(`<div class="cal-badge" title="Tagesbetreuung"><span>🐕 <strong>${dayc}</strong></span><span class="muted">/ ${CAPACITY.Tagesbetreuung}</span></div>`);
      bars.push(`<div class="cal-bar" title="Tages: ${dayc}/${CAPACITY.Tagesbetreuung}"><div class="fill" style="width:${tPct}%;"></div></div>`);
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
  const freeU = CAPACITY.Urlaubsbetreuung - board;
  const freeT = CAPACITY.Tagesbetreuung - dayc;
  const parts = [];
  const freeParts = [];
  if(f.urlaub){ parts.push(`🏡 ${board}/${CAPACITY.Urlaubsbetreuung}`); freeParts.push(`🏡 ${Math.max(0, freeU)} frei`); }
  if(f.tages){ parts.push(`🐕 ${dayc}/${CAPACITY.Tagesbetreuung}`); freeParts.push(`🐕 ${Math.max(0, freeT)} frei`); }
  meta.textContent = `${parts.join(' · ')}  —  ${freeParts.join(' · ')}`;

  const stays = (state.docs||[]).filter(d=>{
    if(!d.saved) return false;
    if(d.type==='invoice') return false;
    if(!d.meta?.von || !d.meta?.bis) return false;
    const bt = d.meta?.betreuung||'';
    if(bt==='Urlaubsbetreuung' && !f.urlaub) return false;
    if(bt==='Tagesbetreuung' && !f.tages) return false;
    return (iso >= d.meta.von && iso <= d.meta.bis);
  }).slice().sort((a,b)=> String(a.meta?.von||'').localeCompare(String(b.meta?.von||'')));

  list.innerHTML = '';
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
    CAL.selectedDay = d.toISOString().slice(0,10);
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
  // Unterstützt sowohl Schema (name/key) als auch (title/id)
  if(!t || typeof t !== "object") return t;

  if(!t.name && t.title) t.name = t.title;

  // sections[].fields[]: id -> key
  if(Array.isArray(t.sections)){
    t.sections.forEach(sec=>{
      if(Array.isArray(sec.fields)){
        sec.fields.forEach(f=>{
          if(f && !f.key && f.id) f.key = f.id;
        });
      }
    });
  }

  // top-level fields[]: id -> key
  if(Array.isArray(t.fields)){
    t.fields.forEach(f=>{
      if(f && !f.key && f.id) f.key = f.id;
    });
  }

  return t;
}

async function loadTemplates(){
  const res1 = await fetch("templates/hundeannahme.json");
  if(!res1.ok) throw new Error("Konnte templates/hundeannahme.json nicht laden ("+res1.status+")");

  const t1 = normalizeTemplate(await res1.json());
  templates = [t1];

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
function ensureStateShape(){
  // Basis-Defaults (ohne UID-Erzeugung, damit es beim ersten Load robust bleibt)
  if(!state || typeof state !== "object") return;
  if(typeof state.schemaVersion !== "number") state.schemaVersion = 1;

  state.dogs = Array.isArray(state.dogs) ? state.dogs : [];
  state.docs = Array.isArray(state.docs) ? state.docs : [];

  state.customers = Array.isArray(state.customers) ? state.customers : [];
  state.pets = Array.isArray(state.pets) ? state.pets : [];
  state.stays = Array.isArray(state.stays) ? state.stays : [];
  state.worklogs = Array.isArray(state.worklogs) ? state.worklogs : [];
  state.invoices = Array.isArray(state.invoices) ? state.invoices : [];

  state._legacy = (state._legacy && typeof state._legacy === "object") ? state._legacy : {};
  state._legacy.dogIdToCustomerId = (state._legacy.dogIdToCustomerId && typeof state._legacy.dogIdToCustomerId === "object") ? state._legacy.dogIdToCustomerId : {};
  state._legacy.dogIdToPetId = (state._legacy.dogIdToPetId && typeof state._legacy.dogIdToPetId === "object") ? state._legacy.dogIdToPetId : {};
  state._legacy.docIdToStayId = (state._legacy.docIdToStayId && typeof state._legacy.docIdToStayId === "object") ? state._legacy.docIdToStayId : {};
  state._legacy.docIdToInvoiceId = (state._legacy.docIdToInvoiceId && typeof state._legacy.docIdToInvoiceId === "object") ? state._legacy.docIdToInvoiceId : {};

  // Vertrag
  state.contract = (state.contract && typeof state.contract === "object") ? state.contract : null;
  state.contractSignatures = Array.isArray(state.contractSignatures) ? state.contractSignatures : [];

  // Rechnungsnummer beibehalten
  if(typeof state.nextInvoiceNumber !== "number"){
    state.nextInvoiceNumber = 1;
  }
}


function ensureContractDefaults(){
  if(!state.contract || typeof state.contract !== "object"){
    state.contract = {
      title: "Betreuungsvertrag für Hunde",
      provider: "Doggy Style Hundepension",
      version: "v1.0",
      validFrom: "2025-12-27",
      text: DEFAULT_CONTRACT_TEXT,
      updatedAt: new Date().toISOString()
    };
  }
  if(!Array.isArray(state.contractSignatures)) state.contractSignatures = [];
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
  // Migration ist bewusst "additiv": wir verlieren NICHTS aus state.dogs/state.docs,
  // sondern spiegeln alles zusätzlich sauber in customers/pets/stays/invoices.
  if(state.schemaVersion >= 2) return;

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

  (state.dogs||[]).forEach(d=>{
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

  (state.docs||[]).forEach(doc=>{
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
  if(customers.length) state.customers = customers;
  if(pets.length) state.pets = pets;
  if(stays.length) state.stays = stays;
  if(invoices.length) state.invoices = invoices;

  state._legacy.dogIdToCustomerId = dogIdToCustomerId;
  state._legacy.dogIdToPetId = dogIdToPetId;
  state._legacy.docIdToStayId = docIdToStayId;
  state._legacy.docIdToInvoiceId = docIdToInvoiceId;

  state.schemaVersion = 2;
  saveState();
}


function pruneInvoiceDocs(){
  // Variante A: Rechnungen gehören ausschließlich in state.invoices (Rechnungs-Tab),
  // nicht in state.docs (Aufenthalte). Damit bleibt "Aufenthalte" übersichtlich.
  if(!Array.isArray(state.docs)) state.docs = [];
  const invDocs = state.docs.filter(d=>d && d.type==="invoice");
  if(invDocs.length){
    state.worklogs = Array.isArray(state.worklogs) ? state.worklogs : [];
  state.invoices = Array.isArray(state.invoices) ? state.invoices : [];
    invDocs.forEach(inv=>{
      if(!state.invoices.some(x=>x.id===inv.id)){
        state.invoices.push(inv);
      }
    });
    state.docs = state.docs.filter(d=>!(d && d.type==="invoice"));
  }
}
// ===== ETAPPE 2 Helpers (Customer/Pet Editor) =====
const cpEdit = { mode: "new", petId: "" };

function getCustomer(id){
  return (state.customers||[]).find(c=>c.id===id) || null;
}
function getPet(id){
  return (state.pets||[]).find(p=>p.id===id) || null;
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
  const customers = (state.customers||[]).slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de"));
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
  const map = state._legacy?.dogIdToPetId || {};
  for(const did of Object.keys(map)){
    if(map[did] === pet.id){ dogId = did; break; }
  }

  // 2) Falls nicht vorhanden: neu anlegen
  if(!dogId){
    dogId = "d_"+uid();
    state.dogs.push({ id: dogId, name: pet.name||"", owner: customer?.name||"", phone: customer?.phone||"", note: pet.note||"" });
  }

  // 3) Update Legacy-Dog
  const d = (state.dogs||[]).find(x=>x.id===dogId);
  if(d){
    d.name = pet.name || d.name;
    d.owner = (customer?.name ?? d.owner) || "";
    d.phone = (customer?.phone ?? d.phone) || "";
    d.note = pet.note || d.note || "";
  }

  // 4) Mapping aktualisieren
  state._legacy = state._legacy || {};
  state._legacy.dogIdToPetId = state._legacy.dogIdToPetId || {};
  state._legacy.dogIdToCustomerId = state._legacy.dogIdToCustomerId || {};
  state._legacy.dogIdToPetId[dogId] = pet.id;
  state._legacy.dogIdToCustomerId[dogId] = pet.customerId;

  return dogId;
}

// ===== ETAPPE 3 Helpers: Hund auswählen -> Halter automatisch =====
function getPetByDogId(dogId){
  ensureStateShape();
  ensureContractDefaults();
  const pid = state._legacy?.dogIdToPetId?.[dogId] || "";
  return pid ? getPet(pid) : null;
}
function getCustomerByDogId(dogId){
  ensureStateShape();
  ensureContractDefaults();
  const cid = state._legacy?.dogIdToCustomerId?.[dogId] || "";
  return cid ? getCustomer(cid) : null;
}
function getLegacyDogIdForPet(petId){
  ensureStateShape();
  ensureContractDefaults();
  const map = state._legacy?.dogIdToPetId || {};
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
  if(!doc.petId && doc.dogId) doc.petId = state._legacy?.dogIdToPetId?.[doc.dogId] || "";
  if(!doc.customerId && doc.dogId) doc.customerId = state._legacy?.dogIdToCustomerId?.[doc.dogId] || "";
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
  if(!doc.petId) doc.petId = state._legacy?.dogIdToPetId?.[dogId] || doc.petId || "";
  if(!doc.customerId) doc.customerId = state._legacy?.dogIdToCustomerId?.[dogId] || doc.customerId || "";
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
  return state.docs.filter(d=>{
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
    days.push(x.toISOString().slice(0,10));
  }

  return days;
}
function countForDay(type, day){
  return state.docs.filter(d=>{
    if(!d.saved) return false;
    if(d.meta?.betreuung !== type) return false;
    if(!d.meta?.von || !d.meta?.bis) return false;

    return day >= d.meta.von && day <= d.meta.bis;
  }).length;
}
function countToday(type){
  const today = new Date().toISOString().slice(0,10);
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
        ${u} / ${CAPACITY.Urlaubsbetreuung} Hunde
      </div>
      <div class="status-card">
        <strong>Tagesbetreuung</strong><br>
        ${t} / ${CAPACITY.Tagesbetreuung} Hunde
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
              <td>${u} / ${CAPACITY.Urlaubsbetreuung}</td>
              <td>${t} / ${CAPACITY.Tagesbetreuung}</td>
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
  return (state.invoices||[]).slice().sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""));
}

function getInvoiceById(id){
  ensureStateShape();
  ensureContractDefaults();
  return (state.invoices||[]).find(x=>x.id===id) || null;
}

function resolveInvoiceParties(inv){
  ensureStateShape();
  ensureContractDefaults();
  const cust = inv?.customerId ? getCustomer(inv.customerId) : (inv?.dogId ? getCustomerByDogId(inv.dogId) : null);
  const pet  = inv?.petId ? getPet(inv.petId) : (inv?.dogId ? getPetByDogId(inv.dogId) : null);
  const legacyDog = inv?.dogId ? (state.dogs||[]).find(d=>d.id===inv.dogId) : null;
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

      <p>Grundpreis: ${inv.pricing.basePrice.toFixed(2)} €</p>
      <p>Zuschläge (%): ${inv.pricing.percentExtra.toFixed(2)} €</p>
      <p>Zuschläge (fix): ${inv.pricing.fixedExtra.toFixed(2)} €</p>

      <hr>
      <h3 style="margin:10px 0 8px">Gesamt: ${inv.pricing.total.toFixed(2)} €</h3>

      <button class="btn" onclick="printInvoice('${inv.id}')">🖨️ Rechnung drucken / PDF</button>
    </div>
  `;
}
function setInvoiceStatus(id, status){
  const inv = getInvoiceById(id);
  if(!inv) return;

  inv.status = status;
  inv.updatedAt = new Date().toISOString();
  saveState();

  openInvoice(id);
  renderInvoiceList();
}

// ===== ETAPPE 4: Freie Rechnung (Kunde/Hund auswählen statt tippen) =====
function openFreeInvoiceForm(){
  ensureStateShape();
  ensureContractDefaults();
  const view = document.getElementById("invoiceView");
  if(!view) return;

  const customers = (state.customers||[]).slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"","de"));
  const hasCustomers = customers.length>0;

  const today = new Date().toISOString().slice(0,10);

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
          <input id="freeInvAmount" type="number" step="0.01" min="0" placeholder="0,00">
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

  const pets = (state.pets||[]).filter(p=>p.customerId===customerId).slice()
    .sort((a,b)=>(a.name||"").localeCompare(b.name||"","de"));

  petSel.innerHTML = `<option value="">—</option>` + pets.map(p=>`<option value="${p.id}">${escapeHtml(p.name||"Hund")}</option>`).join("");
}

function ensureLegacyDogForPetId(petId, customerId){
  ensureStateShape();
  ensureContractDefaults();
  if(!petId || !customerId) return "";

  const map = state._legacy?.dogIdToPetId || {};
  for(const dogId of Object.keys(map)){
    if(map[dogId] === petId) return dogId;
  }

  const pet = getPet(petId);
  const cust = getCustomer(customerId);

  const dogId = uid();
  state.dogs = state.dogs || [];
  state.dogs.push({
    id: dogId,
    name: pet?.name || "Hund",
    owner: cust?.name || "",
    phone: cust?.phone || "",
    note: ""
  });

  state._legacy.dogIdToPetId[dogId] = petId;
  state._legacy.dogIdToCustomerId[dogId] = customerId;
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
  const amount = parseFloat(document.getElementById("freeInvAmount")?.value || "0");

  if(!customerId){ alert("Bitte Kunde auswählen."); return; }
  if(!(amount>0)){ alert("Bitte einen Betrag > 0 eingeben."); return; }

  const year = new Date().getFullYear();
  const number = String(state.nextInvoiceNumber).padStart(4, "0");
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

  state.worklogs = Array.isArray(state.worklogs) ? state.worklogs : [];
  state.invoices = Array.isArray(state.invoices) ? state.invoices : [];
  state.invoices.push(invoice);

  state.nextInvoiceNumber++;

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
    <strong>Leistungszeitraum:</strong> ${escapeHtml(inv.period?.from||"")} – ${escapeHtml(inv.period?.to||"")}
  </p>

  <table>
    <tr>
      <th>Position</th>
      <th class="right">Betrag</th>
    </tr>
    <tr>
      <td>Grundpreis</td>
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
  localStorage.setItem(LS_KEY,JSON.stringify(state));
  SYNC.localSavedAt = Date.now();
  updateSyncUI();
  // Cloud Sync (Weg 2B): Änderungen nach außen spiegeln
  if(CLOUD.enabled) cloudSchedulePush();
}

function ensureDefaultDog(){
  if(!state.dogs || state.dogs.length===0){
    state.dogs=[{id:uid(),name:"— Bitte auswählen —",owner:"",phone:"",isPlaceholder:true}];
  }
}
function syncDogSelect(){
  ensureDefaultDog();
  $("#dogSelect").innerHTML=state.dogs.map(d=>{
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

  const pets = (state.pets||[]).slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de"));

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
          state.pets = state.pets.filter(x=>x.id!==p.id);
          // legacy dog nicht automatisch löschen (Sicherheit), aber Mapping entfernen
          for(const dogId of Object.keys(state._legacy?.dogIdToPetId||{})){
            if(state._legacy.dogIdToPetId[dogId]===p.id){
              delete state._legacy.dogIdToPetId[dogId];
              delete state._legacy.dogIdToCustomerId[dogId];
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
    const dogs = state.dogs.filter(d=>!d.isPlaceholder);
    dogs.forEach(d=>{
      const el=document.createElement("div");
      el.className="item";
      el.innerHTML=`<div><strong>${escapeHtml(d.name)}</strong><small>${escapeHtml(d.owner||"")} · ${escapeHtml(d.phone||"")}</small></div>
        <div class="actions"><button class="smallbtn" data-e="1">Bearbeiten</button><button class="smallbtn" data-d="1">Löschen</button></div>`;
      el.querySelector('[data-e="1"]').onclick=()=>openCpEditor("new"); // legacy fallback: einfach neu anlegen
      el.querySelector('[data-d="1"]').onclick=()=>{
        if(confirm("Hund/Kunde wirklich löschen?")){
          state.dogs=state.dogs.filter(x=>x.id!==d.id);
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
  const useExisting = $("#useExistingCustomer").checked && (state.customers||[]).length>0;

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
    state.customers.push(customer);
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
  state.pets.push(pet);

  upsertLegacyDogForPet(pet, getCustomer(customerId));

  state.schemaVersion = Math.max(state.schemaVersion||1, 2);
  saveState();
  closeCpEditor();
  renderDogs();
});


function renderDocs(){
  const list=$("#docList");
  list.innerHTML="";
  const docs=(state.docs||[]).filter(d=>d.type!=="invoice").slice().sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""));
  docs.forEach(d=>list.appendChild(docItem(d)));
  if(!docs.length) list.innerHTML=`<div class="muted">Noch keine Aufenthalte erstellt.</div>`;
  renderRecent();
}
function renderRecent(){
  const list=$("#recentList");
  const docs=(state.docs||[]).filter(d=>d.type!=="invoice").slice().sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||"")).slice(0,3);
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
      state.docs=state.docs.filter(x=>x.id!==d.id);
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
  const src = (state.docs||[]).find(x=>x.id===docId);
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

  state.docs.unshift(copy);
  saveState();
  openDoc(copy.id);
}
$("#btnNewDoc").addEventListener("click",()=>createDoc($("#templateSelect").value));
function createDoc(tid){
  const t=getTemplate(tid);
  if(!t) return;
  ensureStateShape();
  ensureContractDefaults();
  // Etappe 3: Standardauswahl = erster Hund aus neuem Stamm (falls vorhanden)
  let defaultDogId = state.dogs?.[0]?.id || "";
  if((state.pets||[]).length){
    const pet = state.pets[0];
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
  state.docs=state.docs||[];
  state.docs.unshift(docObj);
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
updateCreateInvoiceButton();
  currentDoc=(state.docs||[]).find(d=>d.id===id);
  if(!currentDoc) return;
  ensureDocLinks(currentDoc);
  updateDocCustomerPetFromDogId(currentDoc);
normalizeMeta(currentDoc);
  $("#editorTitle").textContent=currentDoc.title||"Dokument";
  $("#editorMeta").textContent=currentDoc.templateName;
  $("#docName").value=currentDoc.title||"";
  syncDogSelect();
  $("#dogSelect").value=currentDoc.dogId||state.dogs?.[0]?.id||"";
  renderCustomerInfoForDogId($("#dogSelect").value);
  renderEditor(currentDoc);
  updateContractWarnBanner(currentDoc);
  autofillHundeannahmeFieldsFromMaster($("#dogSelect").value, { overwrite:false });
renderVersions(currentDoc);
  
  $("#dsGvoText").textContent=getTemplate(currentDoc.templateId)?.dsGvoNote||"";
  dirty=false;
  showPanel("editor");
  window.scrollTo({top:0,behavior:"smooth"});
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
  const d = (state.dogs||[]).find(x=>x.id===docObj.dogId);
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
const limit = CAPACITY[type];

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
  const exists = (state.invoices||[]).some(x=>x.sourceDocId===currentDoc.id);
  if(!exists){
    createInvoiceFromDoc(currentDoc);
  }
}
     // sauberer Zeitstempel

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
  const number = String(state.nextInvoiceNumber).padStart(4, "0");

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

  state.worklogs = Array.isArray(state.worklogs) ? state.worklogs : [];
  state.invoices = Array.isArray(state.invoices) ? state.invoices : [];
  state.invoices.push(invoice);
  state.nextInvoiceNumber++;

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

  state.docs.unshift(fork);
  currentDoc = fork;

  saveState();
}
function getDocumentVersions(doc){
  const rootId = doc.versionOf || doc.id;

  return (state.docs || [])
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
  const dog=state.dogs.find(d=>d.id===currentDoc.dogId) || null;
  const html=buildPrintHtml(currentDoc,t,dog);
  const win=window.open("","_blank");
  if(!win){ alert("Popup blockiert. Bitte Popups erlauben."); return; }
  win.document.open(); win.document.write(html); win.document.close();
  win.focus();
  setTimeout(()=>win.print(),300);
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
  const stamp=new Date().toISOString().slice(0,10);
  a.href=URL.createObjectURL(blob);
  a.download=`DoggyStyleWorkspace_Backup_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const _btnExportAll = $("#btnExportAll");
if(_btnExportAll) _btnExportAll.addEventListener("click", doBackupExport);

const _btnBackupExport = document.getElementById('btnBackupExport');
if(_btnBackupExport) _btnBackupExport.addEventListener('click', doBackupExport);

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

async function startApp(){
  // 1) Wenn Cloud aktiviert: Login + Sync
  const cloudOk = await cloudInit();
  if(!cloudOk){
    showAuthGate(false);
    await boot();
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

  // Auth state
  CLOUD.auth.onAuthStateChanged(async (user)=>{
    CLOUD.user = user || null;
    if(!user){
      CLOUD.role = 'guest';
      try{ if(btnLogoutApp) btnLogoutApp.style.display = 'none'; }catch(e){}
      updateSyncUI();
      // In dieser Version gibt es kein Login-Overlay mehr. Wenn nicht eingeloggt: auf Login-Seite umleiten.
      try{
        const p = (location && location.pathname) ? location.pathname.toLowerCase() : '';
        // local/offline Nutzung erlauben: nicht hart auf login umleiten
        // if(!p.endsWith('login.html')) location.href = 'login.html';
      }catch(e){}
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
    if(btnLogoutApp) btnLogoutApp.style.display = "inline-block";
    updateSyncUI();
    if(btnLogoutApp) btnLogoutApp.style.display = "inline-block";

    // staff/admin Features (Rollen, Aufgaben, Inbox)
    try{ await initStaffFeatures(); }catch(e){ console.warn(e); }

    // Sync UI initial
    SYNC.cloudLastOkAt = Number(CLOUD.lastPushOkAt||0);
    SYNC.cloudLastError = String(CLOUD.lastPushError||"");
    updateSyncUI();

    // Erstes Boot lokal (stellt state sicher), danach Remote laden und übernehmen
    await boot();

    try{
      const remote = await cloudLoadState();
      if(remote){
        // v1: Remote gewinnt, wenn neuer (oder lokal leer)
        const localStamp = Number(state._cloudUpdatedAt||0);
        const remoteStamp = Number(remote._cloudUpdatedAt||CLOUD._lastRemoteStamp||0);
        if(remoteStamp && remoteStamp >= localStamp){
          state = remote;
          ensureStateShape();
  ensureContractDefaults();
          migrateToV2();
          pruneInvoiceDocs();
          ensureDefaultDog();
          saveState();
          renderDogs();
          renderDocs();
          renderInvoiceList();
        }
      }
    }catch(e){
      console.error("Cloud load failed", e);
      setAuthMsg("Cloud Sync konnte nicht geladen werden. App läuft lokal weiter.");
    }

    // Echtzeit-Listener (last-write-wins)
    (cloudStateRef()||{onSnapshot:()=>{}}).onSnapshot((snap)=>{
      if(!snap.exists) return;
      const data = snap.data();
      const stamp = Number(data?.updatedAt||0);
      if(stamp) { SYNC.cloudLastSeenAt = stamp; updateSyncUI(); }
      if(!stamp || stamp <= Number(state._cloudUpdatedAt||0)) return;
      // Nicht unsere eigene Änderung nochmal einspielen
      if(CLOUD.user && (data.updatedBy === (CLOUD.user.email||CLOUD.user.uid))) return;
      if(data.payload){
        state = data.payload;
        ensureStateShape();
  ensureContractDefaults();
        migrateToV2();
        pruneInvoiceDocs();
        ensureDefaultDog();
        saveState();
        renderDogs();
        renderDocs();
        renderInvoiceList();
      }
    });
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

// Start
startApp().catch(console.error);
// UI: Sync-Status regelmäßig auffrischen (auch bei Tab-Wechsel/PWA)
setInterval(()=>{ try{ updateSyncUI(); }catch(_){ } }, 1500);
window.addEventListener('online', ()=>{ try{ updateSyncUI(); }catch(_){ } });
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
    const count = (state.docs||[]).filter(d=>d.type==="invoice").length + 1;
    doc.invoiceNumber = `${year}-${String(count).padStart(4,"0")}`;
  }

  const root = document.getElementById("formRoot");
  if(!root) return;

  // Basisfelder
  doc.items = Array.isArray(doc.items) ? doc.items : [];
  doc.date = doc.date || new Date().toISOString().slice(0,10);

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
  renderForm(doc);
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
  const v = state.contract?.version || "";
  return (state.contractSignatures||[]).find(s=>s.customerId===customerId && s.petId===petId && s.contractVersion===v) || null;
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
  const c = state.contract;
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

    <script>
      // Auto-open print dialog for easy Save as PDF
      setTimeout(()=>{ try{ window.print(); }catch(e){} }, 350);
    </script>
  </body></html>`;

  const win = window.open("", "_blank");
  if(!win){ alert("Popup blockiert. Bitte Popups erlauben."); return; }
  win.document.open(); win.document.write(html); win.document.close();
  win.focus();
}

function renderContractPanel(){
  ensureContractDefaults();
  const t = $("#contractText");
  const titleEl = $("#contractTitle");
  const metaEl = $("#contractMeta");
  if(!t) return;

  const c = state.contract;
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
      state.contract = c;
      saveState();
      alert(`Neue Version veröffentlicht: ${c.version}. Kunden müssen neu unterschreiben.`);
      renderContractPanel();
    };
  }

  // customer/pet selects
  const cs = $("#contractCustomerSelect");
  const ps = $("#contractPetSelect");
  const customers = (state.customers||[]).slice().sort((a,b)=>String(a.lastName||"").localeCompare(String(b.lastName||""),"de"));
  cs.innerHTML = customers.map(x=>`<option value="${x.id}">${escapeHtml((x.lastName? x.lastName+', ':'') + (x.firstName||''))}</option>`).join("") || `<option value="">(keine Kunden)</option>`;

  function fillPets(){
    const cid = cs.value;
    const pets = (state.pets||[]).filter(p=>p.customerId===cid).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de"));
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
      contractVersion: state.contract.version,
      signedAt: new Date().toISOString(),
      signatureDataUrl: dataUrl
    };

    // Replace existing for this combo/version
    state.contractSignatures = (state.contractSignatures||[]).filter(s=>!(s.customerId===customerId && s.petId===petId && s.contractVersion===sig.contractVersion));
    state.contractSignatures.push(sig);
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
      info.innerHTML = `🔴 Noch keine gültige Unterschrift für Version ${escapeHtml(state.contract.version)}.`;
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
  state.worklogs.unshift(entry);
  cloudSchedulePush();
}

function wfOpenPdf(html){
  const w = window.open("", "_blank");
  if(!w) { alert("Popup blockiert – bitte Popups erlauben."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(()=>{ try{ w.focus(); w.print(); }catch(_){} }, 300);
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
  sel.innerHTML = `<option value="">— auswählen —</option>` + (state.dogs||[]).map(d=>`<option value="${d.id}">${escapeHtml(d.name||"Hund")}</option>`).join("");
  sel.onchange = ()=>{
    const dog = (state.dogs||[]).find(d=>d.id===sel.value);
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
  const items = state.worklogs || [];
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
  const it = (state.worklogs||[]).find(x=>x.id===id);
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
  const it = (state.worklogs||[]).find(x=>x.id===id);
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
  const staysToday = (state.stays||[]).filter(s=>{
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