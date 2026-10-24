/* Invoice editing uses explicit saves; signed stay documents remain separate. */
(function(){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v)),text=v=>String(v??''),bases=new Map(),signedOpen=new Map();
  let edit=null;
  const actor=()=>window.firebase?.auth().currentUser?.uid||'';
  const chargeKeys=new Set(['special_times','extra_care','short_notice','discount_enabled','discount_percent','medication','walks_enabled','walk_extra_count','walk_extra_auto','bandage_enabled','bandage_count','grooming_enabled','grooming_count','hygiene_enabled','hygiene_days','pickup_dropoff_enabled','pickup_dropoff_count','sun_hol_apply']);
  function isStay(doc){return !!doc&&(doc.type==='stay'||doc.templateId==='hundeannahme'||doc.templateName==='Aufenthalte');}
  function signedStay(doc){return isStay(doc)&&!!(doc.saved||doc.signature?.dataUrl);}
  function effectiveFields(doc){return {...(doc?.fields||{}),...(doc?.billingOverrides||{})};}
  function clearSignature(doc){doc.signature=null;delete doc.signatureDataUrl;delete doc.signatureAt;delete doc.signatures;for(const value of [doc.fields,doc.meta])if(value){delete value.signatureDataUrl;delete value.signatureAt;}}
  function sameParty(a,b){return (!a.customerId||!b.customerId||a.customerId===b.customerId)&&(!a.petId||!b.petId||a.petId===b.petId)&&(!a.dogId||!b.dogId||a.dogId===b.dogId);}
  function stayRoot(doc){
    if(!doc?.id)throw new Error('Aufenthalt nicht gefunden.');
    const seen=new Set();let node=doc;
    while(node.versionOf){
      if(seen.has(node.id)||node.versionOf===node.id)throw new Error('Die Aufenthaltsversionen sind nicht eindeutig zugeordnet.');seen.add(node.id);
      const parent=(state.docs||[]).find(d=>d.id===node.versionOf);
      if(!parent)return text(node.versionOf);
      if(!sameParty(doc,parent))throw new Error('Die Aufenthaltsversion gehört zu einem anderen Kunden oder Hund.');node=parent;
    }
    return text(node.stayId||node.id);
  }
  function family(doc){const root=stayRoot(doc);return (state.docs||[]).filter(d=>{try{return isStay(d)&&sameParty(doc,d)&&stayRoot(d)===root;}catch(_){return false;}});}
  function findForStay(doc){
    const root=stayRoot(doc),ids=new Set(family(doc).map(d=>d.id));ids.add(root);ids.add(doc.id);
    const candidates=(state.invoices||[]).filter(inv=>!!inv.sourceDocId&&sameParty(doc,inv)&&(inv.stayId===root||ids.has(inv.sourceDocId)));
    const linked=candidates.find(inv=>inv.id===doc.invoiceId);
    if(linked)return linked;
    const open=candidates.filter(inv=>!frozen(inv));
    if(open.length===1)return open[0];if(!open.length&&candidates.length===1)return candidates[0];
    if(candidates.length>1){const e=new Error('Für diesen Aufenthalt gibt es mehrere Rechnungen. Bitte die passende Rechnung auswählen.');e.code='invoice-ambiguous';e.candidates=open.length?open:candidates;throw e;}
    return null;
  }
  function sourceDoc(inv){
    if(!inv?.sourceDocId)return null;
    const original=(state.docs||[]).find(d=>d.id===inv.sourceDocId||d.docId===inv.sourceDocId);
    if(!original)return (state.stays||[]).find(d=>d.id===inv.sourceDocId||d.docId===inv.sourceDocId)||null;
    const versions=family(original),explicit=versions.find(d=>d.id===inv.sourceVersionId);
    return explicit||versions.slice().sort((a,b)=>dsTsMs(b.createdAt)-dsTsMs(a.createdAt)||dsTsMs(b.updatedAt)-dsTsMs(a.updatedAt))[0]||original;
  }
  function admin(){return !!actor()&&window.CLOUD?.role==='admin'&&!window.DSWorkflow?.scoped();}
  function frozen(inv){return ['paid','cancelled','bezahlt','storniert'].includes(text(inv?.status).trim().toLowerCase());}
  function editable(inv){return admin()&&!!inv&&!frozen(inv);}
  function requireEdit(inv){
    if(!admin()){alert('Rechnungen können nur Administratoren bearbeiten.');return false;}
    if(inv&&frozen(inv)){alert('Bezahlte und stornierte Rechnungen sind abgeschlossen.');return false;}
    return true;
  }
  function number(value){
    const s=text(value).trim().replace(',','.');
    if(!/^-?\d+(?:\.\d{1,2})?$/.test(s))throw new Error('Bitte einen gültigen Betrag mit höchstens zwei Nachkommastellen eingeben.');
    const n=Number(s);if(!Number.isFinite(n))throw new Error('Ungültiger Betrag.');return n;
  }
  function display(inv){
    if(!frozen(inv))return inv;
    const out=clone(inv);
    if(inv.pricingSnapshot)out.pricing=clone(inv.pricingSnapshot);
    if(inv.lineItemsSnapshot)out.lineItems=clone(inv.lineItemsSnapshot);
    if(inv.sourceSnapshotAtLock)out.sourceSnapshot=clone(inv.sourceSnapshotAtLock);
    return out;
  }
  function parts(inv){
    const p=inv.pricing||(inv.pricing={});
    if(!p.parts)p.parts={base:round2(p.basePrice??p.base??p.total??0),holiday:round2(p.holidayExtra??p.holidayValue??0),percent:round2(p.percentExtra??0),fixed:round2(p.fixedExtra??0)};
    return p.parts;
  }
  function lines(inv){
    const v=display(inv);
    if(v.pricingMode==='manual'&&Array.isArray(v.lineItems))return clone(v.lineItems);
    if(v.sourceDocId)return buildInvoiceLineItems(v);
    const total=round2(v.pricing?.parts?.base??v.pricing?.basePrice??v.pricing?.total??0);
    return [{key:'base',label:v.note||'Freie Rechnung',qty:1,unit:total,total}];
  }
  function lineDescription(line){
    const qty=Number(line.qty),unit=Number(line.unit);
    if(Number.isFinite(qty)&&qty>0&&Number.isFinite(unit))return text(line.label)+' – '+qty+' × '+formatEuro(unit);
    if(Number(line.rate))return text(line.label)+' – '+Number(line.rate)+' % von '+formatEuro(line.base||0);
    return text(line.label);
  }
  function positions(inv,table=false,sign=1){
    return lines(inv).map(item=>{const line={...item,total:sign*Number(item.total||0),unit:item.unit==null?item.unit:sign*Number(item.unit)};return table?'<tr><td>'+escapeHtml(lineDescription(line))+'</td><td class="right">'+formatEuro(line.total)+'</td></tr>':'<p><strong>'+escapeHtml(lineDescription(line))+':</strong> '+formatEuro(line.total)+'</p>';}).join('');
  }
  function nextNumber(){
    const year=new Date().getFullYear(),used=new Set((state.invoices||[]).map(x=>x.invoiceNumber));
    let next=Math.max(1,Math.trunc(Number(state.nextInvoiceNumber)||1)),value;
    do{value=year+'-'+String(next++).padStart(4,'0');}while(used.has(value));
    state.nextInvoiceNumber=next;return value;
  }
  function billableDates(from,to){
    const dates=DSWorkflowCore.dateRange(from,to);return dates.length===1?dates:dates.slice(0,-1);
  }
  function surchargeDays(from,to){return billableDates(from,to).filter(day=>new Date(day+'T12:00:00Z').getUTCDay()===0||bavariaHolidaysSet(Number(day.slice(0,4))).has(day)).length;}
  function recalcFromStay(inv,doc,force=false){
    if(!inv||!doc||frozen(inv)||(!force&&inv.pricingMode==='manual'))return false;
    const before=JSON.stringify({pricing:inv.pricing,period:inv.period,lineItems:inv.lineItems,sourceSnapshot:inv.sourceSnapshot});
    const p=calculateInvoicePricing(doc);if(!p)throw new Error('Bitte Betreuung und Zeitraum im Aufenthalt prüfen.');
    const lastCapture=inv.sourceSnapshot?.capturedAt;
    inv.pricing={...(inv.pricing||{}),basePrice:round2(p.base),percentExtra:round2(p.percentValue),percentRate:round2(p.percentExtra),holidayDays:Number(p.sunHolDays||0),holidayExtra:round2(p.holidayValue),fixedExtra:round2(p.fixedExtra),parts:{base:round2(p.base),percent:round2(p.percentValue),holiday:round2(p.holidayValue),fixed:round2(p.fixedExtra)},breakdown:{percentItems:clone(p.percentItems||[]),fixedItems:clone(p.fixedItems||[]),holidayDays:p.sunHolDays,sunHolDays:p.sunHolDays,sunHolRate:p.sunHolRate,sunHolUnit:p.sunHolUnit},_calc:{days:p.days,daily:p.daily,betreuungNorm:p.betreuungNorm,percentRate:p.percentExtra,percentValue:p.percentValue,holidayDays:p.sunHolDays,holidayExtra:p.holidayValue}};
    delete inv.pricing.locked;inv.period={...(inv.period||{}),from:doc.meta.von,to:doc.meta.bis};
    recomputeInvoiceTotals(inv);inv.lineItems=buildInvoiceLineItems(inv);snapshotInvoiceSourceMeta(inv);
    if(lastCapture)inv.sourceSnapshot.capturedAt=lastCapture;
    if(force)inv.pricingMode='stay';
    const after=JSON.stringify({pricing:inv.pricing,period:inv.period,lineItems:inv.lineItems,sourceSnapshot:inv.sourceSnapshot});
    if(before!==after){inv.updatedAt=new Date().toISOString();inv.sourceSnapshot.capturedAt=inv.updatedAt;return true;}return false;
  }
  function create(doc){
    if(!requireEdit())return null;
    if(!doc)throw new Error('Aufenthalt nicht gefunden.');
    state.invoices=Array.isArray(state.invoices)?state.invoices:[];
    let inv=findForStay(doc);
    if(inv)return inv;
    if(!DSWorkflowCore.dateISO(doc.meta?.von)||!DSWorkflowCore.dateISO(doc.meta?.bis)||doc.meta.bis<doc.meta.von)throw new Error('Bitte einen gültigen Zeitraum im Aufenthalt angeben.');
    if(!calculateInvoicePricing(doc))throw new Error('Bitte die Betreuung im Aufenthalt auswählen.');
    const at=new Date().toISOString();
    inv={id:uid(),type:'invoice',sourceDocId:doc.id,sourceVersionId:doc.id,stayId:stayRoot(doc),dogId:doc.dogId||'',customerId:doc.customerId||getCustomerByDogId(doc.dogId)?.id||'',petId:doc.petId||getPetByDogId(doc.dogId)?.id||'',period:{from:doc.meta.von,to:doc.meta.bis},pricing:{},status:'draft',note:'',invoiceNumber:nextNumber(),invoiceDate:at,createdAt:at,updatedAt:at};
    recalcFromStay(inv,doc);state.invoices.push(inv);doc.invoiceId=inv.id;doc.invoiceNumber=inv.invoiceNumber;return inv;
  }
  function openForStay(id){
    if(!requireEdit())return;
    try{
      if(typeof currentDoc!=='undefined'&&currentDoc?.id===id&&document.getElementById('editor')?.classList.contains('is-active')&&dirty){if(!saveCurrent(false))return;}
      const doc=(state.docs||[]).find(d=>d.id===id);if(!doc)throw new Error('Aufenthalt nicht gefunden.');
      const previous=findForStay(doc),inv=create(doc);if(!inv)return;
      if(!previous)saveState();selectTab('invoices');renderInvoiceList();openInvoice(inv.id);
    }catch(e){if(e.code==='invoice-ambiguous'){chooseInvoice(id,e.candidates);return;}alert('Rechnung konnte nicht geöffnet werden: '+e.message);}
  }
  function refresh(id){
    const inv=getInvoiceById(id);if(!requireEdit(inv)||!inv)return;
    if(inv.pricingMode==='manual'&&!confirm('Bearbeitete Rechnungspositionen durch die aktuellen Angaben aus dem Aufenthalt ersetzen?'))return;
    const doc=getInvoiceSourceDoc(inv);if(!doc){alert('Aufenthalt nicht gefunden.');return;}
    recalcFromStay(inv,doc,true);saveState();renderInvoiceList();openInvoice(id);
  }
  function saveRecord(inv){
    if(!requireEdit(inv))return false;
    state.invoices=Array.isArray(state.invoices)?state.invoices:[];
    const index=state.invoices.findIndex(x=>x.id===inv.id);if(index<0)throw new Error('Rechnung nicht gefunden.');
    if(!requireEdit(state.invoices[index]))return false;
    inv.updatedAt=new Date().toISOString();state.invoices[index]=inv;saveState();renderInvoiceList();openInvoice(inv.id);return true;
  }
  function syncLinked(doc){const inv=findForStay(doc);if(!inv)return;if(!frozen(inv)){inv.stayId=stayRoot(doc);inv.sourceVersionId=doc.id;doc.invoiceId=inv.id;doc.invoiceNumber=inv.invoiceNumber;recalcFromStay(inv,doc);}}
  function rememberStay(doc){if(admin()&&doc&&['hundeannahme','stay'].includes(doc.templateId||doc.type))bases.set(actor()+':'+doc.id,clone(doc));}
  function attachStay(doc){
    const index=(state.docs||[]).findIndex(d=>d.id===doc.id);if(index<0)throw new Error('Der Aufenthalt wurde inzwischen entfernt. Die Eingaben bleiben geöffnet.');
    if(state.docs[index]===doc)return doc;
    const base=bases.get(actor()+':'+doc.id);if(!base)throw new Error('Der Aufenthalt wurde inzwischen neu geladen. Bitte die Eingaben prüfen und den Aufenthalt erneut öffnen.');
    const plan=DSWorkflowCore.mergePlan({docs:[base]},{docs:[doc]},{docs:[state.docs[index]]});
    if(plan.conflicts.length)throw new Error('Der Aufenthalt wurde inzwischen an denselben Angaben geändert. Die Eingaben bleiben geöffnet; bitte zuerst den Serverstand prüfen.');
    const merged=DSWorkflowCore.resolveMerge(plan,{}).docs[0];state.docs[index]=merged;return merged;
  }
  function prepareStay(doc){if(admin()&&signedStay(doc))signedOpen.set(actor()+':'+doc.id,clone(doc));}
  function readCharge(key,value){
    if(['special_times','extra_care','short_notice','discount_enabled','medication','walks_enabled','walk_extra_auto','bandage_enabled','grooming_enabled','hygiene_enabled','pickup_dropoff_enabled','sun_hol_apply'].includes(key))return value===true;
    if(value==='')return '';const n=Number(text(value).replace(',','.'));if(!Number.isFinite(n))throw new Error('Bitte einen gültigen Zuschlag eingeben.');return n;
  }
  function setCharge(doc,key,value){
    if(!admin()||!isStay(doc)||!chargeKeys.has(key))return;
    value=readCharge(key,value);
    if(signedStay(doc))doc.billingOverrides={...(doc.billingOverrides||{}),[key]:value};else{doc.fields=doc.fields||{};doc.fields[key]=value;}
    if(key==='walk_extra_count'){if(signedStay(doc))doc.billingOverrides.walk_extra_auto=false;else doc.fields.walk_extra_auto=false;}
  }
  function collectCharges(doc){
    if(!admin()||!isStay(doc))return;
    document.querySelectorAll('#formRoot [data-key]').forEach(input=>{const key=input.dataset.key;if(chargeKeys.has(key))setCharge(doc,key,input.type==='checkbox'?input.checked:input.value);});
  }
  function prepareStaySave(doc,fields,meta){
    if(!admin()||!signedStay(doc))return {fields,meta};
    const original=signedOpen.get(actor()+':'+doc.id)||bases.get(actor()+':'+doc.id)||clone(doc);
    if(!signedStay(original))return {fields,meta};
    for(const [key,value]of Object.entries(fields||{}))if(chargeKeys.has(key))setCharge(doc,key,value);
    collectCharges(doc);
    if(!doc.billingOriginal)doc.billingOriginal={pricing:clone(original.pricing||{}),sourceDocId:doc.id,sourceUpdatedAt:original.updatedAt||null};
    return {fields:clone(original.fields||{}),meta:clone(original.meta||{})};
  }
  function financialSave(doc){return admin()&&signedStay(doc)&&signedOpen.has(actor()+':'+doc.id);}
  function auditStay(doc){
    const base=bases.get(actor()+':'+doc.id);if(!admin()||!base)return;
    const before=effectiveFields(base),after=effectiveFields(doc),changes=[];
    for(const key of chargeKeys){const a=before[key],b=after[key];if(JSON.stringify(a)!==JSON.stringify(b))changes.push({key,from:a===undefined?null:a,to:b===undefined?null:b});}
    if(changes.length){doc.billingAudit=Array.isArray(doc.billingAudit)?doc.billingAudit:[];doc.billingAudit.push({at:new Date().toISOString(),byUid:actor(),sourceDocId:doc.id,changes});}
  }
  function validateFinancial(doc){const errors=[];if(!DSWorkflowCore.dateISO(doc.meta?.von)||!DSWorkflowCore.dateISO(doc.meta?.bis)||doc.meta.bis<doc.meta.von)errors.push('Gültiger Aufenthaltszeitraum');if(!normalizeBetreuung(doc.meta?.betreuung))errors.push('Betreuung');return errors;}
  function chargeLabel(key,cfg){
    const ex=cfg.extras||{},money=n=>formatEuro(n);
    const labels={special_times:'Sonderzeiten / Sonderaufwand ('+Number(ex.specialTimesPercent||0)+' %)',extra_care:'Besondere Betreuung ('+Number(ex.extraCarePercent||0)+' %)',short_notice:'Kurzfristig ('+Number(ex.shortNoticePercent||0)+' %)',medication:'Medikamentengabe ('+money(ex.medicationPerDay||0)+' pro Tag)',walk_extra_count:'Zusatz-Spaziergänge (Anzahl × '+money(ex.walkExtraPrice||0)+')',bandage_count:'Verbandwechsel (Anzahl × '+money(ex.bandagePrice||0)+')',grooming_count:'Pflege / Extra (Anzahl × '+money(ex.groomingPrice||0)+')',hygiene_days:'Hygiene / Extra (Tage × '+money(ex.hygienePerDay||0)+')',pickup_dropoff_count:'Abhol-/Bringservice (Fahrten × '+money(ex.pickupDropoffPrice||0)+')',sun_hol_apply:'Sonn- & Feiertagszuschlag ('+Number(cfg.holidayPercent||0)+' %)',discount_percent:'Sonderrabatt (%)'};
    return labels[key]||'';
  }
  function decorateStay(doc){
    const root=document.getElementById('formRoot');if(!root||!admin()||!isStay(doc))return;
    const cfg=getPricingSettings(),getCurrent=()=>typeof currentDoc!=='undefined'&&currentDoc?.id===doc.id?currentDoc:doc;
    const refresh=()=>{
      const current=getCurrent(),fields=effectiveFields(current);
      const dependencies={walk_extra_count:'walks_enabled',bandage_count:'bandage_enabled',grooming_count:'grooming_enabled',hygiene_days:'hygiene_enabled',pickup_dropoff_count:'pickup_dropoff_enabled',discount_percent:'discount_enabled'};
      root.querySelectorAll('[data-key]').forEach(input=>{const key=input.dataset.key;if(!chargeKeys.has(key))return;
        if(input.type==='checkbox')input.checked=['sun_hol_apply','walks_enabled','bandage_enabled','grooming_enabled','hygiene_enabled','pickup_dropoff_enabled'].includes(key)?fields[key]!==false:key==='discount_enabled'?(fields[key]??!!Number(fields.discount_percent)):fields[key]===true;else input.value=fields[key]??'';
        input.disabled=dependencies[key]?(dependencies[key]==='discount_enabled'?!(fields.discount_enabled??!!Number(fields.discount_percent)):fields[dependencies[key]]===false):false;
      });
      try{renderStayPricingPreview(clone(current));}catch(_){}
    };
    root.querySelectorAll('[data-key]').forEach(old=>{
      const key=old.dataset.key;if(!chargeKeys.has(key))return;
      const input=old.cloneNode(true);input.value=old.value;input.checked=old.checked;old.replaceWith(input);
      const label=chargeLabel(key,cfg),caption=input.closest('label')?.querySelector(':scope > span')||(input.id?root.querySelector('label[for="'+input.id+'"] strong'):null);if(label&&caption)caption.textContent=label;
      const change=()=>{try{setCharge(getCurrent(),key,input.type==='checkbox'?input.checked:input.value);dirty=true;refresh();}catch(e){alert(e.message);}};
      input.addEventListener('input',change);input.addEventListener('change',change);
    });
    if(signedStay(doc)){
      root.querySelectorAll('[data-key]').forEach(input=>{if(!chargeKeys.has(input.dataset.key))input.disabled=true;});
      for(const id of ['docName','dogSelect','stayDogSelect','stayCustomerSelect','stayVon','stayBis','stayBetreuung','stayNotes','stayConsentDsGvo','stayConsentAgb','stayConsentVet','stayConsentHealth','stayConsentTruth']){const input=document.getElementById(id);if(input)input.disabled=true;}
      const clear=root.querySelector('#btnSignatureClear');if(clear)clear.disabled=true;
    }
    let info=root.querySelector('#dsStayBillingInfo');if(!info){info=document.createElement('div');info.id='dsStayBillingInfo';info.className='card ds-stay-billing-info';root.prepend(info);}
    info.replaceChildren();const note=document.createElement('p');note.textContent=signedStay(doc)?'Zuschläge können ohne neue Aufenthaltsversion angepasst werden. Die ursprünglichen Kundenangaben und vorhandene Unterschriften bleiben erhalten.':'Zuschläge werden mit der zugeordneten offenen Rechnung abgeglichen.';info.append(note);
    try{const inv=findForStay(doc);if(inv?.pricingMode==='manual'){const p=document.createElement('p');p.textContent='Rechnung '+inv.invoiceNumber+' enthält manuell bearbeitete Positionen. Mit „Aufschläge aus Aufenthalt übernehmen“ kannst du sie nach Bestätigung ersetzen.';info.append(p);}}catch(e){const p=document.createElement('p');p.textContent=e.message;info.append(p);}
    const actions=document.createElement('div');actions.className='ds-billing-actions';
    for(const [label,fn]of [['Zuschläge speichern',()=>saveCurrent(true)],['Rechnung öffnen',()=>openForStay(doc.id)],...(signedStay(doc)?[['Aufenthaltsangaben bearbeiten',()=>beginRevision(doc.id)]]:[])]){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=label;button.onclick=fn;actions.append(button);}info.append(actions);
    refresh();
  }
  function afterOpenStay(doc){
    if(!admin()||!isStay(doc))return;
    const original=signedOpen.get(actor()+':'+doc.id);
    if(original){doc.fields=clone(original.fields||{});doc.meta=clone(original.meta||{});doc.signature=clone(original.signature||null);doc.saved=original.saved;doc.pricing=clone(original.pricing||{});}
    decorateStay(doc);rememberStay(doc);
  }
  function afterSaveStay(doc){if(admin()&&isStay(doc)){if(signedStay(doc))signedOpen.set(actor()+':'+doc.id,clone(doc));decorateStay(doc);rememberStay(doc);}}
  function beginRevision(id){if(!admin())return;const doc=(state.docs||[]).find(d=>d.id===id);if(!doc||!signedStay(doc))return;try{findForStay(doc);openDoc(id);forkDocument();openDoc(currentDoc.id);}catch(e){if(e.code==='invoice-ambiguous')chooseInvoice(id,e.candidates);else alert(e.message);}}
  function finishFork(parent,fork){
    if(!isStay(parent))return;
    fork.stayId=stayRoot(parent);fork.fields=clone(effectiveFields(parent));clearSignature(fork);delete fork.billingOverrides;delete fork.billingOriginal;
    const inv=findForStay(parent);if(inv){fork.invoiceId=inv.id;fork.invoiceNumber=inv.invoiceNumber;}
    window.currentDoc=fork;rememberStay(fork);
  }
  function chooseInvoice(docId,candidates){
    document.getElementById('dsChooseStayInvoice')?.remove();const user=actor(),dialog=document.createElement('dialog');dialog.id='dsChooseStayInvoice';dialog.className='ds-billing-dialog';
    const heading=document.createElement('h2');heading.textContent='Rechnung für diesen Aufenthalt wählen';const hint=document.createElement('p');hint.textContent='Es gibt mehrere vorhandene Rechnungen. Wähle die Rechnung, die zu diesem Aufenthalt gehört.';dialog.append(heading,hint);
    for(const row of candidates){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=(row.invoiceNumber||'Rechnung')+' · '+formatEuro(row.pricing?.total||0)+' · '+invoiceStatusLabel(row.status);button.onclick=()=>{
      try{if(!admin()||actor()!==user)throw new Error('Konto gewechselt.');const doc=(state.docs||[]).find(d=>d.id===docId),inv=getInvoiceById(row.id);if(!doc||!inv||!sameParty(doc,inv))throw new Error('Zuordnung wurde inzwischen geändert.');const root=stayRoot(doc),ids=new Set(family(doc).map(d=>d.id));ids.add(root);if(!inv.sourceDocId||!(inv.stayId===root||ids.has(inv.sourceDocId)))throw new Error('Zuordnung wurde inzwischen geändert.');doc.invoiceId=inv.id;doc.invoiceNumber=inv.invoiceNumber;saveState();dialog.close();dialog.remove();selectTab('invoices');openInvoice(inv.id);}catch(e){hint.textContent=e.message;}
    };dialog.append(button);}
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Abbrechen';cancel.onclick=()=>{dialog.close();dialog.remove();};dialog.append(cancel);document.body.append(dialog);dialog.showModal();
  }
  function close(){if(edit?.dialog){const d=edit.dialog;edit=null;d.close?.();d.remove();}}
  function reset(){close();bases.clear();signedOpen.clear();document.getElementById('dsChooseStayInvoice')?.remove();}
  function openEdit(id){
    const inv=getInvoiceById(id);if(!inv||!requireEdit(inv))return;close();
    const initial=clone(inv),items=lines(inv).map((item,i)=>({...item,key:item.key||'manual-'+i,label:text(item.label),qty:Number(item.qty)>0?Number(item.qty):1,unit:Number(item.qty)>0&&Number.isFinite(Number(item.unit))?Number(item.unit):Number(item.total||0)}));
    const dialog=document.createElement('dialog');dialog.id='dsInvoiceEdit';dialog.className='ds-billing-dialog';
    dialog.innerHTML='<form><h2>Rechnung bearbeiten</h2><p class="muted">'+escapeHtml(inv.invoiceNumber||'')+' · Beträge inklusive Mehrwertsteuer</p><label>Rechnungsdatum<input name="date" type="date" required></label><label>Leistungszeitraum von<input name="from" type="date"></label><label>Leistungszeitraum bis<input name="to" type="date"></label><label>Mehrwertsteuer (%)<input name="vat" type="text" inputmode="decimal" required></label><div data-lines></div><button type="button" data-add>Position hinzufügen</button><p data-total role="status"></p><label>Hinweis<textarea name="note" rows="3"></textarea></label><p data-error role="alert"></p><div class="ds-billing-actions"><button type="button" data-cancel>Abbrechen</button><button type="submit">Änderungen speichern</button></div></form>';
    document.body.append(dialog);edit={uid:actor(),id,initial,items,dialog};
    const form=dialog.querySelector('form'),error=dialog.querySelector('[data-error]');
    form.elements.date.value=text(inv.invoiceDate).slice(0,10)||toISODateLocal(new Date());form.elements.from.value=inv.period?.from||'';form.elements.to.value=inv.period?.to||'';form.elements.vat.value=text(inv.vatRate??getPricingSettings().vatPercent??19);form.elements.note.value=inv.note||'';
    const total=()=>{try{const gross=round2(items.reduce((sum,x)=>sum+round2(number(x.qty)*number(x.unit)),0)),v=number(form.elements.vat.value);if(v<0||v>100)throw new Error('Bitte einen gültigen Mehrwertsteuersatz eingeben.');const net=computeNetVatFromGross(gross,v);dialog.querySelector('[data-total]').textContent='Brutto: '+formatEuro(gross)+' · enthaltene MwSt: '+formatEuro(net.vat)+' · Netto: '+formatEuro(net.net);error.textContent='';}catch(e){error.textContent=e.message;}};
    const draw=()=>{const host=dialog.querySelector('[data-lines]');host.replaceChildren();items.forEach((item,i)=>{const row=document.createElement('fieldset');row.innerHTML='<legend>Position '+(i+1)+'</legend><label>Bezeichnung<input data-label required></label><label>Menge<input data-qty type="text" inputmode="decimal" required></label><label>Einzelpreis brutto (€)<input data-unit type="text" inputmode="decimal" required></label><button type="button" data-remove>Entfernen</button>';for(const [selector,key]of [['[data-label]','label'],['[data-qty]','qty'],['[data-unit]','unit']]){const input=row.querySelector(selector);input.value=text(item[key]);input.oninput=()=>{item[key]=input.value;total();};}row.querySelector('[data-remove]').onclick=()=>{items.splice(i,1);draw();};host.append(row);});total();};
    dialog.querySelector('[data-add]').onclick=()=>{items.push({key:'manual-'+crypto.randomUUID(),label:'',qty:1,unit:0});draw();};dialog.querySelector('[data-cancel]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});form.elements.vat.oninput=total;
    form.onsubmit=e=>{e.preventDefault();try{
      if(!edit||edit.uid!==actor()||!admin())throw new Error('Konto gewechselt. Bitte erneut anmelden.');
      const current=getInvoiceById(id);if(!current||frozen(current)||JSON.stringify(current)!==JSON.stringify(initial))throw new Error('Die Rechnung wurde inzwischen geändert. Bitte die Bearbeitung erneut öffnen.');
      if(!DSWorkflowCore.dateISO(form.elements.date.value))throw new Error('Bitte ein gültiges Rechnungsdatum angeben.');
      const from=form.elements.from.value,to=form.elements.to.value;if((from||to)&&(!DSWorkflowCore.dateISO(from)||!DSWorkflowCore.dateISO(to)||to<from))throw new Error('Bitte einen gültigen Leistungszeitraum angeben.');
      const rows=items.map(item=>{const qty=number(item.qty),unit=number(item.unit),label=text(item.label).trim();if(!label||qty<=0)throw new Error('Jede Position benötigt eine Bezeichnung und eine Menge größer 0.');return {key:item.key,label,qty,unit,total:round2(qty*unit)};});
      if(!rows.length)throw new Error('Bitte mindestens eine Rechnungsposition angeben.');
      const gross=round2(rows.reduce((sum,x)=>sum+x.total,0));if(gross<0)throw new Error('Der Gesamtbetrag darf nicht negativ sein.');const vat=number(form.elements.vat.value);if(vat<0||vat>100)throw new Error('Bitte einen gültigen Mehrwertsteuersatz eingeben.');
      const next=clone(current),previousTotal=Number(next.pricing?.total||0);next.invoiceDate=form.elements.date.value+'T12:00:00.000Z';next.period={from:form.elements.from.value,to:form.elements.to.value};next.note=form.elements.note.value.trim();next.pricingMode='manual';next.vatRate=vat;next.lineItems=rows;next.pricing={...(next.pricing||{}),parts:{base:gross,holiday:0,percent:0,fixed:0},basePrice:gross,holidayExtra:0,percentExtra:0,fixedExtra:0};recomputeInvoiceTotals(next);
      next.auditTrail=Array.isArray(next.auditTrail)?next.auditTrail:[];next.auditTrail.push({at:new Date().toISOString(),field:'pricing',from:previousTotal,to:gross});saveRecord(next);close();
    }catch(e){error.textContent=e.message;}};
    draw();dialog.showModal();dialog.querySelector('input')?.focus();
  }
  window.DSBilling={admin,frozen,editable,requireEdit,number,display,parts,lines,positions,nextNumber,billableDates,surchargeDays,recalcFromStay,create,openForStay,refresh,saveRecord,syncLinked,rememberStay,attachStay,openEdit,reset,isStay,signedStay,effectiveFields,clearSignature,stayRoot,family,findForStay,sourceDoc,prepareStay,collectCharges,prepareStaySave,financialSave,auditStay,validateFinancial,afterOpenStay,afterSaveStay,decorateStay,finishFork};
})();
