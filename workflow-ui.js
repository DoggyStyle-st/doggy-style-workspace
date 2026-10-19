/* Loaded before app.js: one owner for submission, contract and review actions. */
(function(){
  'use strict';
  const Core = window.DSWorkflowCore, S = v=>String(v == null ? '' : v).trim(), $ = id=>document.getElementById(id);
  let profileUnsub=null, profileUid='', inboxUnsub=null, inboxUid='', inboxRows=[], reviewRow=null;
  let busy=false, draft=null, mergeReview=null;
  const ink = new WeakSet(), blobs = new Map();
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
    return Core.service(firebase.firestore(),window.firebaseOrgId,currentUser,d=>d.secureWorkflowVersion===3?d.payload:(typeof dsBuildMergedCloudDocPayload==='function'?dsBuildMergedCloudDocPayload(d):d.payload));
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
    window.DSBrowserStore.reset();
    window.DSRepair?.reset();
    if(profileUnsub) profileUnsub(); if(inboxUnsub) inboxUnsub();
    profileUnsub=inboxUnsub=null;profileUid=inboxUid='';reviewRow=null;inboxRows=[];draft=null;
    closeReview();if($('inboxFeedback'))$('inboxFeedback').textContent='';
    window.DSCustomerPortal?.reset();
    window.__dsMediaError=null;
    for(const url of blobs.values()) URL.revokeObjectURL(url); blobs.clear();
    if(window.__dsCustomerPortalUnsubscribe) window.__dsCustomerPortalUnsubscribe();
    window.__dsCustomerTasks=[];window.__dsCustomerProposals=[];
    mergeReview=null;$('dsSyncConflictDialog')?.remove();$('dsSyncConflictNotice')?.remove();
    if(window.CLOUD){CLOUD.userProfile=null;CLOUD._profileReadConfirmedAt=0;CLOUD._workspaceReadConfirmedAt=0;CLOUD._lastRemoteStamp=0;CLOUD.lastPushOkAt=0;CLOUD._workflowBaseSnapshot=null;CLOUD._pendingRemoteSnapshot=null;CLOUD._deferredRemoteSnapshot=null;}
    if(window.SYNC)Object.assign(SYNC,{cloudPending:false,cloudLastError:'',cloudLastOkAt:0,cloudLastSeenAt:0,cloudReachable:false});
    if(typeof state!=='undefined') state={dogs:[],docs:[],customers:[],pets:[],contractAgreements:{},contractSignatures:{}};
    document.querySelectorAll('[data-ds-media]').forEach(el=>{el.removeAttribute('src');el.removeAttribute('href');});
  }
  function baseKey(){return 'ds_workspace_base_v3:'+window.firebaseConfig.projectId+':'+window.firebaseOrgId+':'+currentUser()?.uid;}
  function rememberBase(payload,stamp){
    if(!currentUser() || scoped())return;
    const base={payload:JSON.parse(JSON.stringify(payload)),stamp:Number(stamp||0)};
    CLOUD._workflowBaseSnapshot=base;
    DSBrowserStore.cache(baseKey(),JSON.stringify(base));
  }
  function readBase(){
    if(CLOUD._workflowBaseSnapshot)return CLOUD._workflowBaseSnapshot.payload;
    try{return JSON.parse(DSBrowserStore.get(baseKey())||'null')?.payload || null;}catch(_){return null;}
  }
  async function backupLocal(){
    const key='ds_workspace_conflict_backup_v3:'+window.firebaseConfig.projectId+':'+window.firebaseOrgId+':'+currentUser().uid+':'+crypto.randomUUID();
    try{await DSBrowserStore.put(key,JSON.stringify({createdAt:Date.now(),payload:state}));}
    catch(e){throw new Error('Lokale Änderungen konnten nicht gesichert werden. Bitte zuerst ein Backup exportieren. Der Server wurde nicht verändert.');}
  }
  function showConflict(remote,stamp){
    if(scoped() || CLOUD.role!=='admin' || !currentUser())return;
    CLOUD._pendingRemoteSnapshot={remote:JSON.parse(JSON.stringify(remote)),remoteStamp:Number(stamp||0)};
    let notice=$('dsSyncConflictNotice');if(!notice){notice=document.createElement('div');notice.id='dsSyncConflictNotice';notice.className='card';($('syncDetails')?.parentElement || document.body).append(notice);}
    notice.replaceChildren();const text=document.createElement('p');text.textContent='Ein neuer Serverstand ist vorhanden. Ungesendete Änderungen bleiben erhalten.';
    const button=document.createElement('button');button.id='dsOpenSyncConflict';button.className='btn';button.textContent='Änderungen vergleichen';notice.append(text,button);
  }
  function conflictLabel(path){
    const names={customers:'Kunden',pets:'Hunde',dogs:'Hundeauswahl',docs:'Dokumente',phone:'Telefon',email:'E-Mail',name:'Name',note:'Notiz',street:'Straße',zip:'Postleitzahl',city:'Ort'};
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
  function openConflict(){
    if(scoped() || CLOUD.role!=='admin' || !CLOUD._pendingRemoteSnapshot)throw new Error('Kein administrativer Synchronisationskonflikt verfügbar.');
    const pending=CLOUD._pendingRemoteSnapshot,base=readBase(),local=JSON.parse(JSON.stringify(state));
    mergeReview={uid:currentUser().uid,local,remote:pending.remote,stamp:pending.remoteStamp,plan:base?Core.mergePlan(base,local,pending.remote):null};
    $('dsSyncConflictDialog')?.remove();const dialog=document.createElement('dialog');dialog.id='dsSyncConflictDialog';dialog.style.maxWidth='min(960px,95vw)';
    const title=document.createElement('h2');title.textContent='Lokale Änderungen mit Firebase abgleichen';
    const hint=document.createElement('p');hint.textContent=base?'Unterschiedliche Änderungen werden zusammengeführt. Für widersprüchliche Angaben bitte einen Stand wählen. Verträge und Unterschriften bleiben zusammen.':'Ein gespeicherter Ausgangsstand fehlt. Die lokale Fassung bleibt als Backup erhalten; ein automatisches Zusammenführen ist gesperrt.';
    dialog.append(title,hint);
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
    const result=useServer?{stamp:latest.stamp}:await api().publish(resolved,latest.stamp);
    if(currentUser()?.uid!==review.uid)throw new Error('Konto gewechselt.');
    Object.assign(SYNC,{cloudPending:false,cloudLastError:'',cloudLastOkAt:useServer?SYNC.cloudLastOkAt:result.stamp});
    CLOUD._pendingRemoteSnapshot=null;
    if(!applyRemoteState(resolved,result.stamp,'conflict-resolution'))throw new Error('Serverstand wurde gespeichert, konnte aber noch nicht angezeigt werden. Bitte neu laden.');
    rememberBase(resolved,result.stamp);mergeReview=null;$('dsSyncConflictDialog')?.remove();$('dsSyncConflictNotice')?.remove();
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
  async function loadMedia(el){
    const attr=el.tagName==='A'?'href':'src';
    const source=mediaSource(el.getAttribute(attr));
    if(!source.startsWith('ds-storage:')) return;
    const path=source.slice(11), user=currentUser();if(el.dataset.dsLoading===path)return;el.removeAttribute(attr);
    if(!user || !path.startsWith('orgs/'+window.firebaseOrgId+'/')) return;
    el.dataset.dsMedia=path;
    const key=user.uid+':'+path;
    if(blobs.has(key)){el.setAttribute(attr,blobs.get(key));return;}
    el.dataset.dsLoading=path;
    try{
      const token=await user.getIdToken();
      const bucket=window.firebaseConfig.storageBucket;
      const response=await fetch('https://firebasestorage.googleapis.com/v0/b/'+encodeURIComponent(bucket)+'/o/'+encodeURIComponent(path)+'?alt=media',{headers:{Authorization:'Firebase '+token},cache:'no-store'});
      if(!response.ok) throw new Error('Foto konnte nicht mit diesem Konto geladen werden.');
      const blob=await response.blob();
      if(currentUser()?.uid!==user.uid || el.dataset.dsMedia!==path) return;
      const url=URL.createObjectURL(blob);blobs.set(key,url);el.setAttribute(attr,url);el.nextElementSibling?.matches('[data-ds-media-error]')&&el.nextElementSibling.remove();if(window.__dsMediaError?.path===path)window.__dsMediaError=null;
    }catch(e){
      if(currentUser()?.uid!==user.uid)return;
      window.__dsMediaError={path,code:S(e.code||e.name),message:S(e.message),at:Date.now()};console.warn('Medienabruf fehlgeschlagen',path,e);
      let message=el.nextElementSibling;if(!message?.matches('[data-ds-media-error]')){message=document.createElement('span');message.dataset.dsMediaError='1';message.setAttribute('role','status');el.after(message);}
      message.replaceChildren(document.createTextNode('Datei konnte nicht geladen werden. '));const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Erneut laden';retry.onclick=()=>{el.setAttribute(attr,source);loadMedia(el);};message.append(retry);
    }finally{if(el.dataset.dsLoading===path)delete el.dataset.dsLoading;}
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
    for(const id of ['inboxList','inboxProposalList']){
      const list=$(id);if(!list)continue;list.replaceChildren();
      if(!inboxRows.length){list.textContent='Keine offenen Eingänge.';continue;}
      inboxRows.forEach(row=>{
        const el=document.createElement('div');el.className='list-item';
        const text=document.createElement('div');text.textContent=(row.title || row.templateId)+' · '+(row.customerName || row.customerEmail);
        const open=document.createElement('button');open.className='smallbtn';open.textContent='Prüfen';open.onclick=()=>openReview(row);
        el.append(text,open);list.append(el);
      });
    }
    if($('inboxProposalMsg')) $('inboxProposalMsg').textContent=inboxRows.length+' offene Eingänge aus Firebase.';
  }
  async function wireInbox(){
    window.DSRepair?.install();
    const user=currentUser();if(!user || !['admin','staff'].includes(CLOUD.role)) return;
    if(inboxUnsub && inboxUid===user.uid){renderInbox();return;}
    if(inboxUnsub) inboxUnsub();inboxUid=user.uid;
    inboxUnsub=firebase.firestore().collection('orgs').doc(window.firebaseOrgId).collection('proposals').where('proposalStatus','==','pending').onSnapshot(snap=>{
      if(currentUser()?.uid!==user.uid || snap.metadata.hasPendingWrites) return;
      inboxRows=snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>b.submittedAt-a.submittedAt);renderInbox();
    },e=>error(e,'inboxProposalMsg'));
  }
  function reviewControls(){
    for(const id of ['btnInboxAdopt','btnInboxClose']){
      const button=$(id);if(!button)continue;
      button.hidden=false;button.style.removeProperty('display');button.style.removeProperty('visibility');
      button.disabled=!reviewRow || busy || CLOUD.role!=='admin';
    }
  }
  function closeReview(){
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
  function reviewDate(value){const date=Core.dateISO(value);return date?date.slice(8,10)+'.'+date.slice(5,7)+'.'+date.slice(0,4):'Nicht angegeben';}
  function changedFields(root,row,workspace){
    const p=row.payloadSubmitted||{},summary=$('dsReviewChanges');if(!summary)return;summary.replaceChildren();const changes=[];
    for(const [kind,keys]of [['customer',Core.customerFields],['pet',Core.petFields]]){
      const before=(workspace?.[kind==='customer'?'customers':'pets']||[]).find(x=>x.id===(kind==='customer'?row.customerId:row.petId));
      for(const key of keys){if(p[kind]?.[key]===undefined)continue;const input=root.querySelector('[data-review-kind="'+kind+'"][data-review-field="'+key+'"]');
        const value=input?(input.type==='checkbox'?input.checked:input.value):p[kind][key],previous=before?.[key],changed=JSON.stringify(previous??'')!==JSON.stringify(value??'');
        const label=input?.closest('label')||root.querySelector('[data-review-photo="'+key+'"]');if(label){label.dataset.changed=String(changed);let line=label.querySelector('[data-review-before]');if(!line){line=reviewNode('small',null,label);line.dataset.reviewBefore='1';}line.textContent=changed?'Bisher: '+reviewValue(previous,key):'Unverändert';}
        if(changed)changes.push({kind,key,value,previous});
      }
    }
    if(!changes.length){reviewNode('p','Keine Abweichung zu den gespeicherten Angaben.',summary);return;}
    reviewNode('h3',changes.length+' geänderte Angabe'+(changes.length===1?'':'n'),summary);const wrap=reviewNode('div',null,summary);wrap.className='dsReviewTableWrap';const table=reviewNode('table',null,wrap),head=reviewNode('tr',null,reviewNode('thead',null,table));for(const title of ['Angabe','Bisher','Vorgeschlagen'])reviewNode('th',title,head);const body=reviewNode('tbody',null,table);
    for(const c of changes){const tr=reviewNode('tr',null,body);tr.dataset.changed='true';reviewNode('td',(c.kind==='customer'?'Kunde: ':'Hund: ')+(reviewLabels[c.key]||c.key),tr);reviewNode('td',reviewValue(c.previous,c.key),tr);reviewNode('td',reviewValue(c.value,c.key),tr).className='dsChangedText';}
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
    if(e.target?.id==='contractSig'){e.stopImmediatePropagation();return;}
    const b=e.target?.closest?.('button');if(!b)return;
    const actions={dsOpenSyncConflict:openConflict,dsApplySyncMerge:()=>resolveConflict(false),dsUseServerSnapshot:()=>resolveConflict(true),dsCloseSyncMerge:()=>{$('dsSyncConflictDialog')?.remove();mergeReview=null;},contractSignBtn:sign,contractSigClear:clearSignature,contractSaveBtn:submitContract,btnInboxAdopt:()=>review('adopted'),btnInboxClose:()=>review('rejected'),btnAssignTask:assign,btnInboxRefresh:wireInbox,btnInboxProposalLoad:wireInbox,btnInboxBack:closeReview};
    const action=actions[b.id];if(!action)return;
    e.preventDefault();e.stopImmediatePropagation();if(busy)return;
    busy=true;b.disabled=true;reviewControls();
    Promise.resolve().then(action).catch(err=>error(err,b.closest('#dsSyncConflictDialog')?'dsSyncConflictStatus':b.closest('#inboxDetail')?'inboxReviewStatus':b.closest('#contract')?'contractSavedInfo':'assignMsg')).finally(()=>{busy=false;b.disabled=false;reviewControls();});
  },true);
  window.DSWorkflow={context,snapshot,hydrate,watchProfile,resetAccount,submit,submitContract,retryQueue,wireInbox,wireAssignments,openReview,closeReview,renderContractStatus,api,scoped,mediaSource,scanMedia,prepareNewPetPhoto,signatureHasInk,rememberBase,showConflict,openConflict,resolveConflict,startupStatus,readWithTimeout,workspaceRole};
  function observeMedia(){
    if(!document.body)return;
    scanMedia(document.body);
    new MutationObserver(rows=>rows.forEach(row=>row.type==='attributes'?scanMedia(row.target):row.addedNodes.forEach(scanMedia))).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeMedia,{once:true});else observeMedia();
  window.addEventListener('online',()=>retryQueue().catch(e=>error(e,'customerTaskSaveHint')));
})();
