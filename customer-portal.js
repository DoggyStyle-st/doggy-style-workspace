/* Customer navigation, stay requests, decision notices and UID-bound chat adapters. */
(function(){
  'use strict';const $=id=>document.getElementById(id),S=v=>String(v==null?'':v).trim();
  const user=()=>window.firebase?.auth().currentUser,context=()=>window.DSWorkflow?.context(),api=()=>DSCommunicationCore.service(firebase.firestore(),window.firebaseOrgId,user,()=>firebase.firestore.FieldValue?.serverTimestamp?.()||Date.now());
  let noticeUid='',noticeUnsub=null,notices=[],choices=[],choicesUid='',choicesPending=null;const sends=new Map();
  let noticeEpoch=0,noticeFeedback='',noticeError='';const noticeBusy=new Set();
  const stayForms=new WeakMap();
  function navigate(url){if(typeof window.__dsTestNavigate==='function')window.__dsTestNavigate(url);else location.assign(url);}
  function reset(){noticeUnsub?.();noticeUnsub=null;noticeUid='';notices=[];noticeEpoch++;noticeFeedback=noticeError='';noticeBusy.clear();choices=[];choicesUid='';choicesPending=null;sends.clear();document.querySelectorAll('[data-ds-notices]').forEach(el=>el.remove());
    for(const key of ['__dsAdminChatState','__dsCustomerChatState']){const st=window[key];for(const field of ['listUnsub','msgUnsub'])st?.[field]?.();for(const unsubscribe of st?.listUnsubs||[])unsubscribe();window[key]=null;}
    window.__dsChatComposeState=null;
    $('dsStayRequestForm')?.remove();
    for(const id of ['customerChatRoot','chatAdminRoot'])$(id)?.replaceChildren();$('dsChatPreviewModal')?.remove();
  }
  function node(tag,text,parent){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(parent)parent.append(el);return el;}
  function field(form,label,name,type='text',value=''){const wrap=node('label',null,form);wrap.className='field';node('span',label,wrap);const el=node(type==='select'?'select':type==='textarea'?'textarea':'input',null,wrap);el.name=name;if(el.tagName==='INPUT')el.type=type;el.value=value;if(type==='checkbox'){wrap.style.cssText='display:flex;align-items:center;gap:12px;min-height:44px';el.style.cssText='width:24px;height:24px;flex-shrink:0';}return el;}
  function stayStyles(){if($('dsStayStyles'))return;const style=node('style',null,document.head);style.id='dsStayStyles';style.textContent=`
    #dsStayRequestForm{color:#f5f5f5;text-align:left;scroll-margin-top:180px}
    #dsStayRequestForm .dsStayFields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:14px}
    #dsStayRequestForm .field{display:flex;flex-direction:column;gap:6px;text-align:left;align-items:stretch}
    #dsStayRequestForm input,#dsStayRequestForm select,#dsStayRequestForm textarea{box-sizing:border-box;width:100%;min-height:46px;font-size:16px}
    #dsStayRequestForm textarea{min-height:100px}#dsStayRequestForm fieldset{margin:18px 0;border:1px solid #818894;border-radius:12px;padding:14px}
    #dsStayRequestForm .dsConsent{padding:12px 0;border-bottom:1px solid #7778}#dsStayRequestForm .dsConsent:last-child{border-bottom:0}
    #dsStayRequestForm .dsConsent label{display:flex;align-items:flex-start;gap:12px;min-height:44px;text-align:left;justify-content:flex-start}
    #dsStayRequestForm .dsConsent input{flex:0 0 24px;width:24px;height:24px;min-height:24px;margin:0}
    #dsStayRequestForm details{margin:4px 0 0 36px}#dsStayRequestForm summary{cursor:pointer;min-height:44px;padding:8px 0;text-decoration:underline}
    #dsStayRequestForm .dsConsentText{white-space:pre-wrap;font-size:16px;line-height:1.55;max-width:100%;overflow-wrap:anywhere;color:#fff;background:#20232b;padding:14px;border-radius:8px}
    #dsStaySignature{display:block;box-sizing:border-box;background:#fff;border:2px solid #808a96;border-radius:10px;width:100%;height:200px;touch-action:none}
    #dsStayRequestForm button{min-height:44px}#dsStayRequestForm .dsSignatureActions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:10px 0}
    @media(max-width:600px){#dsStayRequestForm{padding:14px}#dsStayRequestForm details{margin-left:0}}
  `;}
  function consentTexts(){
    const labels=DSWorkflowCore.stayConsents,map={ev_agb:'agb',ev_dsgvo:'dsgvo',ev_wahr:'wahrheit',ev_tierarzt:'tierarzt'},out={};
    for(const [key,label]of Object.entries(labels))out[key]=(map[key]&&typeof getLegalText==='function'?getLegalText(map[key]):'')||label;
    return out;
  }
  function signaturePad(canvas,hint){
    const ctx=canvas.getContext('2d');let drawing=false,signedAt=0,initialized=false;
    const clear=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);drawing=false;signedAt=0;initialized=false;hint.textContent='Noch nicht unterschrieben.';};
    const point=e=>{const r=canvas.getBoundingClientRect(),t=e.touches?.[0]||e.changedTouches?.[0]||e;return{x:(t.clientX-r.left)*canvas.width/(r.width||canvas.width),y:(t.clientY-r.top)*canvas.height/(r.height||canvas.height)};};
    const start=e=>{if(e.button!=null&&e.button!==0)return;e.preventDefault();const r=canvas.getBoundingClientRect();if(!initialized&&r.width>0&&r.height>0){const scale=Math.min(window.devicePixelRatio||1,2,2048/r.width);canvas.width=Math.round(r.width*scale);canvas.height=Math.round(r.height*scale);initialized=true;}const p=point(e);drawing=true;signedAt=0;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineWidth=2.8*canvas.width/(r.width||canvas.width);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';try{canvas.setPointerCapture(e.pointerId);}catch(_){}hint.textContent='Unterschrift wird erfasst …';};
    const move=e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();};
    const end=e=>{if(!drawing)return;e.preventDefault();drawing=false;signedAt=Date.now();hint.textContent=DSWorkflowCore.canvasHasInk(ctx.getImageData(0,0,canvas.width,canvas.height).data)?'Unterschrift erfasst.':'Bitte im Feld unterschreiben.';};
    if('PointerEvent'in window){canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);}
    else{canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);canvas.addEventListener('mouseup',end);canvas.addEventListener('mouseleave',end);canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end,{passive:false});canvas.addEventListener('touchcancel',end,{passive:false});}
    clear();return{clear,hasInk:()=>!!signedAt,read(){if(!signedAt||!DSWorkflowCore.canvasHasInk(ctx.getImageData(0,0,canvas.width,canvas.height).data))throw new Error('Bitte den Aufenthalt im Unterschriftenfeld unterschreiben.');const signature={dataUrl:canvas.toDataURL('image/png'),signedAt};if(!DSWorkflowCore.signatureValid(signature))throw new Error('Die Unterschrift konnte nicht gespeichert werden. Bitte erneut unterschreiben.');return signature;}};
  }
  function mountStay(host){if(!host)return;const ctx=context();const key=ctx?.uid+':'+ctx?.customerId;
    stayStyles();
    if(ctx?.verified&&host.dataset.dsStayKey===key&&host.querySelector('form')){const form=host.querySelector('form'),select=form.elements.namedItem('petId'),selected=select.value,oldName=form.elements.namedItem('customer').value,oldPetName=select.selectedOptions[0]?.textContent;form.elements.namedItem('customer').value=ctx.customer.name;select.replaceChildren(...ctx.pets.map(p=>new Option(p.name,p.id)));if(ctx.pets.some(p=>p.id===selected))select.value=selected;
      const st=stayForms.get(form),texts=consentTexts();if(st&&JSON.stringify(st.texts)!==JSON.stringify(texts)){st.texts=texts;for(const key of Object.keys(texts)){form.querySelector('[data-consent-text="'+key+'"]').textContent=texts[key];form.elements.namedItem(key).checked=false;}st.pad.clear();st.status.textContent='Die Bestätigungstexte wurden geändert. Bitte erneut lesen, bestätigen und unterschreiben.';}
      else if(st&&(select.value!==selected||oldName!==ctx.customer.name||oldPetName!==select.selectedOptions[0]?.textContent)){for(const name of Object.keys(DSWorkflowCore.stayConsents))form.elements.namedItem(name).checked=false;st.pad.clear();st.status.textContent='Kunde oder Hund wurde aktualisiert. Bitte erneut bestätigen und unterschreiben.';}return;}
    host.replaceChildren();host.dataset.dsStayKey=key;if(!ctx?.verified){node('p','Dein Kundenkonto muss zuerst zugeordnet werden.',host);return;}
    const form=node('form',null,host);form.id='dsStayRequestForm';form.className='card';node('h2','Aufenthalt anfragen',form);node('p','Die Anfrage wird geprüft. Nach der Entscheidung erhältst du hier eine Rückmeldung.',form);
    const grid=node('div',null,form);grid.className='dsStayFields';field(grid,'Kunde','customer','text',ctx.customer.name).disabled=true;
    const pets=field(grid,'Hund','petId','select');for(const p of ctx.pets)pets.add(new Option(p.name,p.id));pets.required=true;
    const care=field(grid,'Betreuungsart','betreuung','select');for(const label of ['Urlaubsbetreuung','Tagesbetreuung','Probetag'])care.add(new Option(label,label));
    for(const [label,name,type]of [['Von','von','date'],['Bis einschließlich','bis','date'],['Bringzeit','bringzeit','time'],['Abholzeit','abholzeit','time']]){const el=field(grid,label,name,type);el.required=['von','bis'].includes(name);}field(form,'Hinweise zum Aufenthalt','notes','textarea');
    const consents=Object.entries(DSWorkflowCore.stayConsents),texts=consentTexts(),readLabels={ev_agb:'AGB lesen',ev_dsgvo:'Datenschutzinformationen lesen',ev_wahr:'Erklärung lesen',ev_hv:'Bestätigung nachlesen',ev_gesund:'Bestätigung nachlesen',ev_tierarzt:'Tierarzt-Erlaubnis lesen'};
    const consentBox=node('fieldset',null,form);node('legend','Bestätigungen – Texte vor dem Ankreuzen lesen',consentBox);
    for(const [name,label]of consents){const article=node('div',null,consentBox);article.className='dsConsent';const row=node('label',null,article),el=node('input',null,row);el.type='checkbox';el.name=name;el.required=true;node('span',label,row);const details=node('details',null,article);node('summary',readLabels[name],details);const text=node('p',texts[name],details);text.className='dsConsentText';text.dataset.consentText=name;}
    const sigBox=node('fieldset',null,form);node('legend','Deine Unterschrift zum Aufenthalt',sigBox);node('p','Bitte die Angaben und Bestätigungstexte prüfen und hier mit dem Finger oder Stift unterschreiben.',sigBox);
    const canvas=node('canvas',null,sigBox);canvas.id='dsStaySignature';canvas.width=700;canvas.height=200;canvas.setAttribute('aria-label','Unterschrift zum angefragten Aufenthalt');
    const actions=node('div',null,sigBox);actions.className='dsSignatureActions';const clear=node('button','Unterschrift neu zeichnen',actions);clear.type='button';clear.className='btn';const sigHint=node('span','',actions);sigHint.setAttribute('role','status');const pad=signaturePad(canvas,sigHint);clear.onclick=()=>pad.clear();
    const submit=node('button','Anfrage zur Prüfung senden',form);submit.id='dsStaySubmit';submit.type='submit';submit.className='btn primary';submit.style.minHeight='44px';
    const status=node('p','',form);status.id='dsStayStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');let pending=false,lastPayload='',requestId='';
    const st={texts,pad,status};stayForms.set(form,st);
    const changed=event=>{if(!pending){submit.disabled=false;status.textContent='';if(pad.hasInk()){pad.clear();status.textContent='Angaben geändert. Bitte den Aufenthalt erneut unterschreiben.';}if(event.target.name==='petId'){for(const [name]of consents)form.elements.namedItem(name).checked=false;status.textContent='Bitte die Bestätigungen für den ausgewählten Hund erneut prüfen.';}}};form.addEventListener('input',changed);form.addEventListener('change',changed);
    form.addEventListener('submit',async event=>{event.preventDefault();if(pending)return;
      try{if(!form.reportValidity())return;const current=context();if(!current?.verified||current.uid!==ctx.uid||current.customerId!==ctx.customerId)throw new Error('Kundenkonto gewechselt.');
        const data=new FormData(form),pid=S(data.get('petId')),pet=current.pets.find(p=>p.id===pid);if(!pet)throw new Error('Bitte einen eigenen Hund auswählen.');
        const von=S(data.get('von')),bis=S(data.get('bis'));if(!von||!bis||bis<von)throw new Error('Bitte einen gültigen Zeitraum angeben.');
        const fields={halter_name:current.customer.name,halter_email:current.customer.email||'',hund_name:pet.name,notes:S(data.get('notes'))};for(const [name]of consents){fields[name]=!!form.elements.namedItem(name).checked;if(!fields[name])throw new Error('Bitte alle Bestätigungen prüfen.');}
        const signature=pad.read();
        const payload={staySchemaVersion:1,customerId:current.customerId,petId:pid,meta:{customerId:current.customerId,petId:pid,dogId:pid,betreuung:S(data.get('betreuung')),von,bis,bringzeit:S(data.get('bringzeit')),abholzeit:S(data.get('abholzeit')),ort_datum:new Date(signature.signedAt).toLocaleDateString('de-DE')},fields,signature,consentTexts:{...st.texts}};
        DSWorkflowCore.validateStay(payload);
        const fingerprint=JSON.stringify(payload);if(fingerprint!==lastPayload){lastPayload=fingerprint;requestId=crypto.randomUUID();}
        pending=true;submit.disabled=true;status.textContent='Anfrage wird übermittelt …';const result=await DSWorkflow.submit({id:requestId,templateId:'hundeannahme',title:'Aufenthaltsanfrage',customerId:current.customerId,petId:pid,payloadSubmitted:payload});
        if(!result.ok)throw result.error||new Error('Übertragung nicht bestätigt.');status.textContent='✅ Anfrage übermittelt. Die Entscheidung steht noch aus.';form.dataset.submittedId=result.task.id;
      }catch(error){status.textContent='Anfrage nicht übermittelt: '+error.message;submit.disabled=false;}finally{pending=false;}
    });
  }
  function mountMainStay(){const host=$('documents');if(host){host.style.display='';host.classList.add('is-active');mountStay(host);const editor=$('editor');if(editor)editor.style.display='none';}}
  function noticeHost(parent,id){if(!parent)return null;let el=$(id);if(!el){el=node('section');el.id=id;el.className='card';el.dataset.dsNotices='1';parent.prepend(el);}return el;}
  function noticeStyles(){if($('dsNoticeStyles'))return;const style=node('style',null,document.head);style.id='dsNoticeStyles';style.textContent=`
    [data-ds-notices]{text-align:left}[data-ds-notices] article{padding:14px;margin:12px 0;border:1px solid #8c94a466;border-radius:12px}
    [data-ds-notices] button,[data-ds-notices] summary{min-height:44px;font-size:16px}[data-ds-notices] summary{padding:10px 0;cursor:pointer;font-weight:700}
    [data-ds-notices] article p{white-space:pre-wrap;overflow-wrap:anywhere}[data-ds-notices] small{display:block;margin-bottom:10px}
  `;}
  async function noticeAction(id,action){
    if(noticeBusy.has(id))return;if(action==='delete'&&!confirm('Diese gelesene Rückmeldung löschen? Die Entscheidung und die bestätigten Daten bleiben erhalten.'))return;
    const uid=user()?.uid,epoch=noticeEpoch;noticeBusy.add(id);noticeError=noticeFeedback='';renderNotices();
    try{const result=action==='delete'?await api().deleteNotice(id):await api().markNoticeRead(id);
      if(user()?.uid!==uid||noticeEpoch!==epoch)return;
      notices=action==='delete'||result.missing?notices.filter(n=>n.id!==id):notices.map(n=>n.id===id?{...n,read:true}:n);
      noticeFeedback=action==='delete'?'Rückmeldung gelöscht.':'Als gelesen markiert. Die Rückmeldung steht jetzt unter Gelesen.';
    }catch(e){if(user()?.uid===uid&&noticeEpoch===epoch)noticeError='Rückmeldung konnte nicht '+(action==='delete'?'gelöscht':'als gelesen markiert')+' werden: '+e.message;}
    finally{if(user()?.uid===uid&&noticeEpoch===epoch){noticeBusy.delete(id);renderNotices();}}
  }
  function renderNotices(){if(!context()?.verified)return;$('dsCustomerNotices')?.remove();const targets=[noticeHost($('view-chat'),'dsChatNotices')].filter(Boolean);
    noticeStyles();const unread=notices.filter(n=>n.read!==true),read=notices.filter(n=>n.read===true);
    for(const host of targets){const readOpen=host.querySelector('[data-read-notices]')?.open===true,legacyOpen=host.querySelector('[data-legacy-notices]')?.open===true;host.replaceChildren();host.hidden=!notices.length&&!noticeError;
      const legacy=node('details',null,host);legacy.dataset.legacyNotices='1';legacy.open=legacyOpen||!!noticeError;node('summary','Frühere Rückmeldungen ('+notices.length+')'+(unread.length?' · '+unread.length+' ungelesen':''),legacy);
      node('p','Neue Entscheidungen kommen direkt als Nachricht in diesen Chat.',legacy);
      const current=node('div',null,legacy);current.dataset.unreadNotices='1';if(!unread.length)node('p','Keine ungelesenen früheren Rückmeldungen.',current);
      const history=node('details',null,legacy);history.dataset.readNotices='1';history.open=readOpen;node('summary','Gelesen ('+read.length+')',history);if(!read.length)node('p','Keine gelesenen Rückmeldungen.',history);
      for(const n of [...unread,...read]){const item=node('article',null,n.read===true?history:current);item.dataset.notificationId=n.id;node('h3',n.title,item);node('p',n.text,item);node('small',new Date(DSCommunicationCore.milliseconds(n.reviewedAt)).toLocaleString('de-DE'),item);
        const action=n.read===true?'delete':'read',button=node('button',action==='delete'?'Löschen':'Als gelesen markieren',item);button.type='button';button.className='btn';button.dataset.noticeAction=action;button.disabled=noticeBusy.has(n.id);button.onclick=()=>noticeAction(n.id,action);}
      const status=node('p',noticeError||noticeFeedback,legacy);status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.dataset.noticeStatus='1';
    }
  }
  function watchNotices(){const current=user(),ctx=context();if(!current||!ctx?.verified)return;if(noticeUid===current.uid){renderNotices();return;}noticeUnsub?.();noticeUid=current.uid;notices=[];
    const epoch=++noticeEpoch;noticeFeedback=noticeError='';noticeBusy.clear();renderNotices();
    noticeUnsub=firebase.firestore().collection('orgs').doc(window.firebaseOrgId).collection('users').doc(current.uid).collection('notifications').orderBy('reviewedAt','desc').onSnapshot({includeMetadataChanges:true},snap=>{if(user()?.uid!==current.uid||noticeEpoch!==epoch||snap.metadata.hasPendingWrites)return;notices=snap.docs.map(d=>({id:d.id,...d.data()}));renderNotices();},error=>{if(user()?.uid!==current.uid||noticeEpoch!==epoch)return;noticeError='Rückmeldungen konnten nicht geladen werden: '+error.message;renderNotices();});
  }
  async function refreshChoices(){const current=user();if(!current||!['admin','staff'].includes(window.CLOUD?.role))return [];
    if(choicesPending&&choicesUid===current.uid)return choicesPending;choicesUid=current.uid;
    choicesPending=api().listCustomers(window.state||{}).then(items=>{if(user()?.uid!==current.uid)return [];choices=items;const select=$('chatAdminCustomerSelect');if(select){const selected=select.value;select.replaceChildren(new Option('Kunde auswählen …',''));for(const c of items)select.add(new Option(c.name+' · '+c.email,c.id));if(items.some(c=>c.id===selected))select.value=selected;}return items;}).finally(()=>{choicesPending=null;});return choicesPending;
  }
  async function clearChat(role){const st=role==='staff'?dsAdminChatState():dsCustomerChatState(),id=S(st.currentChatId);if(!id)throw new Error('Kein Chat ausgewählt.');
    if(!confirm('Bisherigen Verlauf für dein Konto leeren? Neue Nachrichten bleiben sichtbar.'))return false;const result=await api().clear(id);
    for(const list of [st.chats,st.filteredChats])for(const c of list||[])if(c.id===id)c.clearedAtByUid={...(c.clearedAtByUid||{}),[result.uid]:result.cutoff};
    dsPatchLocalChatReadState(id,role,result.cutoff,0);dsUpdateCustomerUnreadBadge();dsUpdateAdminUnreadBadge();
    st.__lastRenderKey='';if(role==='staff')renderAdminChatMessages();else renderCustomerChatMessages();return true;}
  async function deleteMessage(chatId,message,role,rerender){if(!DSCommunicationCore.canDelete(message,user(),CLOUD.role))throw new Error('Du kannst nur deine eigenen Nachrichten löschen.');
    const uid=user()?.uid,personal=!['admin','staff'].includes(CLOUD.role)&&message.senderUid!==uid;
    if(!confirm(personal?'Diese Rückmeldung für dich entfernen? Die Entscheidung bleibt erhalten.':'Diese Nachricht endgültig löschen?'))return false;
    const result=await api().remove(chatId,message.id);if(user()?.uid!==uid)return false;
    if(result.hidden){const st=dsCustomerChatState();st.currentMessages=(st.currentMessages||[]).map(m=>m.id===message.id?{...m,hiddenForUids:{...(m.hiddenForUids||{}),[uid]:true}}:m);st.__lastRenderKey='';const chat=(st.chats||[]).find(c=>c.id===chatId);dsPatchLocalChatReadState(chatId,role,chat?.customerLastReadAtMs||0,result.unreadCount);dsUpdateCustomerUnreadBadge();}
    else{await dsDeleteChatAttachmentFiles({attachments:result.attachments});if(user()?.uid!==uid)return false;await dsRefreshChatMetaFromMessages(chatId);}
    if(user()?.uid!==uid)return false;dsCloseChatPreviewModal();rerender?.();return true;}
  async function sendMessage(chatId,text,meta={}){const key=user().uid+':'+chatId+':'+JSON.stringify([text,meta.attachments||[]]);if(!sends.has(key))sends.set(key,crypto.randomUUID());const result=await api().send(chatId,text,meta.attachments||[],sends.get(key));sends.delete(key);return result;}
  function ready(){if(context()?.verified){watchNotices();if(location.pathname.endsWith('app.html')&&new URLSearchParams(location.search).get('customer_mode')==='stay')mountMainStay();if($('stayEditorHost'))mountStay($('stayEditorHost'));}}
  document.addEventListener('click',event=>{const paw=event.target.closest?.('.paw-start');if(paw&&DSWorkflow.scoped()){event.preventDefault();event.stopImmediatePropagation();navigate('customer.html?view=home');}},true);
  window.addEventListener('ds-customer-data-ready',ready);
  window.DSCustomerPortal={consentTexts,mountStay,mountMainStay,watchNotices,renderNotices,refreshChoices,customerOptions:()=>choices,clearChat,deleteMessage,sendMessage,reset,navigate,ready,api};
})();
