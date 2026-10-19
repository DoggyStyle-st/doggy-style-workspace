/* UID-bound chat operations; history clearing affects only the acting participant. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./workflow-core.js'));else root.DSCommunicationCore=factory(root.DSWorkflowCore);})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';const str=v=>String(v==null?'':v).trim(),copy=v=>JSON.parse(JSON.stringify(v));
  function fail(message){throw new Error(message);}
  function customerOptions(workspace,profiles){
    const result=[];for(const customer of workspace.customers||[]){const accounts=(profiles||[]).filter(r=>r.data?.role==='customer'&&Core.context({uid:r.id,email:r.data.email},r.data).verified&&r.data.customerId===customer.id);
      if(accounts.length!==1)continue;const account=accounts[0];result.push({id:customer.id,uid:account.id,email:str(account.data.email),name:str(customer.name)||str(account.data.displayName)});}
    return result.sort((a,b)=>a.name.localeCompare(b.name,'de'));
  }
  function milliseconds(v){if(typeof v?.toMillis==='function')return v.toMillis();if(v?.seconds)return Number(v.seconds)*1000;const n=Number(v||0);return Number.isFinite(n)?n:Date.parse(String(v))||0;}
  function visibleMessages(messages,chat,uid){const cutoff=milliseconds(chat?.clearedAtByUid?.[uid]);return (messages||[]).filter(m=>milliseconds(m.createdAt||m.createdAtMs)>cutoff);}
  function canDelete(message,user,role){return !!user?.uid&&!!message?.id&&(['admin','staff'].includes(role)||message.senderUid===user.uid);}
  function service(db,orgId,getUser,timestamp=()=>Date.now()){
    if(orgId!=='doggystyle')fail('Unbekannter Workspace.');const org=db.collection('orgs').doc(orgId),users=org.collection('users'),chats=org.collection('chats');
    async function authority(){const user=getUser();if(!user)fail('Bitte anmelden.');const p=await users.doc(user.uid).get({source:'server'});const profile=p.exists?p.data():{};
      const staff=['admin','staff'].includes(profile.role)||(user.emailVerified===true&&str(user.email).toLowerCase()==='raphael@boch-plan.de');
      const ctx=Core.context(user,profile);if(!staff&&!ctx.verified)fail('Kundenkonto noch nicht zugeordnet.');if(getUser()?.uid!==user.uid)fail('Konto gewechselt.');return{user,profile,ctx,staff};}
    function owns(a,chat){if(!a.staff&&chat.customerUid!==a.user.uid)fail('Dieser Chat gehört zu einem anderen Kundenkonto.');}
    async function listCustomers(workspace){const a=await authority();if(!a.staff)fail('Nur das Team kann Kunden auswählen.');const snap=await users.where('accessSchemaVersion','==',3).get({source:'server'});return customerOptions(workspace,snap.docs.map(d=>({id:d.id,data:d.data()})));}
    async function findOwn(team){const a=await authority();if(a.staff)fail('Bitte einen Kunden auswählen.');const snap=await chats.where('customerUid','==',a.user.uid).get({source:'server'});
      return snap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>!team||str(c.teamMemberKey||'raphael')===team).sort((a,b)=>milliseconds(b.updatedAtMs||b.updatedAt)-milliseconds(a.updatedAtMs||a.updatedAt));}
    async function ensure(target,team){const a=await authority();team=['raphael','anschi'].includes(team)?team:'raphael';let uid=a.user.uid,profile=a.profile;
      if(a.staff){uid=str(target?.uid);if(!uid)fail('Kundenkonto fehlt.');const snap=await users.doc(uid).get({source:'server'});if(!snap.exists)fail('Kundenkonto fehlt.');profile=snap.data();const ctx=Core.context({uid,email:profile.email},profile);if(!ctx.verified||ctx.customerId!==str(target.id))fail('Kundenzuordnung ist nicht eindeutig.');}
      const ctx=Core.context({uid,email:profile.email},profile);if(!ctx.verified)fail('Kundenzuordnung fehlt.');
      const existing=await chats.where('customerUid','==',uid).get({source:'server'}),match=existing.docs.map(d=>({id:d.id,...d.data()})).filter(c=>str(c.teamMemberKey||'raphael')===team).sort((a,b)=>milliseconds(b.updatedAtMs)-milliseconds(a.updatedAtMs))[0];if(match)return match;
      const ref=chats.doc(uid+'__'+team);return db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists){owns(a,snap.data());if(snap.data().customerUid!==uid)fail('Chatkennung ist bereits belegt.');return{id:ref.id,...snap.data()};}
        if(getUser()?.uid!==a.user.uid)fail('Konto gewechselt.');const now=Date.now(),chat={customerUid:uid,customerId:ctx.customerId,customerEmail:str(profile.email).toLowerCase(),customerName:ctx.customer.name,teamMemberKey:team,teamMemberLabel:team==='anschi'?'Anschi':'Raphael',createdAt:timestamp(),updatedAt:timestamp(),createdAtMs:now,updatedAtMs:now,lastMessageText:'',lastMessageAtMs:0,unreadForStaff:0,unreadForCustomer:0,status:'open'};
        tx.set(ref,chat);return{id:ref.id,...chat};});}
    async function send(chatId,text,attachments=[],id){const a=await authority(),ref=chats.doc(str(chatId)),messageRef=ref.collection('messages').doc(id||undefined);text=str(text);
      if(!text&&!attachments.length)fail('Bitte eine Nachricht oder Datei auswählen.');if(text.length>10000)fail('Die Nachricht ist zu lang.');
      const files=copy(attachments);for(const file of files){const path=str(file.path);if(!path.startsWith('orgs/'+orgId+'/chatMedia/'+ref.id+'/')||path.split('/').length!==5||file.url!=='ds-storage:'+path)fail('Datei gehört nicht zu diesem Chat.');}
      return db.runTransaction(async tx=>{const [chat,prior]=await Promise.all([tx.get(ref),tx.get(messageRef)]);if(!chat.exists)fail('Chat fehlt.');const data=chat.data();owns(a,data);
        if(prior.exists){const p=prior.data();if(p.senderUid!==a.user.uid||p.text!==text||JSON.stringify(p.attachments)!==JSON.stringify(files))fail('Nachrichtenkennung ist bereits belegt.');return{ok:true,id:messageRef.id,existing:true};}
        if(getUser()?.uid!==a.user.uid)fail('Konto gewechselt.');const now=Date.now(),role=a.staff?'staff':'customer';
        const message={text,attachments:files,senderUid:a.user.uid,senderEmail:str(a.user.email),senderName:a.staff?(a.profile.displayName||'Doggy Style Team'):a.ctx.customer.name,senderRole:role,createdAt:timestamp(),createdAtMs:now,customerUid:data.customerUid,customerEmail:data.customerEmail||'',customerName:data.customerName||'',teamMemberKey:data.teamMemberKey||'raphael'};
        tx.set(messageRef,message);tx.update(ref,{updatedAt:timestamp(),lastMessageAt:timestamp(),updatedAtMs:now,lastMessageAtMs:now,lastMessageText:text||(files.length+' Datei(en)'),lastMessageFromRole:role,status:'open',unreadForStaff:a.staff?0:Number(data.unreadForStaff||0)+1,unreadForCustomer:a.staff?Number(data.unreadForCustomer||0)+1:0});return{ok:true,id:messageRef.id};});}
    async function clear(chatId){const a=await authority(),ref=chats.doc(str(chatId));return db.runTransaction(async tx=>{const chat=await tx.get(ref);if(!chat.exists)fail('Chat fehlt.');owns(a,chat.data());
      const messages=await ref.collection('messages').orderBy('createdAt','desc').limit(1).get({source:'server'});const cutoff=Math.max(Date.now(),milliseconds(messages.docs[0]?.data().createdAt||messages.docs[0]?.data().createdAtMs));
      if(getUser()?.uid!==a.user.uid)fail('Konto gewechselt.');tx.update(ref,{['clearedAtByUid.'+a.user.uid]:cutoff});return{ok:true,cutoff,uid:a.user.uid};});}
    async function remove(chatId,messageId){const a=await authority(),ref=chats.doc(str(chatId));return db.runTransaction(async tx=>{const [chat,message]=await Promise.all([tx.get(ref),tx.get(ref.collection('messages').doc(str(messageId)))]);if(!chat.exists)fail('Chat fehlt.');owns(a,chat.data());if(!message.exists)return{ok:true,attachments:[]};
      const data=message.data();if(!a.staff&&data.senderUid!==a.user.uid)fail('Du kannst nur deine eigenen Nachrichten löschen.');if(getUser()?.uid!==a.user.uid)fail('Konto gewechselt.');tx.delete(message.ref);return{ok:true,attachments:(data.attachments||[]).filter(f=>str(f.path).startsWith('orgs/'+orgId+'/chatMedia/'+ref.id+'/'))};});}
    async function markNoticeRead(id){const a=await authority();if(!a.ctx.verified)fail('Kein zugeordnetes Kundenkonto.');await users.doc(a.user.uid).collection('notifications').doc(str(id)).update({read:true});return{ok:true};}
    return{listCustomers,findOwn,ensure,send,clear,remove,markNoticeRead};
  }
  return{customerOptions,milliseconds,visibleMessages,canDelete,service};
});
