/* App-owned browser data only. Never intercept Firebase Auth storage or delete old data. */
(function(){
  'use strict';
  const values=new Map(),jobs=new Map(),warnings=new Map();
  let database=null,generation=0,activePrefix='',activeUid='';
  const supported=key=>/^ds_workspace_(?:v3|base_v3|conflict_backup_v3):/.test(key) || /^ds_customer_proposal_queue_v3:/.test(key);
  function nativeValue(key){try{return localStorage.getItem(key);}catch(_){return null;}}
  function get(key){return values.has(key)?values.get(key):nativeValue(key);}
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('IndexedDB ist nicht verfügbar.'));return;}
      const request=indexedDB.open('DoggyStyleWorkspaceBrowser-v1',1),timer=setTimeout(()=>reject(new Error('Gerätespeicher antwortet nicht.')),5000);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('records'))request.result.createObjectStore('records',{keyPath:'key'});};
      request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{clearTimeout(timer);reject(new Error('Gerätespeicher ist durch einen anderen Tab gesperrt.'));};
      request.onsuccess=()=>{clearTimeout(timer);const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
    }).catch(error=>{database=null;throw error;});return database;
  }
  async function record(key,value,write){
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('records',write?'readwrite':'readonly'),store=tx.objectStore('records');let result=null;
      const request=write?store.put({key,value,writtenAt:Date.now()}):store.get(key);
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(write?true:result?.value??null);
      tx.onerror=()=>reject(tx.error||request.error||new Error('Gerätespeicher konnte nicht gelesen werden.'));
      tx.onabort=()=>reject(tx.error||new Error('Gerätespeicherung wurde abgebrochen.'));
    });
  }
  function showWarning(key,message,epoch){
    if(epoch!==generation)return;warnings.set(key,message);
    let box=document.getElementById('dsLocalStorageWarning');
    if(!box){box=document.createElement('div');box.id='dsLocalStorageWarning';box.setAttribute('role','status');box.style.cssText='position:sticky;top:0;z-index:9996;margin:8px 12px;padding:12px;border:1px solid #f59e0b;border-radius:10px;background:#30220a;color:#fff0c2;white-space:pre-wrap';(document.querySelector('main')||document.body).prepend(box);}
    box.replaceChildren();const text=document.createElement('p');text.textContent=message;box.append(text);
    const save=document.createElement('button');save.type='button';save.textContent='Lokale Sicherung herunterladen';save.style.cssText='background:#fff;color:#18181b;min-height:44px;padding:8px 14px;border:1px solid #a16207;border-radius:8px';save.onclick=download;box.append(save);
  }
  function clearWarning(key,epoch){if(epoch!==generation)return;warnings.delete(key);if(!warnings.size)document.getElementById('dsLocalStorageWarning')?.remove();}
  async function put(key,value){
    if(!supported(key))throw new Error('Unbekannter App-Speicherschlüssel.');
    const text=String(value),epoch=generation;values.set(key,text);
    const previous=jobs.get(key)||Promise.resolve();
    const operation=previous.catch(()=>{}).then(async()=>{
      try{await record(key,text,true);clearWarning(key,epoch);return {durable:true,kind:'indexeddb'};}
      catch(databaseError){
        try{localStorage.setItem(key,text);clearWarning(key,epoch);return {durable:true,kind:'localStorage'};}
        catch(localError){
          const error=new Error('Auf diesem Gerät konnte die Änderung nicht dauerhaft gespeichert werden. Die vorhandenen Daten bleiben erhalten. Bitte eine Sicherung herunterladen; Website-Daten nicht löschen.');
          error.code='device-storage-full';error.cause=localError;showWarning(key,error.message,epoch);throw error;
        }
      }
    });
    jobs.set(key,operation);operation.finally(()=>{if(jobs.get(key)===operation)jobs.delete(key);}).catch(()=>{});return operation;
  }
  function cache(key,value){return put(key,value).catch(error=>({durable:false,warning:error.message}));}
  async function prepare(project,org,uid){
    if(activeUid && (activeUid!==uid || activePrefix!==project+':'+org+':'))reset();
    const epoch=generation;activePrefix=project+':'+org+':';activeUid=uid;
    const keys=['ds_workspace_v3:'+activePrefix+uid,'ds_workspace_base_v3:'+activePrefix+uid,'ds_customer_proposal_queue_v3:'+uid];
    for(const key of keys){
      let stored=null;try{stored=await record(key,null,false);}catch(_){}
      if(epoch!==generation || activeUid!==uid)return false;
      const legacy=nativeValue(key);
      // Preserve a newer legacy workspace edit, including edits made by an older open app tab.
      if(stored!==null && legacy!==null && key.startsWith('ds_workspace_v3:')){
        try{if(Number(JSON.parse(legacy)._localUpdatedAt||0)>Number(JSON.parse(stored)._localUpdatedAt||0))stored=legacy;}catch(_){}
      }
      if(!values.has(key))values.set(key,stored!==null?stored:legacy);
    }return true;
  }
  async function flush(){await Promise.allSettled([...jobs.values()]);return [...warnings.values()];}
  function download(){
    if(!activeUid || window.firebase?.auth().currentUser?.uid!==activeUid)throw new Error('Bitte mit dem zu sichernden Konto anmelden.');
    const keys=['ds_workspace_v3:'+activePrefix+activeUid,'ds_workspace_base_v3:'+activePrefix+activeUid,'ds_customer_proposal_queue_v3:'+activeUid],records={};
    for(const [key,value] of values)if(key.startsWith('ds_workspace_conflict_backup_v3:'+activePrefix+activeUid+':'))records[key]=value;
    for(const key of keys){const value=get(key);if(value!==null)records[key]=value;}
    try{for(let i=0;i<sessionStorage.length;i++){const key=sessionStorage.key(i);if(key.startsWith('ds_contract_draft_v3:'+activeUid+':'))records[key]=sessionStorage.getItem(key);}}catch(_){}
    const blob=new Blob([JSON.stringify({format:'DoggyStyleLocalBackup-v1',uid:activeUid,createdAt:Date.now(),records},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='DoggyStyle_Lokale_Sicherung_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function reset(){generation++;activeUid='';activePrefix='';values.clear();warnings.clear();document.getElementById('dsLocalStorageWarning')?.remove();}
  window.DSBrowserStore={get,put,cache,prepare,flush,reset,download};
})();
