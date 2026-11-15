/* Render the same invoice data in the document preview and the downloadable PDF. */
(function(){
  'use strict';

  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
  const htmlLines=lines=>lines.map(line=>escape(line)).join('<br>');

  function html(invoice){
    const rows=(items)=>items.map(({label,amount})=>
      `<tr><td>${escape(label)}</td><td class="amount">${escape(amount)}</td></tr>`
    ).join('');
    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="format-detection" content="telephone=no">
<title>${escape(invoice.title)}</title>
<style>
  @page{size:A4;margin:16mm}
  *{box-sizing:border-box}
  body{margin:0;padding:20px;color:#161616;background:#fff;font:14px/1.45 Arial,sans-serif;overflow-wrap:anywhere}
  main{max-width:780px;margin:auto}
  header{display:flex;align-items:flex-start;gap:20px;margin-bottom:22px}
  address, .sender{flex:1 1 0;min-width:0}
  address{font-style:normal}
  .sender{text-align:right}
  .sender img{display:block;width:56px;height:56px;object-fit:contain;margin:0 0 8px auto}
  .detail{margin-top:10px;color:#444}
  h1{margin:0 0 10px;font-size:28px;line-height:1.15}
  .metadata{margin:0 0 16px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{padding:7px 9px;border-bottom:1px solid #d2d2d2;text-align:left;vertical-align:top}
  th{background:#f1f1f1}
  .amount{width:30%;text-align:right}
  .totals tr:first-child{font-weight:bold;background:#f1f1f1}
  .payment{margin-top:18px}
  .payment p{margin:0 0 6px}
  .closing{margin-top:14px}
  @media screen and (max-width:460px){body{padding:14px}header{flex-wrap:wrap;gap:14px}address,.sender{flex-basis:100%}.sender{text-align:left}.sender img{margin-left:0}.amount{width:34%}}
  @media print{
    body{padding:0;font-size:10.5pt}
    main{max-width:none}
    h1{break-after:avoid}
    thead{display:table-header-group}
    tr,.totals,.payment{break-inside:avoid;page-break-inside:avoid}
  }
</style>
</head>
<body>
<main>
  <header>
    <address><strong>${escape(invoice.recipient[0])}</strong>${invoice.recipient.length>1?'<br>'+htmlLines(invoice.recipient.slice(1)):''}
      ${invoice.recipientDetails.length?'<div class="detail">'+htmlLines(invoice.recipientDetails)+'</div>':''}
    </address>
    <div class="sender">${invoice.logoUrl?'<img src="'+escape(invoice.logoUrl)+'" alt="">':''}
      <strong>${escape(invoice.sender[0])}</strong><br>${htmlLines(invoice.sender.slice(1))}
    </div>
  </header>
  <h1>${escape(invoice.heading)}</h1>
  <div class="metadata">${invoice.metadata.map(([label,value])=>`<div><strong>${escape(label)}:</strong> ${escape(value)}</div>`).join('')}</div>
  <table>
    <thead><tr><th scope="col">Position</th><th scope="col" class="amount">Betrag</th></tr></thead>
    <tbody>${rows(invoice.rows)}</tbody>
    <tbody class="totals">${rows(invoice.totals)}</tbody>
  </table>
  <section class="payment">
    <p>${escape(invoice.payment[0])}</p>
    <div>${htmlLines(invoice.payment.slice(1))}</div>
    <div class="closing">Vielen Dank!</div>
  </section>
</main>
</body>
</html>`;
  }

  function pdf(invoice,JsPDF,font,logo){
    if(!JsPDF)throw new Error('Die PDF-Erstellung ist noch nicht geladen.');
    const doc=new JsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
    let face='helvetica';
    if(font){
      doc.addFileToVFS('DoggyStyle.ttf',font);
      doc.addFont('DoggyStyle.ttf','DoggyStyle','normal');
      face='DoggyStyle';
    }
    doc.setFont(face);
    doc.setProperties({title:invoice.title,author:invoice.sender[0]});
    const margin=16,right=194,width=right-margin,top=17,bottom=272,lineHeight=4.9;
    let y=top;
    const wrap=(text,maxWidth,size=10)=>{
      doc.setFontSize(size);
      return doc.splitTextToSize(String(text??'').replace(/\r/g,'').replace(/\t/g,' '),maxWidth);
    };
    function page(){doc.addPage();y=top;}
    function write(text,size=10,gap=lineHeight){
      const lines=wrap(text,width,size);
      for(const line of lines){
        if(y+gap>bottom)page();
        doc.setFontSize(size);
        doc.text(line,margin,y+gap-1);
        y+=gap;
      }
    }
    const logoSize=17;
    let logoHeight=0;
    if(logo){
      try{doc.addImage(logo,'PNG',right-logoSize,y,logoSize,logoSize,undefined,'FAST');logoHeight=logoSize+3;}
      catch(_){/* The company details still identify the sender. */}
    }
    function column(values,x,start,align){
      let baseline=start;
      doc.setFontSize(10);
      for(const value of values){
        if(value)doc.text(value,x,baseline+lineHeight-1,{align});
        baseline+=lineHeight;
      }
      return baseline;
    }
    const leftWidth=83,rightWidth=86;
    const recipient=invoice.recipient.flatMap(line=>wrap(line,leftWidth));
    if(invoice.recipientDetails.length)recipient.push('',...invoice.recipientDetails.flatMap(line=>wrap(line,leftWidth)));
    const sender=invoice.sender.flatMap(line=>wrap(line,rightWidth));
    if(top+Math.max(recipient.length*lineHeight,logoHeight+sender.length*lineHeight)+13<bottom){
      const recipientEnd=column(recipient,margin,top,'left');
      const senderEnd=column(sender,right,top+logoHeight,'right');
      y=Math.max(recipientEnd,senderEnd)+11;
    }else{
      y+=logoHeight;
      for(const line of [...invoice.sender,'',...invoice.recipient,'',...invoice.recipientDetails])write(line);
      y+=8;
    }
    if(y+24>bottom)page();
    write(invoice.heading,22,10);
    y+=4;
    for(const [label,value] of invoice.metadata)write(label+': '+value);
    y+=8;

    const amountWidth=47,labelWidth=width-amountWidth,padding=3.2;
    const rowHeight=count=>count*lineHeight+2*padding;
    function capacity(){return Math.floor((bottom-y-2*padding)/lineHeight);}
    function drawRow(label,amount,highlight,offset,count){
      const height=rowHeight(count);
      if(highlight){
        doc.setFillColor(241,241,241);
        doc.rect(margin,y,width,height,'F');
      }
      doc.setFontSize(10);
      label.slice(offset,offset+count).forEach((line,i)=>doc.text(line,margin+padding,y+padding+(i+0.76)*lineHeight));
      amount.slice(offset,offset+count).forEach((line,i)=>doc.text(line,right-padding,y+padding+(i+0.76)*lineHeight,{align:'right'}));
      doc.setDrawColor(208,208,208);
      doc.line(margin,y+height,right,y+height);
      y+=height;
    }
    function header(){drawRow(['Position'],['Betrag'],true,0,1);}
    const measure=row=>{
      const keepPrice=text=>text.replace(/(\d) €/g,'$1\u00a0€');
      const label=wrap(keepPrice(row.label),labelWidth-2*padding);
      const amount=wrap(keepPrice(row.amount),amountWidth-2*padding);
      return {label,amount,lines:Math.max(label.length,amount.length,1)};
    };
    function tableRow({label,amount,lines},highlight=false,followingHeight=0){
      const required=rowHeight(lines)+followingHeight;
      if(y+required>bottom&&top+rowHeight(1)+required<=bottom){page();header();}
      for(let offset=0;offset<lines;){
        if(capacity()<1){page();header();}
        const count=Math.min(lines-offset,capacity());
        drawRow(label,amount,highlight,offset,count);
        offset+=count;
      }
    }
    const payment=[...invoice.payment,'','Vielen Dank!'];
    const paymentHeight=payment.reduce((sum,line)=>sum+wrap(line,width).length*lineHeight,0);
    const totals=invoice.totals.map(measure);
    const closingHeight=totals.reduce((sum,row)=>sum+rowHeight(row.lines),0)+8+paymentHeight;
    const measured=invoice.rows.map(measure);
    const firstRowHeight=rowHeight(measured[0]?.lines||1)+(measured.length===1?closingHeight:0);
    const firstSection=rowHeight(1)+firstRowHeight;
    if(y+firstSection>bottom&&top+firstSection<=bottom||y+2*rowHeight(1)>bottom)page();
    header();
    measured.forEach((row,i)=>tableRow(row,false,i===measured.length-1?closingHeight:0));
    totals.forEach((row,i)=>tableRow(row,i===0));

    if(y+8+paymentHeight>bottom)page();else y+=8;
    payment.forEach(line=>write(line));
    const pages=doc.getNumberOfPages();
    for(let i=1;i<=pages;i++){
      doc.setPage(i);
      doc.setDrawColor(208,208,208);
      doc.line(margin,280,right,280);
      doc.setTextColor(70);
      doc.setFontSize(8);
      doc.text('Seite '+i+' / '+pages,right,285,{align:'right'});
    }
    return doc.output('blob');
  }

  window.DSInvoicePrint={html,pdf};
})();
