/* Local document preview. Customer data never leaves the device for PDF creation. */
(function(){
  'use strict';
  let dialog,active=null,revision=0;
  const el=id=>document.getElementById(id);
  function status(message){el('docModalStatus').textContent=message;}
  function init(){
    if(dialog)return dialog;
    const old=el('docModal');if(!old)throw new Error('Dokumentansicht fehlt.');
    dialog=document.createElement('dialog');dialog.id='docModal';dialog.className='doc-modal ds-document';
    dialog.setAttribute('aria-labelledby','docModalTitle');
    while(old.firstChild)dialog.append(old.firstChild);
    old.replaceWith(dialog);document.body.append(dialog);
    const actions=dialog.querySelector('.doc-modal__actions');
    const save=document.createElement('a');save.id='docModalSave';save.className='btn';save.textContent='PDF speichern';actions.prepend(save);
    const hint=el('docModalHint'),message=document.createElement('p');message.id='docModalStatus';message.setAttribute('role','status');hint.before(message);
    el('docModalPrint').textContent='Drucken';el('docModalOpen').textContent='PDF öffnen';el('docModalShare').textContent='PDF teilen';el('docModalClose').textContent='Schließen';
    el('docModalClose').onclick=close;el('docModalBackdrop').onclick=close;
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    el('docModalPrint').onclick=()=>{
      if(!active?.ready)return;
      try{const win=el('docModalFrame').contentWindow;win.focus();win.print();}
      catch(_){status('Drucken konnte nicht geöffnet werden. Bitte die PDF speichern oder öffnen.');}
    };
    save.onclick=()=>{if(active?.pdfUrl)status('PDF-Download gestartet. In Safari findest du die Datei bei den Downloads.');};
    el('docModalShare').onclick=async()=>{
      const file=active?.file;if(!file)return;
      try{await navigator.share({files:[file],title:active.title});}
      catch(e){if(e.name!=='AbortError' && active?.file===file)status('Teilen nicht verfügbar. Bitte „PDF speichern“ verwenden.');}
    };
    const frame=el('docModalFrame');frame.setAttribute('sandbox','allow-same-origin allow-modals');
    return dialog;
  }
  function close(){
    if(!dialog || !active)return;
    const previous=active;active=null;revision++;
    const frame=el('docModalFrame');frame.onload=null;frame.removeAttribute('srcdoc');frame.src='about:blank';
    if(dialog.open && typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
    dialog.classList.remove('is-open');dialog.setAttribute('aria-hidden','true');
    if(previous.pdfUrl)URL.revokeObjectURL(previous.pdfUrl);
    if(previous.ownedUrl && previous.ownedUrl!==previous.pdfUrl)URL.revokeObjectURL(previous.ownedUrl);
    document.body.style.cssText=previous.bodyStyle;document.documentElement.style.overflow=previous.overflow;
    window.scrollTo(0,previous.scrollY);previous.focus?.focus?.();
  }
  function open(options){
    init();close();
    const id=++revision,frame=el('docModalFrame'),title=String(options.title||'Dokument');
    active={title,ready:false,focus:document.activeElement,scrollY:window.scrollY||0,bodyStyle:document.body.style.cssText,overflow:document.documentElement.style.overflow};
    const current=active;
    el('docModalTitle').textContent=title;el('docModalMeta').textContent=options.filename||'';
    el('docModalPrint').disabled=true;
    el('docModalSave').hidden=true;el('docModalOpen').hidden=true;el('docModalOpen').style.display='none';
    el('docModalShare').hidden=true;el('docModalShare').style.display='none';
    el('docModalHint').textContent=options.hint||'Drucken öffnet die Druckauswahl. Dort kannst du auch eine PDF in Dateien sichern.';
    status('Vorschau wird geladen …');
    if(options.pdf){
      if(options.pdf.type!=='application/pdf')throw new Error('Die Druckdatei ist keine PDF.');
      current.pdfUrl=URL.createObjectURL(options.pdf);
      const save=el('docModalSave');save.href=current.pdfUrl;save.download=options.filename||'Dokument.pdf';save.hidden=false;
      const openButton=el('docModalOpen');openButton.hidden=false;openButton.style.display='';openButton.onclick=()=>window.open(current.pdfUrl,'_blank','noopener');
      current.file=new File([options.pdf],save.download,{type:'application/pdf'});
      if(navigator.share && navigator.canShare?.({files:[current.file]})){el('docModalShare').hidden=false;el('docModalShare').style.display='';}
    }
    frame.onload=async()=>{
      try{
        const doc=frame.contentDocument;
        if(doc?.fonts?.ready)await doc.fonts.ready;
        if(doc)await Promise.all([...doc.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;})));
      }catch(_){}
      if(revision!==id || active!==current)return;
      current.ready=true;el('docModalPrint').disabled=false;status(options.warning||'Vorschau bereit.');
    };
    frame.title=title;frame.removeAttribute('srcdoc');
    if(options.html!==undefined){frame.removeAttribute('src');frame.srcdoc=String(options.html);}
    else{current.ownedUrl=options.url;frame.src=options.url;}
    dialog.classList.add('is-open');dialog.setAttribute('aria-hidden','false');
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    document.documentElement.style.overflow='hidden';
    Object.assign(document.body.style,{position:'fixed',top:-current.scrollY+'px',left:'0',right:'0',width:'100%',overflow:'hidden'});
    el('docModalClose').focus();
  }
  window.DSDocumentOutput={init,open,close};
})();
