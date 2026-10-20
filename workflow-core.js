/* Customer identity and atomic review workflow. No local names/emails resolve ownership. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.DSWorkflowCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  const str = v => String(v == null ? '' : v).trim();
  const clone = v => JSON.parse(JSON.stringify(v));
  const idOf = v => str(v && (v.id || v.petId || v.customerId));
  const customerFields = ['name','email','phone','street','zip','city','emergencyName','emergencyPhone','pickupAuth','note'];
  const petFields = ['name','breed','birthdate','sex','chipStatus','chip','chipNumber','vet','vetPhone','vetEmail','vetStreet','vetZip','vetCity','vetEmergencyName','vetEmergencyPhone','allergies','medicalConditions','insuranceStatus','insuranceCompany','insurancePolicy','insuranceNotes','vaccinatedConfirmed','rabiesDate','mixedVaccineDate','vaccinationPassPhoto','profilePhoto','food','treatsAllowed','aloneTime','houseTrained','transport','feeding','compatDogs','compatCats','compatKids','compat','leashBehavior','recall','resourceBehavior','behavior','dailyRoutine','commands','note'];
  const stayConsents = {ev_agb:'Ich habe die AGB gelesen und akzeptiere sie.',ev_dsgvo:'Ich habe die Datenschutzinformationen gelesen.',ev_wahr:'Meine Angaben sind vollständig und wahrheitsgemäß.',ev_hv:'Mein Hund ist haftpflichtversichert.',ev_gesund:'Mein Hund ist frei von ansteckenden Krankheiten.',ev_tierarzt:'Im Notfall darf mein Hund tierärztlich versorgt werden. Die Kosten trage ich.'};
  function careType(value){
    const v=str(value).toLowerCase();
    if(v==='holiday'||v==='boarding'||v==='ub'||v.includes('urlaub'))return 'Urlaubsbetreuung';
    if(v==='day'||v==='daycare'||v==='tag'||v==='tb'||v.includes('tages')||v.includes('probe'))return 'Tagesbetreuung';
    return '';
  }
  function dateISO(value){
    const s=str(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
    const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
  }
  function stayDetails(value){
    const p=value||{},m=p.meta||{};
    return {from:dateISO(m.von||p.from||m.from),to:dateISO(m.bis||p.to||m.to),care:careType(m.betreuung||p.careType||p.type),
      bringTime:str(m.bringzeit||p.bringTime),pickupTime:str(m.abholzeit||p.pickupTime),notes:str(p.fields?.notes||p.fields?.sonderfall_notiz||p.notes)};
  }
  function dateRange(from,to){
    const a=dateISO(from),b=dateISO(to);if(!a||!b||b<a)fail('Bitte einen gültigen Zeitraum angeben.');
    const start=Date.parse(a+'T12:00:00Z'),end=Date.parse(b+'T12:00:00Z');
    if((end-start)/86400000>3660)fail('Der Zeitraum ist zu lang. Bitte einzelne Aufenthalte anfragen.');
    const result=[];for(let t=start;t<=end;t+=86400000)result.push(new Date(t).toISOString().slice(0,10));return result;
  }
  function capacity(workspace,type,day){
    const label=careType(type),caps=workspace?.capacities;
    if(!label)return 0;
    const ex=(caps?.exceptions||[]).find(x=>x&&dateISO(x.from)&&dateISO(x.to)&&day>=x.from&&day<=x.to&&Number.isFinite(Number(x[label]))&&Number(x[label])>=0);
    const raw=ex?ex[label]:caps?.default?.[label];
    return raw!=null&&Number.isFinite(Number(raw))&&Number(raw)>=0?Math.min(4,Math.floor(Number(raw))):4;
  }
  function confirmedStays(workspace){
    const s=workspace||{},out=[],seen=new Set();
    for(const d of s.docs||[]){
      if(!d||!d.saved||!(d.templateId==='hundeannahme'||d.templateName==='Aufenthalte'||['stay','hundeannahme'].includes(d.type)))continue;
      if(['cancelled','canceled','storniert','deleted','rejected'].includes(str(d.status||d.meta?.status).toLowerCase()))continue;
      const info=stayDetails(d);if(!info.from||!info.to||!info.care||info.to<info.from)continue;
      const pid=str(d.petId||s._legacy?.dogIdToPetId?.[d.dogId]||d.dogId||d.id);
      out.push({...info,id:str(d.id),petId:pid});seen.add(str(d.id));
    }
    for(const d of s.stays||[]){
      if(!d||seen.has(str(d.docId))||!(d.saved===true||['closed','confirmed','adopted'].includes(str(d.status).toLowerCase())))continue;
      const info=stayDetails(d);if(!info.from||!info.to||!info.care||info.to<info.from)continue;
      out.push({...info,id:str(d.docId||d.id),petId:str(d.petId||s._legacy?.dogIdToPetId?.[d.dogId]||d.dogId||d.id)});
    }
    return out;
  }
  function occupancyForDay(workspace,day,excludeId){
    const animals=new Map();
    for(const stay of confirmedStays(workspace))if(stay.id!==str(excludeId)&&day>=stay.from&&day<=stay.to){
      if(!animals.has(stay.petId)||stay.care==='Urlaubsbetreuung')animals.set(stay.petId,stay.care);
    }
    const daycare=[...animals.values()].filter(x=>x==='Tagesbetreuung').length,boarding=animals.size-daycare;
    return {day,daycare,boarding,total:animals.size,daycareCapacity:capacity(workspace,'Tagesbetreuung',day),boardingCapacity:capacity(workspace,'Urlaubsbetreuung',day),totalCapacity:4,petIds:[...animals.keys()]};
  }
  function occupancyRange(workspace,from,to,proposal){
    const proposed=proposal?{id:'__request__',templateId:'hundeannahme',saved:true,petId:str(proposal.petId),meta:{von:from,bis:to,betreuung:proposal.care}}:null;
    const after=proposed?{...workspace,docs:[...(workspace?.docs||[]),proposed]}:workspace;
    return dateRange(from,to).map(day=>{const before=occupancyForDay(workspace,day),next=occupancyForDay(after,day);return {...before,after:next,exceeds:next.total>next.totalCapacity||next.daycare>next.daycareCapacity||next.boarding>next.boardingCapacity};});
  }
  function validateStay(payload){
    const p=payload||{},info=stayDetails(p);dateRange(info.from,info.to);if(!info.care)fail('Betreuungsart fehlt oder ist ungültig.');
    if(!signatureValid(p.signature))fail('Bitte den Aufenthalt mit einer eigenen Unterschrift bestätigen.','stay-signature-required');
    for(const key of Object.keys(stayConsents))if(p.fields?.[key]!==true)fail('Bitte alle Bestätigungen zum Aufenthalt prüfen.','stay-consent-required');
    if(p.staySchemaVersion!==1)fail('Der Textstand zur Anfrage fehlt. Bitte eine neue Anfrage mit der aktuellen App einreichen.','stay-consent-text-required');
    for(const key of Object.keys(stayConsents))if(!str(p.consentTexts?.[key])||str(p.consentTexts[key]).length>80000)fail('Der Text einer Bestätigung fehlt oder ist zu lang.','stay-consent-text-required');
    return info;
  }
  function legalTexts(workspace){
    const out={};for(const key of ['agb','dsgvo','tierarzt','wahrheit'])if(typeof workspace?.legalTexts?.[key]==='string')out[key]=workspace.legalTexts[key];return out;
  }
  function fail(message, code){ const e = new Error(message); e.code = code || 'workflow-validation'; throw e; }
  function pick(v, keys){ const out = {}; for(const k of keys) if(v && v[k] !== undefined) out[k] = clone(v[k]); return out; }
  function stable(value){
    if(Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if(value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function uniqueTargets(workspace){
    for(const key of ['customers','pets']){
      const ids=(workspace[key] || []).map(idOf).filter(Boolean);
      if(new Set(ids).size!==ids.length)fail('Doppelte Kunden- oder Hunde-ID im Workspace. Zuordnung muss vor der Freigabe geprüft werden.');
    }
  }
  function context(user, profile){
    const empty = {uid:str(user && user.uid), email:str(user && user.email).toLowerCase(), customer:null, customerId:'', pets:[], verified:false};
    if(!user || !user.uid || !profile || profile.uid !== user.uid || profile.accessSchemaVersion !== 3) return empty;
    const cid = str(profile.customerId), bundle = profile.portalData || {};
    if(!cid || !bundle.customer || idOf(bundle.customer) !== cid || !Array.isArray(profile.petIds) || !Array.isArray(bundle.pets)) return empty;
    const ids = profile.petIds.map(str);
    if(ids.some(x=>!x) || new Set(ids).size !== ids.length) return empty;
    const pets = bundle.pets.filter(p=>p && ids.includes(idOf(p)) && str(p.customerId) === cid);
    if(pets.length !== ids.length || bundle.pets.length !== ids.length || new Set(pets.map(idOf)).size !== ids.length) return empty;
    const safeBundle={customer:clone(bundle.customer),pets:clone(pets),contractVersion:str(bundle.contractVersion || 'v1.0'),contract:clone(bundle.contract || {}),legalTexts:legalTexts(bundle),updatedAt:bundle.updatedAt || 0,
      contracts:(bundle.contracts || []).filter(c=>c && c.customerId===cid && ids.includes(c.petId)).map(clone),
      stays:(bundle.stays || []).filter(d=>d && d.customerId===cid && ids.includes(d.petId)).map(clone)};
    return {...empty, customerId:cid, customer:clone(bundle.customer), pets:clone(pets), verified:true, bundle:safeBundle};
  }
  function signatureValid(sig){
    if(!(sig && typeof sig.dataUrl === 'string' && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(sig.dataUrl)
      && sig.dataUrl.length > 128 && sig.dataUrl.length < 180000 && Number.isFinite(Number(sig.signedAt)) && Number(sig.signedAt) > 0))return false;
    try{
      const raw=atob(sig.dataUrl.slice(22)),u32=i=>((raw.charCodeAt(i)*0x1000000)+(raw.charCodeAt(i+1)<<16)+(raw.charCodeAt(i+2)<<8)+raw.charCodeAt(i+3));
      if(raw.slice(0,8)!=='\x89PNG\r\n\x1a\n' || raw.slice(12,16)!=='IHDR' || u32(8)!==13)return false;
      const width=u32(16),height=u32(20);if(width<2 || height<2 || width>4096 || height>4096 || width*height>2000000)return false;
      let imageData=false;
      for(let at=8;at+12<=raw.length;){
        const size=u32(at),kind=raw.slice(at+4,at+8);if(!Number.isFinite(size) || at+12+size>raw.length)return false;
        if(kind==='IDAT' && size>0)imageData=true;
        if(kind==='IEND')return size===0 && imageData && at+12===raw.length;
        at+=12+size;
      }
    }catch(_){}
    return false;
  }
  function canvasHasInk(pixels){
    if(!pixels || !pixels.length || pixels.length%4)return false;
    let background=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<64)background++;
    const transparentBackground=background/(pixels.length/4)>0.2;
    let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>64 && (transparentBackground || Math.min(pixels[i],pixels[i+1],pixels[i+2])<235))ink++;
    // Ignore transparent/white backgrounds and reject a completely filled image.
    return ink>=4 && ink/(pixels.length/4)<0.8;
  }
  function auditRecords(workspace,profiles){
    const s=workspace || {},issues=[],groups=new Map(),customers=Array.isArray(s.customers)?s.customers:[],pets=Array.isArray(s.pets)?s.pets:[];
    if((s.customers && !Array.isArray(s.customers)) || (s.pets && !Array.isArray(s.pets)))issues.push('Kunden- oder Hundeliste hat ein ungültiges Format.');
    for(const [kind,rows] of [['Kunden',customers],['Hunde',pets]]){
      const ids=rows.map(idOf);if(ids.some(x=>!x) || new Set(ids).size!==ids.length)issues.push(kind+': fehlende oder doppelte IDs.');
    }
    const group=cid=>{if(!groups.has(cid))groups.set(cid,{customerId:cid,customer:null,pets:[],blocked:[]});return groups.get(cid);};
    for(const [cid,c] of Object.entries(s.customerRecords || {})){
      if(customers.some(x=>idOf(x)===cid))continue;
      const g=group(cid);if(!c || typeof c!=='object' || Array.isArray(c)){g.blocked.push('Ungültiger Kundendatensatz.');continue;}g.customer=clone(c);
      if(idOf(c)!==cid || (c.customerId && str(c.customerId)!==cid))g.blocked.push('Kunden-ID in der Datensatz-Tabelle widersprüchlich.');
    }
    for(const [pid,p] of Object.entries(s.petRecords || {})){
      if(pets.some(x=>idOf(x)===pid))continue;
      if(!p || typeof p!=='object' || Array.isArray(p)){issues.push('Ungültiger Hundedatensatz '+pid+'.');continue;}
      const cid=str(p && p.customerId),g=group(cid);g.pets.push(clone(p));
      if(!cid || idOf(p)!==pid || (p.petId && str(p.petId)!==pid))g.blocked.push('Hunde-ID oder Kundenzuordnung widersprüchlich.');
      if(!customers.some(c=>idOf(c)===cid) && !g.customer)g.blocked.push('Der zugehörige Kunde fehlt.');
      const mapped=Object.entries(s._legacy?.dogIdToPetId || {}).filter(([,id])=>str(id)===pid).map(([id])=>id);
      const explicit=str(p.dogId);if(explicit && !mapped.includes(explicit))mapped.push(explicit);
      if(mapped.length>1)g.blocked.push('Mehrere bisherige Hunde-IDs verweisen auf diesen Hund.');
      const dogId=mapped[0] || pid,owner=s._legacy?.dogIdToCustomerId?.[dogId];
      if(owner && str(owner)!==cid)g.blocked.push('Bisherige Hunde-ID gehört zu einem anderen Kunden.');
      if((s.dogs || []).some(d=>str(d.id)===dogId) && (!owner || str(owner)!==cid))g.blocked.push('Hundeauswahl enthält bereits eine widersprüchliche ID.');
    }
    const links=[];
    for(const c of customers){
      if(!c || typeof c!=='object')continue;
      const cid=idOf(c),email=str(c.email).toLowerCase();
      const accounts=(profiles || []).filter(u=>u.role==='customer' && (str(u.customerId)===cid || (!u.customerId && email && str(u.email).toLowerCase()===email)));
      if(accounts.length===1){const u=accounts[0];if(!context({uid:u.documentId || u.uid,email:u.email},u).verified)links.push({customerId:cid,uid:u.documentId || u.uid,email:u.email,name:c.name,petIds:pets.filter(p=>str(p.customerId)===cid).map(idOf)});}
      else if(accounts.length>1)issues.push('Mehrere Konten passen zu Kunde '+cid+'. Keine automatische Zuordnung.');
    }
    return {groups:[...groups.values()],links,issues,legacyContracts:Object.values(s.contractAgreements || {}).filter(x=>x && x.accepted && (!x.approvedByUid || !x.approvedAt)).length};
  }
  function restoreRecords(workspace,cid){
    const report=auditRecords(workspace),g=report.groups.find(x=>x.customerId===str(cid));
    if(!g)fail('Für diesen Kunden fehlen keine Einträge aus den Datensatz-Tabellen.');
    if(report.issues.length || g.blocked.length)fail('Bestandswiderspruch: '+[...report.issues,...g.blocked].join(' '));
    const next=clone(workspace);next.customers=next.customers || [];next.pets=next.pets || [];next.dogs=next.dogs || [];
    if(g.customer)next.customers.push(clone(g.customer));
    next._legacy=next._legacy || {};next._legacy.dogIdToPetId=next._legacy.dogIdToPetId || {};next._legacy.dogIdToCustomerId=next._legacy.dogIdToCustomerId || {};
    for(const record of g.pets){
      const pet=clone(record),pid=idOf(pet),mapped=Object.entries(next._legacy.dogIdToPetId).find(([,id])=>str(id)===pid);
      const dogId=str(pet.dogId) || (mapped && mapped[0]) || pid;pet.dogId=dogId;next.pets.push(pet);
      next._legacy.dogIdToPetId[dogId]=pid;next._legacy.dogIdToCustomerId[dogId]=g.customerId;
      if(!next.dogs.some(d=>str(d.id)===dogId))next.dogs.push({...clone(next.dogRecords?.[dogId] || {}),id:dogId,customerId:g.customerId,petId:pid,name:pet.name,owner:next.customers.find(c=>idOf(c)===g.customerId)?.name || ''});
    }
    uniqueTargets(next);return next;
  }
  function signatureKey(cid, pid, version){ return str(version)+'__'+str(cid)+'__'+str(pid); }
  function agreementKey(cid, pid, version){ return signatureKey(cid,pid,version)+'::'+str(version); }
  function approvedContract(workspace, cid, pid, version){
    const s = workspace || {}, v = str(version || s.contractVersion || 'v1.0');
    const sig = (s.contractSignatures || {})[signatureKey(cid,pid,v)];
    const agr = (s.contractAgreements || {})[agreementKey(cid,pid,v)];
    return !!(agr && agr.accepted === true && str(agr.customerId) === str(cid) && str(agr.petId) === str(pid)
      && str(agr.version) === v && str(agr.approvedByUid) && Number(agr.approvedAt) > 0 && signatureValid(sig)
      && str(sig.customerId)===str(cid) && str(sig.petId)===str(pid) && str(sig.version)===v);
  }
  function portalSnapshot(workspace, cid){
    const s = workspace || {};uniqueTargets(s);
    const customer = (s.customers || []).find(c=>idOf(c) === str(cid));
    if(!customer) fail('Der zugeordnete Kunde ist im Workspace nicht vorhanden.');
    const pets = (s.pets || []).filter(p=>str(p.customerId) === str(cid));
    const petIds = pets.map(idOf);
    if(petIds.some(x=>!x) || new Set(petIds).size !== petIds.length) fail('Hundezordnung ist nicht eindeutig.');
    const version = str(s.contractVersion || 'v1.0');
    // Historic aliases may describe the same contract. Only its approved canonical record enters the portal.
    const contracts=Object.entries(s.contractAgreements || {}).filter(([key,agr])=>agr && key===agreementKey(cid,agr.petId,agr.version)
      && agr.customerId===str(cid) && petIds.includes(agr.petId) && approvedContract(s,cid,agr.petId,agr.version)).map(([,agr])=>({customerId:str(cid),petId:agr.petId,version:agr.version,
        signature:clone(s.contractSignatures[signatureKey(cid,agr.petId,agr.version)]),agreement:clone(agr)}));
    const stays = (s.docs || []).filter(d=>{
      if(!d || d.templateId !== 'hundeannahme')return false;
      const pid=str(d.petId || (s._legacy && s._legacy.dogIdToPetId && s._legacy.dogIdToPetId[d.dogId]) || d.dogId);
      return petIds.includes(pid) && (!str(d.customerId) || str(d.customerId)===str(cid));
    }).map(d=>({...clone(d),customerId:str(cid),petId:str(d.petId || (s._legacy && s._legacy.dogIdToPetId && s._legacy.dogIdToPetId[d.dogId]) || d.dogId)}));
    // Health/contact information is copied only for this customer, never the global workspace.
    return {customer:clone(customer),pets:clone(pets),contracts,stays:clone(stays),contractVersion:version,contract:clone(s.contract || {}),legalTexts:legalTexts(s),updatedAt:Date.now()};
  }
  function validateTarget(data, ctx, options){
    if(!ctx || !ctx.verified || str(data.customerUid) !== ctx.uid || str(data.customerId) !== ctx.customerId) fail('Kundenkonto und Kundenzuordnung stimmen nicht überein.');
    const pid = str(data.petId), p = data.payloadSubmitted || {};
    const newPet = data.templateId === 'customer_data' && p.isNewPet === true && pid === '';
    if(!newPet && !ctx.pets.some(pet=>idOf(pet) === pid)) fail('Der Hund gehört nicht zum zugeordneten Kunden.');
    for(const v of [p,p.meta,p.fields]){
      if(!v) continue;
      if(v.customerId != null && str(v.customerId) !== ctx.customerId) fail('Abweichende Kundennummer in der Einreichung.');
      for(const k of ['petId','dogId']) if(v[k] != null && str(v[k]) !== pid) fail('Abweichende Hundenummer in der Einreichung.');
    }
    if(p.customer && idOf(p.customer) !== ctx.customerId) fail('Fremde Kundendaten in der Einreichung.');
    if(p.pet && (str(p.pet.id || p.pet.petId || p.pet.dogId) !== pid || str(p.pet.customerId) !== ctx.customerId)) fail('Fremde Hundedaten in der Einreichung.');
    for(const k of ['profilePhoto','vaccinationPassPhoto']){
      const photo=str(p.pet && p.pet[k]);
      if(photo && !(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) && photo.length<180000)
        && !(pid && photo.startsWith('ds-storage:orgs/doggystyle/pets/'+pid+'/') && photo.split('/').length===5)) fail('Foto verweist auf einen fremden Hund oder eine ungültige Bildquelle.');
    }
    if(data.templateId === 'boarding_contract' && (p.accepted !== true || !str(p.contractVersion) || !signatureValid(p.signature))) fail('Vertrag, Zustimmung oder Unterschrift fehlen.');
    if(data.templateId === 'hundeannahme' && !options?.allowIncompleteStay)validateStay(p);
    return true;
  }
  function submission(opts, user, profile){
    const ctx = context(user,profile), stamp = Date.now(), o = opts || {};
    if(!['customer_data','boarding_contract','hundeannahme'].includes(o.templateId)) fail('Unbekanntes Kundenformular.');
    const id = str(o.id);
    if(!id || id.includes('/')) fail('Ungültige Vorschlagsnummer.');
    const data = {id,taskId:id,proposalId:id,submissionSchemaVersion:3,templateId:o.templateId,title:str(o.title || o.templateId),
      customerUid:str(user && user.uid),customerEmail:str(user && user.email).toLowerCase(),customerName:str(ctx.customer && ctx.customer.name),
      customerId:str(o.customerId),petId:str(o.petId),dogId:str(o.petId),sourceTaskId:str(o.sourceTaskId),
      status:'submitted',proposalStatus:'pending',submittedAt:stamp,createdAt:stamp,updatedAt:stamp,payloadSubmitted:clone(o.payloadSubmitted || {})};
    validateTarget(data,ctx);
    if(new TextEncoder().encode(JSON.stringify(data)).length > 700000) fail('Die Einreichung ist zu groß. Fotos bitte verkleinern.','payload-too-large');
    return data;
  }
  function sameSubmission(a,b){
    const keys = ['id','templateId','customerUid','customerEmail','customerId','petId','sourceTaskId','payloadSubmitted'];
    return keys.every(k=>stable(a && a[k]) === stable(b && b[k]));
  }
  function mergePlan(base,local,remote){
    if(!base)fail('Ausgangsstand fehlt. Lokale Änderungen zuerst sichern und den Serverstand prüfen.','merge-base-missing');
    const conflicts=[],copy=v=>v===undefined?undefined:clone(v),equal=(a,b)=>stable(a)===stable(b);
    const contracts=['contract','contractVersion','contractSignatures','contractAgreements'];
    const group=s=>{const out={};for(const k of contracts)if(s && s[k]!==undefined)out[k]=s[k];return out;};
    function conflict(path,b,l,r,kind){
      conflicts.push({id:String(conflicts.length),path:clone(path),kind:kind || 'value',base:copy(b),local:copy(l),remote:copy(r),localExists:l!==undefined,remoteExists:r!==undefined});
      return copy(r);
    }
    function walk(b,l,r,path){
      if(equal(l,r))return copy(l);
      if(equal(l,b))return copy(r);
      if(equal(r,b))return copy(l);
      const plain=v=>v && typeof v==='object' && !Array.isArray(v);
      if(plain(b) && plain(l) && plain(r)){
        const out={};for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){
          const v=walk(b[k],l[k],r[k],path.concat(k));if(v!==undefined)out[k]=v;
        }return out;
      }
      const identified=v=>Array.isArray(v) && v.every(x=>plain(x) && str(x.id)) && new Set(v.map(x=>str(x.id))).size===v.length;
      if(identified(b) && identified(l) && identified(r)){
        const index=v=>new Map(v.map(x=>[str(x.id),x])),bi=index(b),li=index(l),ri=index(r),out=[];
        for(const id of new Set([...ri.keys(),...li.keys(),...bi.keys()])){
          const v=walk(bi.get(id),li.get(id),ri.get(id),path.concat({id}));if(v!==undefined)out.push(v);
        }return out;
      }
      return conflict(path,b,l,r);
    }
    const stripped=s=>{const v=clone(s || {});for(const k of [...contracts,'_cloudUpdatedAt','_localUpdatedAt'])delete v[k];return v;};
    const merged=walk(stripped(base),stripped(local),stripped(remote),[]);
    const bg=group(base),lg=group(local),rg=group(remote);
    const cg=equal(lg,rg)?copy(lg):equal(lg,bg)?copy(rg):equal(rg,bg)?copy(lg):conflict([],bg,lg,rg,'contracts');
    Object.assign(merged,cg);return {merged,conflicts};
  }
  function resolveMerge(plan,decisions){
    const out=clone(plan.merged);
    for(const c of plan.conflicts){
      const choice=decisions && decisions[c.id];if(!['local','remote'].includes(choice))fail('Bitte für jeden Konflikt einen Stand auswählen.');
      const exists=c[choice+'Exists'],value=exists?clone(c[choice]):undefined;
      if(c.kind==='contracts'){
        for(const key of ['contract','contractVersion','contractSignatures','contractAgreements'])delete out[key];
        if(exists)Object.assign(out,value);continue;
      }
      if(!c.path.length)fail('Der vollständige Workspace kann nicht ungeprüft ersetzt werden.');
      let cursor=out;
      for(const key of c.path.slice(0,-1))cursor=typeof key==='object'?cursor.find(x=>str(x.id)===key.id):cursor[key];
      const key=c.path[c.path.length-1];
      if(typeof key==='object'){
        const at=cursor.findIndex(x=>str(x.id)===key.id);
        if(!exists && at>=0)cursor.splice(at,1);else if(exists && at>=0)cursor[at]=value;else if(exists)cursor.push(value);
      }else if(exists)cursor[key]=value;else delete cursor[key];
    }
    uniqueTargets(out);return out;
  }
  function service(db, orgId, getUser, decodeWorkspace, serverTime=stamp=>stamp){
    const org = db.collection('orgs').doc(str(orgId));
    const users = org.collection('users'), proposals = org.collection('proposals'), tasks = org.collection('tasks');
    const stateRef = org.collection('meta').doc('workspace_state'), inboxArchive=org.collection('inboxArchive');
    const decode = d => clone((decodeWorkspace ? decodeWorkspace(d) : d && d.payload) || {});
    async function profile(uid){ const snap = await users.doc(uid).get({source:'server'}); if(!snap.exists) fail('Kundenkonto ist noch nicht zugeordnet.'); return snap.data(); }
    async function workspace(){const actor=getUser(),snap=await stateRef.get({source:'server'});if(!actor || getUser()?.uid!==actor.uid)fail('Konto gewechselt.');if(!snap.exists)fail('Workspace fehlt.');return {payload:decode(snap.data()),stamp:Number(snap.data().updatedAt || 0)};}
    async function submit(data){
      const user = getUser(); if(!user || data.customerUid !== user.uid) fail('Kundenkonto gewechselt.');
      validateTarget(data,context(user,await profile(user.uid)));
      const pref = proposals.doc(data.id), tref = tasks.doc(data.id);
      const [p,t] = await Promise.all([pref.get({source:'server'}),tref.get({source:'server'})]);
      for(const snap of [p,t]) if(snap.exists && !sameSubmission(snap.data(),data)) fail('Vorschlagsnummer ist bereits mit anderen Daten belegt.','proposal-id-conflict');
      if(p.exists && t.exists) return {ok:true,id:data.id,status:p.data().proposalStatus,existing:true};
      if((p.exists && p.data().proposalStatus !== 'pending') || (t.exists && t.data().proposalStatus !== 'pending')) fail('Unvollständiger bereits bearbeiteter Eingang. Bitte Administrator prüfen lassen.');
      const existing = p.exists ? p.data() : (t.exists ? t.data() : data);
      const batch = db.batch(); batch.set(pref,existing); batch.set(tref,existing);
      await batch.commit();
      return {ok:true,id:data.id,status:'pending'};
    }
    async function requireAdmin(tx){
      const user = getUser(); if(!user) fail('Bitte anmelden.');
      const snap = await tx.get(users.doc(user.uid));
      if(!(snap.exists && snap.data().role === 'admin') && !(str(user.email).toLowerCase() === 'raphael@boch-plan.de' && user.emailVerified === true)) fail('Nur ein Administrator darf Vorschläge übernehmen.');
      return user;
    }
    async function setInboxArchived(entries,archived=true){
      const initiator=getUser();if(!initiator)fail('Bitte anmelden.');
      if(!Array.isArray(entries)||!entries.length||entries.length>100)fail('Bitte 1 bis 100 Eingänge auswählen.');
      const rows=entries.map(entry=>typeof entry==='string'?{id:entry}:entry);
      if(rows.some(r=>!str(r?.id)||str(r.id).includes('/'))||new Set(rows.map(r=>str(r.id))).size!==rows.length)fail('Die Auswahl enthält ungültige oder doppelte Eingänge.');
      return db.runTransaction(async tx=>{
        const actor=await requireAdmin(tx);if(actor.uid!==initiator.uid)fail('Konto gewechselt.');
        const snapshots=await Promise.all(rows.map(async entry=>({entry,proposal:await tx.get(proposals.doc(str(entry.id))),marker:await tx.get(inboxArchive.doc(str(entry.id)))})));
        for(const {entry,proposal}of snapshots){
          if(archived&&!proposal.exists)fail('Ein ausgewählter Eingang fehlt. Bitte die Liste aktualisieren.');
          if(entry.expectedRow&&proposal.exists&&stable({...proposal.data(),id:proposal.id})!==stable(entry.expectedRow))fail('Ein Eingang wurde zwischenzeitlich geändert. Bitte die Liste aktualisieren.','inbox-changed');
        }
        if(getUser()?.uid!==actor.uid)fail('Konto gewechselt.');let count=0;
        for(const {entry,marker}of snapshots){
          if(archived&&!marker.exists){tx.set(inboxArchive.doc(str(entry.id)),{proposalId:str(entry.id),archivedAt:Date.now(),archivedByUid:actor.uid});count++;}
          else if(!archived&&marker.exists){tx.delete(marker.ref);count++;}
        }
        return{ok:true,ids:rows.map(r=>str(r.id)),archived,count};
      });
    }
    async function maintenance(){
      const actor=await db.runTransaction(tx=>requireAdmin(tx));
      const [w,accounts,ps,ts,archives]=await Promise.all([stateRef.get({source:'server'}),users.get({source:'server'}),proposals.get({source:'server'}),tasks.get({source:'server'}),inboxArchive.get({source:'server'})]);
      if(getUser()?.uid!==actor.uid)fail('Konto gewechselt.');if(!w.exists)fail('Workspace fehlt.');
      const records=snap=>snap.docs.map(d=>({id:d.id,data:d.data()}));
      return {projectId:db.app?.options?.projectId || '',orgId:str(orgId),createdAt:Date.now(),workspaceDocument:w.data(),payload:decode(w.data()),stamp:Number(w.data().updatedAt || 0),profiles:records(accounts),proposals:records(ps),tasks:records(ts),inboxArchive:records(archives)};
    }
    async function assign(uid,cid,templateId,guard){
      if(!uid || !cid || (templateId && !['customer_data','boarding_contract','hundeannahme'].includes(templateId)) || (!templateId && !guard)) fail('Kundenkonto, Kunde und Vorlage sind erforderlich.');
      const taskRef = templateId?tasks.doc():null;
      await db.runTransaction(async tx=>{
        const admin = await requireAdmin(tx);
        const [u,w] = await Promise.all([tx.get(users.doc(uid)),tx.get(stateRef)]);
        if(!u.exists || u.data().role !== 'customer' || !w.exists) fail('Bestehendes Kundenkonto oder Workspace fehlt.');
        const account = u.data();
        if(account.uid!==uid)fail('Die Profil-UID stimmt nicht mit dem registrierten Konto überein.');
        if(guard && (Number(w.data().updatedAt || 0)!==Number(guard.stamp) || stable(account)!==stable(guard.account)))fail('Workspace oder Konto wurde seit der Bestandsprüfung geändert. Bitte erneut prüfen.','workspace-conflict');
        if(account.customerId && str(account.customerId) !== str(cid)) fail('Das Konto ist bereits einem anderen Kunden zugeordnet. Keine Änderung vorgenommen.','assignment-conflict');
        const snapshot = portalSnapshot(decode(w.data()),cid);
        const trusted=context({uid,email:account.email},account).verified;
        if(!trusted && str(account.email).toLowerCase() !== str(snapshot.customer.email).toLowerCase()) fail('Die E-Mail des registrierten Kontos stimmt nicht mit dem gewählten Kunden überein.');
        const stamp=Math.max(Date.now(),Number(w.data().updatedAt || 0)+1),mapping = {uid,customerId:str(cid),petIds:snapshot.pets.map(idOf),accessSchemaVersion:3,portalData:snapshot,accessUpdatedAt:stamp};
        tx.update(users.doc(uid),mapping);
        // Assignments advance the workspace revision, so a concurrent publish cannot skip a newly assigned account.
        tx.update(stateRef,{updatedAt:stamp,updatedBy:admin.uid});
        if(taskRef)tx.set(taskRef,{id:taskRef.id,taskId:taskRef.id,templateId,title:templateId,status:'open',customerUid:uid,customerEmail:account.email,
          customerId:str(cid),customerName:str(snapshot.customer.name),createdAt:Date.now(),createdByUid:admin.uid});
      });
      return {ok:true,id:taskRef?.id || ''};
    }
    async function repairPair(id,expectedRow){
      if(!str(id) || str(id).includes('/'))fail('Ungültige Vorschlagsnummer.');
      return db.runTransaction(async tx=>{
        const actor=await requireAdmin(tx),pref=proposals.doc(id),tref=tasks.doc(id);
        const [p,t]=await Promise.all([tx.get(pref),tx.get(tref)]);
        if(!p.exists && !t.exists)fail('Einreichung fehlt.');
        const row=p.exists?p.data():t.data();
        if(stable(row)!==stable(expectedRow))fail('Der Eingang wurde seit der Prüfung geändert.');
        if(row.id!==id || row.proposalStatus!=='pending' || row.status!=='submitted')fail('Nur ein vollständiger offener Eingang kann ergänzt werden.');
        if(row.submissionSchemaVersion!==3 && row.templateId!=='customer_data')fail('Alte Verträge und Aufenthalte müssen einzeln geprüft werden. Keine automatische Ergänzung.');
        if(!['customer_data','boarding_contract','hundeannahme'].includes(row.templateId) || !row.payloadSubmitted || typeof row.payloadSubmitted!=='object')fail('Formularinhalt fehlt.');
        if(row.templateId==='customer_data' && (!str(row.payloadSubmitted.customer?.name) || !str(row.payloadSubmitted.customer?.email) || !str(row.payloadSubmitted.pet?.name)))fail('Vollständige Kunden- und Hundedaten fehlen.');
        const uid=str(row.customerUid),account=await tx.get(users.doc(uid));if(!account.exists)fail('Kundenkonto fehlt.');
        if(str(row.customerEmail).toLowerCase()!==str(account.data().email).toLowerCase())fail('Absender-E-Mail und registriertes Kundenkonto widersprechen sich.');
        validateTarget(row,context({uid,email:account.data().email},account.data()));
        if(new TextEncoder().encode(JSON.stringify(row)).length>700000)fail('Der Eingang ist zu groß. Keine Ergänzung vorgenommen.');
        if(p.exists && t.exists){if(stable(p.data())!==stable(t.data()))fail('Die Gegenstücke unterscheiden sich. Keine Überschreibung.');return {ok:true,existing:true};}
        if(getUser()?.uid!==actor.uid)fail('Konto gewechselt.');
        tx.set(p.exists?tref:pref,clone(row));return {ok:true,id,created:p.exists?'task':'proposal'};
      });
    }
    async function review(id, decision, edits){
      if(!['adopted','rejected'].includes(decision)) fail('Unbekannte Prüfentscheidung.');
      const initiator=getUser();if(!initiator)fail('Bitte anmelden.');
      if(!str(id)||str(id).includes('/'))fail('Ungültige Vorschlagsnummer.');
      const preflight=await proposals.doc(str(id)).get({source:'server'});
      if(!preflight.exists)fail('Vorschlag fehlt.');
      const targetUid=str(preflight.data().customerUid);if(!targetUid)fail('Kundenkonto fehlt.');
      // Reuse the customer's existing team chat by UID, including historic chats.
      const listed=await org.collection('chats').where('customerUid','==',targetUid).get({source:'server'});
      const priorChats=listed.docs.map(d=>({id:d.id,...d.data()})).filter(c=>str(c.teamMemberKey||'raphael')==='raphael');
      priorChats.sort((a,b)=>(Number(b.updatedAtMs)||b.updatedAt?.toMillis?.()||0)-(Number(a.updatedAtMs)||a.updatedAt?.toMillis?.()||0));
      const chatRef=org.collection('chats').doc(priorChats[0]?.id||targetUid+'__raphael'),messageRef=chatRef.collection('messages').doc('decision__'+str(id));
      const newPetId = tasks.doc().id, newStayId = tasks.doc().id;
      return db.runTransaction(async tx=>{
        const admin = await requireAdmin(tx);
        if(admin.uid!==initiator.uid)fail('Konto gewechselt.');
        const pref = proposals.doc(str(id)), tref = tasks.doc(str(id));
        const [ps,ts,ws,archived] = await Promise.all([tx.get(pref),tx.get(tref),tx.get(stateRef),tx.get(inboxArchive.doc(str(id)))]);
        if(archived.exists)fail('Dieser Eingang ist archiviert. Bitte zuerst aus dem Archiv wiederherstellen.','inbox-archived');
        if(!ps.exists || !ts.exists || !ws.exists) fail('Vorschlag, Gegenstück oder Workspace fehlt.');
        const row = ps.data(), task = ts.data();
        if(!sameSubmission(row,task)) fail('Vorschlag und Aufgabe enthalten unterschiedliche Daten.');
        if(row.proposalStatus !== 'pending' || task.proposalStatus !== 'pending'){
          if(row.proposalStatus === decision && task.proposalStatus === decision) return {ok:true,existing:true};
          fail('Der Eingang wurde bereits anders bearbeitet.');
        }
        const uid = str(row.customerUid), uref = users.doc(uid), us = await tx.get(uref);
        if(uid!==targetUid)fail('Die Kundenzuordnung des Eingangs wurde geändert. Bitte erneut öffnen.');
        if(!us.exists) fail('Kundenkonto fehlt.');
        const account = us.data();
        validateTarget(row,context({uid,email:account.email},account),{allowIncompleteStay:decision==='rejected'});
        let sourceRef = null;
        if(str(row.sourceTaskId)){
          sourceRef = tasks.doc(str(row.sourceTaskId));
          const src = await tx.get(sourceRef);
          if(!src.exists || src.data().customerUid !== uid || src.data().customerId !== row.customerId
            || src.data().templateId!==row.templateId || src.data().status!=='open' || (str(src.data().petId) && str(src.data().petId)!==str(row.petId))) fail('Die Ausgangsaufgabe gehört zu einem anderen Kunden, Hund oder Formular oder ist nicht mehr offen.');
        }
        const [chatSnap,messageSnap]=await Promise.all([tx.get(chatRef),tx.get(messageRef)]);
        const chat=chatSnap.exists?chatSnap.data():null;
        if(chat&&(chat.customerUid!==uid||str(chat.teamMemberKey||'raphael')!=='raphael'))fail('Der Chat gehört zu einem anderen Kunden oder Team.');
        if(messageSnap.exists)fail('Zu diesem offenen Eingang gibt es bereits eine Rückmeldung. Bitte den Eingang prüfen.');
        if(getUser()?.uid!==admin.uid)fail('Konto gewechselt.');
        const stamp = Math.max(Date.now(),Number(ws.data().updatedAt || 0)+1), resolution = {status:decision,proposalStatus:decision,reviewedAt:stamp,reviewedByUid:admin.uid,updatedAt:stamp};
        let adoptedWorkspace=null;
        if(decision === 'adopted'){
          const workspace = decode(ws.data()), cid = row.customerId, input = row.payloadSubmitted || {};
          const customer = (workspace.customers || []).find(c=>idOf(c) === cid);
          if(!customer) fail('Zugeordneter Kunde fehlt im Workspace.');
          let pet = (workspace.pets || []).find(p=>idOf(p) === row.petId && str(p.customerId) === cid);
          if(row.templateId === 'customer_data'){
            const changes = edits || input;
            Object.assign(customer,pick(changes.customer,customerFields),{updatedAt:stamp});
            if(input.isNewPet === true && !row.petId){
              pet = {id:newPetId,petId:newPetId,dogId:newPetId,customerId:cid,createdAt:stamp};
              (workspace.pets || (workspace.pets=[])).push(pet);
              (workspace.dogs || (workspace.dogs=[])).push({id:newPetId,customerId:cid});
              workspace._legacy=workspace._legacy || {};
              (workspace._legacy.dogIdToPetId || (workspace._legacy.dogIdToPetId={}))[newPetId]=newPetId;
              (workspace._legacy.dogIdToCustomerId || (workspace._legacy.dogIdToCustomerId={}))[newPetId]=cid;
            }
            if(!pet) fail('Zugeordneter Hund fehlt im Workspace.');
            Object.assign(pet,pick(changes.pet,petFields),{updatedAt:stamp});
            if(!str(customer.name) || !str(customer.email) || !str(pet.name) || (pet.chip === true && !str(pet.chipNumber))) fail('Name, E-Mail oder Chipnummer fehlen.');
            // Keep the historic select/document mapping stable; update only this pet's existing legacy dog.
            const dog = (workspace.dogs || []).find(d=>d.id === pet.dogId || (workspace._legacy && workspace._legacy.dogIdToPetId && workspace._legacy.dogIdToPetId[d.id] === pet.id));
            if(dog) Object.assign(dog,{name:pet.name,owner:customer.name,phone:customer.phone,email:customer.email,customerId:cid});
            for(const owned of workspace.pets || [])if(owned.customerId===cid){
              const legacy=(workspace.dogs || []).find(d=>d.id===owned.dogId || workspace._legacy?.dogIdToPetId?.[d.id]===owned.id);
              if(legacy)Object.assign(legacy,{owner:customer.name,phone:customer.phone,email:customer.email,customerId:cid});
            }
          }else if(row.templateId === 'boarding_contract'){
            if(!pet) fail('Zugeordneter Hund fehlt.');
            const version = str(workspace.contractVersion || 'v1.0');
            if(input.contractVersion !== version) fail('Der Vertrag wurde inzwischen geändert. Bitte die aktuelle Fassung neu unterschreiben.','contract-version-changed');
            const sk = signatureKey(cid,pet.id,version), ak = agreementKey(cid,pet.id,version);
            (workspace.contractSignatures || (workspace.contractSignatures={}))[sk] = {...clone(input.signature),customerId:cid,petId:pet.id,version};
            (workspace.contractAgreements || (workspace.contractAgreements={}))[ak] = {customerId:cid,petId:pet.id,version,accepted:true,
              signatureAt:Number(input.signature.signedAt),savedAt:stamp,approvedAt:stamp,approvedByUid:admin.uid,approvalId:row.id};
          }else if(row.templateId === 'hundeannahme'){
            if(!pet) fail('Zugeordneter Hund fehlt.');
            const stay=validateStay(input),days=occupancyRange(workspace,stay.from,stay.to,{petId:pet.id,care:stay.care}),full=days.find(d=>d.exceeds);
            if(full)fail('Am '+full.day+' würde die Kapazität überschritten. Der Eingang bleibt offen.','stay-capacity-exceeded');
            const doc = {id:newStayId,templateId:'hundeannahme',templateName:'Aufenthalte',customerId:cid,petId:pet.id,dogId:pet.dogId || pet.id,
              fields:clone(input.fields || {}),meta:clone(input.meta || {}),signature:input.signature ? clone(input.signature) : null,
              staySchemaVersion:input.staySchemaVersion||0,consentTexts:clone(input.consentTexts||{}),
              sourceProposalId:row.id,createdAt:stamp,updatedAt:stamp,saved:true};
            (workspace.docs || (workspace.docs=[])).push(doc);
          }else fail('Nicht unterstütztes Formular.');
          workspace._cloudUpdatedAt = stamp;
          const snapshot = portalSnapshot(workspace,cid);
          const next = {payload:workspace,secureWorkflowVersion:3,updatedAt:stamp,updatedBy:admin.uid};
          if(new TextEncoder().encode(JSON.stringify({...ws.data(),...next})).length > 900000) fail('Workspace überschreitet die sichere Dokumentgröße. Eingang bleibt offen.','workspace-too-large');
          tx.update(stateRef,next);
          tx.update(uref,{portalData:snapshot,petIds:snapshot.pets.map(idOf),accessUpdatedAt:stamp});
          adoptedWorkspace={payload:workspace,stamp};
          resolution.resolvedPetId = pet && pet.id || '';
        }
        const kind={customer_data:'Deine Änderung der Kunden-/Hundedaten',boarding_contract:'Dein Betreuungsvertrag',hundeannahme:'Deine Aufenthaltsanfrage'}[row.templateId]||'Deine Einreichung';
        const stay=row.templateId==='hundeannahme'?row.payloadSubmitted?.meta:null;
        const period=stay?' ('+str(stay.von)+' bis '+str(stay.bis)+')':'';
        const text=kind+period+' wurde '+(decision==='adopted'?'angenommen. Die bestätigten Daten sind in deiner App verfügbar.':'abgelehnt. Bei Rückfragen kannst du uns hier im Chat schreiben.');
        const time=serverTime(stamp);
        if(!chat)tx.set(chatRef,{customerUid:uid,customerId:row.customerId,customerEmail:str(account.email).toLowerCase(),customerName:str(account.portalData?.customer?.name||row.customerName),teamMemberKey:'raphael',teamMemberLabel:'Raphael',createdAt:time,createdAtMs:stamp,unreadForStaff:0});
        tx.set(messageRef,{kind:'decision',proposalId:str(id),decision,templateId:row.templateId,senderUid:admin.uid,senderRole:'staff',senderName:'Doggy Style',senderEmail:str(admin.email),customerUid:uid,customerEmail:str(account.email).toLowerCase(),customerName:str(account.portalData?.customer?.name||row.customerName),teamMemberKey:'raphael',text,attachments:[],createdAt:time,createdAtMs:stamp});
        tx.set(chatRef,{updatedAt:time,updatedAtMs:stamp,lastMessageAt:time,lastMessageAtMs:stamp,lastMessageText:text,lastMessageFromRole:'staff',unreadForCustomer:Number(chat?.unreadForCustomer||0)+1,status:'open'},{merge:true});
        tx.update(pref,resolution); tx.update(tref,resolution);
        if(sourceRef && sourceRef.id !== tref.id) tx.update(sourceRef,{status:decision,answeredAt:stamp,updatedAt:stamp});
        return {ok:true,id,decision,...(adoptedWorkspace?{workspace:adoptedWorkspace}:{})};
      });
    }
    async function publish(workspace, expectedStamp){
      const actor=getUser();if(!actor)fail('Bitte anmelden.');
      // Query identities only; every snapshot is re-read inside the transaction.
      const listed=await users.where('accessSchemaVersion','==',3).get({source:'server'});
      if(listed.size>200) fail('Zu viele Konten für eine gemeinsame Synchronisation.');
      const input=clone(workspace);uniqueTargets(input);
      return db.runTransaction(async tx=>{
        const admin=await requireAdmin(tx), remote=await tx.get(stateRef);
        if(admin.uid!==actor.uid)fail('Konto gewechselt.');
        if(remote.exists && Number(remote.data().updatedAt || 0)!==Number(expectedStamp || 0)) fail('Der Workspace wurde auf einem anderen Gerät geändert. Bitte zuerst aktualisieren.','workspace-conflict');
        const accounts=await Promise.all(listed.docs.map(doc=>tx.get(doc.ref)));
        const stamp=Math.max(Date.now(),Number(remote.exists && remote.data().updatedAt || 0)+1);input._cloudUpdatedAt=stamp;
        const next={payload:input,secureWorkflowVersion:3,updatedAt:stamp,updatedBy:admin.uid};
        if(new TextEncoder().encode(JSON.stringify({...(remote.exists?remote.data():{}),...next})).length>900000) fail('Workspace ist zu groß. Die Cloud wurde nicht verändert.','workspace-too-large');
        for(const account of accounts){
          if(!account.exists || account.data().role!=='customer' || !account.data().customerId) continue;
          const snapshot=portalSnapshot(input,account.data().customerId);
          tx.update(account.ref,{portalData:snapshot,petIds:snapshot.pets.map(idOf),accessUpdatedAt:stamp});
        }
        if(remote.exists)tx.update(stateRef,next);else tx.set(stateRef,next);
        return {ok:true,stamp};
      });
    }
    async function approveManualContract(cid,pid,version,signature,accepted,expectedStamp){
      if(accepted!==true || !signatureValid(signature))fail('Zustimmung und eine erfasste Unterschrift sind erforderlich.');
      const snap=await stateRef.get({source:'server'});if(!snap.exists)fail('Workspace fehlt.');
      const workspace=decode(snap.data()),user=getUser();
      const customer=(workspace.customers || []).find(c=>idOf(c)===str(cid));
      const pet=(workspace.pets || []).find(p=>idOf(p)===str(pid) && p.customerId===str(cid));
      if(!customer || !pet)fail('Kunde und Hund sind nicht eindeutig miteinander zugeordnet.');
      if(str(workspace.contractVersion || 'v1.0')!==str(version))fail('Die Vertragsfassung wurde geändert. Bitte erneut unterschreiben.');
      if(Number(snap.data().updatedAt || 0)!==Number(expectedStamp || 0))fail('Der Workspace wurde geändert. Bitte zuerst aktualisieren.','workspace-conflict');
      const stamp=Date.now();
      (workspace.contractSignatures || (workspace.contractSignatures={}))[signatureKey(cid,pid,version)]={...clone(signature),customerId:str(cid),petId:str(pid),version:str(version)};
      (workspace.contractAgreements || (workspace.contractAgreements={}))[agreementKey(cid,pid,version)]={customerId:str(cid),petId:str(pid),version:str(version),accepted:true,
        signatureAt:Number(signature.signedAt),savedAt:stamp,approvedAt:stamp,approvedByUid:str(user && user.uid),source:'admin_manual'};
      // publish re-checks admin authority and the exact server revision before one atomic write.
      return publish(workspace,expectedStamp);
    }
    return {profile,workspace,submit,assign,review,publish,approveManualContract,maintenance,repairPair,setInboxArchived,
      linkCustomer:(uid,cid,stamp,account)=>assign(uid,cid,'',{stamp,account})};
  }
  return {context,signatureValid,canvasHasInk,auditRecords,restoreRecords,signatureKey,agreementKey,approvedContract,portalSnapshot,validateTarget,submission,sameSubmission,mergePlan,resolveMerge,service,customerFields,petFields,stayConsents,careType,dateISO,stayDetails,dateRange,capacity,confirmedStays,occupancyForDay,occupancyRange,validateStay,legalTexts};
});
