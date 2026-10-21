/* Staff-only statistics. Explicit corrections and deletion markers synchronize across devices. */
(function(){
  'use strict';
  const weights={social:1,food:1.2,handling:1,leash:.8,stress:2,noise:1.5,separation:1.5,play:.8,health:1,hygiene:.5};
  const clone=value=>JSON.parse(JSON.stringify(value)),text=value=>String(value??'').trim();
  let epoch=0,active='',lastRead=null;
  function scope(){
    const c=window.CLOUD,u=window.firebase?.auth().currentUser;
    if(!u?.uid || c?.user?.uid!==u.uid || !['admin','staff'].includes(c.role) || window.DSWorkflow?.scoped())throw new Error('Statistik ist nur für angemeldete Workspace-Mitarbeiter verfügbar.');
    const project=window.firebaseConfig.projectId,org=c.orgId||window.firebaseOrgId;
    if(org!==window.firebaseOrgId)throw new Error('Die Organisation stimmt nicht mit der App-Konfiguration überein.');
    const key=project+':'+org+':'+u.uid;
    if(active!==key){reset();active=key;}
    return {key,uid:u.uid,email:text(u.email).toLowerCase(),org,db:c.db,epoch};
  }
  function same(s){const now=scope();if(now.key!==s.key||now.epoch!==s.epoch)throw new Error('Das angemeldete Konto wurde gewechselt.');}
  function reset(){epoch++;active='';lastRead=null;document.getElementById('statRatingDialog')?.remove();const p=document.getElementById('statistics');if(p)p.replaceChildren();}
  function number(value){if(value===null||value===undefined||text(value)==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
  function date(value){
    const s=text(value).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
    const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
  }
  function index(scores){let total=0,weight=0;for(const [k,w] of Object.entries(weights)){const n=number(scores?.[k]);if(n!==null&&n>=1&&n<=10){total+=n*w;weight+=w;}}return weight?Math.round(total/weight*10)/10:null;}
  function pets(){
    const src=window.state?.pets||[],list=Array.isArray(src)?src:Object.entries(src).map(([id,p])=>({id,...p}));
    const seen=new Set();return list.filter(p=>p&&text(p.id||p.petId||p.dogId)).map(p=>({...p,id:text(p.id||p.petId||p.dogId)})).filter(p=>!seen.has(p.id)&&seen.add(p.id)).sort((a,b)=>text(a.name).localeCompare(text(b.name),'de'));
  }
  function normalize(raw,source,id){
    const dogId=text(raw.dogId||raw.petId),pet=pets().find(p=>p.id===dogId),scores={};
    const input=raw.scores||raw.scales||{};
    for(const k of Object.keys(weights)){const n=number(input[k]);if(n!==null&&n>=1&&n<=10)scores[k]=n;}
    const docId=text(raw.docId||raw.id||id);
    return {...clone(raw),id:docId,docId,dogId,petId:dogId,dogName:text(raw.dogName||pet?.name||dogId||'Unbekannter Hund'),
      date:date(raw.date||raw.assessmentDate),type:text(raw.type||raw.assessmentType),breed:text(raw.breed||raw.breedMainType||pet?.breed),
      __scores:scores,__indexB:index(scores),__source:source,__raw:clone(raw),__key:source+':'+docId,
      __sourceId:text(id||docId),__targetKey:raw.importKey?'import:'+text(raw.importKey):source==='legacy-device'?'import:'+importKey(raw):source==='legacy-cloud'?'stats:'+text(id||docId):'rating:'+text(id||docId),
      __revision:0,__base:clone(raw)};
  }
  function localKey(s){return 'ds_statistics_v3:'+s.key;}
  async function localRows(s){
    const raw=await window.DSBrowserStore.read(localKey(s));same(s);
    if(!raw)return [];
    const list=JSON.parse(raw);if(!Array.isArray(list))throw new Error('Die lokale Statistik-Sicherung ist nicht lesbar. Sie wurde nicht verändert.');return list;
  }
  function oldLocalRows(s){
    let raw;try{raw=localStorage.getItem('ds_statistics_local_v1');}catch(_){return [];}
    if(!raw)return [];
    const list=JSON.parse(raw);if(!Array.isArray(list))throw new Error('Ältere lokale Bewertungen sind nicht lesbar. Die Sicherung bleibt erhalten.');
    // The old key had no project/account scope. Never expose another account's rows.
    return list.filter(r=>r&&(text(r.updatedBy)===s.uid||text(r.updatedBy).toLowerCase()===s.email)&&pets().some(p=>p.id===text(r.dogId||r.petId)));
  }
  async function putLocal(s,row){const rows=await localRows(s),at=rows.findIndex(x=>x.docId===row.docId);if(at<0)rows.push(row);else rows[at]=row;same(s);await DSBrowserStore.put(localKey(s),JSON.stringify(rows));same(s);}
  function collection(s,name='statistics'){if(!s.db)throw new Error('Firebase ist noch nicht verbunden.');return s.db.collection('orgs').doc(s.org).collection(name);}
  function errorText(error){const code=text(error?.code);if(/permission-denied/.test(code))return 'Firebase hat den Statistik-Zugriff abgelehnt. Bitte die Firestore-Regeln aus GB374 veröffentlichen.';return text(error?.message||error)||'Firebase antwortet nicht.';}
  async function timedRead(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Firebase antwortet nicht rechtzeitig. Bitte die Verbindung prüfen und erneut laden.')),12000);})]);}finally{clearTimeout(timer);}}
  async function read(filters={}){
    const s=scope(),{from='',to='',dogId='',breed=''}=filters;
    if((from&&!date(from))||(to&&!date(to))||(from&&to&&from>to))throw new Error('Bitte einen gültigen Zeitraum wählen: Von darf nicht nach Bis liegen.');
    const local=await localRows(s),old=oldLocalRows(s),rows=[];
    const completed=await Promise.allSettled(['statistics','stats','statisticChanges'].map(name=>timedRead(collection(s,name).get({source:'server'}))));
    same(s);let cloudError='',confirmed=true;
    completed.forEach((result,i)=>{
      if(result.status==='rejected'){confirmed=false;cloudError=errorText(result.reason);return;}
      if(i<2)result.value.forEach(doc=>rows.push(normalize(doc.data(),i?'legacy-cloud':'cloud',doc.id)));
    });
    const imports=new Set(rows.map(r=>r.importKey).filter(Boolean)),ids=new Set(rows.filter(r=>r.__source==='cloud').map(r=>r.docId));
    const workspace=window.state?.behaviorAssessments||[];
    const workspaceOccurrences=new Map();
    for(const [key,r] of Object.entries(workspace))if(r&&!ids.has(text(r.docId||r.id))){
      let id=text(r.docId||r.id);if(!id){const base='workspace-'+(Array.isArray(workspace)?await digest(stable(r)):key),occurrence=workspaceOccurrences.get(base)||0;workspaceOccurrences.set(base,occurrence+1);id=Array.isArray(workspace)?base+'_'+occurrence:base;}
      rows.push(normalize(r,'workspace',id));
    }
    const available=local.map(r=>({...r,__origin:'device'})).concat(old.map(r=>({...r,__origin:'legacy-device'})));
    const seen=new Set();for(const r of available){const id=text(r.docId||r.id);if(!id||seen.has(id)||ids.has(id)||imports.has(importKey(r)))continue;seen.add(id);rows.push(normalize(r,r.__origin,id));}
    let effective=[];
    if(completed[2].status==='fulfilled'){
      const changes=new Map();completed[2].value.forEach(doc=>{const c=doc.data();changes.set(c.targetKey,c);});
      const used=new Set();
      for(const r of rows){const c=changes.get(r.__targetKey);used.add(r.__targetKey);if(c?.deleted)continue;
        effective.push(c?applyChange(r,c):r);
      }
      // Corrected device-only legacy records must also be available on a new device.
      for(const [key,c] of changes)if(!used.has(key)&&!c.deleted){const r=normalize(c.rating,c.origin.source,c.origin.sourceId);r.__targetKey=key;effective.push(applyChange(r,c));}
    }else{
      // Without the deletion index, old server/cache copies could resurrect removed ratings.
      effective=rows.filter(r=>r.__source==='device'&&r.syncStatus==='pending');
    }
    lastRead={confirmed,error:cloudError,localCount:effective.filter(r=>/device$/.test(r.__source)&&!r.__revision).length,total:effective.length};
    const notice=document.getElementById('statDataWarning');if(notice){notice.hidden=confirmed;notice.textContent=confirmed?'':cloudError+' Die angezeigten lokalen Daten können unvollständig sein.';}
    return effective.filter(r=>(!dogId||r.dogId===dogId)&&(!breed||r.breed===breed)&&(!from||r.date>=from)&&(!to||r.date<=to)).sort((a,b)=>a.date.localeCompare(b.date)||a.docId.localeCompare(b.docId));
  }
  function stable(value){if(value&&typeof value.toJSON==='function')return stable(value.toJSON());if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
  function applyChange(row,change){return {...normalize(change.rating,row.__source,row.__sourceId),__targetKey:row.__targetKey,__revision:change.revision,__base:row.__base,__changed:true};}
  const fields=['dogId','petId','dogName','customerId','date','type','sex','breed','ageYears','scores','scales','qualitative','context','dogsInGroup','notes','schema','importKey'];
  function comparable(row){return JSON.stringify(fields.map(k=>row[k]??null));}
  function validate(row){
    const pet=pets().find(p=>p.id===row.dogId);if(!pet)throw new Error('Bitte einen vorhandenen Hund auswählen.');
    if(!date(row.date))throw new Error('Bitte ein gültiges Bewertungsdatum auswählen.');
    if(!['arrival','mid','departure'].includes(row.type))throw new Error('Bitte einen Bewertungstyp auswählen.');
    if(Object.keys(weights).some(k=>number(row.scores?.[k])===null||!Number.isInteger(Number(row.scores[k]))||row.scores[k]<1||row.scores[k]>10))throw new Error('Bitte alle zehn Skalen mit Werten von 1 bis 10 ausfüllen.');
    if(text(row.notes).length>10000)throw new Error('Die Notiz darf höchstens 10.000 Zeichen enthalten.');
    if(row.ageYears!==null&&(row.ageYears<0||row.ageYears>40))throw new Error('Bitte ein gültiges Alter eingeben oder das Feld leeren.');
    const group=row.dogsInGroup||[];
    if(!Array.isArray(group)||!group.includes(pet.id)||group.length>4||new Set(group).size!==group.length||group.some(id=>!pets().some(p=>p.id===id)))throw new Error('Bitte die tatsächlich gemeinsam beobachteten Hunde auswählen (höchstens vier).');
    const n=number(row.context?.dominantCount);if(n!==null&&(!Number.isInteger(n)||n<0||n>group.length))throw new Error('Die Anzahl dominanter Hunde muss innerhalb der Gruppengröße liegen.');
    return pet;
  }
  async function save(input){
    const s=scope(),pet=validate(input),row={sex:'',breed:'',notes:'',qualitative:{},...clone(input),dogName:pet.name||input.dogId,customerId:text(pet.customerId),indexB:index(input.scores),schema:'M50.10_STAT_CORE_V1',updatedAtLocal:input.updatedAtLocal||Date.now(),updatedBy:s.uid};
    row.docId=text(input.docId)||crypto.randomUUID();row.petId=row.dogId;
    delete row.__origin;delete row.syncStatus;const id=row.docId;
    if(!/^[A-Za-z0-9_-]{1,160}$/.test(id))throw new Error('Ungültige Bewertungs-ID.');
    let durable=true;try{await putLocal(s,{...row,syncStatus:'pending'});}catch(_){durable=false;}
    same(s);
    try{
      const ref=collection(s).doc(id),changeRef=collection(s,'statisticChanges').doc(await digest(row.importKey?'import:'+row.importKey:'rating:'+id));
      await s.db.runTransaction(async tx=>{
        const existing=await tx.get(ref),change=await tx.get(changeRef);same(s);
        if(change.exists)throw new Error('Diese Bewertung wurde bereits bearbeitet oder gelöscht. Bitte die aktuelle Bewertungsliste verwenden.');
        if(existing.exists){if(comparable(existing.data())!==comparable(row))throw new Error('Diese Bewertung existiert bereits mit anderen Angaben. Der gespeicherte Eintrag wurde nicht verändert.');return;}
        const timestamp=firebase.firestore.FieldValue.serverTimestamp();tx.set(ref,{...row,createdBy:s.uid,createdAt:timestamp,updatedAt:timestamp});
      });same(s);
    }catch(e){const error=new Error('Nicht in Firebase gespeichert. '+errorText(e)+(durable?' Die Bewertung bleibt auf diesem Gerät und kann erneut übertragen werden.':' Auch die Gerätesicherung ist fehlgeschlagen. Bitte diese Seite geöffnet lassen.'));error.cause=e;throw error;}
    try{await putLocal(s,{...row,syncStatus:'confirmed'});}catch(_){/* The server acknowledgement is authoritative. */}
    same(s);return row;
  }
  function importKey(row){return text(row.importKey)||'local:'+text(row.docId||row.id);}
  async function transferLocal(){
    const rows=(await read()).filter(r=>/device$/.test(r.__source)&&!r.__revision);
    if(!rows.length)return 0;
    if(!confirm(rows.length+' lokale Bewertung(en) zusätzlich in Firebase sichern? Vorhandene Bewertungen werden nicht überschrieben.'))return 0;
    let saved=0;for(const r of rows){const input={...r.__raw,importKey:importKey(r),scores:r.__scores,scales:r.__scores,dogId:r.dogId,petId:r.dogId,date:r.date,type:r.type,ageYears:number(r.ageYears)};
      input.dogsInGroup=Array.isArray(input.dogsInGroup)&&input.dogsInGroup.length?input.dogsInGroup:[r.dogId];input.context={...(input.context||{}),groupSize:input.dogsInGroup.length};
      // Keep the original ID for retryable drafts; old browser rows get a separate import ID.
      if(r.__source==='legacy-device')input.docId='import_'+await digest(importKey(r));
      await save(input);saved++;
    }return saved;
  }
  async function digest(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(b)).map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function changeRating(row,rating,deleted=false){
    const s=scope(),key=row.__targetKey,id=await digest(key);same(s);
    if(!key||!Number.isInteger(row.__revision))throw new Error('Bitte die Bewertung erneut laden.');
    if(!deleted)validateEdit(rating,row);
    const change={schema:'DoggyStyleStatisticChange-v1',targetKey:key,revision:row.__revision+1,deleted,rating:deleted?{}:clone(rating),
      origin:{source:row.__source,sourceId:row.__sourceId},updatedBy:s.uid,changedAtLocal:Date.now()};
    try{
      await s.db.runTransaction(async tx=>{
        const ref=collection(s,'statisticChanges').doc(id),before=await tx.get(ref);same(s);
        const previous=before.exists?before.data():null;
        if((previous?.revision||0)!==row.__revision||previous?.deleted||(previous&&previous.targetKey!==key))throw new Error('Die Bewertung wurde inzwischen geändert oder gelöscht. Bitte neu laden und erneut prüfen.');
        if(previous){
          if(stable(previous.rating)!==stable(row.__raw))throw new Error('Die Bewertung wurde inzwischen geändert. Bitte neu laden.');
          change.origin=previous.origin;
        }else if(['cloud','legacy-cloud'].includes(row.__source)){
          const base=await tx.get(collection(s,row.__source==='cloud'?'statistics':'stats').doc(row.__sourceId));same(s);
          if(!base.exists||stable(base.data())!==stable(row.__base))throw new Error('Die ursprüngliche Bewertung wurde inzwischen geändert. Bitte neu laden.');
        }else if(row.__source==='workspace'){
          const base=await tx.get(s.db.collection('orgs').doc(s.org).collection('meta').doc('workspace_state'));same(s);
          const list=base.data()?.payload?.behaviorAssessments||[],occurrences=new Map();let found;
          for(const [entryKey,value] of Object.entries(list)){
            let sourceId=text(value.docId||value.id);if(!sourceId){const sourceBase='workspace-'+(Array.isArray(list)?await digest(stable(value)):entryKey),occurrence=occurrences.get(sourceBase)||0;occurrences.set(sourceBase,occurrence+1);sourceId=Array.isArray(list)?sourceBase+'_'+occurrence:sourceBase;}
            if(sourceId===row.__sourceId){found=value;break;}
          }
          if(!found||stable(found)!==stable(row.__base))throw new Error('Die Workspace-Bewertung wurde inzwischen geändert. Bitte die App neu laden.');
        }
        same(s);tx.set(ref,{...change,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      });same(s);
    }catch(e){throw new Error((deleted?'Nicht gelöscht. ':'Änderung nicht gespeichert. ')+errorText(e));}
    return change;
  }
  function validateEdit(r,row){
    if(!text(r.dogId)||(!pets().some(p=>p.id===r.dogId)&&r.dogId!==row.dogId))throw new Error('Bitte einen vorhandenen Hund auswählen.');
    if(!date(r.date))throw new Error('Bitte ein gültiges Bewertungsdatum auswählen.');
    if(!['arrival','mid','departure'].includes(r.type))throw new Error('Bitte einen Bewertungstyp auswählen.');
    for(const k of Object.keys(weights)){const n=r.scores?.[k];if(n!==undefined&&(!Number.isInteger(n)||n<1||n>10))throw new Error('Skalen müssen ganze Zahlen von 1 bis 10 sein.');}
    if(Object.keys(row.__scores).length===10&&Object.keys(weights).some(k=>r.scores[k]===undefined))throw new Error('Bitte alle zehn Skalen ausfüllen.');
    if(text(r.notes).length>10000)throw new Error('Die Notiz darf höchstens 10.000 Zeichen enthalten.');
    if(r.ageYears!==null&&(!Number.isFinite(r.ageYears)||r.ageYears<0||r.ageYears>40))throw new Error('Bitte ein gültiges Alter eingeben oder das Feld leeren.');
    const group=r.dogsInGroup;if(!Array.isArray(group)||group.length>4||new Set(group).size!==group.length||(group.length&&!group.includes(r.dogId)))throw new Error('Eine erfasste Gruppe muss den bewerteten Hund enthalten und darf höchstens vier Hunde umfassen.');
    const n=r.context?.dominantCount;if(n!==null&&n!==undefined&&(!Number.isInteger(n)||n<0||(group.length&&n>group.length)))throw new Error('Bitte eine gültige Anzahl dominanter Hunde eingeben.');
  }
  function statusLabel(row){if(row.__changed)return 'Korrektur in Firebase gespeichert';return ({cloud:'In Firebase gespeichert','legacy-cloud':'Älterer Firebase-Eintrag',workspace:'Im Workspace gespeichert',device:'Nur auf diesem Gerät', 'legacy-device':'Älterer Eintrag auf diesem Gerät'})[row.__source]||'';}
  function readMessage(count){const r=lastRead||{};return count+' Bewertung'+(count===1?'':'en')+' gefunden.'+(r.confirmed?' Firebase gelesen.':' '+(r.error||'Firebase konnte nicht gelesen werden.')+' Die Anzeige kann unvollständig sein.')+(r.localCount?' '+r.localCount+' Bewertung(en) nur auf diesem Gerät.':'');}
  function capture(dimensions,qualFields){
    scope();const val=id=>document.getElementById(id)?.value??'',btn=document.getElementById('btnStatSave');
    const dogId=val('statDogSelect'),scores=Object.fromEntries(dimensions.map(d=>[d.id,number(val('stat_'+d.id))]));
    const group=[...document.querySelectorAll('#statGroupDogs input:checked')].map(el=>el.value);if(dogId&&!group.includes(dogId))group.unshift(dogId);
    const row={dogId,petId:dogId,date:val('statDate'),type:val('statType'),sex:val('statSex'),breed:val('statBreed')==='—'?'':val('statBreed'),ageYears:number(val('statAge')),
      scores,scales:scores,qualitative:Object.fromEntries(qualFields.map(q=>[q.id,val('statQual_'+q.id)])),context:{groupSize:group.length,groupStability:val('statGroupStability'),dominantCount:number(val('statDominantCount')),occupancy:val('statOccupancy'),trainer:val('statTrainer')},dogsInGroup:group,notes:val('statNotes')};
    // Preserve the submission ID across retries, but never reuse it for changed contents.
    const fingerprint=JSON.stringify(row);if(btn.dataset.fingerprint!==fingerprint){btn.dataset.fingerprint=fingerprint;btn.dataset.ratingId=crypto.randomUUID();}
    row.docId=btn.dataset.ratingId;return row;
  }
  function groups(){
    const box=document.getElementById('statGroupDogs'),selected=document.getElementById('statDogSelect')?.value||'';if(!box)return;
    const keep=new Set([...box.querySelectorAll('input:checked:not([disabled])')].map(x=>x.value));box.replaceChildren();
    for(const pet of pets()){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=pet.id;input.checked=pet.id===selected||keep.has(pet.id);input.disabled=pet.id===selected;label.append(input,document.createTextNode(' '+(pet.name||pet.id)));box.append(label);}
    const update=()=>{const el=document.getElementById('statGroupSize');if(el){el.value=String(box.querySelectorAll('input:checked').length);el.readOnly=true;}};box.onchange=update;update();
  }
  function metadata(){
    const pet=pets().find(p=>p.id===document.getElementById('statDogSelect')?.value),byId=id=>document.getElementById(id);
    if(byId('statBreed'))byId('statBreed').value=text(pet?.breed||pet?.race)||'—';
    if(byId('statSex'))byId('statSex').value=pet?window._statNormalizeSexCode(pet.sex||pet.gender,pet):'';
    const raw=number(pet?.ageYears??pet?.age),birth=date(pet?.birthdate||pet?.birthday||pet?.dob),day=date(byId('statDate')?.value);
    let age=raw;if(birth&&day){const years=(new Date(day+'T12:00:00Z')-new Date(birth+'T12:00:00Z'))/(365.2425*86400000);age=years>=0?Math.round(years*10)/10:null;}
    if(byId('statAge'))byId('statAge').value=age!==null&&age>=0&&age<=40?String(age):'';groups();
  }
  function download(filename,value,type='application/json'){
    scope();const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function ratingDialog(title){
    scope();mountStyle();document.getElementById('statRatingDialog')?.remove();const d=document.createElement('dialog');d.id='statRatingDialog';d.setAttribute('aria-label',title);
    const h=document.createElement('h2');h.textContent=title;d.append(h);document.body.append(d);return d;
  }
  function node(parent,tag,value){const el=document.createElement(tag);if(value!==undefined)el.textContent=value;parent.append(el);return el;}
  function button(parent,label,action){const el=node(parent,'button',label);el.type='button';el.className='btn';el.onclick=action;return el;}
  function actions(parent,row,dimensions,qualFields,changed){
    const wrap=node(parent,'div');wrap.className='stat-actions';
    button(wrap,'Bearbeiten',()=>edit(row,dimensions,qualFields,changed)).dataset.action='edit';
    button(wrap,'Löschen',()=>remove(row,changed)).dataset.action='delete';
    return wrap;
  }
  function edit(row,dimensions,qualFields,changed){
    const s=scope(),d=ratingDialog('Bewertung bearbeiten'),form=node(d,'form');form.id='statEditForm';
    node(form,'p',row.dogName+' · '+(row.date||'Datum fehlt')+' · '+window._statTypeLabel(row.type));
    const grid=node(form,'div');grid.className='stat-edit-grid';
    function field(label,id,value,options,type='text',parent=grid){
      const wrap=node(parent,'label',label),el=node(wrap,options?'select':'input');el.id=id;el.className='input';
      if(options){el.add(new Option('Nicht erfasst',''));for(const [v,t] of options)el.add(new Option(t,v));if(text(value)&&!options.some(o=>o[0]===String(value)))el.add(new Option(String(value),String(value)));}
      else el.type=type;el.value=value??'';return el;
    }
    const allPets=pets(),choices=allPets.map(p=>[p.id,p.name||p.id]);if(!choices.some(([id])=>id===row.dogId))choices.push([row.dogId,row.dogName+' (Altbestand)']);
    const dog=field('Hund','statEditDog',row.dogId,choices);dog.required=true;
    field('Datum','statEditDate',row.date,null,'date').required=true;
    field('Bewertungstyp','statEditType',row.type,[['arrival','Ankunft'],['mid','Zwischenbewertung'],['departure','Abreise']]).required=true;
    field('Geschlecht','statEditSex',row.sex,[['m','männlich'],['w','weiblich'],['k','kastriert (Rüde)'],['s','kastriert (Hündin)']]);
    field('Rasse zur Beobachtung','statEditBreed',row.breed);
    const age=field('Alter (Jahre)','statEditAge',number(row.ageYears),null,'number');age.min='0';age.max='40';age.step='0.1';
    node(form,'h3','Skalen (1–10)');node(form,'p','1 = unauffällig / entspannt · 10 = stark auffällig / hoch belastet. Nicht erfasste ältere Werte bleiben leer.');
    const scores=node(form,'div');scores.className='stat-edit-grid';
    for(const dim of dimensions){const el=field(dim.label,'statEdit_'+dim.id,row.__scores[dim.id],null,'number',scores);el.min='1';el.max='10';el.step='1';el.required=Object.keys(row.__scores).length===10;}
    node(form,'h3','Kontext');const context=node(form,'div');context.className='stat-edit-grid';const c=row.context||{};
    field('Gruppenstabilität','statEditGroupStability',c.groupStability,[['stabil','stabil'],['wechselnd','wechselnd'],['neu','neu gemischt']],null,context);
    const dominant=field('Dominante Hunde (Anzahl)','statEditDominantCount',c.dominantCount,null,'number',context);dominant.min='0';dominant.step='1';
    field('Auslastung','statEditOccupancy',c.occupancy,[['niedrig','niedrig'],['mittel','mittel'],['hoch','hoch']],null,context);
    field('Betreuer / Trainer','statEditTrainer',c.trainer,null,'text',context);
    node(form,'h3','Gemeinsam beobachtete Hunde');node(form,'p','Bei älteren Bewertungen ohne bekannte Mitglieder kann die Gruppe leer bleiben.');
    const group=node(form,'div');group.id='statEditGroupDogs';group.className='stat-edit-group';const members=new Set(row.dogsInGroup||[]),groupPets=[...allPets];
    for(const id of members)if(!groupPets.some(p=>p.id===id))groupPets.push({id,name:id+' (Altbestand)'});
    for(const pet of groupPets){const label=node(group,'label'),el=node(label,'input');el.type='checkbox';el.value=pet.id;el.checked=members.has(pet.id);label.append(document.createTextNode(' '+(pet.name||pet.id)));}
    for(const q of qualFields)field(q.label,'statEditQual_'+q.id,row.qualitative?.[q.id],q.options.map(o=>[o.v,o.t]),null,context);
    const noteLabel=node(form,'label','Notiz'),notes=node(noteLabel,'textarea');notes.id='statEditNotes';notes.value=row.notes||'';notes.maxLength=10000;notes.rows=5;notes.className='input';
    const msg=node(form,'p');msg.id='statEditMsg';msg.setAttribute('role','status');
    const controls=node(form,'div');controls.className='stat-actions';const saveButton=button(controls,'Änderungen speichern');saveButton.id='statEditSave';saveButton.type='submit';
    const cancel=button(controls,'Abbrechen',()=>d.remove());cancel.id='statEditCancel';
    let busy=false;d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;saveButton.disabled=true;cancel.disabled=true;msg.textContent='Wird in Firebase gespeichert …';
      try{
        same(s);const val=id=>d.querySelector('#'+id).value,raw=clone(row.__raw),dogId=val('statEditDog'),pet=allPets.find(p=>p.id===dogId);
        const values={...(raw.scores||raw.scales||{})};for(const dim of dimensions){const n=number(val('statEdit_'+dim.id));if(n===null)delete values[dim.id];else values[dim.id]=n;}
        const ids=[...group.querySelectorAll('input:checked')].map(el=>el.value),groupChanged=stable([...ids].sort())!==stable([...(row.dogsInGroup||[])].sort());
        const rating={...raw,docId:row.docId,dogId,petId:dogId,dogName:dogId===row.dogId?row.dogName:pet?.name||dogId,
          customerId:dogId===row.dogId?text(row.customerId):text(pet?.customerId),date:val('statEditDate'),type:val('statEditType'),sex:val('statEditSex'),breed:val('statEditBreed'),ageYears:number(val('statEditAge')),
          scores:values,scales:values,qualitative:{...(row.qualitative||{}),...Object.fromEntries(qualFields.map(q=>[q.id,val('statEditQual_'+q.id)]))},
          dogsInGroup:ids,context:{...c,groupStability:val('statEditGroupStability'),dominantCount:number(val('statEditDominantCount')),occupancy:val('statEditOccupancy'),trainer:val('statEditTrainer')},
          notes:val('statEditNotes'),indexB:index(values),updatedBy:s.uid,updatedAtLocal:Date.now()};
        if(groupChanged)rating.context.groupSize=ids.length;
        if('assessmentDate' in raw)rating.assessmentDate=rating.date;if('assessmentType' in raw)rating.assessmentType=rating.type;if('breedMainType' in raw)rating.breedMainType=rating.breed;
        delete rating.syncStatus;delete rating.__origin;
        await changeRating(row,rating);same(s);d.remove();await changed?.('Änderung in Firebase gespeichert.');
      }catch(error){if(d.isConnected)msg.textContent=error.message;}finally{busy=false;saveButton.disabled=false;cancel.disabled=false;}
    };
    d.showModal();return d;
  }
  function remove(row,changed){
    const s=scope(),d=ratingDialog('Ganze Bewertung löschen?');node(d,'p',row.dogName+' · '+(row.date||'Datum fehlt')+' · '+window._statTypeLabel(row.type));
    node(d,'p','Diese Bewertung wird aus der Liste, den Auswertungen und den Exporten entfernt.');
    const preview=node(d,'p',row.notes||'Keine Notiz');preview.style.cssText='white-space:pre-wrap;max-height:30dvh;overflow:auto';
    const msg=node(d,'p');msg.id='statDeleteMsg';msg.setAttribute('role','status');const controls=node(d,'div');controls.className='stat-actions';let busy=false;
    const yes=button(controls,'Bewertung löschen',async()=>{if(busy)return;busy=true;yes.disabled=true;cancel.disabled=true;msg.textContent='Wird in Firebase gelöscht …';
      try{same(s);await changeRating(row,null,true);same(s);d.remove();await changed?.('Bewertung in Firebase gelöscht.');}
      catch(e){if(d.isConnected)msg.textContent=e.message;}finally{busy=false;yes.disabled=false;cancel.disabled=false;}
    });yes.id='statDeleteConfirm';const cancel=button(controls,'Abbrechen',()=>d.remove());cancel.id='statDeleteCancel';
    d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.showModal();return d;
  }
  function detail(row,dimensions,qualFields,changed){
    scope();document.getElementById('statRatingDialog')?.remove();const d=document.createElement('dialog');d.id='statRatingDialog';d.style.cssText='max-width:min(850px,90vw);max-height:85dvh;overflow:auto;background:#20242d;color:#fff;border:1px solid #a7aeb9;border-radius:14px;padding:22px;box-sizing:border-box';
    const add=(tag,value,parent=d)=>{const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;};
    const close=add('button','Schließen');close.className='btn';close.style.cssText='position:sticky;top:0;float:right;background:#303a4e;color:#fff;min-height:44px';close.onclick=()=>d.remove();
    add('h2',row.dogName+' · '+(row.date||'Datum fehlt'));add('p',(window._statTypeLabel(row.type)||row.type)+' · '+statusLabel(row));
    const table=add('table','');table.className='dsTable';for(const dim of dimensions){const tr=add('tr','',table);add('th',dim.label,tr);add('td',row.__scores[dim.id]??'Nicht erfasst',tr);}
    const extra=Object.entries(row.__raw.scores||row.__raw.scales||{}).filter(([k])=>!dimensions.some(d=>d.id===k));if(extra.length){add('h3','Weitere ältere Skalen');add('pre',JSON.stringify(Object.fromEntries(extra),null,2));}
    add('p','Index B: '+(row.__indexB??'Nicht berechenbar')+' · '+Object.keys(row.__scores).length+'/10 Skalen erfasst');
    add('h3','Kontext');const c=row.context||{};for(const [label,value] of [['Rasse',row.breed],['Geschlecht',row.sex],['Alter',row.ageYears],['Gruppengröße',c.groupSize],['Gruppenstabilität',c.groupStability],['Dominante Hunde',c.dominantCount],['Auslastung',c.occupancy],['Betreuer',c.trainer]])add('p',label+': '+(value===0?'0':value||'Nicht erfasst'));
    add('p','Beobachtete Gruppe: '+(row.dogsInGroup||[]).map(id=>pets().find(p=>p.id===id)?.name||id).join(', '));
    for(const q of qualFields){const value=row.qualitative?.[q.id];add('p',q.label+': '+(q.options.find(o=>o.v===value)?.t||value||'Nicht erfasst'));}
    add('h3','Notiz');add('p',row.notes||'Keine Notiz').style.whiteSpace='pre-wrap';actions(d,row,dimensions,qualFields,changed);document.body.append(d);d.showModal();
  }
  function mountStyle(){
    if(document.getElementById('statRepairStyle'))return;const el=document.createElement('style');el.id='statRepairStyle';el.textContent='#statRatingDialog{max-width:min(850px,94vw);width:850px;max-height:88dvh;overflow:auto;background:#20242d;color:#fff;border:1px solid #a7aeb9;border-radius:14px;padding:20px;box-sizing:border-box}#statRatingDialog p{overflow-wrap:anywhere}#statRatingDialog pre{max-width:100%;overflow:auto}#statRatingDialog::backdrop{background:rgba(0,0,0,.65)}#statRatingDialog .input{width:100%;box-sizing:border-box;font-size:16px;min-height:44px}#statRatingDialog label{display:block;min-width:0}#statRatingDialog .stat-edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}#statRatingDialog .stat-edit-group{display:flex;flex-wrap:wrap;gap:12px}#statRatingDialog .stat-edit-group label{display:flex;align-items:center;gap:8px;min-height:44px}#statRatingDialog .stat-edit-group input{width:22px;height:22px}#statRatingDialog button{min-height:44px;color:#fff;background:#303a4e}#statRatingDialog [data-action=delete],#statDeleteConfirm{background:#71363c}.stat-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}#statistics .row{display:flex;flex-wrap:wrap}#statistics .row>div{max-width:100%;box-sizing:border-box}#statistics input,#statistics select,#statistics textarea{box-sizing:border-box;max-width:100%}#statistics .stat-range-row{flex-wrap:wrap}#statGroupDogs{display:flex;flex-wrap:wrap;gap:12px}#statGroupDogs label{display:flex;align-items:center;gap:8px;min-height:44px}#statGroupDogs input{width:22px;height:22px}#statistics .dsTable{width:100%;border-collapse:collapse}#statistics .dsTable td,#statistics .dsTable th{padding:9px;text-align:left;border-bottom:1px solid #666}#statistics .heatmap{display:flex;flex-wrap:wrap;gap:10px}#statistics .heat-cell{padding:10px;border-radius:8px;color:#111;min-width:100px}#statistics canvas{min-height:120px}@media(max-width:600px){#statRatingDialog .stat-edit-grid{grid-template-columns:minmax(0,1fr)}#statistics .row>div{min-width:0!important;width:100%;flex:1 1 100%!important}#statistics .stat-range-row>div{min-width:0!important;width:100%}#statistics input,#statistics select,#statistics textarea{font-size:16px}}';document.head.append(el);
  }
  window.DSStatistics={weights,scope,reset,pets,date,number,index,normalize,read,save,capture,groups,metadata,transferLocal,readMessage,statusLabel,detail,edit,remove,actions,changeRating,download,mountStyle,get lastRead(){return lastRead;}};
})();
