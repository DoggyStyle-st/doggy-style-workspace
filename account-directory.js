/* Administrator account directory: one bounded, searchable view; no implicit role writes. */
(function(){
  'use strict';
  const text=v=>String(v??'').trim(),$=id=>document.getElementById(id),pageSize=10;
  let epoch=0,active='',rows=[],query='',role='',page=0,ticket=0;
  function context(){
    const u=window.firebase?.auth().currentUser,c=window.CLOUD,org=c?.orgId||window.firebaseOrgId;
    if(!u?.uid||c?.user?.uid!==u.uid||c.role!=='admin'||window.DSWorkflow?.scoped()||org!==window.firebaseOrgId)throw new Error('Die Kontoverwaltung ist nur für Administratoren verfügbar.');
    return {uid:u.uid,key:window.firebaseConfig.projectId+':'+org+':'+u.uid,db:c.db,org,epoch};
  }
  function same(s){const c=context();if(s.key!==c.key||s.epoch!==c.epoch)throw new Error('Das angemeldete Konto wurde gewechselt.');}
  function reset(){epoch++;ticket++;active='';rows=[];query='';role='';page=0;$('dsAccountTools')?.remove();$('usersList')?.replaceChildren();if($('usersMsg'))$('usersMsg').textContent='';}
  function node(parent,tag,value){const e=document.createElement(tag);if(value!==undefined)e.textContent=value;parent.append(e);return e;}
  function button(parent,label,fn){const e=node(parent,'button',label);e.type='button';e.className='btn';e.onclick=fn;return e;}
  const fold=value=>text(value).toLocaleLowerCase('de').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ß/g,'ss');
  const roleLabel=value=>({admin:'Administrator',staff:'Mitarbeiter',customer:'Kunde',guest:'Noch nicht zugeteilt'})[value]||'Noch nicht zugeteilt';
  function name(u){return text(u.displayName||u.name||u.customerName||u.portalData?.customer?.name||(window.state?.customers||[]).find(c=>c.id===u.customerId)?.name);}
  function missing(u){return !['staff','admin'].includes(u.role)&&!u.customerId;}
  function mountStyle(){if($('dsAccountStyle'))return;const s=node(document.head,'style');s.id='dsAccountStyle';s.textContent='#dsAccountTools{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;align-items:end}#dsAccountTools label{flex:1 1 210px;min-width:0}#dsAccountTools input,#dsAccountTools select{display:block;width:100%;min-height:44px;box-sizing:border-box;font-size:16px}#usersList{max-height:min(50dvh,420px);overflow:auto;overscroll-behavior:contain;border:1px solid #626775;border-radius:10px;padding:6px}#usersList details{border-bottom:1px solid #626775;padding:8px}#usersList summary{cursor:pointer;min-height:44px;overflow-wrap:anywhere}#usersList summary strong{margin-right:12px}#usersList summary small{display:block;color:#c6cbd4}#usersList .account-edit{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:12px 0}#usersList select,#usersList button,#dsAccountTools button,#dsAccountPager button{min-height:44px;font-size:16px}#dsAccountPager{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}';}
  function render(){
    const s=context(),list=$('usersList');if(!list)return;
    const terms=fold(query).split(/\s+/).filter(Boolean);
    const found=rows.filter(u=>terms.every(t=>fold([name(u),u.email,u.id].join(' ')).includes(t))&&(!role||(role==='unassigned'?missing(u):u.role===role)));
    page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(found.length/pageSize)-1)));const begin=page*pageSize;
    list.replaceChildren();list.scrollTop=0;
    for(const u of found.slice(begin,begin+pageSize)){
      const d=node(list,'details');d.dataset.accountId=u.id;const summary=node(d,'summary');
      node(summary,'strong',name(u)||u.email||u.id);node(summary,'span',roleLabel(u.role)+(missing(u)?' · Zuordnung fehlt':''));
      if(u.email)node(summary,'small',u.email);
      node(d,'p','Konto: '+u.id);if(u.customerId)node(d,'p','Kundenzuordnung: '+(u.portalData?.customer?.name||u.customerId));
      const editor=node(d,'div');editor.className='account-edit';const label=node(editor,'label','Rolle '),select=node(label,'select');select.setAttribute('aria-label','Rolle für '+(u.email||name(u)||u.id));
      if(!['admin','staff','customer'].includes(u.role))select.add(new Option('Bitte zuteilen',''));
      for(const [v,t] of [['customer','Kunde'],['staff','Mitarbeiter'],['admin','Administrator']])select.add(new Option(t,v));select.value=['admin','staff','customer'].includes(u.role)?u.role:'';
      const save=button(editor,'Rolle speichern',async()=>{
        const next=select.value;if(!next)return;save.disabled=true;select.disabled=true;status.textContent='Wird in Firebase gespeichert …';
        try{
          same(s);const currentContext=context(),ref=currentContext.db.collection('orgs').doc(s.org).collection('users').doc(u.id);
          await currentContext.db.runTransaction(async tx=>{const current=await tx.get(ref);same(s);if(!current.exists||text(current.data().role)!==text(u.role))throw new Error('Die Rolle wurde inzwischen geändert. Bitte Aktualisieren wählen.');tx.update(ref,{role:next});});
          same(s);u.role=next;render();if($('usersMsg'))$('usersMsg').textContent='✅ Rolle für '+(u.email||name(u)||u.id)+' in Firebase gespeichert.';
        }catch(e){try{same(s);status.textContent='Nicht gespeichert. '+text(e.message||e);select.value=u.role||'';}catch(_){}}
        finally{save.disabled=false;select.disabled=false;}
      });
      const status=node(d,'p');status.setAttribute('role','status');
    }
    if(!found.length)node(list,'p',rows.length?'Keine Konten für diese Suche gefunden.':'Keine registrierten Konten gefunden.');
    $('dsAccountCount').textContent=found.length?(begin+1)+'–'+Math.min(begin+pageSize,found.length)+' von '+found.length+' Konten'+(found.length!==rows.length?' ('+rows.length+' insgesamt)':''):'0 von '+rows.length+' Konten';
    $('dsAccountPrev').disabled=page===0;$('dsAccountNext').disabled=begin+pageSize>=found.length;
  }
  async function load(){
    const s=context(),request=++ticket,msg=$('usersMsg');if(msg)msg.textContent='Konten werden aus Firebase geladen …';
    try{
      const snap=await DSWorkflow.readWithTimeout(s.db.collection('orgs').doc(s.org).collection('users').get({source:'server'}),'Kontenliste');same(s);if(ticket!==request)return;
      rows=snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>(missing(a)?0:1)-(missing(b)?0:1)||fold(name(a)||a.email).localeCompare(fold(name(b)||b.email),'de')||a.id.localeCompare(b.id));
      render();if(msg)msg.textContent='Firebase gelesen. Zum Bearbeiten ein Konto aufklappen.';
    }catch(e){try{same(s);if(ticket!==request)return;rows=[];render();if(msg)msg.textContent='Laden fehlgeschlagen. '+text(e.message||e);}catch(_){}}
  }
  async function mount(){
    const initial=context();if(active!==initial.key){reset();active=initial.key;}const s=context();if(!$('usersList'))return;mountStyle();
    if(!$('dsAccountTools')){
      const tools=document.createElement('div');tools.id='dsAccountTools';$('usersList').before(tools);
      const label=node(tools,'label','Name oder E-Mail suchen'),search=node(label,'input');search.type='search';search.id='dsAccountSearch';search.placeholder='Name oder E-Mail';search.autocomplete='off';search.value=query;search.oninput=()=>{same(s);query=search.value;page=0;render();};
      const roleWrap=node(tools,'label','Anzeigen'),filter=node(roleWrap,'select');filter.id='dsAccountFilter';for(const [v,t] of [['','Alle Konten'],['unassigned','Ohne Kundenzuordnung'],['customer','Kunden'],['staff','Mitarbeiter'],['admin','Administratoren']])filter.add(new Option(t,v));filter.value=role;filter.onchange=()=>{same(s);role=filter.value;page=0;render();};
      button(tools,'Suche zurücksetzen',()=>{same(s);query='';role='';page=0;search.value='';filter.value='';render();});
      const pager=node(tools,'div');pager.id='dsAccountPager';button(pager,'Zurück',()=>{same(s);page--;render();}).id='dsAccountPrev';const count=node(pager,'span');count.id='dsAccountCount';count.setAttribute('aria-live','polite');button(pager,'Weiter',()=>{same(s);page++;render();}).id='dsAccountNext';
    }
    if($('btnUsersRefresh'))$('btnUsersRefresh').onclick=()=>load();await load();
  }
  window.DSAccountDirectory={mount,reset};
})();
