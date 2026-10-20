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
      const moduleUrl=new URL("assets/vendor/pdfjs/pdf.min.mjs",document.baseURI);
      pdfjsPromise=import(moduleUrl.href).then(mod=>{
        mod.GlobalWorkerOptions.workerSrc=new URL("assets/vendor/pdfjs/pdf.worker.min.mjs",document.baseURI).href;
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

  // Modo visual: cada pagina PDF e renderizada pelo PDF.js e embutida como imagem
  // na mesma geometria no OOXML. Isto preserva o aspecto, NAO torna texto editavel.
  function drawing(pageNo, extentX, extentY){
    const id=pageNo, rid="rId"+(pageNo+1);
    return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="1" layoutInCell="1" allowOverlap="1">'+
      '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>'+
      '<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>'+
      '<wp:extent cx="'+extentX+'" cy="'+extentY+'"/><wp:wrapNone/>'+
      '<wp:docPr id="'+id+'" name="Pagina '+id+' do PDF" descr="Representacao visual da pagina '+id+'; conteudo nao editavel"/>'+
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'+
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'+
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="Pagina '+id+'.jpg"/><pic:cNvPicPr/></pic:nvPicPr>'+
      '<pic:blipFill><a:blip r:embed="'+rid+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+extentX+'" cy="'+extentY+'"/></a:xfrm>'+
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'+
      '</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
  }
  function visualDocument(paragraphs,firstDimension){
    // Margens nulas; as imagens flutuantes sao ancoradas em coordenadas da pagina.
    const w=twip(firstDimension.width),h=twip(firstDimension.height);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'+
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'+
      ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'+
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'+
      ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'+
      '<w:body>'+paragraphs.join('')+
      '<w:sectPr><w:pgSz w:w="'+w+'" w:h="'+h+'"/>'+
      '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>'+
      '</w:body></w:document>';
  }
  async function visualDocx(pdf,{onProgress,signal}){
    const zip=new root.JSZip(),paragraphs=[],relationships=[];
    const first=(await pdf.getPage(1)).getViewport({scale:1});
    let mixedSizes=false;
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Default Extension="jpg" ContentType="image/jpeg"/>'+
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
      '</Types>');
    zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
      '</Relationships>');
    for(let n=1;n<=pdf.numPages;n++){
      failIfCancelled(signal);
      const page=await pdf.getPage(n),view=page.getViewport({scale:1});
      if(Math.abs(view.width-first.width)>0.5||Math.abs(view.height-first.height)>0.5)mixedSizes=true;
      // 144 dpi para qualidade legivel sem transformar arquivos extensos em GB.
      const renderViewport=page.getViewport({scale:2});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(renderViewport.width);canvas.height=Math.ceil(renderViewport.height);
      const context=canvas.getContext('2d',{alpha:false});
      if(!context)throw new Error('O navegador nao oferece suporte a renderizacao Canvas.');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
      const renderTask=page.render({canvasContext:context,viewport:renderViewport,background:'#ffffff'});
      const abortRender=()=>renderTask.cancel();
      signal?.addEventListener('abort',abortRender,{once:true});
      try{await renderTask.promise;}
      finally{signal?.removeEventListener('abort',abortRender);}
      failIfCancelled(signal);
      const jpg=await new Promise((resolve,reject)=>
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao gerar a imagem da pagina '+n)), 'image/jpeg',.90));
      const filename='pagina-'+String(n).padStart(4,'0')+'.jpg';
      zip.file('word/media/'+filename,new Uint8Array(await jpg.arrayBuffer()),{compression:'STORE'});
      relationships.push('<Relationship Id="rId'+(n+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+filename+'"/>');
      const x=Math.round(view.width*12700),y=Math.round(view.height*12700);
      // Cada paragrafo pertence a pagina correspondente; posicionamento absoluto nao
      // consome o espaco vertical da pagina e evita criar folhas em branco.
      const pPr='<w:pPr>'+(n>1?'<w:pageBreakBefore/>':'')+
        '<w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>';
      paragraphs.push('<w:p>'+pPr+drawing(n,x,y)+'</w:p>');
      canvas.width=0;canvas.height=0;
      page.cleanup();
      onProgress?.(8+Math.round(84*n/pdf.numPages),'Preservando pagina '+n+' de '+pdf.numPages);
      if(n%2===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(mixedSizes)throw new Error('O modo visual ainda nao aceita PDFs com dimensoes ou orientacoes diferentes entre paginas; nenhum DOCX incompleto sera entregue.');
    zip.file('word/document.xml',visualDocument(paragraphs,first));
    zip.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+relationships.join('')+'</Relationships>');
    failIfCancelled(signal);
    onProgress?.(94,'Compactando documento visual');
    return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}});
  }

  async function convert(file,{onProgress,signal,mode='editable-layout'}={}){
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
      if(mode==='editable-layout'){
        if(!root.GrconPdfEditableLayout?.convert)throw new Error('O módulo local de reconstrução editável não está disponível.');
        const result=await root.GrconPdfEditableLayout.convert(pdf,{onProgress,signal,reader});
        failIfCancelled(signal);
        onProgress?.(100,'DOCX editável pronto');
        return result;
      }
      if(mode==='visual'){
        const bytes=await visualDocx(pdf,{onProgress,signal});
        failIfCancelled(signal);
        onProgress?.(100,'DOCX visual pronto');
        return {bytes,pages:pdf.numPages,mode:'visual',warnings:[
          'Copia visual fiel: cada pagina e uma imagem e seu conteudo nao e editavel no Word.',
          'Assinaturas digitais do PDF nao sao transferidas como assinaturas validas ao DOCX.'
        ]};
      }
      if(mode!=='editable-basic')throw new Error('Modo de conversao nao reconhecido.');
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
      return {bytes,pages:pdf.numPages,mode:'editable-basic',warnings};
    }catch(error){
      if(signal?.aborted)throw new DOMException("Conversão cancelada.","AbortError");
      if(error?.name==="PasswordException")throw new Error("O PDF está protegido por senha. Remova a proteção com autorização antes da conversão.");
      throw error;
    }finally{
      signal?.removeEventListener("abort",cancelled);
      await task.destroy().catch(()=>{});
    }
  }
  root.GrconDocxPdfCore=Object.freeze({convert,MAX_INPUT,formats:Object.freeze(['pdf']),modes:Object.freeze(['editable-layout','visual','editable-basic'])});
})(window);
