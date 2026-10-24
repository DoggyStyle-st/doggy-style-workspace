/* Loaded before app.js: one owner for submission, contract and review actions. */
(function(){
  'use strict';
  const Core = window.DSWorkflowCore, S = v=>String(v == null ? '' : v).trim(), $ = id=>document.getElementById(id);
  let profileUnsub=null, profileUid='', inboxUnsub=null, inboxUid='', inboxRows=[], reviewRow=null;
  let inboxArchiveUnsub=null,inboxMarkers=new Map(),inboxArchiveReady=false,inboxRowsReady=false,inboxLoadError='',inboxView='open',inboxMutating=false,inboxEpoch=0;
  const inboxSelected=new Set();
  let busy=false, draft=null, mergeReview=null;
  let photoEpoch=0,photoBindings=null;const photoRecords=new Map();
  const photoFields={profile:{input:'p_profilePhoto',preview:'p_profilePhotoPreview',remove:'p_profilePhotoRemove',label:'Profilfoto',get:()=>photoBindings?.get('profile')||'',set:value=>photoBindings?.set('profile',value),refresh:()=>cpRefreshProfilePhotoPreview()},vaccpass:{input:'p_vaccinationPhoto',preview:'p_vaccinationPhotoPreview',remove:'p_vaccinationPhotoRemove',label:'Impfpassfoto',get:()=>photoBindings?.get('vaccpass')||'',set:value=>photoBindings?.set('vaccpass',value),refresh:()=>cpRefreshVaccinationPhotoPreview()}};
  const ink = new WeakSet(), blobs = new Map(), mediaRequests = new Set(), mediaJobs = new Map(), mediaElements = new WeakMap();
  let mediaEpoch=0,mediaRequestId=0;
  const currentUser = ()=>window.firebase && firebase.auth().currentUser;
  function workspaceRole(user,profile){
    if(user?.emailVerified===true && S(user.email).toLowerCase()==='raphael@boch-plan.de')return 'admin';
    return ['admin','staff','customer'].includes(profile?.role)?profile.role:'guest';
  }
  function startupStatus(stage,error){
    window.__dsStartup={stage:String(stage||''),error:String(error?.message||error||''),at:Date.now()};
    window.dispatchEvent(new CustomEvent('ds-startup-status'));
  }
  function readWithTimeout(operation,label,milliseconds=12000){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{const error=new Error(label+' antwortet nicht. Bitte Verbindung und Firebase-Zugriff prüfen.');error.code='read-timeout';reject(error);},milliseconds);
      Promise.resolve(operation).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
  }
  const scoped = ()=>location.pathname.endsWith('customer.html') || new URLSearchParams(location.search).has('customer_mode');
  function context(){ return Core.context(currentUser(),window.CLOUD && CLOUD.userProfile); }
  function api(){
    if(!currentUser()) throw new Error('Bitte anmelden.');
    const service=Core.service(firebase.firestore(),window.firebaseOrgId,currentUser,d=>d.secureWorkflowVersion===3?d.payload:(typeof dsBuildMergedCloudDocPayload==='function'?dsBuildMergedCloudDocPayload(d):d.payload),()=>firebase.firestore.FieldValue?.serverTimestamp?.()||Date.now());
    const publish=service.publish;
    service.publish=(workspace,stamp,options)=>publishWithSafetyDataSheets(service,publish,workspace,stamp,options);
    return service;
  }
  function sdsPath(value){
    const path=S(value?.storagePath),prefix='orgs/'+window.firebaseOrgId+'/safetyDataSheets/';
    return path.startsWith(prefix)&&/^[a-f0-9]{64}\.pdf$/.test(path.slice(prefix.length))?path:'';
  }
  function hasSafetyDataSheet(value){return !!(value && (value.dataUrl || sdsPath(value)));}
  async function pdfBytes(value){
    const match=String(value||'').match(/^data:[^,]*;base64,([A-Za-z0-9+/=\s]+)$/);
    if(!match)throw new Error('Das Sicherheitsdatenblatt enthält keine lesbare PDF-Datei. Die lokale Fassung bleibt erhalten.');
    let binary;try{binary=atob(match[1].replace(/\s/g,''));}catch(_){throw new Error('Das Sicherheitsdatenblatt ist beschädigt. Die lokale Fassung bleibt erhalten.');}
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    validatePdf(bytes);return bytes;
  }
  function validatePdf(bytes){
    if(!bytes.length||bytes.length>8*1024*1024)throw new Error('Das Sicherheitsdatenblatt muss eine PDF-Datei bis 8 MB sein.');
    if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw new Error('Die ausgewählte Datei ist keine lesbare PDF.');
  }
  async function sha256(bytes){
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function publishWithSafetyDataSheets(service,publish,workspace,stamp,options={}){
    const hazards=workspace?.compliance?.hazards;
    if(!Array.isArray(hazards)||!hazards.some(h=>h?.sds?.dataUrl))return publish(workspace,stamp);
    const actor=currentUser()?.uid,epoch=mediaEpoch,orgId=window.firebaseOrgId;
    const check=()=>{if(!actor||currentUser()?.uid!==actor||mediaEpoch!==epoch||window.firebaseOrgId!==orgId||CLOUD.role!=='admin'||scoped())throw new Error('Konto gewechselt oder keine Administrator-Berechtigung.');};
    check();
    const latest=await service.workspace();check();
    if(Number(latest.stamp)!==Number(stamp||0)){const e=new Error('Der Workspace wurde auf einem anderen Gerät geändert. Bitte zuerst aktualisieren.');e.code='workspace-conflict';throw e;}
    if(!options.localBackupDone)await backupLocal();check();
    const prepared=JSON.parse(JSON.stringify(workspace));
    // Convert only known SDS attachments on a copy. No change to local originals before ACK.
    const files=[];
    for(const h of prepared.compliance.hazards){
      if(!h?.sds?.dataUrl)continue;
      const bytes=await pdfBytes(h.sds.dataUrl),hash=await sha256(bytes);check();
      const path='orgs/'+orgId+'/safetyDataSheets/'+hash+'.pdf',old=h.sds;
      files.push({path,hash,bytes});
      h.sds={...old,mime:'application/pdf',size:bytes.length,storagePath:path,sha256:hash};delete h.sds.dataUrl;
    }
    const matches=(metadata,file)=>metadata?.contentType==='application/pdf'&&Number(metadata.size)===file.bytes.length&&metadata.customMetadata?.sha256===file.hash&&metadata.customMetadata?.orgId===orgId&&metadata.customMetadata?.kind==='sds';
    const storage=firebase.storage();storage.setMaxUploadRetryTime?.(30000);storage.setMaxOperationRetryTime?.(30000);
    for(const file of files){
      check();const ref=storage.ref().child(file.path);let metadata;
      try{metadata=await ref.getMetadata();}catch(e){if(e.code!=='storage/object-not-found')throw sdsStorageError(e);}
      check();
      if(!metadata){
        try{const result=await ref.put(new Blob([file.bytes],{type:'application/pdf'}),{contentType:'application/pdf',customMetadata:{orgId,uploadedBy:actor,kind:'sds',sha256:file.hash}});metadata=result.metadata;}
        catch(e){
          // A simultaneous upload may already have created the same immutable content.
          try{metadata=await ref.getMetadata();}catch(_){throw sdsStorageError(e);}
        }
        check();
      }
      if(!matches(metadata,file))throw new Error('Die gespeicherte PDF stimmt nicht mit dem Sicherheitsdatenblatt überein. Die lokale Fassung bleibt erhalten.');
    }
    check();const result=await publish(prepared,stamp);check();
    prepared._cloudUpdatedAt=result.stamp;return {...result,payload:prepared};
  }
  function sdsStorageError(error){
    const e=new Error(error?.code==='storage/unauthorized'?'Sicherheitsdatenblatt konnte nicht gespeichert werden. Bitte die Storage-Regeln aus GB376 veröffentlichen. Die lokale PDF bleibt erhalten.':'Sicherheitsdatenblatt konnte nicht in Firebase Storage gespeichert werden. Die lokale PDF bleibt erhalten. '+String(error?.message||error));
    e.code=error?.code||'sds/storage';return e;
  }
  function acceptPublishedFiles(target,submitted,published){
    for(const old of submitted?.compliance?.hazards||[]){
      if(!old?.sds?.dataUrl)continue;
      const current=(target?.compliance?.hazards||[]).filter(h=>h?.id===old.id),saved=(published?.compliance?.hazards||[]).filter(h=>h?.id===old.id);
      if(current.length===1&&saved.length===1&&sdsPath(saved[0].sds)&&JSON.stringify(current[0].sds)===JSON.stringify(old.sds))current[0].sds=JSON.parse(JSON.stringify(saved[0].sds));
    }
    return target;
  }
  async function openSafetyDataSheet(hazard){
    const user=currentUser(),epoch=mediaEpoch,sds=hazard?.sds;
    if(!user||scoped()||!['admin','staff'].includes(CLOUD.role))throw new Error('Bitte mit einem Workspace-Konto anmelden.');
    if(!hasSafetyDataSheet(sds))throw new Error('Kein Sicherheitsdatenblatt hinterlegt.');
    let blob;
    if(sds.dataUrl)blob=new Blob([await pdfBytes(sds.dataUrl)],{type:'application/pdf'});
    else{
      blob=await requestMedia(sdsPath(sds),user,epoch);
      const bytes=new Uint8Array(await blob.arrayBuffer());validatePdf(bytes);
      const hash=await sha256(bytes);
      if(hash!==sds.sha256||!sdsPath(sds).endsWith('/'+hash+'.pdf'))throw new Error('Die geladene PDF stimmt nicht mit dem gespeicherten Dateiverweis überein.');
      blob=new Blob([bytes],{type:'application/pdf'});
    }
    if(currentUser()?.uid!==user.uid||mediaEpoch!==epoch)throw new Error('Konto gewechselt.');
    const filename=String(sds.name||('SDB_'+(hazard.name||'Produkt')+'.pdf')).replace(/[\\/\x00-\x1f]/g,'_');
    DSDocumentOutput.open({title:'Sicherheitsdatenblatt – '+(hazard.name||'Produkt'),filename,pdf:blob,url:URL.createObjectURL(blob)});
  }
  function error(e, id){
    const message=S(e && e.message || e);
    if($(id || 'assignMsg')) $(id || 'assignMsg').textContent='❌ '+message;
    if(typeof dsSetSyncDiag==='function') dsSetSyncDiag(message,true);
    console.error('Workspace workflow:',message);
  }
  function snapshot(profile){
    const ctx=Core.context(currentUser(),profile || window.CLOUD?.userProfile), b=ctx.bundle || {};
    const next={dogs:[],docs:[],customers:[],pets:[],contractAgreements:{},contractSignatures:{},contractVersion:b.contractVersion || 'v1.0',contract:b.contract || {},legalTexts:b.legalTexts || {},_legacy:{dogIdToPetId:{},dogIdToCustomerId:{}}};
    if(ctx.verified){
      next.customers=[ctx.customer]; next.pets=ctx.pets; next.docs=b.stays || [];
      ctx.pets.forEach(p=>{
        const dogId=p.dogId || p.id;
        next.dogs.push({id:dogId,name:p.name,owner:ctx.customer.name,customerId:ctx.customerId});
        next._legacy.dogIdToPetId[dogId]=p.id; next._legacy.dogIdToCustomerId[dogId]=ctx.customerId;
      });
      (b.contracts || []).forEach(c=>{
        if(c.customerId!==ctx.customerId || !ctx.pets.some(p=>p.id===c.petId)) return;
        next.contractSignatures[Core.signatureKey(c.customerId,c.petId,c.version)]=c.signature;
        next.contractAgreements[Core.agreementKey(c.customerId,c.petId,c.version)]=c.agreement;
      });
    }
    return next;
  }
  function hydrate(profile){
    if(!scoped()) return;
    if(typeof state!=='undefined') state=snapshot(profile);
    if(typeof ensureStateShape==='function') ensureStateShape();
    window.dispatchEvent(new CustomEvent('ds-customer-data-ready'));
  }
  async function watchProfile(user){
    if(profileUnsub && profileUid===user.uid) return;
    if(profileUnsub) profileUnsub();
    profileUid=user.uid;
    const ref=firebase.firestore().collection('orgs').doc(window.firebaseOrgId).collection('users').doc(user.uid);
    const initial=await readWithTimeout(ref.get({source:'server'}),'Kundenprofil');
    if(!initial.exists) throw new Error('Das Kundenkonto muss zuerst vom Administrator zugeordnet werden.');
    if(currentUser()?.uid!==user.uid) return;
    CLOUD._profileReadConfirmedAt=Date.now();CLOUD.userProfile=initial.data(); hydrate(CLOUD.userProfile);
    profileUnsub=ref.onSnapshot(snap=>{
      if(currentUser()?.uid!==user.uid || snap.metadata.hasPendingWrites) return;
      if(!snap.metadata.fromCache)CLOUD._profileReadConfirmedAt=Date.now();
      CLOUD.userProfile=snap.exists?snap.data():null; hydrate(CLOUD.userProfile);
    },e=>error(e,'customerTaskSaveHint'));
  }
  function resetAccount(){
    window.DSBilling?.reset();
    window.DSAccountDirectory?.reset();
    window.DSStatistics?.reset();
    window.DSDocumentOutput?.close();
    mediaEpoch++;for(const xhr of mediaRequests)xhr.abort();mediaRequests.clear();mediaJobs.clear();
    resetPhotoEditor();
    window.DSBrowserStore.reset();
    window.DSRepair?.reset();
    if(profileUnsub) profileUnsub(); if(inboxUnsub) inboxUnsub();if(inboxArchiveUnsub)inboxArchiveUnsub();
    profileUnsub=inboxUnsub=null;profileUid=inboxUid='';reviewRow=null;inboxRows=[];draft=null;
    inboxArchiveUnsub=null;inboxMarkers.clear();inboxSelected.clear();inboxArchiveReady=inboxRowsReady=false;inboxLoadError='';inboxView='open';inboxMutating=false;inboxEpoch++;
    $('dsInboxToolbar')?.remove();
    closeReview();if($('inboxFeedback'))$('inboxFeedback').textContent='';
    window.DSCustomerPortal?.reset();
    window.__dsMediaError=null;
    for(const url of blobs.values()) URL.revokeObjectURL(url); blobs.clear();
    if(window.__dsCustomerPortalUnsubscribe) window.__dsCustomerPortalUnsubscribe();
    window.__dsCustomerTasks=[];window.__dsCustomerProposals=[];
    mergeReview=null;$('dsSyncConflictDialog')?.remove();$('dsSyncConflictNotice')?.remove();$('dsSyncBackupBox')?.remove();
    if(window.CLOUD){CLOUD.userProfile=null;CLOUD._profileReadConfirmedAt=0;CLOUD._workspaceReadConfirmedAt=0;CLOUD._lastRemoteStamp=0;CLOUD.lastPushOkAt=0;CLOUD.lastPushError='';CLOUD._workflowBaseSnapshot=null;CLOUD._pendingRemoteSnapshot=null;CLOUD._deferredRemoteSnapshot=null;CLOUD._startupLocalSnapshot=null;CLOUD._localEditRevision=0;}
    if(window.SYNC)Object.assign(SYNC,{cloudPending:false,cloudNeedsReview:false,cloudLastError:'',cloudLastOkAt:0,cloudLastSeenAt:0,cloudReachable:false});
    if(typeof state!=='undefined') state={dogs:[],docs:[],customers:[],pets:[],contractAgreements:{},contractSignatures:{}};
    document.querySelectorAll('[data-ds-media]').forEach(el=>{el.removeAttribute('src');el.removeAttribute('href');});
  }
  function baseKey(){return 'ds_workspace_base_v3:'+window.firebaseConfig.projectId+':'+window.firebaseOrgId+':'+currentUser()?.uid;}
  function rememberBase(payload,stamp,localBaseline=payload){
    if(!currentUser() || scoped())return;
    const base={payload:JSON.parse(JSON.stringify(payload)),localBaseline:JSON.parse(JSON.stringify(localBaseline)),stamp:Number(stamp||0)};
    CLOUD._workflowBaseSnapshot=base;
    DSBrowserStore.cache(baseKey(),JSON.stringify(base));
  }
  function readBase(){
    if(CLOUD._workflowBaseSnapshot)return CLOUD._workflowBaseSnapshot.payload;
    try{return JSON.parse(DSBrowserStore.get(baseKey())||'null')?.payload || null;}catch(_){return null;}
  }
  function workspaceContent(value){
    const out=JSON.parse(JSON.stringify(value||{}));
    // Only transport stamps and known view preferences are excluded. Business data stays exact.
    delete out._localUpdatedAt;delete out._cloudUpdatedAt;delete out.__statSub;
    for(const key of ['hygiene','medication'])if(out[key]&&typeof out[key]==='object')delete out[key].ui;
    if(Array.isArray(out.dogs))out.dogs=out.dogs.filter(d=>d?.isPlaceholder!==true);
    return out;
  }
  function sameWorkspace(a,b){
    const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
    return stable(workspaceContent(a))===stable(workspaceContent(b));
  }
  function captureStartup(payload){CLOUD._startupLocalSnapshot={payload:JSON.parse(JSON.stringify(payload)),revision:Number(CLOUD._localEditRevision||0)};}
  function markWorkspaceEdit(){CLOUD._localEditRevision=Number(CLOUD._localEditRevision||0)+1;}
  function hasLocalChanges(remote){
    if(CLOUD._workflowPublishing)return true;
    if(sameWorkspace(state,remote))return false;
    const startup=CLOUD._startupLocalSnapshot;
    if(startup&&startup.revision===Number(CLOUD._localEditRevision||0)&&sameWorkspace(startup.payload,remote))return false;
    let base=CLOUD._workflowBaseSnapshot;try{if(!base)base=JSON.parse(DSBrowserStore.get(baseKey())||'null');}catch(_){}
    return !(base&&Number(base.stamp)===Number(state._cloudUpdatedAt||0)&&sameWorkspace(state,base.localBaseline||base.payload));
  }
  function clearConflict(){
    CLOUD._pendingRemoteSnapshot=null;CLOUD._deferredRemoteSnapshot=null;SYNC.cloudNeedsReview=false;
    mergeReview=null;$('dsSyncConflictDialog')?.remove();$('dsSyncConflictNotice')?.remove();
  }
  async function backupLocal(){
    const key='ds_workspace_conflict_backup_v3:'+window.firebaseConfig.projectId+':'+window.firebaseOrgId+':'+currentUser().uid+':'+crypto.randomUUID();
    try{await DSBrowserStore.put(key,JSON.stringify({createdAt:Date.now(),payload:state}));}
    catch(e){throw new Error('Lokale Änderungen konnten nicht gesichert werden. Bitte zuerst ein Backup exportieren. Der Server wurde nicht verändert.');}
  }
  function installSyncBackup(){
    if(scoped()||!currentUser()||!['admin','staff'].includes(CLOUD.role)||$('dsSyncBackupBox'))return;
    const host=$('syncDetails')?.closest('.card');if(!host)return;
    const box=document.createElement('div');box.id='dsSyncBackupBox';const button=document.createElement('button');button.id='dsSyncLocalBackup';button.className='btn';button.type='button';button.textContent='Lokale Sicherung herunterladen';
    button.onclick=()=>{try{DSBrowserStore.download();}catch(e){alert(e.message);}};
    const hint=document.createElement('p');hint.className='muted';hint.textContent='Enthält auch lokal ungesendete Daten und gesicherte Fassungen vor einem Abgleich.';box.append(button,hint);host.append(box);
  }
  function showConflict(remote,stamp){
    if(scoped() || CLOUD.role!=='admin' || !currentUser())return;
    CLOUD._pendingRemoteSnapshot={remote:JSON.parse(JSON.stringify(remote)),remoteStamp:Number(stamp||0)};
    SYNC.cloudNeedsReview=true;
    let notice=$('dsSyncConflictNotice');if(!notice){notice=document.createElement('div');notice.id='dsSyncConflictNotice';notice.className='card ds-sync-review';notice.setAttribute('role','status');const main=document.querySelector('main');if(main)main.before(notice);else document.body.prepend(notice);}
    notice.replaceChildren();const text=document.createElement('p');text.textContent='Der Serverstand wurde geladen. Auf diesem Gerät liegen Änderungen zur Prüfung vor. Sie werden weder automatisch überschrieben noch gesendet.';
    const button=document.createElement('button');button.id='dsOpenSyncConflict';button.className='btn';button.textContent='Änderungen vergleichen';notice.append(text,button);
  }
  function conflictLabel(path){
    const names={customers:'Kunden',pets:'Hunde',dogs:'Hundeauswahl',docs:'Dokumente',phone:'Telefon',email:'E-Mail',name:'Name',note:'Notiz',street:'Straße',zip:'Postleitzahl',city:'Ort',profilePhoto:'Profilfoto',vaccinationPassPhoto:'Impfpassfoto',contract:'Betreuungsvertrag',contractSignatures:'Unterschriften',contractAgreements:'Vertragsfreigaben'};
    return path.map(part=>{
      if(typeof part!=='object')return names[part] || part;
      const row=(state[path[0]] || []).find?.(x=>x.id===part.id);
      return S(row?.name || row?.title) || 'Eintrag '+part.id;
    }).join(' · ');
  }
  function conflictValue(value,kind){
    if(value===undefined)return 'Entfernt';
    if(kind==='contracts')return 'Vertragsfassung '+S(value.contractVersion)+' · '+Object.keys(value.contractAgreements || {}).length+' Zustimmungen · '+Object.keys(value.contractSignatures || {}).length+' Unterschriften';
    if(typeof value==='string')return value.startsWith('data:image')?'Bild':value;
    if(typeof value==='boolean')return value?'Ja':'Nein';
    if(value && typeof value==='object')return S(value.name || value.title || value.templateName || value.id) || 'Mehrere Angaben';
    return S(value);
  }
  function showWorkspaceDifferences(parent,local,remote){
    const rows=[];let total=0;
    const preview=v=>v===undefined?'Nicht vorhanden':Array.isArray(v)?v.length+' Einträge':v&&typeof v==='object'?JSON.stringify(v):typeof v==='boolean'?v?'Ja':'Nein':String(v);
    const cell=v=>{let text=preview(v);if(text.startsWith('data:image'))return 'Bild vorhanden';return text.length>220?text.slice(0,220)+' …':text;};
    const plain=v=>v&&typeof v==='object'&&!Array.isArray(v),identified=v=>Array.isArray(v)&&v.every(x=>plain(x)&&x.id)&&new Set(v.map(x=>x.id)).size===v.length;
    const equal=(a,b)=>{if(a===undefined||b===undefined)return a===b;const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':plain(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);return stable(a)===stable(b);};
    function walk(a,b,path){
      if(equal(a,b))return;
      if(plain(a)&&plain(b)){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[key],b[key],path.concat(key));return;}
      if(identified(a)&&identified(b)){const aa=new Map(a.map(x=>[x.id,x])),bb=new Map(b.map(x=>[x.id,x]));for(const id of new Set([...aa.keys(),...bb.keys()]))walk(aa.get(id),bb.get(id),path.concat({id}));return;}
      total++;if(rows.length<60)rows.push({path,local:a,remote:b});
    }
    walk(workspaceContent(local),workspaceContent(remote),[]);
    if(!total)return;
    const details=document.createElement('details');details.className='ds-sync-differences';const summary=document.createElement('summary');summary.textContent=total+' Unterschiede zwischen diesem Gerät und Firebase ansehen';details.append(summary);
    const table=document.createElement('table'),head=document.createElement('tr');for(const title of ['Angabe','Auf diesem Gerät','In Firebase']){const th=document.createElement('th');th.textContent=title;head.append(th);}table.append(head);
    for(const row of rows){const tr=document.createElement('tr');for(const text of [conflictLabel(row.path),cell(row.local),cell(row.remote)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}table.append(tr);}details.append(table);
    if(total>rows.length){const hint=document.createElement('p');hint.textContent='Die ersten '+rows.length+' Unterschiede sind aufgeführt. Die lokale Sicherung enthält alle Angaben.';details.append(hint);}parent.append(details);
  }
  function openConflict(){
    if(scoped() || CLOUD.role!=='admin' || !CLOUD._pendingRemoteSnapshot)throw new Error('Kein administrativer Synchronisationskonflikt verfügbar.');
    const pending=CLOUD._pendingRemoteSnapshot,base=readBase(),local=JSON.parse(JSON.stringify(state));
    mergeReview={uid:currentUser().uid,local,remote:pending.remote,stamp:pending.remoteStamp,plan:base?Core.mergePlan(base,local,pending.remote):null};
    $('dsSyncConflictDialog')?.remove();const dialog=document.createElement('dialog');dialog.id='dsSyncConflictDialog';dialog.style.cssText='width:960px;max-width:95vw;max-height:85dvh;overflow:auto;box-sizing:border-box;background:#20242d;color:#fff;border:1px solid #9b803e;border-radius:14px;padding:20px';dialog.setAttribute('aria-label','Lokale Änderungen mit Firebase abgleichen');
    const title=document.createElement('h2');title.textContent='Lokale Änderungen mit Firebase abgleichen';
    const hint=document.createElement('p');hint.textContent=base?'Unterschiedliche Änderungen werden zusammengeführt. Für widersprüchliche Angaben bitte einen Stand wählen. Verträge und Unterschriften bleiben zusammen.':'Ein gespeicherter Ausgangsstand fehlt. Die lokale Fassung bleibt als Backup erhalten; ein automatisches Zusammenführen ist gesperrt.';
    dialog.append(title,hint);
    showWorkspaceDifferences(dialog,local,pending.remote);
    if(mergeReview.plan){
      const conflicts=mergeReview.plan.conflicts;
      if(!conflicts.length){const text=document.createElement('p');text.textContent='Keine widersprüchlichen Änderungen. Die lokalen und die Serveränderungen können gemeinsam gespeichert werden.';dialog.append(text);}
      for(const c of conflicts){
        const box=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=c.kind==='contracts'?'Betreuungsverträge und Unterschriften':conflictLabel(c.path);box.append(legend);
        for(const choice of ['local','remote']){
          const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name='ds-merge-'+c.id;input.value=choice;input.dataset.mergeConflict=c.id;
          const text=document.createElement('span');text.textContent=(choice==='local'?'Auf diesem Gerät: ':'In Firebase: ')+conflictValue(c[choice],c.kind);
          label.append(input,text);label.style.display='block';box.append(label);
          if(c.kind==='contracts'){
            const records=c[choice] || {},preview=document.createElement('div');preview.style.margin='8px 0 16px';
            const contractText=document.createElement('p');contractText.textContent=new DOMParser().parseFromString(S(records.contract?.text),'text/html').body.textContent;preview.append(contractText);
            for(const [key,sig] of Object.entries(records.contractSignatures || {})){
              const description=document.createElement('p');description.textContent='Unterschrift '+key+' · '+(sig?.signedAt?new Date(Number(sig.signedAt)).toLocaleString('de-DE'):'Zeitpunkt fehlt');preview.append(description);
              if(Core.signatureValid(sig)){const image=document.createElement('img');image.src=sig.dataUrl;image.alt='Unterschrift im '+(choice==='local'?'lokalen':'Server')+' Stand';image.style.maxWidth='300px';preview.append(image);}
            }box.append(preview);
          }
        }dialog.append(box);
      }
    }
    const status=document.createElement('p');status.id='dsSyncConflictStatus';dialog.append(status);
    for(const [id,text] of [['dsApplySyncMerge','Auswahl gemeinsam speichern'],['dsUseServerSnapshot','Lokales sichern und Serverstand anzeigen'],['dsCloseSyncMerge','Abbrechen']]){
      const button=document.createElement('button');button.id=id;button.type='button';button.className='btn';button.textContent=text;if(id==='dsApplySyncMerge')button.disabled=!base;dialog.append(button);
    }
    document.body.append(dialog);if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }
  async function resolveConflict(useServer){
    const review=mergeReview;if(!review || currentUser()?.uid!==review.uid || CLOUD.role!=='admin' || scoped())throw new Error('Konto oder Konfliktauswahl hat sich geändert.');
    if(JSON.stringify(state)!==JSON.stringify(review.local))throw new Error('Lokale Daten wurden nach Öffnen des Vergleichs geändert. Bitte den Vergleich erneut öffnen.');
    const latest=await api().workspace();
    if(currentUser()?.uid!==review.uid)throw new Error('Konto gewechselt.');
    if(latest.stamp!==review.stamp){showConflict(latest.payload,latest.stamp);openConflict();throw new Error('Firebase wurde inzwischen erneut geändert. Der Vergleich wurde aktualisiert.');}
    let resolved=latest.payload;
    if(!useServer){
      if(!review.plan)throw new Error('Ausgangsstand fehlt. Zusammenführen ist gesperrt.');
      const decisions={};document.querySelectorAll('[data-merge-conflict]:checked').forEach(input=>decisions[input.dataset.mergeConflict]=input.value);
      resolved=Core.resolveMerge(review.plan,decisions);
    }
    await backupLocal();
    const result=useServer?{stamp:latest.stamp}:await api().publish(resolved,latest.stamp,{localBackupDone:true});
    if(currentUser()?.uid!==review.uid)throw new Error('Konto gewechselt.');
    const persisted=result.payload||resolved;
    if(JSON.stringify(state)!==JSON.stringify(review.local)){
      if(!useServer)acceptPublishedFiles(state,resolved,persisted);
      rememberBase(persisted,result.stamp);SYNC.cloudPending=true;
      showConflict(persisted,result.stamp);openConflict();
      throw new Error('Während des Abgleichs wurden weitere lokale Angaben geändert. Diese bleiben erhalten. Bitte den aktualisierten Vergleich prüfen.');
    }
    Object.assign(SYNC,{cloudPending:false,cloudNeedsReview:false,cloudLastError:'',cloudLastOkAt:useServer?SYNC.cloudLastOkAt:result.stamp});
    CLOUD.lastPushError='';CLOUD._pendingRemoteSnapshot=null;
    if(!applyRemoteState(persisted,result.stamp,'conflict-resolution'))throw new Error('Serverstand wurde gespeichert, konnte aber noch nicht angezeigt werden. Bitte neu laden.');
    clearConflict();
  }
  function mediaSource(value){
    const v=S(value);
    if(v.startsWith('ds-storage:')) return v;
    if(v.startsWith('https://firebasestorage.googleapis.com/')){
      try{
        const match=v.match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/);
        if(!match || decodeURIComponent(match[1])!==window.firebaseConfig?.storageBucket) return '';
        return 'ds-storage:'+decodeURIComponent(match[2]);
      }catch(_){return '';}
    }
    return /^(data:image\/(png|jpeg|webp);base64,|blob:|\.\/assets\/|assets\/)/.test(v)?v:'';
  }
  function mediaError(code,message,status=0){const e=new Error(message);e.code=code;e.status=status;return e;}
  function mediaHttpError(status){
    const message=status===401?'Die Anmeldung für den Dateiabruf ist abgelaufen. Bitte erneut anmelden.':status===403?'Dieses Konto darf die Datei nicht lesen. Bitte die Storage-Berechtigung prüfen.':status===404?'Die Datei wurde im Speicher nicht gefunden.':status===429?'Zu viele Dateiabrufe. Bitte kurz warten und erneut laden.':status>=500?'Der Dateispeicher antwortet mit einem Serverfehler. Bitte erneut laden.':'Der Dateispeicher hat den Abruf abgelehnt.';
    return mediaError('media/http-'+status,message+' (HTTP '+status+')',status);
  }
  function retainUploadedPhoto(path,blob,uid){
    // A confirmed upload already has the exact normalized bytes on this
    // device. Keep those bytes for the uploading account's preview; reading
    // the remote file in another session still requires Storage permission.
    if(!uid||currentUser()?.uid!==uid||!S(path).startsWith('orgs/'+window.firebaseOrgId+'/pets/')||!blob?.size||!/^image\/(jpeg|png|webp)$/.test(blob.type))return false;
    const key=uid+':'+path;
    if(!blobs.has(key))blobs.set(key,URL.createObjectURL(blob));
    return true;
  }
  async function requestMedia(path,user,epoch){
    // Blob downloads use the same browser transport as the Storage SDK. No
    // no-store/no-cache request headers: Firebase's media CORS endpoint does
    // not allow Cache-Control or Pragma. Each attempt has a fresh URL instead.
    const active=()=>mediaEpoch===epoch&&currentUser()?.uid===user.uid;
    for(let attempt=0;attempt<2;attempt++){
      const token=await user.getIdToken(attempt===1);
      if(!active())throw mediaError('media/canceled','Der Dateiabruf wurde nach einem Kontowechsel abgebrochen.');
      if(!token)throw mediaError('media/unauthenticated','Bitte zum Laden der Datei anmelden.');
      const bucket=S(window.firebaseConfig?.storageBucket);
      if(!bucket)throw mediaError('media/config','Der Dateispeicher ist nicht eingerichtet.');
      try{
        return await new Promise((resolve,reject)=>{
          const xhr=new XMLHttpRequest();mediaRequests.add(xhr);
          const finish=(error,blob)=>{mediaRequests.delete(xhr);error?reject(error):resolve(blob);};
          xhr.open('GET','https://firebasestorage.googleapis.com/v0/b/'+encodeURIComponent(bucket)+'/o/'+encodeURIComponent(path)+'?alt=media&ds_request='+Date.now()+'_'+(++mediaRequestId),true);
          xhr.responseType='blob';xhr.timeout=25000;xhr.withCredentials=false;
          xhr.setRequestHeader('Authorization','Firebase '+token);
          xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){const blob=xhr.response;if(!blob||!blob.size)return finish(mediaError('media/empty','Die gespeicherte Datei ist leer.'));finish(null,blob);}else finish(mediaHttpError(xhr.status));};
          xhr.onerror=()=>finish(mediaError('media/network','Verbindung zum Dateispeicher fehlgeschlagen. Möglich sind ein Netzfehler oder eine Browser-/CORS-Sperre.'));
          xhr.ontimeout=()=>finish(mediaError('media/timeout','Der Dateiabruf hat zu lange gedauert. Bitte die Verbindung prüfen und erneut laden.'));
          xhr.onabort=()=>finish(mediaError('media/canceled','Der Dateiabruf wurde abgebrochen.'));
          try{xhr.send();}catch(e){finish(e);}
        });
      }catch(e){if(!active())throw mediaError('media/canceled','Der Dateiabruf wurde nach einem Kontowechsel abgebrochen.');if(e.status===401&&attempt===0)continue;throw e;}
    }
  }
  async function loadMedia(el){
    const attr=el.tagName==='A'?'href':'src',source=mediaSource(el.getAttribute(attr));
    if(!source.startsWith('ds-storage:'))return;
    const path=source.slice(11),user=currentUser(),epoch=mediaEpoch;
    if(el.dataset.dsLoading===path&&mediaElements.get(el)?.epoch===epoch)return;
    el.removeAttribute(attr);
    if(!user||!path.startsWith('orgs/'+window.firebaseOrgId+'/'))return;
    const view={epoch,path,url:null};mediaElements.set(el,view);el.dataset.dsMedia=path;el.dataset.dsLoading=path;
    const active=()=>currentUser()?.uid===user.uid&&mediaEpoch===epoch&&mediaElements.get(el)===view&&el.dataset.dsMedia===path&&(!el.hasAttribute(attr)||el.getAttribute(attr)===source||el.getAttribute(attr)===view.url);
    const key=user.uid+':'+path;
    const clearError=()=>{el.nextElementSibling?.matches('[data-ds-media-error]')&&el.nextElementSibling.remove();if(window.__dsMediaError?.path===path)window.__dsMediaError=null;};
    const failed=e=>{
      if(!active()||e.code==='media/canceled')return;
      window.__dsMediaError={path,code:S(e.code||e.name),message:S(e.message),status:Number(e.status||0),at:Date.now()};
      console.warn('Medienabruf fehlgeschlagen',path,e.code||e.name,e.status||0);
      let message=el.nextElementSibling;if(!message?.matches('[data-ds-media-error]')){message=document.createElement('span');message.dataset.dsMediaError='1';message.setAttribute('role','status');el.after(message);}
      message.replaceChildren(document.createTextNode('Datei konnte nicht geladen werden. '+S(e.message)+' '));
      const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Erneut laden';retry.onclick=()=>{if(!active())return;el.setAttribute(attr,source);loadMedia(el);};message.append(retry);
    };
    try{
      let url=blobs.get(key);
      if(!url){
        let job=mediaJobs.get(key);
        if(!job){job=requestMedia(path,user,epoch);mediaJobs.set(key,job);job.finally(()=>{if(mediaJobs.get(key)===job)mediaJobs.delete(key);}).catch(()=>{});}
        const blob=await job;
        if(!active())return;
        url=blobs.get(key);if(!url){url=URL.createObjectURL(blob);blobs.set(key,url);}
      }
      if(!active()||el.hasAttribute(attr)&&el.getAttribute(attr)!==source)return;
      view.url=url;clearError();
      if(attr==='src'){
        const onError=()=>{el.removeEventListener('load',onLoad);if(!active()||el.getAttribute(attr)!==url)return;if(blobs.get(key)===url){blobs.delete(key);URL.revokeObjectURL(url);}failed(mediaError('media/decode','Die Datei wurde geladen, kann aber nicht als Bild oder Video angezeigt werden. Bitte ein gültiges JPEG-/PNG-Bild verwenden.'));};
        const onLoad=()=>{el.removeEventListener('error',onError);if(active())clearError();};
        el.addEventListener('error',onError,{once:true});el.addEventListener('load',onLoad,{once:true});
      }
      el.setAttribute(attr,url);
    }catch(e){failed(e);}finally{if(mediaElements.get(el)===view)delete el.dataset.dsLoading;}
  }
  function scanMedia(root){
    if(root?.matches?.('img[src],video[src],a[href]'))loadMedia(root);
    root?.querySelectorAll?.('img[src^="ds-storage:"],video[src^="ds-storage:"],a[href^="ds-storage:"]').forEach(loadMedia);
  }
  async function prepareNewPetPhoto(file){
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Bild konnte nicht gelesen werden.'));reader.readAsDataURL(file);});
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Bildformat konnte nicht verarbeitet werden.'));img.src=data;});
    const scale=Math.min(1,1200/Math.max(image.width,image.height)), canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',0.72);
    if(result.length>180000) throw new Error('Das Foto ist zu groß. Bitte einen kleineren Ausschnitt wählen.');
    return result;
  }
  async function preparePetPhoto(file){
    const type=S(file?.type).toLowerCase(),name=S(file?.name);
    if(!file||!(type.startsWith('image/')||(!type&&/\.(jpe?g|png|webp|hei[cf])$/i.test(name))))throw new Error('Bitte eine Bilddatei auswählen.');
    if(file.size>25*1024*1024)throw new Error('Das Originalfoto ist größer als 25 MB. Bitte einen kleineren Ausschnitt wählen.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Das Foto konnte nicht gelesen werden. Bitte erneut auswählen.'));reader.readAsDataURL(file);});
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Dieses Bildformat kann auf diesem Gerät nicht gelesen werden. Bitte als JPEG oder PNG auswählen.'));img.src=data;});
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    if(!width||!height||width*height>60000000)throw new Error('Die Bildgröße kann nicht verarbeitet werden. Bitte einen kleineren Ausschnitt wählen.');
    const scale=Math.min(1,2048/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Die Bildverarbeitung ist nicht verfügbar. Bitte die App erneut öffnen.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',0.88),match=result.match(/^data:image\/(jpeg|png);base64,(.+)$/);
    if(!match)throw new Error('Das Foto konnte nicht vorbereitet werden.');
    const raw=atob(match[2]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length>=8*1024*1024)throw new Error('Das vorbereitete Foto ist zu groß. Bitte einen kleineren Ausschnitt wählen.');
    return new Blob([bytes],{type:'image/'+match[1]});
  }
  function photoBusy(){return Array.from(photoRecords.values()).some(r=>r.phase==='uploading');}
  function photoProblem(){return Array.from(photoRecords.values()).find(r=>r.phase==='error');}
  function updatePhotoControls(){
    for(const [kind,cfg]of Object.entries(photoFields)){
      const input=$(cfg.input);if(!input)continue;let status=$(cfg.input+'Status');
      if(!status){status=document.createElement('div');status.id=cfg.input+'Status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='margin:8px 0;overflow-wrap:anywhere';input.after(status);}
      status.replaceChildren();const r=photoRecords.get(kind);
      reviewNode('p',r?.message||(cfg.get()?cfg.label+' vorhanden.':'Noch kein '+cfg.label+' hinterlegt.'),status);
      if(r?.phase==='error'){const retry=reviewNode('button','Erneut versuchen',status);retry.type='button';retry.className='btn';retry.style.minHeight='44px';retry.dataset.photoRetry=kind;retry.onclick=()=>startPhoto(kind,r.file);}
      const remove=$(cfg.remove);if(remove){remove.type='button';remove.textContent=r&&['uploading','error'].includes(r.phase)?'Auswahl verwerfen':'Foto entfernen';remove.style.minHeight='44px';remove.style.display=(cfg.get()||r)?'inline-flex':'none';}
    }
    const blocked=photoBusy()||!!photoProblem();for(const id of ['btnCpSave','btnCpAddAnotherDog']){const button=$(id);if(!button)continue;
      if(blocked){if(!button.hasAttribute('data-photo-blocked'))button.dataset.photoWasDisabled=String(button.disabled);button.dataset.photoBlocked='1';button.disabled=true;}
      else if(button.hasAttribute('data-photo-blocked')){button.disabled=button.dataset.photoWasDisabled==='true';delete button.dataset.photoBlocked;delete button.dataset.photoWasDisabled;}
    }
  }
  function resetPhotoEditor(){photoEpoch++;for(const r of photoRecords.values())if(r.previewUrl)URL.revokeObjectURL(r.previewUrl);photoRecords.clear();
    for(const cfg of Object.values(photoFields)){const input=$(cfg.input);if(input)input.value='';}
    for(const id of ['p_profilePhotoStatus','p_vaccinationPhotoStatus'])$(id)?.remove();
    for(const id of ['btnCpSave','btnCpAddAnotherDog']){const button=$(id);if(button?.hasAttribute('data-photo-blocked')){button.disabled=button.dataset.photoWasDisabled==='true';delete button.dataset.photoBlocked;delete button.dataset.photoWasDisabled;}}
  }
  function startPhoto(kind,file){
    const cfg=photoFields[kind];if(!cfg||!file)return;const previous=photoRecords.get(kind);if(previous?.previewUrl)URL.revokeObjectURL(previous.previewUrl);
    const epoch=photoEpoch,uid=currentUser()?.uid,target=JSON.stringify(photoBindings?.target());
    const active=()=>epoch===photoEpoch&&currentUser()?.uid===uid&&JSON.stringify(photoBindings?.target())===target&&photoRecords.get(kind)===r;
    const r={phase:'uploading',file,previous:cfg.get(),message:cfg.label+' wird vorbereitet und hochgeladen …',job:null,previewUrl:''};photoRecords.set(kind,r);
    const image=$(cfg.preview);if(image){delete image.dataset.dsMedia;delete image.dataset.dsLoading;image.nextElementSibling?.matches('[data-ds-media-error]')&&image.nextElementSibling.remove();try{r.previewUrl=URL.createObjectURL(file);image.src=r.previewUrl;image.style.display='block';}catch(_){}}
    updatePhotoControls();cpSetStatus('Fotoübertragung läuft. Bitte warten, bevor du die Änderung sendest.');
    r.job=(async()=>{try{const value=await cpUploadPetPhotoToStorage(file,kind);if(!active())return;
      if(!value)throw new Error('Der Upload wurde nicht bestätigt.');cfg.set(value);r.phase='ready';r.message=cfg.label+' bereit: '+S(file.name)+'. Wird mit der Änderung zur Prüfung gesendet.';cfg.refresh();cpUpdateDirty();if(!photoBusy()&&!photoProblem())cpSetStatus('Fotos bereit. Änderung bitte zur Prüfung einreichen.');
    }catch(e){if(!active())return;r.phase='error';r.message=cfg.label+' nicht übertragen: '+S(e.message||e)+'. Bitte erneut versuchen oder die Auswahl verwerfen.';cpSetStatus(r.message,true);}
    finally{if(active()){r.job=null;updatePhotoControls();}
      else if(photoRecords.get(kind)===r){photoRecords.delete(kind);if(epoch===photoEpoch&&currentUser()?.uid===uid)updatePhotoControls();}
    }})();
  }
  function discardPhoto(kind){const cfg=photoFields[kind],r=photoRecords.get(kind);if(!cfg)return;if(r?.previewUrl)URL.revokeObjectURL(r.previewUrl);
    const canceled=r&&['uploading','error'].includes(r.phase);if(canceled)cfg.set(r.previous||'');else cfg.set('');photoRecords.delete(kind);const input=$(cfg.input);if(input)input.value='';cfg.refresh();cpUpdateDirty();updatePhotoControls();cpSetStatus(canceled?'Fotoauswahl verworfen. Das bisherige Foto bleibt erhalten.':'Foto zur Entfernung vorgemerkt. Änderung bitte zur Prüfung einreichen.');
  }
  function wirePhotoInputs(bindings){if(bindings)photoBindings=bindings;
    for(const [kind,cfg]of Object.entries(photoFields)){const input=$(cfg.input),remove=$(cfg.remove);
      if(input&&!input.dataset.dsPhotoWired){input.dataset.dsPhotoWired='1';input.accept='image/*';input.addEventListener('change',()=>{const file=input.files?.[0];if(file)startPhoto(kind,file);});}
      if(remove&&!remove.dataset.dsPhotoWired){remove.dataset.dsPhotoWired='1';remove.type='button';remove.addEventListener('click',()=>discardPhoto(kind));}
      cfg.refresh();
    }updatePhotoControls();
  }
  async function waitForPhotos(){const epoch=photoEpoch,uid=currentUser()?.uid,target=JSON.stringify(photoBindings?.target());while(photoBusy()){
      const jobs=Array.from(photoRecords.values()).filter(r=>r.phase==='uploading'&&r.job).map(r=>r.job);if(!jobs.length)throw new Error('Die Fotoverarbeitung wurde unterbrochen. Bitte die Fotoauswahl verwerfen und erneut auswählen.');
      await Promise.all(jobs);if(epoch!==photoEpoch||currentUser()?.uid!==uid||JSON.stringify(photoBindings?.target())!==target)throw new Error('Konto oder geöffneter Hund wurde während des Fotouploads gewechselt.');
      if(photoBusy()&&!Array.from(photoRecords.values()).some(r=>r.phase==='uploading'&&r.job&&!jobs.includes(r.job)))throw new Error('Die Fotoverarbeitung wurde unterbrochen. Bitte die Fotoauswahl verwerfen und erneut auswählen.');
    }
    if(epoch!==photoEpoch||currentUser()?.uid!==uid)throw new Error('Konto oder geöffneter Hund wurde gewechselt.');const problem=photoProblem();if(problem)throw new Error(problem.message);
  }
  function signatureDraftKey(){
    const ctx=context(), pid=S($('contractPetSelect')?.value), v=S(typeof state!=='undefined'?state.contractVersion:'v1.0');
    return 'ds_contract_draft_v3:'+ctx.uid+':'+ctx.customerId+':'+pid+':'+v;
  }
  function clearSignature(){
    draft=null; sessionStorage.removeItem(signatureDraftKey());
    const c=$('contractSig'); if(c){c.getContext('2d').clearRect(0,0,c.width,c.height);ink.delete(c);}
    if($('contractSignedInfo')) $('contractSignedInfo').textContent='Bitte für diese Auswahl unterschreiben.';
  }
  function changeSignatureSelection(){
    draft=null;
    const c=$('contractSig');if(c){c.getContext('2d').clearRect(0,0,c.width,c.height);ink.delete(c);}
    if($('contractAcceptChk'))$('contractAcceptChk').checked=false;
    renderContractStatus();
  }
  function sign(){
    const ctx=context(), c=$('contractSig'), cid=S($('contractCustomerSelect')?.value), pid=S($('contractPetSelect')?.value);
    if(scoped() && (!ctx.verified || cid!==ctx.customerId || !ctx.pets.some(p=>p.id===pid))) throw new Error('Kundenkonto oder Hund nicht eindeutig zugeordnet.');
    if(!c || !ink.has(c)) throw new Error('Bitte zuerst im Unterschriftenfeld unterschreiben.');
    if(!Core.canvasHasInk(c.getContext('2d').getImageData(0,0,c.width,c.height).data))throw new Error('Das Unterschriftenbild ist leer. Bitte erneut unterschreiben.');
    draft={customerId:cid,petId:pid,version:S(state.contractVersion || 'v1.0'),signature:{dataUrl:c.toDataURL('image/png'),signedAt:Date.now()}};
    sessionStorage.setItem(signatureDraftKey(),JSON.stringify(draft));
    if($('contractSignedInfo')) $('contractSignedInfo').textContent='✅ Unterschrift erfasst. Bitte zur Prüfung einreichen.';
  }
  async function signatureHasInk(signature){
    if(!Core.signatureValid(signature))throw new Error('Das gespeicherte Unterschriftenbild ist beschädigt oder ungültig.');
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Das Unterschriftenbild konnte nicht gelesen werden.'));img.src=signature.dataUrl;});
    const width=image.naturalWidth || image.width,height=image.naturalHeight || image.height;
    if(!width || !height || width*height>2000000)throw new Error('Ungültige Größe des Unterschriftenbildes.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    if(!Core.canvasHasInk(ctx.getImageData(0,0,width,height).data))throw new Error('Das Unterschriftenbild ist leer. Eine Freigabe ist gesperrt.');
    return true;
  }
  async function submitContract(){
    const ctx=context(), cid=S($('contractCustomerSelect')?.value), pid=S($('contractPetSelect')?.value), v=S(state.contractVersion || 'v1.0');
    const saved=draft || JSON.parse(sessionStorage.getItem(signatureDraftKey()) || 'null');
    if(!$('contractAcceptChk')?.checked) throw new Error('Bitte den Betreuungsvertrag lesen und bestätigen.');
    if(!saved || saved.customerId!==cid || saved.petId!==pid || saved.version!==v || !Core.signatureValid(saved.signature)) throw new Error('Bitte für diesen Hund und diese Vertragsfassung unterschreiben.');
    await signatureHasInk(saved.signature);
    if(currentUser()?.uid!==ctx.uid || S($('contractCustomerSelect')?.value)!==cid || S($('contractPetSelect')?.value)!==pid || S(state.contractVersion || 'v1.0')!==v)throw new Error('Konto, Hund oder Vertragsfassung wurde während der Prüfung gewechselt.');
    if(!scoped()){
      if(CLOUD.role!=='admin')throw new Error('Nur der Administrator darf einen vor Ort unterzeichneten Vertrag freigeben.');
      const res=await api().approveManualContract(cid,pid,v,saved.signature,true,Number(state._cloudUpdatedAt || CLOUD._lastRemoteStamp || 0));
      sessionStorage.removeItem(signatureDraftKey());draft=null;
      if($('contractSavedInfo'))$('contractSavedInfo').textContent='✅ Unterzeichneter Vertrag freigegeben und mit den Kundenkonten synchronisiert.';
      return res;
    }
    if(cid!==ctx.customerId) throw new Error('Fremde Kundenauswahl.');
    if(!saved.proposalId){ saved.proposalId=crypto.randomUUID();sessionStorage.setItem(signatureDraftKey(),JSON.stringify(saved));draft=saved; }
    let sourceTaskId='';
    try{const rec=JSON.parse(sessionStorage.getItem('ds_customer_source_task')||'null');if(rec?.uid===ctx.uid && rec.templateId==='boarding_contract')sourceTaskId=S(rec.id);}catch(_){}
    const res=await submit({id:saved.proposalId,templateId:'boarding_contract',title:'Betreuungsvertrag zur Prüfung',customerId:cid,petId:pid,
      sourceTaskId,
      payloadSubmitted:{customerId:cid,petId:pid,contractVersion:v,accepted:true,signature:saved.signature}});
    if(!res.ok) throw res.error || new Error('Die Übertragung ist noch ausstehend.');
    saved.submissionStatus='submitted';sessionStorage.setItem(signatureDraftKey(),JSON.stringify(saved));draft=saved;
    if($('contractSavedInfo')) $('contractSavedInfo').textContent='✅ An Eingänge übermittelt. Freigabe durch den Administrator ausstehend.';
    // Preserve the captured signature and submission id for reload/retry; never mark a pending contract valid.
    return res;
  }
  async function submit(opts){
    const user=currentUser();if(!user) throw new Error('Bitte mit dem Kundenkonto anmelden.');
    const profile=await api().profile(user.uid);
    if(currentUser()?.uid!==user.uid) throw new Error('Kundenkonto gewechselt.');
    CLOUD.userProfile=profile;
    const data=Core.submission({...opts,id:opts.id || crypto.randomUUID()},user,profile);
    const queueKey='ds_customer_proposal_queue_v3:'+user.uid;
    const queue=JSON.parse(DSBrowserStore.get(queueKey)||'[]');
    if(!queue.some(x=>x.id===data.id)) queue.push(data);
    await DSBrowserStore.put(queueKey,JSON.stringify(queue));
    if(currentUser()?.uid!==user.uid)throw new Error('Kundenkonto gewechselt.');
    try{
      await api().submit(data);
      await DSBrowserStore.cache(queueKey,JSON.stringify(queue.filter(x=>x.id!==data.id)));
      window.dispatchEvent(new CustomEvent('ds-customer-data-ready'));
      return {ok:true,pending:false,task:data};
    }catch(e){if(typeof updateSyncUI==='function')updateSyncUI();return {ok:false,pending:true,error:e,task:data}; }
  }
  async function retryQueue(){
    const user=currentUser();if(!user) return;
    const key='ds_customer_proposal_queue_v3:'+user.uid;
    const items=JSON.parse(DSBrowserStore.get(key)||'[]');
    for(const data of items){
      if(currentUser()?.uid!==user.uid) return;
      try{
        await api().submit(data);
        const latest=JSON.parse(DSBrowserStore.get(key)||'[]');
        await DSBrowserStore.cache(key,JSON.stringify(latest.filter(x=>x.id!==data.id)));
      }catch(e){error(e,'customerTaskSaveHint');return;}
    }
  }
  function renderContractStatus(){
    const cid=S($('contractCustomerSelect')?.value),pid=S($('contractPetSelect')?.value),v=S(state.contractVersion || 'v1.0');
    if(scoped()){
      const ctx=context(); if($('contractSaveBtn')){$('contractSaveBtn').textContent='Zur Prüfung einreichen';$('contractSaveBtn').disabled=!ctx.verified;}
      if($('contractCustomerSelect')) $('contractCustomerSelect').disabled=true;
      if(!ctx.verified && $('contractSavedInfo')) $('contractSavedInfo').textContent='Konto noch nicht vom Administrator zugeordnet.';
    }else if($('contractSaveBtn')){
      $('contractSaveBtn').textContent='Unterzeichneten Vertrag freigeben';$('contractSaveBtn').disabled=CLOUD.role!=='admin';
    }
    draft=null;
    const approved=Core.approvedContract(state,cid,pid,v);
    if($('contractSavedInfo'))$('contractSavedInfo').textContent=approved?'✅ Vertrag vom Administrator freigegeben.':'Freigabe durch den Administrator ausstehend.';
    if(approved && $('contractAcceptChk'))$('contractAcceptChk').checked=true;
    const saved=JSON.parse(sessionStorage.getItem(signatureDraftKey()) || 'null');
    if(saved && saved.customerId===cid && saved.petId===pid && saved.version===v && Core.signatureValid(saved.signature)){
      draft=saved;const image=new Image();image.onload=()=>{const c=$('contractSig');if(c && S($('contractPetSelect')?.value)===pid)c.getContext('2d').drawImage(image,0,0,c.width,c.height);};image.src=saved.signature.dataUrl;
      if($('contractSignedInfo')) $('contractSignedInfo').textContent='Unterschrift als Entwurf erhalten.';
      if(!approved && saved.submissionStatus==='submitted' && $('contractSavedInfo'))$('contractSavedInfo').textContent='An Eingänge übermittelt. Freigabe durch den Administrator ausstehend.';
    }else if(approved){
      const sig=state.contractSignatures[Core.signatureKey(cid,pid,v)],image=new Image();
      image.onload=()=>{const c=$('contractSig');if(c && S($('contractPetSelect')?.value)===pid)c.getContext('2d').drawImage(image,0,0,c.width,c.height);};image.src=sig.dataUrl;
      if($('contractSignedInfo'))$('contractSignedInfo').textContent='Freigegebene Unterschrift für diesen Hund und diese Vertragsfassung vorhanden.';
    }
  }
  function renderInbox(){
    const ready=inboxRowsReady&&inboxArchiveReady&&!inboxLoadError,archived=inboxView==='archive',rows=inboxRows.filter(r=>inboxMarkers.has(r.id)===archived);
    for(const id of inboxSelected)if(!rows.some(r=>r.id===id))inboxSelected.delete(id);
    let toolbar=$('dsInboxToolbar');if(!toolbar&&$('inboxList')){toolbar=document.createElement('div');toolbar.id='dsInboxToolbar';toolbar.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0';$('inboxList').before(toolbar);}
    if(toolbar){toolbar.replaceChildren();for(const [view,label]of [['open','Offen'],['archive','Archiv']]){const button=reviewNode('button',label+' ('+inboxRows.filter(r=>inboxMarkers.has(r.id)===(view==='archive')).length+')',toolbar);button.type='button';button.className='btn';button.style.minHeight='44px';button.dataset.inboxView=view;button.setAttribute('aria-pressed',String(inboxView===view));button.disabled=inboxMutating;button.onclick=()=>{closeReview();inboxView=view;inboxSelected.clear();renderInbox();};}
      if(CLOUD.role==='admin'&&ready&&rows.length){const label=reviewNode('label',null,toolbar);label.style.cssText='display:flex;gap:8px;align-items:center;min-height:44px';const all=reviewNode('input',null,label);all.type='checkbox';all.checked=rows.every(r=>inboxSelected.has(r.id));all.disabled=inboxMutating;all.dataset.inboxSelectAll='1';all.style.cssText='width:24px;height:24px';reviewNode('span','Alle auswählen',label);all.onchange=()=>{if(all.checked)rows.forEach(r=>inboxSelected.add(r.id));else inboxSelected.clear();renderInbox();};
        const bulk=reviewNode('button',(archived?'Auswahl wiederherstellen':'Auswahl archivieren')+' ('+inboxSelected.size+')',toolbar);bulk.type='button';bulk.className='btn';bulk.style.minHeight='44px';bulk.dataset.inboxBulk=archived?'restore':'archive';bulk.disabled=inboxMutating||!inboxSelected.size;bulk.onclick=()=>changeInboxArchive(rows.filter(r=>inboxSelected.has(r.id)),!archived);
      }
    }
    for(const id of ['inboxList','inboxProposalList']){
      const list=$(id);if(!list)continue;list.replaceChildren();
      if(!ready){list.textContent=inboxLoadError?'Eingänge konnten nicht vollständig geladen werden: '+inboxLoadError:'Eingänge und Archiv werden geladen …';continue;}
      if(!rows.length){list.textContent=archived?'Keine archivierten offenen Eingänge.':'Keine offenen Eingänge.';continue;}
      rows.forEach(row=>{
        const el=document.createElement('div');el.className='list-item';el.dataset.inboxId=row.id;el.style.cssText='padding:12px 0;border-bottom:1px solid #8885';
        const text=document.createElement('div');text.textContent=(row.title || row.templateId)+' · '+(row.customerName || row.customerEmail);
        el.append(text);const actions=reviewNode('div',null,el);actions.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px';
        if(CLOUD.role==='admin'){const select=reviewNode('input',null,actions);select.type='checkbox';select.setAttribute('aria-label','Eingang auswählen: '+text.textContent);select.dataset.inboxSelect=row.id;select.checked=inboxSelected.has(row.id);select.disabled=inboxMutating;select.style.cssText='width:24px;height:24px';select.onchange=()=>{if(select.checked)inboxSelected.add(row.id);else inboxSelected.delete(row.id);renderInbox();};}
        if(!archived){const open=reviewNode('button','Prüfen',actions);open.type='button';open.className='smallbtn';open.style.minHeight='44px';open.disabled=inboxMutating;open.onclick=()=>openReview(row);}
        if(CLOUD.role==='admin'){const move=reviewNode('button',archived?'Wiederherstellen':'Archivieren',actions);move.type='button';move.className='smallbtn';move.style.minHeight='44px';move.dataset.inboxAction=archived?'restore':'archive';move.disabled=inboxMutating;move.onclick=()=>changeInboxArchive([row],!archived);}
        list.append(el);
      });
    }
    if($('inboxProposalMsg')) $('inboxProposalMsg').textContent=inboxLoadError||(!ready?'Eingänge werden geladen …':inboxRows.filter(r=>!inboxMarkers.has(r.id)).length+' offene Eingänge · '+inboxRows.filter(r=>inboxMarkers.has(r.id)).length+' im Archiv.');
  }
  async function changeInboxArchive(rows,archived){
    if(inboxMutating||CLOUD.role!=='admin'||!rows.length)return;const actor=currentUser()?.uid,epoch=inboxEpoch;inboxMutating=true;renderInbox();
    try{
      if(rows.length>100)throw new Error('Bitte höchstens 100 Eingänge auf einmal auswählen.');
      await api().setInboxArchived(rows.map(row=>({id:row.id,expectedRow:row})),archived);
      if(currentUser()?.uid!==actor||epoch!==inboxEpoch)return;
      for(const row of rows)if(archived)inboxMarkers.set(row.id,{proposalId:row.id});else inboxMarkers.delete(row.id);
      inboxSelected.clear();if(reviewRow&&rows.some(r=>r.id===reviewRow.id))closeReview();
      if($('inboxFeedback'))$('inboxFeedback').textContent='✅ '+rows.length+(rows.length===1?' Eingang ':' Eingänge ')+(archived?'archiviert. Unter Archiv kannst du sie wiederherstellen.':'wieder in Offen.');
    }catch(e){if(currentUser()?.uid===actor&&epoch===inboxEpoch&&$('inboxFeedback'))$('inboxFeedback').textContent='❌ '+e.message;}
    finally{if(currentUser()?.uid===actor&&epoch===inboxEpoch){inboxMutating=false;renderInbox();}}
  }
  async function wireInbox(force=false){
    window.DSRepair?.install();
    const user=currentUser();if(!user || !['admin','staff'].includes(CLOUD.role)) return;
    if(inboxMutating&&inboxUid===user.uid)return;
    if(!force&&!inboxLoadError&&inboxUnsub&&inboxArchiveUnsub&&inboxUid===user.uid){renderInbox();return;}
    if(inboxUnsub)inboxUnsub();if(inboxArchiveUnsub)inboxArchiveUnsub();inboxUid=user.uid;const epoch=++inboxEpoch;
    inboxRows=[];inboxMarkers.clear();inboxSelected.clear();inboxArchiveReady=inboxRowsReady=false;inboxLoadError='';renderInbox();
    const org=firebase.firestore().collection('orgs').doc(window.firebaseOrgId),failed=e=>{if(currentUser()?.uid!==user.uid||epoch!==inboxEpoch)return;inboxLoadError=e.message;renderInbox();};
    inboxUnsub=org.collection('proposals').where('proposalStatus','==','pending').onSnapshot({includeMetadataChanges:true},snap=>{
      if(currentUser()?.uid!==user.uid||epoch!==inboxEpoch||snap.metadata.hasPendingWrites)return;
      inboxRowsReady=true;
      inboxRows=snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>b.submittedAt-a.submittedAt);renderInbox();
    },failed);
    inboxArchiveUnsub=org.collection('inboxArchive').onSnapshot({includeMetadataChanges:true},snap=>{
      if(currentUser()?.uid!==user.uid||epoch!==inboxEpoch||snap.metadata.hasPendingWrites)return;
      inboxArchiveReady=true;inboxMarkers=new Map(snap.docs.map(d=>[d.id,d.data()]));renderInbox();
    },failed);
  }
  function reviewControls(){
    for(const id of ['btnInboxAdopt','btnInboxClose']){
      const button=$(id);if(!button)continue;
      button.hidden=false;button.style.removeProperty('display');button.style.removeProperty('visibility');
      button.disabled=!reviewRow || busy || CLOUD.role!=='admin';
    }
  }
  function closeReview(){
    $('dsReviewPhotoDialog')?.remove();
    reviewRow=null;if($('inboxDetail'))$('inboxDetail').style.display='none';
    $('inboxDetailForm')?.replaceChildren();if($('inboxDetailForm'))delete $('inboxDetailForm').__dsReviewWorkspace;if($('inboxDetailMeta'))$('inboxDetailMeta').textContent='';
    if($('inboxReviewStatus'))$('inboxReviewStatus').textContent='';
    if($('inboxList'))$('inboxList').style.display='';
    if($('inboxProposalList'))$('inboxProposalList').style.display='none';
    reviewControls();
  }
  function reviewStyles(){
    if($('dsReviewStyles'))return;const el=document.createElement('style');el.id='dsReviewStyles';el.textContent=`
      #inboxDetailForm{font-size:16px;line-height:1.5;text-align:left;overflow-wrap:anywhere}
      #inboxDetailForm .dsStaySummary{display:grid;grid-template-columns:minmax(90px,150px) minmax(0,1fr);gap:8px 16px}
      #inboxDetailForm dt{font-weight:700}#inboxDetailForm dd{margin:0;white-space:pre-wrap}
      #inboxDetailForm .dsReviewTableWrap{overflow-x:auto;max-width:100%;margin:14px 0}
      #inboxDetailForm table{width:100%;border-collapse:collapse}#inboxDetailForm th,#inboxDetailForm td{padding:10px;text-align:left;border-bottom:1px solid #8888;vertical-align:top}
      #inboxDetailForm [data-changed="true"]{border-left:5px solid #ff7777;padding-left:12px}
      #inboxDetailForm [data-changed="true"]>span,#inboxDetailForm .dsChangedText{color:#ffaaaa;font-weight:700}
      #inboxDetailForm [data-changed="true"] input{border:2px solid #ff7777}
      #inboxDetailForm .dsStaySignaturePreview{background:#fff;border-radius:10px;max-width:100%;width:500px;height:auto;padding:8px;box-sizing:border-box}
      #inboxDetailForm summary{cursor:pointer;min-height:44px;padding:10px 0}#inboxDetailForm .dsConsentText{white-space:pre-wrap}
      #inboxDetailForm button{min-height:44px}#inboxDetailForm .dsOverCapacity{color:#ffaaaa;font-weight:700}
      @media(max-width:600px){#inboxDetailForm .dsStaySummary{grid-template-columns:1fr}#inboxDetailForm dd{margin-bottom:8px}}
    `;document.head.append(el);
  }
  function reviewNode(tag,text,parent){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(parent)parent.append(el);return el;}
  const reviewLabels={name:'Name',email:'E-Mail',phone:'Telefon',street:'Straße / Hausnummer',zip:'PLZ',city:'Ort',emergencyName:'Notfallkontakt',emergencyPhone:'Notfalltelefon',pickupAuth:'Abholberechtigte',note:'Hinweise',breed:'Rasse / Mix',birthdate:'Geburtsdatum',sex:'Geschlecht',chipStatus:'Gechippt?',chip:'Chip vorhanden',chipNumber:'Chipnummer',vet:'Tierarzt (Name / Praxis)',vetPhone:'Tierarzt Telefon',vetEmail:'Tierarzt E-Mail',vetStreet:'Straße / Hausnummer Tierarzt',vetZip:'PLZ Tierarzt',vetCity:'Ort Tierarzt',vetEmergencyName:'Tierärztlicher Notfallkontakt',vetEmergencyPhone:'Tierärztliche Notfallnummer',allergies:'Allergien',medicalConditions:'Erkrankungen',insuranceStatus:'Haftpflichtversicherung',insuranceCompany:'Versicherung',insurancePolicy:'Versicherungsnummer',insuranceNotes:'Hinweise zur Versicherung',vaccinatedConfirmed:'Impfstatus bestätigt',rabiesDate:'Tollwutimpfung',mixedVaccineDate:'Kombinationsimpfung',vaccinationPassPhoto:'Impfpassfoto',profilePhoto:'Profilfoto',food:'Futter',treatsAllowed:'Leckerli erlaubt',aloneTime:'Alleinbleiben',houseTrained:'Stubenrein',transport:'Transport',feeding:'Fütterung',compatDogs:'Verträglichkeit mit Hunden',compatCats:'Verträglichkeit mit Katzen',compatKids:'Verträglichkeit mit Kindern',compat:'Verträglichkeit',leashBehavior:'Leinenverhalten',recall:'Rückruf',resourceBehavior:'Ressourcenverhalten',behavior:'Verhalten',dailyRoutine:'Tagesablauf',commands:'Kommandos'};
  function reviewValue(value,key){if(['profilePhoto','vaccinationPassPhoto'].includes(key))return value?'Foto vorhanden':'Kein Foto';if(value===true||value==='yes')return 'Ja';if(value===false||value==='no')return 'Nein';if(key==='sex')return{m:'männlich',w:'weiblich',f:'weiblich'}[value]||S(value)||'—';return S(value)||'—';}
  function reviewPhoto(parent,value,label){
    const source=mediaSource(value);if(!source){reviewNode('p','Kein Foto',parent);return;}
    const image=reviewNode('img',null,parent);image.src=source;image.alt=label;image.style.cssText='display:block;max-width:min(240px,100%);max-height:200px;object-fit:contain;margin:8px 0';scanMedia(image);
    const open=reviewNode('button','Foto ansehen',parent);open.type='button';open.className='btn';open.style.minHeight='44px';open.onclick=()=>{
      $('dsReviewPhotoDialog')?.remove();const dialog=reviewNode('dialog',null,document.body);dialog.id='dsReviewPhotoDialog';dialog.style.cssText='max-width:min(1000px,95vw);max-height:90vh;overflow:auto;background:#20232b;color:#fff;border:1px solid #8c94a4;border-radius:12px;padding:18px';reviewNode('h2',label,dialog);
      const full=reviewNode('img',null,dialog);full.src=source;full.alt=label;full.style.cssText='display:block;max-width:100%;height:auto';scanMedia(full);const close=reviewNode('button','Schließen',dialog);close.type='button';close.className='btn';close.style.minHeight='44px';close.onclick=()=>dialog.remove();if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    };
  }
  function reviewDate(value){const date=Core.dateISO(value);return date?date.slice(8,10)+'.'+date.slice(5,7)+'.'+date.slice(0,4):'Nicht angegeben';}
  function changedFields(root,row,workspace){
    const p=row.payloadSubmitted||{},summary=$('dsReviewChanges');if(!summary)return;summary.replaceChildren();const changes=[];
    for(const [kind,keys]of [['customer',Core.customerFields],['pet',Core.petFields]]){
      const before=(workspace?.[kind==='customer'?'customers':'pets']||[]).find(x=>x.id===(kind==='customer'?row.customerId:row.petId));
      for(const key of keys){if(p[kind]?.[key]===undefined)continue;const input=root.querySelector('[data-review-kind="'+kind+'"][data-review-field="'+key+'"]');
        const value=input?(input.type==='checkbox'?input.checked:input.value):p[kind][key],previous=before?.[key],photo=['profilePhoto','vaccinationPassPhoto'].includes(key),changed=photo?mediaSource(previous)!==mediaSource(value):JSON.stringify(previous??'')!==JSON.stringify(value??'');
        const label=input?.closest('label')||root.querySelector('[data-review-photo="'+key+'"]');if(label){label.dataset.changed=String(changed);let line=label.querySelector('[data-review-before]');if(!line){line=reviewNode('small',null,label);line.dataset.reviewBefore='1';}line.textContent=changed?'Bisher: '+reviewValue(previous,key):'Unverändert';}
        if(changed)changes.push({kind,key,value,previous});
      }
    }
    if(!changes.length){reviewNode('p','Keine Abweichung zu den gespeicherten Angaben.',summary);return;}
    reviewNode('h3',changes.length+' geänderte Angabe'+(changes.length===1?'':'n'),summary);const wrap=reviewNode('div',null,summary);wrap.className='dsReviewTableWrap';const table=reviewNode('table',null,wrap),head=reviewNode('tr',null,reviewNode('thead',null,table));for(const title of ['Angabe','Bisher','Vorgeschlagen'])reviewNode('th',title,head);const body=reviewNode('tbody',null,table);
    for(const c of changes){const tr=reviewNode('tr',null,body);tr.dataset.changed='true';tr.dataset.changeField=c.key;reviewNode('td',(c.kind==='customer'?'Kunde: ':'Hund: ')+(reviewLabels[c.key]||c.key),tr);const before=reviewNode('td',null,tr),after=reviewNode('td',null,tr);after.className='dsChangedText';
      if(['profilePhoto','vaccinationPassPhoto'].includes(c.key)){reviewPhoto(before,c.previous,'Bisheriges '+reviewLabels[c.key]);reviewNode('p',c.value?(c.previous?'Foto ersetzt':'Neues Foto eingereicht'):'Foto zur Entfernung vorgeschlagen',after);if(c.value)reviewPhoto(after,c.value,'Eingereichtes '+reviewLabels[c.key]);}
      else{before.textContent=reviewValue(c.previous,c.key);after.textContent=reviewValue(c.value,c.key);}
    }
  }
  function renderReviewOccupancy(host,row,workspace,stamp){
    host.replaceChildren();reviewNode('h3','Belegung im angefragten Zeitraum',host);const p=row.payloadSubmitted||{},stay=Core.stayDetails(p);
    try{
      const days=Core.occupancyRange(workspace,stay.from,stay.to,{petId:row.petId,care:stay.care}),full=days.some(d=>d.exceeds);
      const status=reviewNode('p',full?'Die Anfrage würde die Kapazität überschreiten.':'Die Anfrage passt in die bestätigte Belegung.',host);status.className=full?'dsOverCapacity':'';
      reviewNode('p','Maximal 4 Hunde insgesamt. Der Abreisetag zählt mit. Offene Anfragen sind noch nicht reserviert.',host);
      const wrap=reviewNode('div',null,host);wrap.className='dsReviewTableWrap';const table=reviewNode('table',null,wrap);table.id='dsStayOccupancyTable';const head=reviewNode('tr',null,reviewNode('thead',null,table));
      for(const title of ['Datum','Tagesbetreuung','Urlaubsbetreuung','Gesamt bisher','Mit Anfrage'])reviewNode('th',title,head);
      const body=reviewNode('tbody',null,table);for(const d of days){const tr=reviewNode('tr',null,body);tr.dataset.day=d.day;if(d.exceeds)tr.className='dsOverCapacity';for(const value of [reviewDate(d.day),d.daycare+' / '+d.daycareCapacity,d.boarding+' / '+d.boardingCapacity,d.total+' / 4',d.after.total+' / 4'+(d.exceeds?' · zu voll':'')])reviewNode('td',value,tr);}
      reviewNode('small','Serverstand: '+new Date(stamp||Date.now()).toLocaleString('de-DE')+'. Beim Übernehmen wird die Kapazität erneut geprüft.',host);
    }catch(e){reviewNode('p',e.message,host);}
    const refresh=reviewNode('button','Belegung aktualisieren',host);refresh.type='button';refresh.className='btn';refresh.onclick=()=>loadReviewWorkspace(row,host.parentElement);
  }
  async function loadReviewWorkspace(row,root){
    const actor=currentUser()?.uid,occupancy=$('dsStayOccupancy'),baseline=$('dsReviewBaseline');
    try{const method=api().workspace;if(typeof method!=='function')return;const latest=await method();if(reviewRow!==row||currentUser()?.uid!==actor||!root.isConnected)return;
      if(row.templateId==='hundeannahme'&&occupancy)renderReviewOccupancy(occupancy,row,latest.payload,latest.stamp);
      if(row.templateId==='customer_data'){changedFields(root,row,latest.payload);root.__dsReviewWorkspace=latest.payload;if(baseline)baseline.textContent='Vergleich mit dem aktuellen Firebase-Stand vom '+new Date(latest.stamp||Date.now()).toLocaleString('de-DE')+'.';}
    }catch(e){if(reviewRow!==row||currentUser()?.uid!==actor)return;const target=row.templateId==='hundeannahme'?occupancy:baseline;if(target){target.replaceChildren();reviewNode('p','Der aktuelle Serverstand konnte nicht geladen werden: '+e.message,target);const retry=reviewNode('button','Erneut laden',target);retry.type='button';retry.className='btn';retry.onclick=()=>loadReviewWorkspace(row,root);}}
  }
  function renderStayReview(root,row){
    const p=row.payloadSubmitted||{},m=p.meta||{},f=p.fields||{},stay=Core.stayDetails(p),list=reviewNode('dl',null,root);list.className='dsStaySummary';
    const customer=(state.customers||[]).find(c=>c.id===row.customerId),pet=(state.pets||[]).find(c=>c.id===row.petId);
    for(const [label,value]of [['Kunde',row.customerName||customer?.name||f.halter_name||'Nicht angegeben'],['Hund',pet?.name||f.hund_name||'Nicht angegeben'],['Kontakt',row.customerEmail||f.halter_email||'—'],['Betreuungsart',m.betreuung||stay.care||'Nicht angegeben'],['Anreise',reviewDate(stay.from)+(stay.bringTime?' · '+stay.bringTime:'')],['Abreise',reviewDate(stay.to)+(stay.pickupTime?' · '+stay.pickupTime:'')],['Hinweise',stay.notes||'Keine Hinweise']]){reviewNode('dt',label,list);reviewNode('dd',value,list);}
    const occupancy=reviewNode('section',null,root);occupancy.id='dsStayOccupancy';reviewNode('h3','Belegung im angefragten Zeitraum',occupancy);reviewNode('p','Aktueller Serverstand wird geladen …',occupancy);
    const consents=reviewNode('section',null,root);reviewNode('h3','Bestätigungen des Kunden',consents);
    for(const [key,label]of Object.entries(Core.stayConsents)){const details=reviewNode('details',null,consents);reviewNode('summary',(f[key]===true?'✓ Bestätigt: ':'⚠ Nicht bestätigt: ')+label,details);reviewNode('p',p.consentTexts?.[key]||'Bei dieser Einreichung wurde kein vollständiger Textstand mitgespeichert.',details).className='dsConsentText';}
    reviewNode('h3','Unterschrift zum Aufenthalt',root);
    if(Core.signatureValid(p.signature)){const img=reviewNode('img',null,root);img.src=p.signature.dataUrl;img.alt='Unterschrift des Kunden zu dieser Aufenthaltsanfrage';img.className='dsStaySignaturePreview';reviewNode('p','Unterschrieben am '+new Date(Number(p.signature.signedAt)).toLocaleString('de-DE'),root);}
    else reviewNode('p','Keine gültige Unterschrift vorhanden. Für die Übernahme ist eine neue unterschriebene Anfrage erforderlich.',root).className='dsOverCapacity';
  }
  function openReview(row){
    reviewRow=row;const root=$('inboxDetailForm');if(!root)return;
    if($('inboxDetail')) $('inboxDetail').style.display='';
    if($('inboxDetailTitle')) $('inboxDetailTitle').textContent=row.title || row.templateId;
    root.replaceChildren();
    reviewStyles();
    const p=row.payloadSubmitted || {};
    if(row.templateId==='customer_data'){
      reviewNode('p',[row.customerName||p.customer?.name||'Kundenänderung',row.customerEmail].filter(Boolean).join(' · '),root);
      reviewNode('p','Vergleich mit dem geladenen Workspace. Aktueller Serverstand wird geprüft …',root).id='dsReviewBaseline';
      reviewNode('section',null,root).id='dsReviewChanges';
      const all=reviewNode('details',null,root);reviewNode('summary','Alle eingereichten Angaben prüfen oder bearbeiten',all);
      for(const [kind,keys] of [['customer',Core.customerFields],['pet',Core.petFields]]){
        const heading=document.createElement('h3');heading.textContent=kind==='customer'?'Kundendaten':'Hund';all.append(heading);
        for(const key of keys){
          const value=p[kind] && p[kind][key];if(value===undefined)continue;
          if(['profilePhoto','vaccinationPassPhoto'].includes(key)){const box=reviewNode('div',null,all);box.dataset.reviewPhoto=key;reviewNode('span',reviewLabels[key],box);if(value){const image=document.createElement('img');image.src=mediaSource(value);image.alt=key==='profilePhoto'?'Profilfoto':'Impfpassfoto';image.style.maxWidth='200px';box.append(image);scanMedia(image);}continue;}
          const label=document.createElement('label');label.className='field';const span=document.createElement('span');
          span.textContent=reviewLabels[key]||key;
          const input=document.createElement('input');input.dataset.reviewKind=kind;input.dataset.reviewField=key;
          if(typeof value==='boolean'){input.type='checkbox';input.checked=value;}else input.value=S(value);
          label.append(span,input);all.append(label);input.addEventListener('input',()=>changedFields(root,row,root.__dsReviewWorkspace||state));
        }
      }
      root.__dsReviewWorkspace=state;changedFields(root,row,state);
    }else if(row.templateId==='hundeannahme'){
      renderStayReview(root,row);
    }else{
      reviewNode('p',row.customerName||row.customerEmail||'Kundenvertrag',root);
      const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.textContent=JSON.stringify({...p,signature:p.signature?'Unterschrift unten':''},null,2);root.append(pre);
      if(p.signature && Core.signatureValid(p.signature)){const image=document.createElement('img');image.src=p.signature.dataUrl;image.alt='Eingereichte Unterschrift';image.style.maxWidth='100%';root.append(image);}
    }
    if($('inboxReviewStatus'))$('inboxReviewStatus').textContent=CLOUD.role==='admin'?'':'Nur der Administrator kann diesen Eingang übernehmen oder ablehnen.';
    reviewControls();
    if(['customer_data','hundeannahme'].includes(row.templateId))loadReviewWorkspace(row,root);
  }
  async function review(decision){
    if(!reviewRow) throw new Error('Bitte zuerst einen Eingang öffnen.');
    const selected=reviewRow,actor=currentUser()?.uid;
    if($('inboxReviewStatus'))$('inboxReviewStatus').textContent=decision==='adopted'?'Übernahme wird in Firebase gespeichert …':'Ablehnung wird in Firebase gespeichert …';
    if(decision==='adopted' && ['boarding_contract','hundeannahme'].includes(reviewRow.templateId))await signatureHasInk(reviewRow.payloadSubmitted?.signature);
    if(reviewRow!==selected || currentUser()?.uid!==actor)throw new Error('Eingang oder Konto wurde während der Prüfung gewechselt.');
    const edits=JSON.parse(JSON.stringify(reviewRow.payloadSubmitted || {}));
    document.querySelectorAll('[data-review-field]').forEach(input=>{
      edits[input.dataset.reviewKind][input.dataset.reviewField]=input.type==='checkbox'?input.checked:input.value;
    });
    const result=await api().review(selected.id,decision,edits);
    if(currentUser()?.uid!==actor)return;
    if(result.workspace&&typeof applyRemoteState==='function')applyRemoteState(result.workspace.payload,result.workspace.stamp,'review');
    if(reviewRow===selected)closeReview();
    const message=decision==='adopted'?'✅ Übernahme und Rückmeldung in Firebase gespeichert.':'✅ Vorschlag abgelehnt.';
    if($('inboxFeedback'))$('inboxFeedback').textContent=message;
    if($('assignMsg'))$('assignMsg').textContent=message;
  }
  async function wireAssignments(){
    window.DSRepair?.install();
    if(!currentUser() || CLOUD.role!=='admin')return;
    const select=$('assignCustomer');if(!select)return;
    if($('taskAssignCard')) $('taskAssignCard').style.display='';
    const selected=select.value;select.replaceChildren(new Option('Bitte auswählen',''));
    (state.customers || []).forEach(c=>select.add(new Option((c.name || c.email)+' · '+(c.email || ''),c.id)));
    if([...select.options].some(o=>o.value===selected))select.value=selected;
  }
  async function assign(){
    const cid=S($('assignCustomer')?.value),templateId=S($('assignTemplate')?.value),customer=(state.customers || []).find(c=>c.id===cid);
    if(!customer)throw new Error('Bitte einen bestehenden Kunden auswählen.');
    const users=firebase.firestore().collection('orgs').doc(window.firebaseOrgId).collection('users');
    const assigned=await users.where('customerId','==',cid).get({source:'server'});
    const snap=assigned.empty?await users.where('email','==',S(customer.email).toLowerCase()).get({source:'server'}):assigned;
    const accounts=snap.docs.filter(d=>d.data().role==='customer');
    if(accounts.length!==1)throw new Error('Zu dieser E-Mail ist kein eindeutiges registriertes Kundenkonto vorhanden.');
    await api().assign(accounts[0].id,cid,templateId);
    if($('assignMsg'))$('assignMsg').textContent='✅ Kundenzuordnung und Aufgabe gemeinsam in Firebase gespeichert.';
  }
  // Capture is registered once, before any legacy app.js listeners.
  document.addEventListener('pointermove',e=>{if(e.target?.id==='contractSig' && e.buttons)ink.add(e.target);},true);
  document.addEventListener('touchmove',e=>{if(e.target?.id==='contractSig' && e.touches?.length)ink.add(e.target);},true);
  document.addEventListener('change',e=>{if(['contractCustomerSelect','contractPetSelect'].includes(e.target?.id))changeSignatureSelection();},true);
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#btnCpSave,#btnCpAddAnotherDog')&&(photoBusy()||photoProblem())){e.preventDefault();e.stopImmediatePropagation();cpSetStatus(photoProblem()?.message||'Bitte warten, bis die Fotos vollständig übertragen wurden.',!!photoProblem());return;}
    if(e.target?.id==='contractSig'){e.stopImmediatePropagation();return;}
    const b=e.target?.closest?.('button');if(!b)return;
    const actions={dsOpenSyncConflict:openConflict,dsApplySyncMerge:()=>resolveConflict(false),dsUseServerSnapshot:()=>resolveConflict(true),dsCloseSyncMerge:()=>{$('dsSyncConflictDialog')?.remove();mergeReview=null;},contractSignBtn:sign,contractSigClear:clearSignature,contractSaveBtn:submitContract,btnInboxAdopt:()=>review('adopted'),btnInboxClose:()=>review('rejected'),btnAssignTask:assign,btnInboxRefresh:()=>wireInbox(true),btnInboxProposalLoad:()=>wireInbox(true),btnInboxBack:closeReview};
    const action=actions[b.id];if(!action)return;
    e.preventDefault();e.stopImmediatePropagation();if(busy)return;
    busy=true;b.disabled=true;reviewControls();
    Promise.resolve().then(action).catch(err=>error(err,b.closest('#dsSyncConflictDialog')?'dsSyncConflictStatus':b.closest('#inboxDetail')?'inboxReviewStatus':b.closest('#contract')?'contractSavedInfo':'assignMsg')).finally(()=>{busy=false;b.disabled=false;reviewControls();});
  },true);
  window.DSWorkflow={context,snapshot,hydrate,watchProfile,resetAccount,submit,submitContract,retryQueue,wireInbox,wireAssignments,openReview,closeReview,renderContractStatus,api,scoped,mediaSource,scanMedia,prepareNewPetPhoto,preparePetPhoto,wirePhotoInputs,waitForPhotos,resetPhotoEditor,signatureHasInk,rememberBase,showConflict,openConflict,resolveConflict,startupStatus,readWithTimeout,workspaceRole,retainUploadedPhoto,workspaceContent,sameWorkspace,hasLocalChanges,clearConflict,captureStartup,markWorkspaceEdit,installSyncBackup,hasSafetyDataSheet,openSafetyDataSheet,acceptPublishedFiles};
  function observeMedia(){
    if(!document.body)return;
    scanMedia(document.body);
    new MutationObserver(rows=>rows.forEach(row=>row.type==='attributes'?scanMedia(row.target):row.addedNodes.forEach(scanMedia))).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeMedia,{once:true});else observeMedia();
  window.addEventListener('online',()=>retryQueue().catch(e=>error(e,'customerTaskSaveHint')));
})();
