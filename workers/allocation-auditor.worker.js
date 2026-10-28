'use strict';
importScripts('../xlsx.full.min.js','../jszip.min.js',
 '../vendor/recon/document_title_standard.js','../vendor/recon/document_title_standard_r.js',
 '../vendor/recon/allocation_normative_catalogs.js','../vendor/recon/allocation_normative_rules.js',
 '../allocation_auditor_core.js');
const C=self.GrconAllocationAuditorCore;
let context=null,prepared=null;
const cache=new Map();
async function readFile(file){
 if(!file||file.size>30*1024*1024||!/.xlsx$/i.test(file.name))throw Error('Selecione um arquivo XLSX de até 30 MB.');
 const bytes=await file.arrayBuffer();
 // Inspect the ZIP directory before decompression; reject expansion bombs/macros.
 const view=new DataView(bytes);let expanded=0,entries=0;
 for(let i=Math.max(0,bytes.byteLength-65557);i<bytes.byteLength-21;i++)if(view.getUint32(i,true)===0x06054b50){const count=view.getUint16(i+10,true),offset=view.getUint32(i+16,true);let at=offset;
  for(let n=0;n<count;n++){if(at+46>bytes.byteLength||view.getUint32(at,true)!==0x02014b50)throw Error('Arquivo ZIP inválido.');expanded+=view.getUint32(at+24,true);entries++;at+=46+view.getUint16(at+28,true)+view.getUint16(at+30,true)+view.getUint16(at+32,true);}break;}
 if(!entries||entries>12000||expanded>160*1024*1024)throw Error('Arquivo excede os limites de expansão segura.');
 return {bytes,book:XLSX.read(bytes,{type:'array',cellDates:true,cellFormula:false,bookVBA:false})};
}
const safe=v=>typeof v==='string'&&/^[\s]*[=+\-@\t\r]/.test(v)?"'"+v:v;
function sheet(book,name,rows){const s=XLSX.utils.aoa_to_sheet(rows.map(row=>row.map(safe)));s['!cols']=rows[0].map(()=>({wch:26}));XLSX.utils.book_append_sheet(book,s,name);}
async function operation(op,input){
 if(op==='inspect'){const {book}=await readFile(input.file);return book.SheetNames.map(name=>{
  const ws=book.Sheets[name],range=ws['!ref']||'';
  if(!range)return {name,range,documentCount:0,model:'unknown'};
  const dimensions=XLSX.utils.decode_range(range);
  const sample=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,range:{s:{r:0,c:0},e:{r:Math.min(240,dimensions.e.r),c:Math.min(60,dimensions.e.c)}}});
  try{const detected=C.parseRows(sample,{});return {name,range,documentCount:detected.documentCount,model:detected.model,headerRow:detected.headerRow};}
  catch(e){return {name,range,documentCount:0,model:'unknown',warning:e.message||String(e)};}
 });}
 if(op==='parse'){const {book,bytes}=await readFile(input.file);if(!book.Sheets[input.sheet])throw Error('Selecione a aba de origem.');const range=book.Sheets[input.sheet]['!ref'];if(range){const r=XLSX.utils.decode_range(range);if(r.e.r>100000||r.e.c>200)throw Error('Planilha acima dos limites de linhas ou colunas.');}
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  return {...C.parseRows(XLSX.utils.sheet_to_json(book.Sheets[input.sheet],{header:1,defval:'',raw:true}),{contract:input.contract,sourceFile:input.file.name,sourceSheet:input.sheet,sourceHash:sha,allocation:input.allocation||''}),sha256:sha};
 }
 if(op==='context'){context={...input,validateDocument:self.RECONAllocationNorms.validateDocument};prepared=C.prepare(context);return {records:context.records.length,treeNodes:prepared.tree.size};}
 if(op==='batch'){if(!context)throw Error('Contexto ausente.');return Promise.all(context.records.slice(input.first,input.first+input.count).map(async r=>{
  const duplicateKey=JSON.stringify([r.document,r.revision||'',r.allocation||r.sourceFile||'']);
  const signature=JSON.stringify([C.VERSION,context.contract,context.versions,context.applicability,context.homologated,r,prepared.ld.get(r.document),prepared.byDocument.get(r.document),prepared.batches.get(duplicateKey)]);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(cache.has(hash))return cache.get(hash);
  const result=C.auditRecord(r,context,prepared);cache.set(hash,result);if(cache.size>5000)cache.delete(cache.keys().next().value);return result;
 }));}
 if(op==='export'){
  const book=XLSX.utils.book_new(),rows=input.rows||[],events=input.events||[];
  sheet(book,'Auditoria',[['Documento','Revisão','Título','Situação','Categoria','Gravidade','Apontamento','Fonte','Evidência','Versão regras'],...rows.flatMap(r=>r.findings.length?r.findings.map(f=>[r.document,r.revision,r.title,r.status,f.category,f.severity,f.message,f.source,JSON.stringify(f.evidence),r.ruleVersion]):[[r.document,r.revision,r.title,r.status,'','','Nenhuma não conformidade detectada','','',r.ruleVersion]])]);
  sheet(book,'Correções LD',[['Documento','Revisão','Arquivo origem','Aba','Linha','Coluna','Campo','Valor anterior','Valor proposto','Justificativa','Estado','Responsável','Data','Evidências'],...events.filter(e=>e.field).map(e=>{const r=rows.find(x=>x.lineage===e.lineage);return [e.document,e.revision,r?.origin?.file||'',r?.origin?.sheet||'',r?.origin?.row||'',e.field==='title'?r?.origin?.titleColumn||'':'',e.field,e.before,e.after,e.justification,e.state,e.actor,e.at,JSON.stringify(e.evidence)];})]);
  sheet(book,'Decisões',[['Documento','Revisão','Estado','Campo','Antes','Depois','Justificativa','Evidência','Responsável','Data'],...events.map(e=>[e.document,e.revision,e.state,e.field,e.before,e.after,e.justification,JSON.stringify(e.evidence),e.actor,e.at])]);
  sheet(book,'Histórico fiscal',[['Documento','Revisão','Alocação','LD','Versão LD','Retorno','Decisão','Comentário original','Arquivo','Aba','Linha'],...(input.history||[]).map(h=>[h.document,h.revision,h.allocation,h.ld||h.ldSheet,h.ldVersion,h.returnedAt,h.fiscalDecision,h.fiscalComment,h.sourceFile,h.sourceSheet,h.sourceRow])]);
  sheet(book,'Fontes e limites',[['Campo','Valor'],['Contrato',input.contract],['Versões',JSON.stringify(input.versions)],['Aplicabilidade',JSON.stringify(input.applicability)],['Limite','Ausência de apontamentos não constitui aprovação. Precedentes fiscais exigem revisão.'],['Modelo oficial','Arquivos oficiais, quando presentes, são gerados pelo Gerador de Alocação existente.']]);
  const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'}),zip=new JSZip();zip.file('Auditoria_e_Correcoes.xlsx',bytes);zip.file('Rastreabilidade.json',JSON.stringify({version:C.VERSION,contract:input.contract,versions:input.versions,sourceVersions:input.sourceVersions,rows,events},null,2));zip.file('Catalogo_Fiscal.json',JSON.stringify(C.catalogComments(input.history||[]),null,2));
  for(const file of input.files||[])zip.file(file.name,file.base64,{base64:true});return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }
 throw Error('Operação desconhecida.');
}
self.onmessage=async({data})=>{try{self.postMessage({id:data.id,result:await operation(data.operation,data.input)});}catch(e){self.postMessage({id:data.id,error:e.message||String(e)});}};
