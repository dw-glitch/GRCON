(function(root){
  "use strict";
  // Reconstrucao OOXML: texto em caixas do Word editaveis, linhas e imagens independentes.
  // Nao rasteriza paginas inteiras e nao afirma equivalencia estrutural de tabelas.
  const NS='http://schemas.openxmlformats.org/package/2006/relationships';
  const esc=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const round=(value,d=2)=>Number(Number(value||0).toFixed(d));
  const pt=value=>round(value)+'pt';
  const rgb=values=>'#'+Array.from(values).slice(0,3).map(v=>{const n=Number(v)||0;return Math.max(0,Math.min(255,Math.round(n>1?n:n*255))).toString(16).padStart(2,'0');}).join('');
  const abort=signal=>{if(signal?.aborted)throw new DOMException('Conversão cancelada.','AbortError');};
  const note=(warnings,message)=>{if(!warnings.includes(message))warnings.push(message);};
  const pageStyle=(x,y,w,h,z=1)=>'position:absolute;margin-left:'+pt(x)+';margin-top:'+pt(y)+';width:'+pt(w)+';height:'+pt(h)+';z-index:'+z+';mso-position-horizontal-relative:page;mso-position-vertical-relative:page';
  const shapeId=id=>'grcon_shape_'+id;
  const textShape=(id,item,view,style)=>{
    const tr=item.transform||[0,0,0,0,0,0];
    const font=Math.max(5,Math.min(72,Math.hypot(Number(tr[2])||0,Number(tr[3])||0)||Number(item.height)||11));
    const pos=view.convertToViewportPoint(Number(tr[4])||0,Number(tr[5])||0);
    const x=Math.max(0,pos[0]-4.4),y=Math.max(0,pos[1]-font*.84-4.2);
    // Word pode usar uma fonte substituta; uma folga de largura diminui quebra de linha.
    const width=Math.max(4,Math.min(view.width-x,Math.max(Number(item.width)||0,item.str.length*font*.28)*1.19+8));
    const height=Math.max(9,font*1.5+6);
    const family=String(style?.fontFamily||'Arial').split(',')[0].replace(/^["']|["']$/g,'').slice(0,70);
    const bold=/bold|black|heavy|demi/i.test(item.fontName+' '+family);
    const italic=/italic|oblique/i.test(item.fontName+' '+family);
    const sz=Math.round(font*2);
    const rpr='<w:rPr><w:rFonts w:ascii="'+esc(family)+'" w:hAnsi="'+esc(family)+'"/>'+
      '<w:sz w:val="'+sz+'"/>'+(bold?'<w:b/>':'')+(italic?'<w:i/>':'')+'</w:rPr>';
    return '<w:r><w:pict><v:shape id="'+shapeId(id)+'" type="#_x0000_t202" style="'+pageStyle(x,y,width,height,2)+'" stroked="f" filled="f">'+
      '<v:textbox inset="0,0,0,0"><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="'+Math.max(200,Math.round(font*20*1.12))+'" w:lineRule="exact"/></w:pPr>'+
      '<w:r>'+rpr+'<w:t xml:space="preserve">'+esc(item.str)+'</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>';
  };
  const lineShape=(id,line,view)=>{
    const a=view.convertToViewportPoint(line.x1,line.y1),b=view.convertToViewportPoint(line.x2,line.y2);
    if(!a.every(Number.isFinite)||!b.every(Number.isFinite))return '';
    return '<w:r><w:pict><v:line id="'+shapeId(id)+'" from="'+pt(a[0])+','+pt(a[1])+'" to="'+pt(b[0])+','+pt(b[1])+
      '" strokecolor="'+line.color+'" strokeweight="'+pt(Math.max(.35,Math.min(3,line.weight)))+
      '" style="position:absolute;z-index:0;mso-position-horizontal-relative:page;mso-position-vertical-relative:page"/></w:pict></w:r>';
  };
  const fillShape=(id,rect,view)=>{
    const corners=rect.points.map(p=>view.convertToViewportPoint(p[0],p[1]));
    const left=Math.min(...corners.map(p=>p[0])),top=Math.min(...corners.map(p=>p[1]));
    const width=Math.max(.1,Math.max(...corners.map(p=>p[0]))-left);
    const height=Math.max(.1,Math.max(...corners.map(p=>p[1]))-top);
    return '<w:r><w:pict><v:rect id="'+shapeId(id)+'" style="'+pageStyle(left,top,width,height,0)+
      '" filled="t" fillcolor="'+rect.color+'" stroked="f"/></w:pict></w:r>';
  };
  const imageShape=(id,image,view,rId)=>{
    const corners=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>{
      const m=image.matrix;
      return view.convertToViewportPoint(m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]);
    });
    const x=Math.max(0,Math.min(...corners.map(v=>v[0])));
    const y=Math.max(0,Math.min(...corners.map(v=>v[1])));
    const w=Math.max(.1,Math.max(...corners.map(v=>v[0]))-x);
    const h=Math.max(.1,Math.max(...corners.map(v=>v[1]))-y);
    return '<w:r><w:pict><v:rect id="'+shapeId(id)+'" style="'+pageStyle(x,y,w,h,1)+
      '" stroked="f"><v:imagedata r:id="'+rId+'" o:title="Imagem do PDF"/></v:rect></w:pict></w:r>';
  };
  const multiply=(m,n)=>[
    m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],
    m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],
    m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]
  ];
  const project=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  function graphics(ops,OPS,warnings){
    let matrix=[1,0,0,1,0,0],color='#000000',fillColor='#000000',weight=.8,pen=null,start=null,pending=[],pendingRects=[];
    const stack=[],lines=[],images=[],fills=[];
    const emit=(from,to)=>{if(from&&to&&lines.length<3500)pending.push({x1:from[0],y1:from[1],x2:to[0],y2:to[1],color,weight});};
    for(let i=0;i<ops.fnArray.length;i++){
      const fn=ops.fnArray[i],args=ops.argsArray[i]||[];
      if(fn===OPS.save){stack.push({matrix:[...matrix],color,fillColor,weight});continue;}
      if(fn===OPS.restore){const old=stack.pop();if(old){matrix=old.matrix;color=old.color;fillColor=old.fillColor;weight=old.weight;}continue;}
      if(fn===OPS.transform){matrix=multiply(matrix,args);continue;}
      if(fn===OPS.setStrokeRGBColor){color=rgb(args);continue;}
      if(fn===OPS.setFillRGBColor){fillColor=rgb(args);continue;}
      if(fn===OPS.setLineWidth){weight=Math.max(.3,Math.min(4,Number(args[0])||.8));continue;}
      if(fn===OPS.constructPath){
        let offset=0;const pathOps=args[0]||[],coords=args[1]||[];
        for(const command of pathOps){
          if(command===OPS.moveTo){pen=project(matrix,coords[offset++],coords[offset++]);start=pen;}
          else if(command===OPS.lineTo){const next=project(matrix,coords[offset++],coords[offset++]);emit(pen,next);pen=next;}
          else if(command===OPS.rectangle){
            const x=coords[offset++],y=coords[offset++],w=coords[offset++],h=coords[offset++];
            const pts=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>project(matrix,...p));
            for(let j=0;j<4;j++)emit(pts[j],pts[(j+1)%4]);pendingRects.push({points:pts,color:fillColor});pen=pts[0];start=pts[0];
          }else if(command===OPS.curveTo){offset+=6;pen=project(matrix,coords[offset-2],coords[offset-1]);}
          else if(command===OPS.curveTo2||command===OPS.curveTo3){offset+=4;pen=project(matrix,coords[offset-2],coords[offset-1]);}
          else if(command===OPS.closePath){emit(pen,start);pen=start;}
        }
        continue;
      }
      if(fn===OPS.stroke||fn===OPS.closeStroke||fn===OPS.fillStroke||fn===OPS.eoFillStroke||fn===OPS.closeFillStroke||fn===OPS.closeEOFillStroke){
        for(const line of pending)if(lines.length<3500)lines.push(line);
        if(fn!==OPS.stroke&&fn!==OPS.closeStroke){for(const rect of pendingRects)if(fills.length<5000)fills.push(rect);}
        pending=[];pendingRects=[];continue;
      }
      if(fn===OPS.fill||fn===OPS.eoFill){for(const rect of pendingRects)if(fills.length<5000)fills.push(rect);pending=[];pendingRects=[];continue;}
      if(fn===OPS.endPath){pending=[];pendingRects=[];continue;}
      if(fn===OPS.paintImageXObject||fn===OPS.paintJpegXObject){
        if(images.length<100)images.push({name:args[0],matrix:[...matrix]});continue;
      }
      if(fn===OPS.paintInlineImageXObject){
        if(images.length<100)images.push({inline:args[0],matrix:[...matrix]});
      }
    }
    if(lines.length>=3500)note(warnings,'Há páginas com milhares de traços vetoriais; parte dos desenhos pode requerer revisão.');
    return {lines,images,fills};
  }
  async function encodeImage(source,reader){
    if(!source?.width||!source?.height||source.width*source.height>16000000)return null;
    if(!source.data)return null;
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const context=canvas.getContext('2d');if(!context)return null;
    const image=context.createImageData(source.width,source.height),data=source.data,rgba=image.data;
    const kind=source.kind;
    const gray=reader.ImageKind?.GRAYSCALE_1BPP, rgb24=reader.ImageKind?.RGB_24BPP,rgba32=reader.ImageKind?.RGBA_32BPP;
    if(kind===rgba32||data.length===rgba.length)rgba.set(data);
    else if(kind===rgb24||data.length===source.width*source.height*3){
      for(let j=0,k=0;j<data.length;j+=3,k+=4){rgba[k]=data[j];rgba[k+1]=data[j+1];rgba[k+2]=data[j+2];rgba[k+3]=255;}
    }else if(kind===gray){
      for(let i=0;i<source.width*source.height;i++){
        const b=(data[i>>3]>>(7-(i%8)))&1,c=b?255:0,k=i*4;rgba[k]=c;rgba[k+1]=c;rgba[k+2]=c;rgba[k+3]=255;
      }
    }else return null;
    context.putImageData(image,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    canvas.width=canvas.height=0;
    return blob?new Uint8Array(await blob.arrayBuffer()):null;
  }
  async function convert(pdf,{onProgress,signal,reader}={}){
    const warnings=[],zip=new root.JSZip(),paragraphs=[],relations=[];
    const first=(await pdf.getPage(1)).getViewport({scale:1}),total=pdf.numPages;
    let texts=0,imageNo=0,shapeNo=0,empty=0;
    const r=(name,target)=>relations.push('<Relationship Id="'+name+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+target+'"/>');
    for(let n=1;n<=total;n++){
      abort(signal);
      const page=await pdf.getPage(n),view=page.getViewport({scale:1});
      if(Math.abs(view.width-first.width)>.5||Math.abs(view.height-first.height)>.5)
        throw new Error('As páginas deste PDF possuem tamanhos ou orientações mistos; o layout editável ainda não pode preservar isso com segurança.');
      const content=await page.getTextContent();
      const items=(content.items||[]).filter(x=>typeof x.str==='string'&&x.str.trim());
      if(!items.length)empty++;
      const operations=await page.getOperatorList();
      const parsed=graphics(operations,reader.OPS,warnings);
      let drawing='';
      for(const rect of parsed.fills)drawing+=fillShape(++shapeNo,rect,view);
      for(const line of parsed.lines)drawing+=lineShape(++shapeNo,line,view);
      for(const graphic of parsed.images){
        abort(signal);
        let source=null;
        try{source=graphic.inline||page.objs.get(graphic.name);}catch(_){}
        const png=await encodeImage(source,reader);
        if(!png){note(warnings,'Algumas imagens ou elementos vetoriais complexos podem não ter sido reconstruídos.');continue;}
        const name='imagem-'+(++imageNo)+'.png',rid='rId'+(imageNo+1);
        zip.file('word/media/'+name,png);r(rid,name);
        drawing+=imageShape(++shapeNo,graphic,view,rid);
      }
      for(const item of items){drawing+=textShape(++shapeNo,item,view,content.styles?.[item.fontName]);texts+=item.str.length;}
      // Uma âncora mínima por página; os conteúdos são objetos Word e podem ser editados.
      paragraphs.push('<w:p><w:pPr>'+(n>1?'<w:pageBreakBefore/>':'')+
        '<w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>'+drawing+'</w:p>');
      page.cleanup();
      onProgress?.(7+Math.round(86*n/total),'Reconstruindo elementos editáveis: página '+n+' de '+total);
      if(n%2===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(!texts)throw new Error('Este PDF não contém texto selecionável. OCR é necessário para criar um DOCX editável.');
    if(empty)note(warnings,empty+' página(s) sem texto selecionável; verifique se contêm digitalizações.');
    note(warnings,'Texto em caixas editáveis e traços independentes; tabelas complexas ainda não são tabelas nativas do Word.');
    note(warnings,'Fontes, curvas e figuras podem diferir do PDF. Confirme visualmente antes do uso oficial.');
    const width=Math.round(first.width*20),height=Math.round(first.height*20);
    const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'+
      ' xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"'+
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
      '<w:body>'+paragraphs.join('')+
      '<w:sectPr><w:pgSz w:w="'+width+'" w:h="'+height+'"/>'+
      '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>';
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Default Extension="png" ContentType="image/png"/>'+
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
      '</Types>');
    zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?>'+
      '<Relationships xmlns="'+NS+'">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
      '</Relationships>');
    zip.file('word/document.xml',document);
    zip.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8"?>'+
      '<Relationships xmlns="'+NS+'">'+relations.join('')+'</Relationships>');
    abort(signal);
    onProgress?.(96,'Montando o Word editável');
    const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:5}});
    abort(signal);
    return {bytes,pages:total,mode:'editable-layout',warnings};
  }
  root.GrconPdfEditableLayout=Object.freeze({convert});
})(window);
