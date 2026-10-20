/* Shared data model for HTML preview and a real, locally generated daily PDF. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./workflow-core.js'));
  else root.DSWorkformsPrint=factory(root.DSWorkflowCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  const s=v=>String(v==null?'':v).trim(),esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(s(v))?s(v).split('-').reverse().join('.'):s(v);
  function build(workspace,options){
    const w=workspace||{},o=options||{},day=Core.dateISO(o.day);if(!day)throw new Error('Druckdatum fehlt.');
    const stays=Core.confirmedStays(w).filter(x=>day>=x.from&&day<=x.to).map(x=>{
      const doc=(w.docs||[]).find(d=>s(d.id)===x.id)||(w.stays||[]).find(d=>s(d.id)===x.id||s(d.docId)===x.id)||{};
      const pet=(w.pets||[]).find(p=>s(p.id)===x.petId)||{},cid=s(pet.customerId||doc.customerId||doc.meta?.customerId);
      const customer=(w.customers||[]).find(c=>s(c.id)===cid)||{},dog=(w.dogs||[]).find(d=>s(d.id)===s(doc.dogId)||s(d.petId)===x.petId)||{};
      return {...x,pet,customer,dogName:s(pet.name||dog.name||doc.fields?.hund_name)||'Hund ohne Namen',owner:s(customer.name||doc.fields?.halter_name)||'Halter nicht zugeordnet'};
    }).sort((a,b)=>a.dogName.localeCompare(b.dogName,'de')||a.id.localeCompare(b.id));
    const occupancy=Core.occupancyForDay(w,day),sections=[];
    sections.push({title:'Tagesübersicht',paragraphs:[`${occupancy.total} / ${occupancy.totalCapacity} Hunde gesamt · Tagesbetreuung: ${occupancy.daycare} · Urlaubsbetreuung: ${occupancy.boarding}`,'Der Abreisetag zählt zur Belegung. Es werden bestätigte Aufenthalte berücksichtigt.'],table:{headers:['Hund','Halter','Betreuung','Zeitraum'],widths:[35,45,50,52],rows:stays.map(x=>[x.dogName,x.owner,x.care,date(x.from)+' - '+date(x.to)])},empty:'Keine bestätigten Aufenthalte für diesen Tag.'});
    const events=[];for(const x of stays){if(x.from===day)events.push(['Anreise',x.dogName,x.owner,x.bringTime||'Nicht angegeben']);if(x.to===day)events.push(['Abreise',x.dogName,x.owner,x.pickupTime||'Nicht angegeben']);}
    sections.push({title:'Anreisen und Abreisen',table:{headers:['Vorgang','Hund','Halter','Uhrzeit'],widths:[32,45,65,40],rows:events},empty:'Keine Anreisen oder Abreisen für diesen Tag.'});
    for(const pid of [...new Set(stays.map(x=>x.petId))]){
      const entries=stays.filter(x=>x.petId===pid),x=entries[0],p=x.pet,c=x.customer;
      const rows=[['Halter',x.owner],['Kontakt',[c.phone,c.email].filter(Boolean).join(' · ')],['Notfallkontakt',[c.emergencyName,c.emergencyPhone].filter(Boolean).join(' · ')],['Betreuung',entries.map(e=>e.care+': '+date(e.from)+' - '+date(e.to)).join('\n')],['Futter / Fütterung',[p.food,p.feeding].filter(Boolean).join('\n')],['Allergien / Erkrankungen',[p.allergies,p.medicalConditions].filter(Boolean).join('\n')],['Tierarzt',[p.vet,p.vetPhone,p.vetEmergencyName,p.vetEmergencyPhone].filter(Boolean).join(' · ')],['Verhalten / Verträglichkeit',[p.behavior,p.compat,p.compatDogs,p.leashBehavior].filter(Boolean).join('\n')],['Hinweise zum Aufenthalt',entries.map(e=>e.notes).filter(Boolean).join('\n')],['Weitere Hinweise',p.note]];
      sections.push({title:'Hundeblatt: '+x.dogName,newPage:true,table:{headers:['Angabe','Information'],widths:[47,135],rows:rows.map(([label,value])=>[label,s(value)||'Keine Angabe'])},paragraphs:['Aktuelle Medikationspläne und Gabe-Nachweise bitte im Bereich Medikamente prüfen.']});
    }
    const shifts=(w.worklogs||[]).filter(x=>x.type==='shift'&&x.date===day);
    if(!shifts.length)sections.push({title:'Übergabe / Schichtblatt',newPage:true,paragraphs:['Noch kein Schichtblatt für diesen Tag archiviert. Handschriftliche Ergänzungen werden nicht automatisch in der App gespeichert.'],table:{headers:['Bereich','Notizen'],widths:[47,135],rows:[['Heute aufgefallen','\n\n\n\n'],['Morgen beachten','\n\n\n\n'],['Unterschrift / Uhrzeit','\n\n\n']]}});
    else for(const shift of shifts)sections.push({title:'Übergabe / Schichtblatt',newPage:true,paragraphs:['Archiviert von: '+s(shift.createdBy)+' · '+s(shift.createdAt)],table:{headers:['Bereich','Notizen'],widths:[47,135],rows:[['Heute aufgefallen',s(shift.data?.today)||'Keine Angabe'],['Morgen beachten',s(shift.data?.tomorrow)||'Keine Angabe']]},signature:/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s(shift.signature))&&s(shift.signature).length<180000?s(shift.signature):'',emptySignature:!shift.signature});
    return {title:'Doggy Style - Tages-Sammeldruck',day,createdAt:s(o.createdAt||new Date().toLocaleString('de-DE')),user:s(o.userLabel)||'Nicht angegeben',filename:'DoggyStyle_Tages-Sammeldruck_'+day+'.pdf',sections,occupancy};
  }
  function html(model){
    const sections=model.sections.map(section=>`<section class="${section.newPage?'page-break':''}"><h2>${esc(section.title)}</h2>${(section.paragraphs||[]).map(p=>'<p>'+esc(p)+'</p>').join('')}${section.table?`<table><colgroup>${section.table.widths.map(n=>`<col style="width:${n/182*100}%">`).join('')}</colgroup><thead><tr>${section.table.headers.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${section.table.rows.length?section.table.rows.map(row=>'<tr>'+row.map((cell,i)=>'<td data-label="'+esc(section.table.headers[i])+'">'+esc(cell).replace(/\n/g,'<br>')+'</td>').join('')+'</tr>').join(''):`<tr><td colspan="${section.table.headers.length}">${esc(section.empty||'Keine Einträge.')}</td></tr>`}</tbody></table>`:''}${section.signature?`<p>Unterschrift des archivierten Schichtblatts</p><img class="signature" src="${section.signature}" alt="Archivierte Unterschrift">`:''}</section>`).join('');
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.filename)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#161616;font:14px/1.45 Arial,sans-serif;padding:24px;overflow-wrap:anywhere}main{max-width:760px;margin:auto}h1{font-size:22px;margin:0 0 8px}h2{font-size:18px;margin:24px 0 10px}p{margin:8px 0;white-space:pre-wrap}.meta{color:#444;font-size:12px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{padding:8px;border:1px solid #bbb;text-align:left;vertical-align:top;white-space:pre-wrap}th{background:#eee}thead{display:table-header-group}.signature{display:block;max-width:100%;width:270px;max-height:130px;object-fit:contain;background:#222;padding:8px}.page-break{border-top:2px solid #ccc;margin-top:32px;padding-top:8px}@media screen and (max-width:500px){body{padding:12px;font-size:14px}table,tbody,tr,td{display:block;width:100%}thead,colgroup{display:none}tr{border:1px solid #bbb;margin:10px 0}td{border:0;border-bottom:1px solid #ddd;padding:8px;display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px}td::before{content:attr(data-label);font-weight:bold;color:#444}td:last-child{border-bottom:0}}@media print{body{padding:0;font-size:10pt}main{max-width:none}.page-break{break-before:page;border:0;margin:0;padding:0}h2{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}}</style></head><body><main><h1>${esc(model.title)}</h1><div class="meta">Datum: ${esc(date(model.day))}<br>Erstellt: ${esc(model.createdAt)} · Verantwortlich: ${esc(model.user)}</div>${sections}</main></body></html>`;
  }
  function pdf(model,JsPDF,font){
    if(!JsPDF)throw new Error('PDF-Erstellung ist noch nicht bereit. Bitte die App neu laden.');
    const doc=new JsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
    let face='helvetica';if(font){doc.addFileToVFS('DoggyStyle.ttf',font);doc.addFont('DoggyStyle.ttf','DoggyStyle','normal');face='DoggyStyle';}
    doc.setFont(face,'normal');doc.setProperties({title:model.title+' '+date(model.day),author:'Doggy Style Hundepension',subject:'Tagesübersicht, Anreisen, Abreisen, Hundeblätter und Schichtblatt'});
    const left=14,width=182,bottom=278;let y=16;
    const clean=v=>String(v==null?'':v).replace(/\r/g,'').replace(/\t/g,' ');
    function next(){doc.addPage();y=16;}
    function line(text,size=10){doc.setFontSize(size);for(const part of doc.splitTextToSize(clean(text),width)){if(y+5>bottom)next();doc.text(part,left,y);y+=5;}}
    function table(table,empty){
      const row=(cells,heading)=>{
        doc.setFontSize(9);const wrapped=cells.map((c,i)=>doc.splitTextToSize(clean(c),table.widths[i]-5));let at=0,total=Math.max(1,...wrapped.map(a=>a.length));
        while(at<total){
          if(bottom-y<11){next();if(!heading)row(table.headers,true);}
          const count=Math.min(total-at,Math.max(1,Math.floor((bottom-y-4)/4.6))),height=count*4.6+4;let x=left;
          cells.forEach((_,i)=>{doc.setDrawColor(180);doc.setFillColor(heading?236:255);doc.rect(x,y,table.widths[i],height,'FD');doc.setTextColor(20);const text=wrapped[i].slice(at,at+count);if(text.length)doc.text(text,x+2.5,y+5,{lineHeightFactor:1.45});x+=table.widths[i];});
          y+=height;at+=count;
        }
      };
      if(bottom-y<24)next();row(table.headers,true);
      if(!table.rows.length)row([empty||'Keine Einträge.',...table.headers.slice(1).map(()=> '')],false);
      else table.rows.forEach(c=>row(c,false));y+=5;
    }
    line(model.title,16);line('Datum: '+date(model.day));line('Erstellt: '+model.createdAt+' · '+model.user,8);y+=5;
    for(const section of model.sections){
      if(section.newPage)next();else if(y+28>bottom)next();
      line(section.title,13);y+=3;for(const text of section.paragraphs||[])line(text,9);if(section.paragraphs?.length)y+=3;
      if(section.table)table(section.table,section.empty);
      if(section.signature){if(y+46>bottom)next();line('Unterschrift des archivierten Schichtblatts',9);doc.setFillColor(34);doc.rect(left,y,80,32,'F');doc.addImage(section.signature,'PNG',left+2,y+2,76,28);y+=36;}
    }
    const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(90);doc.text('Doggy Style · '+date(model.day)+' · Seite '+i+' / '+pages,105,289,{align:'center'});}
    return doc.output('blob');
  }
  return {build,html,pdf};
});
