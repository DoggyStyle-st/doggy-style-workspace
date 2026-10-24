/* Invoice editing uses explicit saves; signed stay documents remain separate. */
(function(){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v)),text=v=>String(v??''),bases=new Map();
  let edit=null;
  const actor=()=>window.firebase?.auth().currentUser?.uid||'';
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
    let inv=state.invoices.find(x=>x.sourceDocId===doc.id);
    if(inv)return inv;
    if(!DSWorkflowCore.dateISO(doc.meta?.von)||!DSWorkflowCore.dateISO(doc.meta?.bis)||doc.meta.bis<doc.meta.von)throw new Error('Bitte einen gültigen Zeitraum im Aufenthalt angeben.');
    if(!calculateInvoicePricing(doc))throw new Error('Bitte die Betreuung im Aufenthalt auswählen.');
    const at=new Date().toISOString();
    inv={id:uid(),type:'invoice',sourceDocId:doc.id,dogId:doc.dogId||'',customerId:doc.customerId||getCustomerByDogId(doc.dogId)?.id||'',petId:doc.petId||getPetByDogId(doc.dogId)?.id||'',period:{from:doc.meta.von,to:doc.meta.bis},pricing:{},status:'draft',note:'',invoiceNumber:nextNumber(),invoiceDate:at,createdAt:at,updatedAt:at};
    recalcFromStay(inv,doc);state.invoices.push(inv);doc.invoiceId=inv.id;doc.invoiceNumber=inv.invoiceNumber;return inv;
  }
  function openForStay(id){
    if(!requireEdit())return;
    try{
      if(typeof currentDoc!=='undefined'&&currentDoc?.id===id&&document.getElementById('editor')?.classList.contains('is-active')&&dirty){if(!saveCurrent(false))return;}
      const doc=(state.docs||[]).find(d=>d.id===id);if(!doc)throw new Error('Aufenthalt nicht gefunden.');
      const previous=(state.invoices||[]).find(x=>x.sourceDocId===id),inv=create(doc);if(!inv)return;
      if(!previous)saveState();selectTab('invoices');renderInvoiceList();openInvoice(inv.id);
    }catch(e){alert('Rechnung konnte nicht geöffnet werden: '+e.message);}
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
  function syncLinked(doc){for(const inv of state.invoices||[])if(inv.sourceDocId===doc.id)recalcFromStay(inv,doc);}
  function rememberStay(doc){if(admin()&&doc&&['hundeannahme','stay'].includes(doc.templateId||doc.type))bases.set(actor()+':'+doc.id,clone(doc));}
  function attachStay(doc){
    const index=(state.docs||[]).findIndex(d=>d.id===doc.id);if(index<0)throw new Error('Der Aufenthalt wurde inzwischen entfernt. Die Eingaben bleiben geöffnet.');
    if(state.docs[index]===doc)return doc;
    const base=bases.get(actor()+':'+doc.id);if(!base)throw new Error('Der Aufenthalt wurde inzwischen neu geladen. Bitte die Eingaben prüfen und den Aufenthalt erneut öffnen.');
    const plan=DSWorkflowCore.mergePlan({docs:[base]},{docs:[doc]},{docs:[state.docs[index]]});
    if(plan.conflicts.length)throw new Error('Der Aufenthalt wurde inzwischen an denselben Angaben geändert. Die Eingaben bleiben geöffnet; bitte zuerst den Serverstand prüfen.');
    const merged=DSWorkflowCore.resolveMerge(plan,{}).docs[0];state.docs[index]=merged;return merged;
  }
  function close(){if(edit?.dialog){const d=edit.dialog;edit=null;d.close?.();d.remove();}}
  function reset(){close();bases.clear();}
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
  window.DSBilling={admin,frozen,editable,requireEdit,number,display,parts,lines,positions,nextNumber,billableDates,surchargeDays,recalcFromStay,create,openForStay,refresh,saveRecord,syncLinked,rememberStay,attachStay,openEdit,reset};
})();
