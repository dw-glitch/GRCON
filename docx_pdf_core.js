(function(root){
  "use strict";
  // Conversor inicial, local e sem envio de arquivos. Não é um mecanismo de
  // diagramação Office: informa explicitamente quando recursos não são fiéis.
  const MAX_INPUT = 20 * 1024 * 1024;
  const MAX_XML = 12 * 1024 * 1024;
  const MAX_BLOCKS = 7000;
  const MAX_PAGES = 300;
  const EMU_PER_POINT = 12700;
  const child = (node, name) => node ? Array.from(node.children || []).find(el => el.localName === name) || null : null;
  const descendants = (node, name) => node ? Array.from(node.getElementsByTagNameNS("*", name)) : [];
  const attr = (node, name) => node?.getAttribute(name) ?? node?.getAttribute("w:" + name) ?? node?.getAttribute("r:" + name) ?? null;
  const number = (value, fallback) => value == null || value === "" ? fallback : Number.isFinite(Number(value)) ? Number(value) : fallback;
  const twips = (value, fallback) => number(value, fallback * 20) / 20;
  const warn = (warnings, message) => { if (!warnings.includes(message)) warnings.push(message); };
  const xml = (str) => {
    const doc = new DOMParser().parseFromString(str, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Estrutura XML do DOCX inválida.");
    return doc;
  };
  function normalizedText(value, warnings) {
    let changed = false;
    const replacements = { "\u2010":"-", "\u2011":"-", "\u2212":"-", "\u2026":"...", "\u2022":"-", "\u200b":"", "\u00a0":" ", "\u2028":"\n", "\u2018":"'", "\u2019":"'", "\u201c":"\"", "\u201d":"\"" };
    const clean = Array.from(String(value || ""), char => {
      if (replacements[char] !== undefined) return replacements[char];
      const code = char.codePointAt(0);
      if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255) || [0x20ac,0x2013,0x2014,0x2019,0x2018,0x201c,0x201d,0x2026].includes(code) || char === "\n") return char;
      changed = true; return "?";
    }).join("");
    if (changed) warn(warnings, "Alguns caracteres fora do alfabeto latino foram substituídos.");
    return clean;
  }
  function contentPart(runs, element, warnings) {
    const formatting = child(element,"rPr");
    const bold = Boolean(child(formatting,"b"));
    const italic = Boolean(child(formatting,"i"));
    let text = "";
    for (const node of Array.from(element.children || [])) {
      if (node.localName === "t") text += node.textContent || "";
      else if (node.localName === "tab") text += "    ";
      else if (node.localName === "br") text += attr(node,"type") === "page" ? "\n" : "\n";
      else if (node.localName === "cr") text += "\n";
      else if (node.localName === "noBreakHyphen") text += "-";
    }
    if (text) runs.push({ text: normalizedText(text,warnings), bold, italic });
  }
  function extractParagraph(p, warnings) {
    const pPr = child(p,"pPr"), style = attr(child(pPr,"pStyle"),"val") || "";
    const heading = /^Heading([1-6])$|^T[ií]tulo([1-6])$/i.exec(style);
    const align = attr(child(pPr,"jc"),"val") || "left";
    const spacing = child(pPr,"spacing"), indent = child(pPr,"ind");
    const level = heading ? Number(heading[1] || heading[2]) : 0;
    const runs = [];
    for (const el of Array.from(p.children || [])) {
      if (el.localName === "r") contentPart(runs,el,warnings);
      else if (el.localName === "hyperlink" || el.localName === "smartTag" || el.localName === "sdt") {
        for (const run of descendants(el,"r")) contentPart(runs,run,warnings);
      }
    }
    const numPr = child(pPr,"numPr"), list = Boolean(numPr || /ListParagraph/i.test(style));
    if (list) { runs.unshift({text:"- ",bold:false,italic:false}); warn(warnings,"Marcadores e numeração foram simplificados."); }
    const drawings = descendants(p,"drawing");
    if (drawings.length) warn(warnings,"Figuras são posicionadas como blocos; podem diferir do Word.");
    const images = [];
    for (const drawing of drawings) {
      const blip = descendants(drawing,"blip")[0];
      const extent = descendants(drawing,"extent")[0];
      const rid = attr(blip,"embed");
      if (rid) images.push({rid,width:number(attr(extent,"cx"),0)/EMU_PER_POINT,height:number(attr(extent,"cy"),0)/EMU_PER_POINT});
    }
    if (descendants(p,"pict").length || descendants(p,"object").length) warn(warnings,"Objetos vetoriais ou incorporados não são reproduzidos.");
    if (descendants(p,"footnoteReference").length || descendants(p,"endnoteReference").length) warn(warnings,"Notas de rodapé e notas finais não são reproduzidas.");
    if (align === "both" || align === "distribute") warn(warnings,"O alinhamento justificado foi adaptado.");
    return {kind:"paragraph",runs,images,heading:level,align,
      before:twips(attr(spacing,"before"),level ? 10 : 0),
      after:twips(attr(spacing,"after"),level ? 5 : 4),
      left:twips(attr(indent,"left"),0),
      first:twips(attr(indent,"firstLine"),0),
      pageBefore:Boolean(child(pPr,"pageBreakBefore"))};
  }
  function extractTable(tbl,warnings){
    const rows = [];
    for(const tr of Array.from(tbl.children||[]).filter(x=>x.localName==="tr")){
      const cells=[];
      for(const tc of Array.from(tr.children||[]).filter(x=>x.localName==="tc")){
        const paragraphs = Array.from(tc.children||[]).filter(x=>x.localName==="p");
        cells.push(paragraphs.map(p=>extractParagraph(p,warnings).runs.map(r=>r.text).join("")).join("\n"));
        if(child(child(tc,"tcPr"),"gridSpan")) warn(warnings,"Mesclagem de células foi simplificada.");
      }
      if(cells.length) rows.push(cells);
    }
    warn(warnings,"Tabelas foram recriadas com dimensões adaptadas.");
    return {kind:"table",rows};
  }
  async function readDocx(file,jszip,onProgress,signal){
    if(!file || !/\.docx$/i.test(file.name||"")) throw new Error("Selecione um documento .docx válido.");
    if(file.size > MAX_INPUT) throw new Error("DOCX acima de 20 MB. Use um arquivo menor.");
    const bytes=await file.arrayBuffer();
    if(signal?.aborted) throw new DOMException("Operação cancelada.","AbortError");
    const header=new Uint8Array(bytes,0,Math.min(4,bytes.byteLength));
    if(header[0]!==80 || header[1]!==75) throw new Error("O arquivo não é um pacote DOCX válido.");
    const zip=await jszip.loadAsync(bytes,{checkCRC32:true});
    if(Object.keys(zip.files).length > 600) throw new Error("Documento excede o limite de componentes suportados.");
    const entry=zip.file("word/document.xml");
    if(!entry) throw new Error("O arquivo não contém o documento principal do Word.");
    if((entry._data?.uncompressedSize||0)>MAX_XML) throw new Error("Conteúdo XML excede o limite seguro.");
    const source=await entry.async("string");
    if(source.length>MAX_XML) throw new Error("Conteúdo XML excede o limite seguro.");
    onProgress?.(15,"Analisando estrutura do Word");
    const warnings=[];
    const doc=xml(source), body=descendants(doc,"body")[0];
    if(!body) throw new Error("Estrutura do documento não reconhecida.");
    const blocks=[];
    for(const n of Array.from(body.children||[])){
      if(n.localName==="p") blocks.push(extractParagraph(n,warnings));
      else if(n.localName==="tbl") blocks.push(extractTable(n,warnings));
      else if(n.localName==="sectPr") continue;
      else warn(warnings,"Alguns elementos avançados foram ignorados.");
      if(blocks.length>MAX_BLOCKS) throw new Error("Documento longo demais para conversão local.");
    }
    const hasContent=blocks.some(b=>b.kind==="table"&&b.rows.length || b.kind==="paragraph"&&(b.runs.some(r=>r.text.trim())||b.images.length));
    if(!hasContent) throw new Error("Documento sem conteúdo compatível para conversão.");
    const sect=descendants(body,"sectPr")[0];
    const pgSz=child(sect,"pgSz"), mar=child(sect,"pgMar");
    const pageWidth=Math.max(300,Math.min(1190,twips(attr(pgSz,"w"),595.28)));
    const pageHeight=Math.max(400,Math.min(1684,twips(attr(pgSz,"h"),841.89)));
    const margins={
      top:Math.min(115,Math.max(30,twips(attr(mar,"top"),62))),
      bottom:Math.min(115,Math.max(30,twips(attr(mar,"bottom"),62))),
      left:Math.min(115,Math.max(30,twips(attr(mar,"left"),59))),
      right:Math.min(115,Math.max(30,twips(attr(mar,"right"),59)))
    };
    const relationEntry=zip.file("word/_rels/document.xml.rels");
    const relationships=new Map();
    if(relationEntry){
      const relSource=await relationEntry.async("string");
      if(relSource.length<MAX_XML){
        for(const item of descendants(xml(relSource),"Relationship")){
          const id=attr(item,"Id"),target=attr(item,"Target");
          if(id && target && !/^(?:https?:|\/)/i.test(target)){
            const clean=target.replace(/^(\.\.\/)+/g,"").replace(/\\/g,"/");
            if(!clean.includes("..")) relationships.set(id,clean.startsWith("word/")?clean:"word/"+clean.replace(/^\//,""));
          }
        }
      }
    }
    if(Object.keys(zip.files).some(name=>/^word\/(?:header|footer)[0-9]+\.xml$/.test(name))) warn(warnings,"Cabeçalhos e rodapés do Word não são reproduzidos.");
    if(Object.keys(zip.files).some(name=>/word\/(?:comments|footnotes|endnotes|charts)\//.test(name))) warn(warnings,"Comentários, notas ou gráficos avançados exigem conferência no Word.");
    return {blocks,warnings,pageWidth,pageHeight,margins,zip,relationships};
  }
  function createFontMap(doc,lib){
    const face=lib.StandardFonts;
    return Promise.all([face.Helvetica,face.HelveticaBold,face.HelveticaOblique,face.HelveticaBoldOblique].map(k=>doc.embedFont(k)))
      .then(a=>({normal:a[0],bold:a[1],italic:a[2],both:a[3]}));
  }
  async function render(model,lib,onProgress,signal){
    const pdf=await lib.PDFDocument.create();
    pdf.setCreator("GRCON");pdf.setProducer("GRCON - Conversão documental local");pdf.setTitle("Documento convertido de DOCX");
    const fonts=await createFontMap(pdf,lib);
    const dark=lib.rgb(.14,.23,.31),grid=lib.rgb(.79,.85,.89);
    const {pageWidth:W,pageHeight:H,margins:m}=model;
    let page=null, y=0;
    const available=W-m.left-m.right;
    const pageNew=()=>{
      if(pdf.getPageCount()>=MAX_PAGES)throw new Error("Documento excedeu o limite de 300 páginas.");
      page=pdf.addPage([W,H]);y=H-m.top;
    };
    const ensure=(height)=>{
      if(!page || y-height < m.bottom)pageNew();
    };
    const fontOf=r=>fonts[r.bold&&r.italic?"both":r.bold?"bold":r.italic?"italic":"normal"];
    function wrapTokens(runs,size,width){
      const lines=[[]];let lineWidth=0;
      const endline=()=>{lines.push([]);lineWidth=0;};
      for(const r of runs){
        const font=fontOf(r);
        for(const part of r.text.split(/(\n|\s+)/)){
          if(!part)continue;
          if(part==="\n"){endline();continue;}
          const sizePart=font.widthOfTextAtSize(part,size);
          if(!part.trim() && lineWidth===0)continue;
          if(lineWidth+sizePart>width && lineWidth>0){endline();if(!part.trim())continue;}
          if(sizePart>width){
            let buffer="";
            for(const ch of part){
              if(font.widthOfTextAtSize(buffer+ch,size)>width && buffer){lines[lines.length-1].push({text:buffer,font,width:font.widthOfTextAtSize(buffer,size)});endline();buffer="";}
              buffer+=ch;
            }
            if(buffer){const w=font.widthOfTextAtSize(buffer,size);lines[lines.length-1].push({text:buffer,font,width:w});lineWidth+=w;}
          }else{lines[lines.length-1].push({text:part,font,width:sizePart});lineWidth+=sizePart;}
        }
      }
      return lines;
    }
    function drawParagraph(b){
      const size=b.heading?Math.max(11,18-(b.heading-1)*1.3):10.5;
      const lineHeight=size*1.32;
      const space=Math.min(32,Math.max(0,b.before));
      ensure(space+lineHeight);
      y-=space;
      const lineMax=available-Math.max(0,b.left);
      const lines=wrapTokens(b.runs,size,Math.max(100,lineMax));
      for(let i=0;i<lines.length;i++){
        ensure(lineHeight);
        const line=lines[i]; const w=line.reduce((sum,t)=>sum+t.width,0);
        let x=m.left+Math.max(0,b.left)+(i===0?Math.max(-20,Math.min(50,b.first)):0);
        if(b.align==="center")x=m.left+Math.max(0,(available-w)/2);
        else if(b.align==="right")x=m.left+Math.max(0,available-w);
        for(const token of line){page.drawText(token.text,{x,y:y-size,font:token.font,size,color:dark});x+=token.width;}
        y-=lineHeight;
      }
      y-=Math.min(22,Math.max(2,b.after));
    }
    function drawTable(t){
      for(const row of t.rows){
        const widths=available/Math.max(1,row.length);
        const layouts=row.map(v=>wrapTokens([{text:normalizedText(v,model.warnings),bold:false,italic:false}],9,Math.max(30,widths-12)));
        const required=Math.max(21,...layouts.map(lines=>lines.length*12+10));
        if(required > H-m.top-m.bottom-12) throw new Error("Uma linha de tabela é alta demais para uma página. Ajuste a tabela no Word.");
        ensure(required+3);
        let x=m.left;
        row.forEach((value,i)=>{
          page.drawRectangle({x,y:y-required,width:widths,height:required,borderColor:grid,borderWidth:.7});
          let yy=y-12;
          for(const line of layouts[i]){
            let xx=x+6;
            for(const token of line){page.drawText(token.text,{x:xx,y:yy,font:token.font,size:9,color:dark});xx+=token.width;}
            yy-=12;
          }
          x+=widths;
        });
        y-=required;
      }
      y-=10;
    }
    async function drawImage(img){
      const path=model.relationships.get(img.rid);
      const entry=path&&model.zip.file(path);
      if(!entry){warn(model.warnings,"Uma imagem não pôde ser localizada no DOCX.");return;}
      const lower=path.toLowerCase();
      if(!/\.(?:png|jpg|jpeg)$/.test(lower)){warn(model.warnings,"Imagem com formato não suportado foi ignorada.");return;}
      try{
        if((entry._data?.uncompressedSize||0)>8*1024*1024)throw new Error("imagem excessivamente grande");
        const bytes=await entry.async("uint8array");
        const embedded=lower.endsWith(".png")?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
        const natural=embedded.scale(1);
        const scale=Math.min(1,available/Math.max(1,img.width||natural.width),((H-m.top-m.bottom)*.75)/Math.max(1,img.height||natural.height));
        const width=Math.max(1,(img.width||natural.width)*scale),height=Math.max(1,(img.height||natural.height)*scale);
        ensure(Math.min(H-m.top-m.bottom-10,height)+8);
        page.drawImage(embedded,{x:m.left,y:y-height,width,height});y-=height+9;
      }catch(e){warn(model.warnings,"Uma imagem não pôde ser convertida. Confira o original.");}
    }
    pageNew();
    for(let i=0;i<model.blocks.length;i++){
      if(signal?.aborted)throw new DOMException("Conversão cancelada.","AbortError");
      const b=model.blocks[i];
      if(b.pageBefore&&i)pageNew();
      if(b.kind==="table")drawTable(b);
      else{
        drawParagraph(b);
        for(const img of b.images)await drawImage(img);
      }
      if(i%15===0){onProgress?.(20+Math.round(i/Math.max(1,model.blocks.length)*73),"Preparando páginas do PDF");await new Promise(r=>setTimeout(r,0));}
    }
    onProgress?.(95,"Finalizando PDF");
    const result=await pdf.save({useObjectStreams:true});
    return {bytes:result,pages:pdf.getPageCount(),warnings:model.warnings};
  }
  async function convert(file,{onProgress,signal}={}){
    const jszip=root.JSZip,lib=root.PDFLib;
    if(!jszip||!lib?.PDFDocument)throw new Error("Os componentes do conversor não foram carregados. Reabra a ferramenta.");
    onProgress?.(5,"Lendo DOCX");
    const model=await readDocx(file,jszip,onProgress,signal);
    const result=await render(model,lib,onProgress,signal);
    onProgress?.(100,"PDF pronto");
    return result;
  }
  root.GrconDocxPdfCore=Object.freeze({convert,MAX_INPUT,formats:Object.freeze(["docx"])});
})(window);
