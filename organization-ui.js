/* Business ownership is separate from application permissions. Only a full admin
   session migrates current templates; signed originals and historical data stay intact. */
(function(){
  'use strict';
  const ownerEmail='anschifessler@googlemail.com',employeeEmail='raphael@boch-plan.de';
  let accountJob=null,accountKey='';
  function admin(){const u=window.firebase?.auth().currentUser;return !!u?.uid&&window.CLOUD?.user?.uid===u.uid&&CLOUD.role==='admin'&&!DSWorkflow.scoped();}
  function apply(s){
    if(!admin()||Number(s.organization?.schemaVersion)>=397)return false;
    // Legacy non-draft invoices used COMPANY as their issuer. Freeze that previous
    // issuer before changing current defaults, including old invoices without snapshots.
    for(const inv of s.invoices||[]){
      if(invoiceStatusCode(inv.status)!=='draft'&&!inv.issuerSnapshot)inv.issuerSnapshot=JSON.parse(JSON.stringify({...COMPANY,owner:'Raphael Boch'}));
    }
    s.settings=s.settings||{};s.settings.invoiceBusiness={...s.settings.invoiceBusiness,owner:'Angelika Boch'};
    const change=value=>typeof value==='string'?value.replace(/Raphael Boch/g,'Angelika Boch').replace(/Inhaber:\s*Angelika Boch/g,'Inhaberin: Angelika Boch'):value;
    const stamp=toISODateLocal(new Date());
    s.organization={schemaVersion:397,ownerName:'Angelika Boch',ownerEmail,adminEmployees:[{name:'Raphael Boch',email:employeeEmail}],changedAt:stamp,previousTemplates:{}};
    if(s.legalTexts){for(const [key,value]of Object.entries(s.legalTexts)){const next=change(value);if(next!==value){s.organization.previousTemplates['legal_'+key]=value;s.legalTexts[key]=next;}}}
    if(s.contract?.text&&change(s.contract.text)!==s.contract.text){s.organization.previousTemplates.contract=JSON.parse(JSON.stringify(s.contract));s.contract={...s.contract,text:change(s.contract.text),version:String(s.contractVersion||s.contract.version||'1.0')+'-GB397',updatedAt:Date.now()};s.contractVersion=s.contract.version;}
    for(const [key,doc]of Object.entries(s.compliance?.docs||{})){
      if(!doc||typeof doc!=='object')continue;
      let next=change(doc.content);
      if(typeof next==='string')next=next.replace('Primär: Angelika Boch · Vertretung: Angelika Boch','Primär: Angelika Boch · Vertretung: Raphael Boch');
      if(typeof next==='string')next=next.replace('Vertretung (Schlüssel/Zugriff): Angelika Boch','Vertretung (Schlüssel/Zugriff): Raphael Boch');
      if(next!==doc.content){const old={...doc};delete old.history;s.organization.previousTemplates['compliance_'+key]=old;doc.history=Array.isArray(doc.history)?doc.history:[];doc.history.push({fromVersion:doc.version||'1.0',toVersion:String(doc.version||'1.0')+'-GB397',changedAt:stamp,note:'Inhaberin Angelika Boch; bisherige Vorlage gesichert.'});doc.version=String(doc.version||'1.0')+'-GB397';doc.content=next;doc.lastChanged=stamp;}
    }
    for(const person of s.staff?.people||[]){if(/^(anschi|angie|angelika)(\s|$)/i.test(person.name||''))person.role='Inhaberin · Admin';else if(/^raphael(\s|$)/i.test(person.name||''))person.role='Mitarbeiter · Admin';}
    return true;
  }
  async function syncAccounts(){
    if(!admin())return;
    const actor=firebase.auth().currentUser.uid,key=window.firebaseOrgId+':'+actor;
    if(accountKey===key&&accountJob)return accountJob;
    accountKey=key;
    const check=()=>{if(!admin()||firebase.auth().currentUser.uid!==actor||window.firebaseOrgId+':'+actor!==key)throw new Error('Konto gewechselt.');};
    accountJob=(async()=>{
      const db=CLOUD.db,users=db.collection('orgs').doc(window.firebaseOrgId).collection('users');
      for(const [email,businessRole]of [[ownerEmail,'owner'],[employeeEmail,'employee']]){
        const result=await users.where('email','==',email).get({source:'server'});check();
        if(result.docs.length!==1)continue;
        const ref=result.docs[0].ref;
        await db.runTransaction(async tx=>{
          const snap=await tx.get(ref);check();const data=snap.data();
          // Never promote a new/unverified customer by an email string. This
          // migrates only the two already assigned team accounts authorized by the admin.
          if(!snap.exists||data.email!==email||!['staff','admin'].includes(data.role))return;
          if(data.role!=='admin'||data.businessRole!==businessRole)tx.update(ref,{role:'admin',businessRole});
        });check();
      }
    })().catch(error=>{accountJob=null;throw error;});
    return accountJob;
  }
  window.DSOrganization={apply,syncAccounts};
})();
