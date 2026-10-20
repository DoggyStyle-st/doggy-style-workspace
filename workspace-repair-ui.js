/* Explicit, reviewed repairs in the signed-in administrator's browser. No automatic writes. */
(function(){
  'use strict';
  const Core=window.DSWorkflowCore,$=id=>document.getElementById(id);
  let session=null,revision=0,working=false;
  const user=()=>window.firebase?.auth().currentUser;
  const allowed=()=>!!(user() && window.CLOUD?.role==='admin' && !window.DSWorkflow.scoped());
  function requireSession(){
    if(!allowed() || !session || session.uid!==user().uid)throw new Error('Reparaturprüfung fehlt oder das Konto wurde gewechselt.');
    return session;
  }
  function element(tag,text,parent){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(parent)parent.append(el);return el;}
  function button(text,action,parent,id){
    const el=element('button',text,parent);el.type='button';el.className='btn';if(id)el.id=id;
    el.onclick=async()=>{
      if(working)return;working=true;const wasDisabled=el.disabled;el.disabled=true;
      try{await action();}catch(e){if($('dsRepairStatus'))$('dsRepairStatus').textContent='❌ '+e.message;}
      finally{working=false;if(el.isConnected)el.disabled=wasDisabled;}
    };return el;
  }
  function reset(){revision++;session=null;$('dsRepairDialog')?.remove();$('dsOpenRepair')?.remove();}
  function install(){
    if(!allowed()){reset();return;}
    if($('dsOpenRepair'))return;
    const host=$('inboxList')?.parentElement;if(!host)return;
    const launcher=button('Bestand prüfen und reparieren',open,host,'dsOpenRepair');host.prepend(launcher);
  }
  function preview(value,parent){
    const pre=element('pre',JSON.stringify(value,(key,v)=>typeof v==='string' && v.startsWith('data:image')?'[Bilddaten bleiben unverändert]':v,2),parent);
    pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';pre.style.maxHeight='40vh';pre.style.overflow='auto';
  }
  async function open(){
    if(!allowed())throw new Error('Dieser Bereich ist nur für den Administrator verfügbar.');
    const mine=++revision,uid=user().uid;session=null;$('dsRepairDialog')?.remove();
    const dialog=element('dialog');dialog.id='dsRepairDialog';dialog.style.maxWidth='min(960px,95vw)';dialog.style.maxHeight='90vh';dialog.style.overflow='auto';
    const style=element('style',undefined,dialog);style.textContent='#dsRepairDialog{background:#fff;color:#161616;color-scheme:light;border:1px solid #64748b;border-radius:14px;padding:20px}#dsRepairDialog .btn{background:#263445!important;color:#fff!important;border:1px solid #526378;min-height:44px;padding:10px 14px;margin:5px 8px 5px 0;border-radius:8px;font-weight:600}#dsRepairDialog .btn:disabled{background:#e2e8f0!important;color:#475569!important;opacity:1}#dsRepairDialog a{color:#1d4ed8}#dsRepairDialog fieldset{border:1px solid #94a3b8;margin:12px 0;padding:12px}#dsRepairDialog::backdrop{background:rgba(0,0,0,.55)}';
    element('h2','Workspace-Bestand prüfen',dialog);
    element('p','Es wird zuerst nur gelesen. Jede Reparatur benötigt eine heruntergeladene Sicherung und deine Prüfung.',dialog);
    const content=element('div',undefined,dialog);content.id='dsRepairContent';element('p','Bestand wird aus Firebase geladen …',content);
    const status=element('p','',dialog);status.id='dsRepairStatus';status.setAttribute('role','status');
    button('Schließen',()=>{revision++;session=null;dialog.remove();},dialog);
    dialog.addEventListener('close',()=>{revision++;session=null;dialog.remove();},{once:true});document.body.append(dialog);
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
    const data=await window.DSWorkflow.api().maintenance();
    if(mine!==revision || !allowed() || user().uid!==uid || !dialog.isConnected)return;
    session={uid,data,backupStarted:false,stage:null};render();
  }
  function render(){
    const s=requireSession(),host=$('dsRepairContent');host.replaceChildren();
    const report=Core.auditRecords(s.data.payload,s.data.profiles.map(x=>({...x.data,documentId:x.id})));
    element('p','Sicherung: Workspace, Kundenprofile, Vorschläge, Aufgaben und Eingangsarchiv. Storage-Dateien und Firebase-Anmeldedaten sind nicht enthalten.',host);
    button('Sicherung herunterladen',download,host,'dsRepairExport');
    const guide=element('a','Regeltexte für Firebase und Einrichtung öffnen',host);guide.href='REGELN_ANZEIGEN.html';guide.target='_blank';guide.rel='noopener';guide.style.display='block';
    element('p','Die Prüfung verändert keine Verträge, Unterschriften, Rollen oder bestehenden Einreichungen.',host);
    for(const message of report.issues)element('p','⚠ '+message,host);
    if(report.legacyContracts)element('p','⚠ '+report.legacyContracts+' alte Vertragszustimmungen ohne nachvollziehbare administrative Freigabe. Sie werden nicht nachträglich bestätigt.',host);
    element('h3','Fehlende Kunden und Hunde in den Listen',host);
    if(!report.groups.length)element('p','Keine ergänzbaren Datensatz-Einträge gefunden.',host);
    for(const group of report.groups){
      const box=element('fieldset',undefined,host);element('legend',group.customer?.name || group.customerId,box);
      element('p',(group.customer?'Kunde fehlt in der Liste. ':'')+group.pets.length+' Hunde fehlen in der Liste.',box);
      if(group.blocked.length || report.issues.length)element('p','Gesperrt: '+[...group.blocked,...report.issues].join(' '),box);
      else button('Ergänzung prüfen',()=>stageRestore(group.customerId),box);
    }
    element('h3','Kundenzuordnungen',host);
    if(!report.links.length)element('p','Keine eindeutige fehlende Zuordnung gefunden. Fehlende Listeneinträge zuerst prüfen.',host);
    for(const link of report.links){const box=element('fieldset',undefined,host);element('legend',link.name || link.customerId,box);element('p',link.email+' · Konto '+link.uid,box);button('Zuordnung prüfen',()=>stageLink(link),box);}
    element('h3','Unvollständige Eingänge',host);
    const proposals=new Map(s.data.proposals.map(x=>[x.id,x])),tasks=new Map(s.data.tasks.map(x=>[x.id,x]));let count=0;
    for(const id of new Set([...proposals.keys(),...tasks.keys()])){
      const p=proposals.get(id),t=tasks.get(id),row=(p || t).data;
      if(row.proposalStatus!=='pending' || (p && t))continue;count++;
      const box=element('fieldset',undefined,host);element('legend',row.title || row.templateId || id,box);element('p','ID '+id+' · '+(row.customerName || row.customerEmail || row.customerUid),box);
      button(p?'Fehlende Aufgabe prüfen':'Fehlenden Vorschlag prüfen',()=>stagePair(id,row),box);
    }
    if(!count)element('p','Keine offenen Einreichungen mit fehlendem Gegenstück gefunden.',host);
    const review=element('section',undefined,host);review.id='dsRepairReview';if(s.stage)renderStage();
  }
  function stageRestore(cid){
    const s=requireSession(),after=Core.restoreRecords(s.data.payload,cid),group=Core.auditRecords(s.data.payload).groups.find(x=>x.customerId===cid);
    s.stage={kind:'restore',cid,after,description:'Vorhandene Datensätze in Kunden-/Hundelisten ergänzen',preview:{customerId:cid,customer:group.customer,pets:group.pets}};renderStage();
  }
  function stageLink(link){
    const s=requireSession(),account=s.data.profiles.find(x=>x.id===link.uid);
    if(!account)throw new Error('Kundenkonto fehlt.');
    const portal=Core.portalSnapshot(s.data.payload,link.customerId);
    s.stage={kind:'link',cid:link.customerId,uid:link.uid,account:account.data,description:'Geprüfte Kundenzuordnung speichern',preview:{uid:link.uid,email:account.data.email,customerId:link.customerId,petIds:portal.pets.map(p=>p.id || p.petId),accessSchemaVersion:3,customer:portal.customer.name,hunde:portal.pets.map(p=>p.name)}};renderStage();
  }
  async function stagePair(id,row){
    const s=requireSession();
    if(row.templateId==='boarding_contract')await window.DSWorkflow.signatureHasInk(row.payloadSubmitted?.signature);
    if(s!==requireSession())throw new Error('Die Bestandsprüfung hat sich geändert.');
    s.stage={kind:'pair',id,row,description:'Nur das fehlende Gegenstück ergänzen; keine Übernahme oder Vertragsfreigabe',preview:row};renderStage();
  }
  function renderStage(){
    const s=requireSession(),host=$('dsRepairReview');host.replaceChildren();if(!s.stage)return;
    element('h3','Vorgesehene Änderung',host);element('p',s.stage.description,host);preview(s.stage.preview,host);
    const label=element('label',undefined,host),check=element('input');check.id='dsRepairConfirm';check.type='checkbox';check.disabled=!s.backupStarted;label.append(check,document.createTextNode(' Ich habe die Sicherung in Dateien gespeichert und die angezeigte Änderung geprüft.'));
    const commit=button('Diese Änderung speichern',commitStage,host,'dsRepairCommit');commit.disabled=true;
    check.onchange=()=>{commit.disabled=!check.checked || !s.backupStarted;};
    if(!s.backupStarted)element('p','Vor dem Speichern oben die Sicherung herunterladen und in Dateien aufbewahren.',host);
  }
  function download(){
    const s=requireSession(),data={format:'DoggyStyleWorkspaceBackup-v1',...s.data},blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='DoggyStyle_Workspace_Sicherung_'+new Date(s.data.createdAt).toISOString().replace(/[:.]/g,'-')+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    s.backupStarted=true;renderStage();$('dsRepairStatus').textContent='Download gestartet. Bitte die Sicherung in Dateien speichern; erst danach die Änderung bestätigen.';
  }
  async function commitStage(){
    const s=requireSession(),stage=s.stage;
    if(!s.backupStarted || !$('dsRepairConfirm')?.checked || !stage)throw new Error('Bitte zuerst die Sicherung speichern und diese Änderung prüfen.');
    if(window.SYNC?.cloudPending || window.CLOUD?._pendingRemoteSnapshot)throw new Error('Lokale oder parallele Änderungen zuerst über den Synchronisationsvergleich klären.');
    const api=window.DSWorkflow.api();
    if(stage.kind==='restore')await api.publish(stage.after,s.data.stamp);
    else if(stage.kind==='link')await api.linkCustomer(stage.uid,stage.cid,s.data.stamp,stage.account);
    else if(stage.kind==='pair')await api.repairPair(stage.id,stage.row);
    else throw new Error('Unbekannte Reparatur.');
    if(!allowed() || user().uid!==s.uid){reset();return;}
    // The transaction has succeeded. A later refresh/cache error must never invite another write.
    s.stage=null;renderStage();
    try{
      const latest=await api.workspace();
      if(!allowed() || user().uid!==s.uid){reset();return;}
      if(typeof window.applyRemoteState==='function')window.applyRemoteState(latest.payload,latest.stamp,'reviewed-repair');
      const warnings=await window.DSBrowserStore.flush();
      if(!allowed() || user().uid!==s.uid){reset();return;}
      await open();if(!allowed() || user().uid!==s.uid){reset();return;}
      if($('dsRepairStatus'))$('dsRepairStatus').textContent='✅ Geprüfte Änderung in Firebase gespeichert. Bestand wurde erneut geladen.'+(warnings.length?' Der lokale Zwischenspeicher ist nicht verfügbar; bitte den Speicherhinweis beachten.':'');
      return {ok:true,committed:true};
    }catch(error){
      if(!allowed() || user().uid!==s.uid){reset();return;}
      if($('dsRepairStatus'))$('dsRepairStatus').textContent='✅ Änderung wurde in Firebase gespeichert. Die anschließende Anzeige konnte nicht vollständig aktualisiert werden: '+error.message+' Bitte schließen und den Bestand erneut prüfen. Die Änderung nicht nochmals speichern.';
      return {ok:true,committed:true,refreshError:error.message};
    }
  }
  window.DSRepair={install,open,reset,stageRestore,stageLink,stagePair,download,commitStage};
})();
