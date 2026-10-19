/* Customer navigation, stay requests, decision notices and UID-bound chat adapters. */
(function(){
  'use strict';const $=id=>document.getElementById(id),S=v=>String(v==null?'':v).trim();
  const user=()=>window.firebase?.auth().currentUser,context=()=>window.DSWorkflow?.context(),api=()=>DSCommunicationCore.service(firebase.firestore(),window.firebaseOrgId,user,()=>firebase.firestore.FieldValue?.serverTimestamp?.()||Date.now());
  let noticeUid='',noticeUnsub=null,notices=[],choices=[],choicesUid='',choicesPending=null;const sends=new Map();
  function navigate(url){if(typeof window.__dsTestNavigate==='function')window.__dsTestNavigate(url);else location.assign(url);}
  function reset(){noticeUnsub?.();noticeUnsub=null;noticeUid='';notices=[];choices=[];choicesUid='';choicesPending=null;sends.clear();document.querySelectorAll('[data-ds-notices]').forEach(el=>el.remove());
    for(const key of ['__dsAdminChatState','__dsCustomerChatState']){const st=window[key];for(const field of ['listUnsub','msgUnsub'])st?.[field]?.();for(const unsubscribe of st?.listUnsubs||[])unsubscribe();window[key]=null;}
    window.__dsChatComposeState=null;
    for(const id of ['customerChatRoot','chatAdminRoot'])$(id)?.replaceChildren();$('dsChatPreviewModal')?.remove();
  }
  function node(tag,text,parent){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(parent)parent.append(el);return el;}
  function field(form,label,name,type='text',value=''){const wrap=node('label',null,form);wrap.className='field';node('span',label,wrap);const el=node(type==='select'?'select':type==='textarea'?'textarea':'input',null,wrap);el.name=name;if(el.tagName==='INPUT')el.type=type;el.value=value;if(type==='checkbox'){wrap.style.cssText='display:flex;align-items:center;gap:12px;min-height:44px';el.style.cssText='width:24px;height:24px;flex-shrink:0';}return el;}
  function mountStay(host){if(!host)return;const ctx=context();const key=ctx?.uid+':'+ctx?.customerId;
    if(ctx?.verified&&host.dataset.dsStayKey===key&&host.querySelector('form')){const form=host.querySelector('form'),select=form.elements.namedItem('petId'),selected=select.value;form.elements.namedItem('customer').value=ctx.customer.name;select.replaceChildren(...ctx.pets.map(p=>new Option(p.name,p.id)));if(ctx.pets.some(p=>p.id===selected))select.value=selected;return;}
    host.replaceChildren();host.dataset.dsStayKey=key;if(!ctx?.verified){node('p','Dein Kundenkonto muss zuerst zugeordnet werden.',host);return;}
    const form=node('form',null,host);form.id='dsStayRequestForm';form.className='card';node('h2','Aufenthalt anfragen',form);node('p','Die Anfrage wird geprüft. Nach der Entscheidung erhältst du hier eine Rückmeldung.',form);
    field(form,'Kunde','customer','text',ctx.customer.name).disabled=true;
    const pets=field(form,'Hund','petId','select');for(const p of ctx.pets)pets.add(new Option(p.name,p.id));pets.required=true;
    const care=field(form,'Betreuungsart','betreuung','select');for(const label of ['Urlaubsbetreuung','Tagesbetreuung','Probetag'])care.add(new Option(label,label));
    for(const [label,name,type]of [['Von','von','date'],['Bis','bis','date'],['Bringzeit','bringzeit','time'],['Abholzeit','abholzeit','time'],['Hinweise zum Aufenthalt','notes','textarea']]){const el=field(form,label,name,type);el.required=['von','bis'].includes(name);}
    const consents=[['ev_agb','Ich akzeptiere die AGB.'],['ev_dsgvo','Ich habe die Datenschutzinformationen gelesen.'],['ev_wahr','Meine Angaben sind wahrheitsgemäß.'],['ev_hv','Mein Hund ist haftpflichtversichert.'],['ev_gesund','Mein Hund ist frei von ansteckenden Krankheiten.'],['ev_tierarzt','Im Notfall darf mein Hund tierärztlich versorgt werden. Die Kosten trage ich.']];
    const consentBox=node('fieldset',null,form);node('legend','Bestätigungen',consentBox);for(const [name,label]of consents){const el=field(consentBox,label,name,'checkbox');el.required=true;}
    const submit=node('button','Anfrage zur Prüfung senden',form);submit.id='dsStaySubmit';submit.type='submit';submit.className='btn primary';submit.style.minHeight='44px';
    const status=node('p','',form);status.id='dsStayStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');let pending=false,lastPayload='',requestId='';
    form.addEventListener('input',()=>{if(!pending){submit.disabled=false;status.textContent='';}});
    form.addEventListener('submit',async event=>{event.preventDefault();if(pending)return;
      try{if(!form.reportValidity())return;const current=context();if(!current?.verified||current.uid!==ctx.uid)throw new Error('Kundenkonto gewechselt.');
        const data=new FormData(form),pid=S(data.get('petId')),pet=current.pets.find(p=>p.id===pid);if(!pet)throw new Error('Bitte einen eigenen Hund auswählen.');
        const von=S(data.get('von')),bis=S(data.get('bis'));if(!von||!bis||bis<von)throw new Error('Bitte einen gültigen Zeitraum angeben.');
        const fields={halter_name:current.customer.name,halter_email:current.customer.email||'',hund_name:pet.name,notes:S(data.get('notes'))};for(const [name]of consents){fields[name]=!!form.elements.namedItem(name).checked;if(!fields[name])throw new Error('Bitte alle Bestätigungen prüfen.');}
        const payload={customerId:current.customerId,petId:pid,meta:{customerId:current.customerId,petId:pid,dogId:pid,betreuung:S(data.get('betreuung')),von,bis,bringzeit:S(data.get('bringzeit')),abholzeit:S(data.get('abholzeit')),ort_datum:new Date().toLocaleDateString('de-DE')},fields};
        const fingerprint=JSON.stringify(payload);if(fingerprint!==lastPayload){lastPayload=fingerprint;requestId=crypto.randomUUID();}
        pending=true;submit.disabled=true;status.textContent='Anfrage wird übermittelt …';const result=await DSWorkflow.submit({id:requestId,templateId:'hundeannahme',title:'Aufenthaltsanfrage',customerId:current.customerId,petId:pid,payloadSubmitted:payload});
        if(!result.ok)throw result.error||new Error('Übertragung nicht bestätigt.');status.textContent='✅ Anfrage übermittelt. Die Entscheidung steht noch aus.';form.dataset.submittedId=result.task.id;
      }catch(error){status.textContent='Anfrage nicht übermittelt: '+error.message;submit.disabled=false;}finally{pending=false;}
    });
  }
  function mountMainStay(){const host=$('documents');if(host){host.style.display='';host.classList.add('is-active');mountStay(host);const editor=$('editor');if(editor)editor.style.display='none';}}
  function noticeHost(parent,id){if(!parent)return null;let el=$(id);if(!el){el=node('section');el.id=id;el.className='card';el.dataset.dsNotices='1';parent.prepend(el);}return el;}
  function renderNotices(){if(!context()?.verified)return;const targets=[noticeHost($('view-home')||$('dogs'),'dsCustomerNotices'),noticeHost($('view-chat'),'dsChatNotices')].filter(Boolean);
    for(const host of targets){host.replaceChildren();node('h2','Rückmeldungen'+(notices.some(n=>!n.read)?' · neu':''),host);
      if(!notices.length)node('p','Hier erscheinen Entscheidungen zu deinen Einreichungen.',host);
      for(const n of notices){const item=node('article',null,host);item.dataset.notificationId=n.id;node('h3',n.title,item);node('p',n.text,item);node('small',new Date(n.reviewedAt).toLocaleString('de-DE'),item);
        if(!n.read){const read=node('button','Als gelesen markieren',item);read.type='button';read.className='btn';read.onclick=async()=>{read.disabled=true;try{await api().markNoticeRead(n.id);}catch(e){read.disabled=false;node('p','Rückmeldung konnte nicht als gelesen markiert werden: '+e.message,item);}};}}
    }
  }
  function watchNotices(){const current=user(),ctx=context();if(!current||!ctx?.verified)return;if(noticeUid===current.uid){renderNotices();return;}noticeUnsub?.();noticeUid=current.uid;notices=[];renderNotices();
    noticeUnsub=firebase.firestore().collection('orgs').doc(window.firebaseOrgId).collection('users').doc(current.uid).collection('notifications').orderBy('reviewedAt','desc').onSnapshot(snap=>{if(user()?.uid!==current.uid)return;notices=snap.docs.map(d=>({id:d.id,...d.data()}));renderNotices();},error=>{if(user()?.uid!==current.uid)return;for(const id of ['dsCustomerNotices','dsChatNotices'])if($(id))node('p','Rückmeldungen konnten nicht geladen werden: '+error.message,$(id));});
  }
  async function refreshChoices(){const current=user();if(!current||!['admin','staff'].includes(window.CLOUD?.role))return [];
    if(choicesPending&&choicesUid===current.uid)return choicesPending;choicesUid=current.uid;
    choicesPending=api().listCustomers(window.state||{}).then(items=>{if(user()?.uid!==current.uid)return [];choices=items;const select=$('chatAdminCustomerSelect');if(select){const selected=select.value;select.replaceChildren(new Option('Kunde auswählen …',''));for(const c of items)select.add(new Option(c.name+' · '+c.email,c.id));if(items.some(c=>c.id===selected))select.value=selected;}return items;}).finally(()=>{choicesPending=null;});return choicesPending;
  }
  async function clearChat(role){const st=role==='staff'?dsAdminChatState():dsCustomerChatState(),id=S(st.currentChatId);if(!id)throw new Error('Kein Chat ausgewählt.');
    if(!confirm('Bisherigen Verlauf für dein Konto leeren? Neue Nachrichten bleiben sichtbar.'))return false;const result=await api().clear(id);
    for(const list of [st.chats,st.filteredChats])for(const c of list||[])if(c.id===id)c.clearedAtByUid={...(c.clearedAtByUid||{}),[result.uid]:result.cutoff};
    st.__lastRenderKey='';if(role==='staff')renderAdminChatMessages();else renderCustomerChatMessages();return true;}
  async function deleteMessage(chatId,message,role,rerender){if(!DSCommunicationCore.canDelete(message,user(),CLOUD.role))throw new Error('Du kannst nur deine eigenen Nachrichten löschen.');if(!confirm('Diese Nachricht endgültig löschen?'))return false;
    const result=await api().remove(chatId,message.id);await dsDeleteChatAttachmentFiles({attachments:result.attachments});await dsRefreshChatMetaFromMessages(chatId);dsCloseChatPreviewModal();rerender?.();return true;}
  async function sendMessage(chatId,text,meta={}){const key=user().uid+':'+chatId+':'+JSON.stringify([text,meta.attachments||[]]);if(!sends.has(key))sends.set(key,crypto.randomUUID());const result=await api().send(chatId,text,meta.attachments||[],sends.get(key));sends.delete(key);return result;}
  function ready(){if(context()?.verified){watchNotices();if(location.pathname.endsWith('app.html')&&new URLSearchParams(location.search).get('customer_mode')==='stay')mountMainStay();if($('stayEditorHost'))mountStay($('stayEditorHost'));}}
  document.addEventListener('click',event=>{const paw=event.target.closest?.('.paw-start');if(paw&&DSWorkflow.scoped()){event.preventDefault();event.stopImmediatePropagation();navigate('customer.html?view=home');}},true);
  window.addEventListener('ds-customer-data-ready',ready);
  window.DSCustomerPortal={mountStay,mountMainStay,watchNotices,renderNotices,refreshChoices,customerOptions:()=>choices,clearChat,deleteMessage,sendMessage,reset,navigate,ready,api};
})();
