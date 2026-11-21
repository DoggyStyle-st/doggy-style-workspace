/* Local, paginated training records, including archived signatures. */
(function(){
  'use strict';
  const css='@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;padding:18px;background:#fff;color:#171717;font:14px/1.5 Arial,sans-serif;overflow-wrap:anywhere}h1{font-size:25px}h2{font-size:19px;break-after:avoid}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #ccc;text-align:left;vertical-align:top}th{background:#eee}tr{break-inside:avoid}.sigimg{display:block;max-width:100%;width:220px;height:65px;object-fit:contain}.sigbox{height:65px;border-bottom:1px solid #888}.muted{color:#444}@media print{body{padding:0}}';
  function pdf(title,root){
    const JsPDF=window.jspdf?.jsPDF;if(!JsPDF)throw new Error('PDF-Erstellung ist noch nicht geladen. Bitte neu laden.');
    const doc=new JsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
    if(window.DSPrintFont){doc.addFileToVFS('DoggyStyle.ttf',DSPrintFont);doc.addFont('DoggyStyle.ttf','DoggyStyle','normal');doc.setFont('DoggyStyle');}
    doc.setProperties({title,author:'Doggy Style Hundepension'});
    let y=18;const left=16,right=194,bottom=275;
    const page=()=>{doc.addPage();y=18;};
    function lines(text,x,width,size=10){doc.setFontSize(size);return doc.splitTextToSize(String(text).replace(/\r/g,''),width);}
    function paragraph(text,size=10){for(const line of lines(text,left,right-left,size)){if(y+size*.45>bottom)page();doc.setFontSize(size);doc.text(line,left,y);y+=size*.45;}y+=3;}
    for(const child of root.children){
      if(child.tagName!=='TABLE'){paragraph(child.textContent,child.tagName==='H1'?17:child.tagName==='H2'?13:10);continue;}
      const rows=[...child.rows],headers=rows.filter(row=>row.parentElement.tagName==='THEAD');
      const count=rows[0]?.cells.length||1,width=(right-left)/count;
      function draw(row,heading=false){
        const cells=[...row.cells].map(cell=>({text:lines(cell.innerText||cell.textContent,left,width-5,10),image:cell.querySelector('img')}));
        const height=Math.max(10,...cells.map(cell=>Math.max(cell.text.length*4.6+5,cell.image?24:0)));
        // Long text-only table cells can span pages, keeping columns aligned.
        const limit=Math.max(1,Math.floor((bottom-y-5)/4.6));
        if(height>bottom-y&&y>19){page();if(!heading)headers.forEach(header=>draw(header,true));}
        const remaining=Math.max(...cells.map(cell=>cell.text.length));
        let offset=0;
        do{
          const capacity=Math.max(1,Math.floor((bottom-y-5)/4.6)),take=Math.min(remaining-offset,capacity),h=Math.max(10,take*4.6+5,offset===0&&cells.some(cell=>cell.image)?24:0);
          for(let i=0;i<cells.length;i++){
            const x=left+i*width;doc.setDrawColor(190);doc.rect(x,y,width,h);doc.setFontSize(10);
            const part=cells[i].text.slice(offset,offset+take);if(part.length)doc.text(part,x+2.5,y+5);
            if(offset===0&&cells[i].image){const src=cells[i].image.getAttribute('src')||'';if(!/^data:image\/(png|jpeg);base64,/i.test(src))throw new Error('Eine archivierte Unterschrift hat kein unterstütztes Bildformat.');const image=doc.getImageProperties(src),w=Math.min(width-5,65),h=Math.min(18,w*image.height/image.width);doc.addImage(src,image.fileType,x+2.5,y+3,w,h);}
          }
          y+=h;offset+=take;
          if(offset<remaining){page();if(!heading)headers.forEach(header=>draw(header,true));}
        }while(offset<remaining);
      }
      for(const row of rows)draw(row,headers.includes(row));y+=6;
    }
    const pages=doc.getNumberOfPages();for(let n=1;n<=pages;n++){doc.setPage(n);doc.setFontSize(8);doc.text('Doggy Style Hundepension',16,287);doc.text('Seite '+n+' / '+pages,194,287,{align:'right'});}
    return doc.output('blob');
  }
  function open(title,body){
    const root=document.createElement('main');root.innerHTML=body;
    const output=pdf(title,root),filename='Unterweisung_'+String(title||'Protokoll').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,90)+'.pdf';
    DSDocumentOutput.open({title,filename,pdf:output,html:'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+root.innerHTML+'</body></html>',hint:'PDF speichern oder über „PDF teilen“ in Dateien ablegen. Drucken öffnet den Druckdialog.'});
  }
  window.DSCompliancePrint={open,pdf};
})();
