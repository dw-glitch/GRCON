(function(root){
  "use strict";
  // Nome do módulo preservado para compatibilidade com a navegação existente.
  // Direção da operação: PDF com texto selecionável -> DOCX editável.
  // PDFs digitalizados/imagem requerem OCR, não disponível nesta etapa.
  const MAX_INPUT=20*1024*1024, MAX_PAGES=300, MAX_CHARACTERS=1000000;
  let pdfjsPromise=null;
  const esc=s=>String(s??"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
  const twip=n=>Math.round(Math.max(0,Number(n)||0)*20);
  const failIfCancelled=signal=>{if(signal?.aborted)throw new DOMException("Conversão cancelada.","AbortError");};
  const warn=(warnings,message)=>{if(!warnings.includes(message))warnings.push(message);};

  async function pdfjs(){
    if(!pdfjsPromise){
      const moduleUrl=new URL("assets/vendor/pdfjs/pdf.min.js",document.baseURI);
      pdfjsPromise=import(moduleUrl.href).then(mod=>{
        mod.GlobalWorkerOptions.workerSrc=new URL("assets/vendor/pdfjs/pdf.worker.min.js",document.baseURI).href;
        return mod;
      }).catch(error=>{pdfjsPromise=null;throw new Error("Não foi possível carregar o leitor PDF local. Atualize a página e tente novamente.");});
    }
    return pdfjsPromise;
  }

  function pageLines(content){
    const items=(content.items||[]).filter(item=>typeof item.str==="string"&&item.str.length);
    const rows=[];
    for(const item of items){
      const transform=item.transform||[], x=Number(transform[4])||0, y=Number(transform[5])||0;
      const size=Math.max(6,Math.min(40,Math.abs(Number(item.height))||Math.hypot(Number(transform[2])||0,Number(transform[3])||0)||11));
      let row=rows.find(r=>Math.abs(r.y-y)<=Math.max(2,Math.min(4,size*.23)));
      if(!row){row={y,size,segments:[]};rows.push(row);}
      row.segments.push({x,width:Math.max(0,Number(item.width)||0),text:item.str,size,end:item.hasEOL});
      row.size=Math.max(row.size,size);
    }
    rows.sort((a,b)=>b.y-a.y);
    return rows.map(row=>{
      const segments=row.segments.sort((a,b)=>a.x-b.x);
      let text="",right=null;
      for(const segment of segments){
        const gap=right===null?0:segment.x-right;
        if(text&&gap>Math.max(1.5,row.size*.26)&&!/^\s/.test(segment.text)&&!/\s$/.test(text))text+=" ";
        text+=segment.text;
        right=Math.max(right??0,segment.x+segment.width);
      }
      return {text:text.trim(),y:row.y,size:row.size};
    }).filter(r=>r.text);
  }

  function paragraph(text,size,after=60){
    const halfPoints=Math.round(Math.max(14,Math.min(40,size*2)));
    return '<w:p><w:pPr><w:spacing w:after="'+after+'"/><w:rPr><w:sz w:val="'+halfPoints+'"/></w:rPr></w:pPr>'+
      '<w:r><w:rPr><w:sz w:val="'+halfPoints+'"/></w:rPr><w:t xml:space="preserve">'+esc(text)+'</w:t></w:r></w:p>';
  }
  function pageBreak(){
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }
  function officeDocument(body,dimension){
    const w=twip(Math.min(1190,Math.max(300,dimension.width||595.28)));
    const h=twip(Math.min(1684,Math.max(400,dimension.height||841.89)));
    const margin=twip(45);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+
      '<w:sectPr><w:pgSz w:w="'+w+'" w:h="'+h+'"/><w:pgMar w:top="'+margin+'" w:right="'+margin+'" w:bottom="'+margin+'" w:left="'+margin+'" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
  }
  async function asDocx(blocks,dimension){
    const zip=new root.JSZip();
    zip.file("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'+
      '</Types>');
    zip.file("_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'+
      '</Relationships>');
    zip.file("docProps/core.xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'+
      '<dc:creator>GRCON</dc:creator><dc:title>Documento convertido de PDF</dc:title></cp:coreProperties>');
    zip.file("word/document.xml",officeDocument(blocks.join(""),dimension));
    return zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
  }
  async function convert(file,{onProgress,signal}={}){
    if(!root.JSZip)throw new Error("O componente de criação do DOCX não está disponível.");
    if(!file||!/\.pdf$/i.test(file.name||"")||file.size<=0)throw new Error("Selecione um arquivo PDF válido.");
    if(file.size>MAX_INPUT)throw new Error("PDF acima de 20 MB. Selecione um arquivo menor.");
    failIfCancelled(signal);
    onProgress?.(4,"Lendo PDF");
    const buffer=await file.arrayBuffer(),magic=new Uint8Array(buffer,0,5);
    if(String.fromCharCode(...magic)!=="%PDF-")throw new Error("Arquivo inválido: a assinatura PDF não foi encontrada.");
    failIfCancelled(signal);
    const reader=await pdfjs();
    const task=reader.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,
      stopAtErrors:true,useSystemFonts:true,disableFontFace:true});
    const cancelled=()=>task.destroy();
    signal?.addEventListener("abort",cancelled,{once:true});
    try{
      const pdf=await task.promise;
      if(pdf.numPages>MAX_PAGES)throw new Error("PDF excede o limite de 300 páginas.");
      const blocks=[],warnings=[];
      let totalText=0,dimension={width:595.28,height:841.89},emptyPages=0;
      for(let n=1;n<=pdf.numPages;n++){
        failIfCancelled(signal);
        const page=await pdf.getPage(n);
        const viewport=page.getViewport({scale:1});
        if(n===1)dimension={width:viewport.width,height:viewport.height};
        const content=await page.getTextContent();
        const lines=pageLines(content);
        if(!lines.length)emptyPages++;
        for(let i=0;i<lines.length;i++){
          const line=lines[i],prev=lines[i-1];
          const gap=prev?prev.y-line.y:0;
          if(prev&&gap>Math.max(20,line.size*2.3))blocks.push(paragraph("",line.size,100));
          blocks.push(paragraph(line.text,line.size,gap>line.size*1.75?100:25));
          totalText+=line.text.length;
          if(totalText>MAX_CHARACTERS)throw new Error("PDF excede o limite de texto suportado.");
        }
        if(n<pdf.numPages)blocks.push(pageBreak());
        onProgress?.(7+Math.round(n/pdf.numPages*86),"Extraindo texto da página "+n+" de "+pdf.numPages);
        if(n%3===0)await new Promise(resolve=>setTimeout(resolve,0));
        page.cleanup();
      }
      if(totalText===0)throw new Error("Este PDF não contém texto selecionável. Documentos digitalizados precisam de OCR antes de serem convertidos.");
      warn(warnings,"PDF e Word utilizam diagramações diferentes: tabelas, imagens, fontes e espaçamentos devem ser conferidos.");
      if(emptyPages)warn(warnings,emptyPages+" página(s) sem texto selecionável não tiveram o conteúdo visual convertido.");
      if(pdf.numPages>1)warn(warnings,"As quebras entre páginas do PDF foram preservadas.");
      onProgress?.(95,"Montando DOCX editável");
      failIfCancelled(signal);
      const bytes=await asDocx(blocks,dimension);
      failIfCancelled(signal);
      onProgress?.(100,"DOCX pronto");
      return {bytes,pages:pdf.numPages,warnings};
    }catch(error){
      if(signal?.aborted)throw new DOMException("Conversão cancelada.","AbortError");
      if(error?.name==="PasswordException")throw new Error("O PDF está protegido por senha. Remova a proteção com autorização antes da conversão.");
      throw error;
    }finally{
      signal?.removeEventListener("abort",cancelled);
      await task.destroy().catch(()=>{});
    }
  }
  root.GrconDocxPdfCore=Object.freeze({convert,MAX_INPUT,formats:Object.freeze(["pdf"])});
})(window);
