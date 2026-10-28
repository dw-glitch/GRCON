(function(root){
 'use strict';
 function text(v){return v==null?'':String(v);}
 function xmlEscape(v){return text(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
 function a1col(field){
  if(field==='workflow')return 'C';
  if(field==='databook')return 'J';
  if(/^N[1-6]$/.test(field))return String.fromCharCode(74+Number(field.slice(1)));
  throw Error('Este campo não pertence às células editáveis do modelo oficial: '+field);
 }
 function originalValue(row,field){return /^N[1-6]$/.test(field)?text((row.levels||[])[Number(field.slice(1))-1]):text(row[field]);}
 function findSheetPart(zip,name){
  return Promise.all([zip.file('xl/workbook.xml')?.async('string'),zip.file('xl/_rels/workbook.xml.rels')?.async('string')]).then(([workbook,rels])=>{
   if(!workbook||!rels)throw Error('Relações internas do Excel indisponíveis.');
   const tag=Array.from(workbook.matchAll(/<sheet\b[^>]*\/>/g)).map(x=>x[0]).find(t=>new RegExp('\\bname="'+name+'"').test(t));
   if(!tag)throw Error('Aba GERAL ausente no arquivo original.');
   const relId=tag.match(/\br:id="([^"]+)"/)?.[1];
   const rel=Array.from(rels.matchAll(/<Relationship\b[^>]*\/>/g)).map(x=>x[0]).find(t=>t.includes('Id="'+relId+'"'));
   const target=rel?.match(/\bTarget="([^"]+)"/)?.[1];
   const part=target?.startsWith('/')?target.slice(1):'xl/'+(target||'').replace(/^\.\//,'');
   if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(part)||!zip.file(part))throw Error('A origem da aba GERAL é inválida.');
   return part;
  });
 }
 function replaceCell(xml,ref,value){
  const cellRe=new RegExp('<c\\b[^>]*\\br="'+ref+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
  const matched=xml.match(cellRe),newValue='<is><t xml:space="preserve">'+xmlEscape(value)+'</t></is>';
  if(matched){
   if(/<f(?:\s|>)/.test(matched[0]))throw Error('A célula '+ref+' contém fórmula e não pode ser substituída.');
   const open=matched[0].match(/^<c\b([^>]*?)(?:\/>|>)/);
   if(!open)throw Error('Célula XLSX ilegível: '+ref);
   const attrs=open[1].replace(/\s+t="[^"]*"/g,'');
   return xml.replace(matched[0],'<c'+attrs+' t="inlineStr">'+newValue+'</c>');
  }
  const number=Number(ref.match(/\d+$/)?.[0]);
  const rowRe=new RegExp('(<row\\b[^>]*\\br="'+number+'"[^>]*>)([\\s\\S]*?)(<\\/row>)');
  const match=xml.match(rowRe);if(!match)throw Error('Linha '+number+' não encontrada no XML original.');
  const colIndex=ref.match(/^[A-Z]+/)?.[0];
  const rank=x=>[...x].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  const cells=[...match[2].matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)];
  const next=cells.find(c=>rank(c[1])>rank(colIndex));
  const insert='<c r="'+ref+'" t="inlineStr">'+newValue+'</c>';
  const body=next?match[2].slice(0,next.index)+insert+match[2].slice(next.index):match[2]+insert;
  return xml.replace(match[0],match[1]+body+match[3]);
 }
 async function revise(input,engine){
  const {XLSX,JSZip,C}=engine,{file,rows,events,sourceHash,contract}=input;
  if(!file||!Array.isArray(rows)||!rows.length||!sourceHash||!/^[a-f0-9]{64}$/.test(sourceHash))throw Error('Análise e SHA-256 da origem são obrigatórios.');
  if(!/\.xlsx$/i.test(file.name)||file.size>30*1024*1024)throw Error('Use a alocação XLSX de até 30 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==sourceHash)throw Error('Arquivo diferente do importado. A correção foi bloqueada por integridade.');
  const book=XLSX.read(bytes,{type:'array',cellFormula:true,cellDates:true,bookVBA:false});
  if(!book.Sheets.GERAL)throw Error('A alocação deve possuir a aba oficial GERAL.');
  const parsed=C.parseRows(XLSX.utils.sheet_to_json(book.Sheets.GERAL,{header:1,defval:'',raw:true}),{sourceFile:file.name,sourceSheet:'GERAL',contract});
  if(parsed.model!=='official-16')throw Error('A revisão direta só admite o padrão oficial de 16 colunas.');
  const originalByRow=new Map(parsed.records.map(r=>[r.sourceRow,r]));
  const reviewedByLineage=new Map(rows.filter(r=>r.sourceFile===file.name&&r.sourceSheet==='GERAL'&&r.officialAllocation&&r.contract===contract).map(r=>[r.lineage,r]));
  if(reviewedByLineage.size!==rows.length||originalByRow.size!==rows.length)throw Error('Quantidade ou identidade dos documentos mudou desde a auditoria.');
  const approved=C.approvedChanges(events||[]).filter(e=>e.field==='workflow'||e.field==='databook'||/^N[1-6]$/.test(e.field));
  if(!approved.length)throw Error('Nenhuma correção de célula oficial foi aprovada com evidência.');
  const replacements=[],seen=new Set();
  for(const event of approved){
   const row=reviewedByLineage.get(event.lineage);
   if(!row||!event.humanReview||!Array.isArray(event.evidence)||!event.evidence.some(x=>text(x).trim())||!event.actor||!event.justification)throw Error('A correção não tem aprovação humana e evidência comprovada.');
   const original=originalByRow.get(row.sourceRow);
   if(!original||original.document!==row.document||original.sourceRow!==row.sourceRow||original.allocation!==row.allocation && original.allocation)throw Error('Código ou linha diferente da origem auditada.');
   const column=a1col(event.field),cell=column+row.sourceRow;
   const current=text(book.Sheets.GERAL[cell]?.v),before=originalValue(original,event.field),after=text(event.after);
   if(before!==current||text(event.before)!==before)throw Error('Valor original divergente na célula '+cell+'. Reimporte o arquivo.');
   if(book.Sheets.GERAL[cell]?.f)throw Error('A célula '+cell+' contém fórmula. Ajuste na origem.');
   if(!after.trim()||after.length>2000||after===before)throw Error('A correção aprovada em '+cell+' está vazia ou não altera o original.');
   if(seen.has(cell))throw Error('Mais de uma correção para '+cell);seen.add(cell);
   replacements.push({cell,after,document:row.document,field:event.field,before});
  }
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true}),path=await findSheetPart(zip,'GERAL');
  let xml=await zip.file(path).async('string');
  for(const change of replacements)xml=replaceCell(xml,change.cell,change.after);
  zip.file(path,xml);
  const output=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  const verify=XLSX.read(output,{type:'array',cellFormula:true,cellDates:true,bookVBA:false});
  for(const change of replacements)if(text(verify.Sheets.GERAL[change.cell]?.v)!==change.after)throw Error('Falha na verificação da célula '+change.cell);
  const originalSheet=book.Sheets.GERAL,finalSheet=verify.Sheets.GERAL;
  const allCells=new Set([...Object.keys(originalSheet),...Object.keys(finalSheet)].filter(x=>!x.startsWith('!')));
  for(const key of allCells){
   if(seen.has(key))continue;
   const a=originalSheet[key],b=finalSheet[key];
   if(text(a?.v)!==text(b?.v)||text(a?.f)!==text(b?.f)||text(a?.t)!==text(b?.t))throw Error('Célula não autorizada modificada: '+key);
  }
  return {bytes:output,changed:replacements.length,changes:replacements.map(({cell,document,field,before,after})=>({cell,document,field,before,after})),originalHash:hash};
 }
 root.GrconAllocationRevision=Object.freeze({revise});
})(typeof globalThis!=='undefined'?globalThis:this);
