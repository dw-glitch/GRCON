'use strict';
importScripts('../xlsx.full.min.js','../jszip.min.js',
 '../vendor/recon/document_title_standard.js','../vendor/recon/document_title_standard_r.js',
 '../vendor/recon/allocation_normative_catalogs.js','../vendor/recon/allocation_normative_rules.js',
 '../allocation_auditor_references.js','../allocation_auditor_opinion.js','../allocation_auditor_reaudit.js','../allocation_auditor_report.js','../allocation_auditor_ml.js','../allocation_auditor_core.js','../allocation_auditor_revision.js','../allocation_auditor_assistant.js','../allocation_auditor_corrections.js','../allocation_auditor_package.js');
const C=self.GrconAllocationAuditorCore;
let context=null,prepared=null;
const cache=new Map();
async function readFile(file){
 if(!file||file.size>30*1024*1024||!/\.xlsx$/i.test(file.name))throw Error('Selecione um arquivo XLSX de até 30 MB.');
 const bytes=await file.arrayBuffer();
 if(bytes.byteLength>30*1024*1024)throw Error('O arquivo ultrapassa 30 MB. Divida a entrada antes de importar.');
 // Inspect the ZIP directory before decompression and bound expansion.
 const view=new DataView(bytes);let expanded=0,entries=0;
 for(let i=Math.max(0,bytes.byteLength-65557);i<bytes.byteLength-21;i++)if(view.getUint32(i,true)===0x06054b50){const count=view.getUint16(i+10,true),offset=view.getUint32(i+16,true);let at=offset;
  for(let n=0;n<count;n++){if(at+46>bytes.byteLength||view.getUint32(at,true)!==0x02014b50)throw Error('Arquivo ZIP inválido.');expanded+=view.getUint32(at+24,true);entries++;at+=46+view.getUint16(at+28,true)+view.getUint16(at+30,true)+view.getUint16(at+32,true);}break;}
 if(!entries)throw Error('Arquivo XLSX inválido ou corrompido. Abra uma cópia no Excel e salve novamente como XLSX.');
 if(entries>12000||expanded>160*1024*1024)throw Error('Arquivo excede os limites de expansão segura. Divida a entrada antes de importar.');
 let book;try{book=XLSX.read(bytes,{type:'array',cellDates:true,cellFormula:true,cellNF:true,sheetStubs:true,bookVBA:false});}catch{throw Error('Não foi possível ler o arquivo XLSX. Ele pode estar corrompido; abra uma cópia no Excel e salve novamente.');}
 return {bytes,book};
}
const safe=v=>typeof v==='string'&&/^[\s]*[=+\-@\t\r]/.test(v)?"'"+v:v;
function sheet(book,name,rows){const s=XLSX.utils.aoa_to_sheet(rows.map(row=>row.map(safe)));s['!cols']=rows[0].map(()=>({wch:26}));XLSX.utils.book_append_sheet(book,s,name);}
async function operation(op,input){
 if(op==='ml-inspect'||op==='ml-prepare'){
  const {book,bytes}=await readFile(input.file),M=self.GrconAllocationAuditorMl;
  const candidates=[];
  for(const name of book.SheetNames){try{
   const ws=book.Sheets[name];if(!ws['!ref'])continue;
   const end=XLSX.utils.decode_range(ws['!ref']).e;
   const preview=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',range:{s:{r:0,c:0},e:{r:Math.min(end.r,999),c:Math.min(end.c,200)}}});
   if(!preview.some(row=>{const m=C.headerMap(row);return m.document>=0&&m.returnedAt>=0&&m.fiscalComment>=0;}))continue;
   const p=C.parseWorksheet(ws,XLSX,{contract:input.contract,sourceFile:input.file.name,sourceSheet:name});
   if(p.columns.fiscalComment>=0&&p.columns.returnedAt>=0)candidates.push({name,parsed:p});
  }catch{/* Non-documentary tabs are not eligible historical sources. */}}
  if(op==='ml-inspect')return candidates.map(c=>({name:c.name,documents:c.parsed.records.length}));
  const chosen=candidates.find(c=>c.name===input.sheet);if(!chosen)throw Error('Selecione uma aba com as colunas de retorno e resposta da Fiscal 01. Este arquivo é um histórico para preparar aprendizado, não uma alocação preventiva.');
  const sourceHash=await self.GrconAllocationAuditPackage.hash(bytes);
  const events=chosen.parsed.records.map(r=>{const raw=r.cellValues?.returnedAt?.raw;
   return {...r,sourceHash,returnedAt:raw===null||raw===undefined?r.returnedAt:raw};});
  const review=M.prepareReview(events),bookOut=new (self.ExcelJS||(importScripts('../exceljs.min.js'),self.ExcelJS)).Workbook();
  const add=(name,headers,rows)=>{const ws=bookOut.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});ws.addRow(headers);rows.forEach(r=>ws.addRow(r.map(v=>typeof v==='string'?v.slice(0,32000):v)));
   ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF205471'}};ws.getRow(1).height=32;
   ws.columns.forEach((c,i)=>{c.width=i===0?26:38;c.alignment={vertical:'top',wrapText:true};c.numFmt='@';});
   ws.eachRow((row,n)=>{if(n>1){let lines=1;row.eachCell(c=>{lines=Math.max(lines,Math.ceil(String(c.value??'').length/34));});row.height=Math.min(409,Math.max(30,lines*16+12));}});
   if(name==='LEIA PRIMEIRO'){ws.getColumn(2).width=100;ws.eachRow((row,n)=>{if(n>1)row.height=Math.max(36,Math.ceil(String(row.getCell(2).value??'').length/90)*18+14);});}
   if(rows.length)ws.autoFilter={from:{row:1,column:1},to:{row:ws.rowCount,column:headers.length}};return ws;};
  add('LEIA PRIMEIRO',['Etapa','O que significa / o que fazer'],[
   ['Resultado','PREPARAÇÃO PARA REVISÃO HUMANA. Nenhum modelo foi treinado ou ativado.'],
   ['1. Conferir lacunas',review.summary.withGaps+' de '+review.summary.total+' registros têm lacunas identificadas. Linhas históricas foram preservadas.'],
   ['2. Recuperar o estado enviado','Localize a revisão e o título vigentes na submissão. Não substitua pelo estado atual de uma LD posterior.'],
   ['3. Classificar exemplos','O palpite não é rótulo confirmado. Confira o comentário e registre confirmado, corrigido, rejeitado ou inconclusivo, categorias, nome, data e evidência.'],
   ['Categorias','Título (title); código (code); TAG (tag); Data Book (databook); níveis EAP (hierarchy); workflow (workflow); disciplina/escopo (scope); histórico (history).'],
   ['4. Autorizar o acervo','A autorização de treinamento deve indicar responsável, contratos e escopo. Este arquivo não concede essa autorização.'],
   ['5. Treinar e avaliar','Após completar as fontes e revisar rótulos, execute o pipeline controlado. Separe documentos e períodos entre treino e teste. Ativação depende de avaliação independente.'],
   ['Fonte',input.file.name+' · '+input.sheet+' · SHA-256 '+sourceHash],
   ['Privacidade','Arquivo gerado localmente no navegador. Não anexa histórico à auditoria preventiva nem transmite a serviço de IA.']]);
  add('LACUNAS',['Campo','Registros com lacuna'],Object.entries(review.summary.gaps));
  const categoryLabel={title:'Título',code:'Código',tag:'TAG',databook:'Data Book',hierarchy:'Níveis EAP',workflow:'Workflow',scope:'Disciplina/escopo',history:'Histórico'};
  add('REVISÃO HUMANA',['ID de origem','Arquivo','Aba','Linha na origem','Documento','Revisão enviada (fonte)','Alocação','Título enviado (fonte)','LD/versão enviada','Retorno fiscal','Decisão fiscal (fonte)','Comentário original','O que falta comprovar','Palpite automático (NÃO revisado)','Decisão humana (preencher)','Categorias confirmadas (preencher)','Responsável (preencher)','Data da revisão (preencher)','Evidência do estado enviado (preencher)'],review.rows.map(({id,event:e,missing,suggested})=>[id,e.sourceFile,e.sourceSheet,e.sourceRow,e.document,e.revision,e.allocation,e.title,e.ldVersion||e.ld,Number.isFinite(M.toTime(e.returnedAt))?new Date(M.toTime(e.returnedAt)).toISOString().slice(0,10):'',e.fiscalDecision,e.fiscalComment,missing.join('; ')||'Sem lacuna detectada — ainda exige confirmação humana',suggested.map(c=>categoryLabel[c]+' ('+c+')').join(', '),'','','','','']));
  return {summary:review.summary,sourceHash,bytes:await bookOut.xlsx.writeBuffer()};
 }
 if(op==='summarize')return {groups:self.GrconAllocationAssistant.groups(input.rows),summary:C.summary(input.rows)};
 if(op==='fingerprint'){const {bytes}=await readFile(input.file);return self.GrconAllocationAuditPackage.hash(bytes);}
 if(op==='inspect'){const {book}=await readFile(input.file);return book.SheetNames.map(name=>{
  const ws=book.Sheets[name],range=ws['!ref']||'';
  if(!range)return {name,range,documentCount:0,model:'unknown'};
  try{const detected=C.parseWorksheet(ws,XLSX,{sourceFile:input.file.name,sourceSheet:name});return {name,range,documentCount:detected.documentCount,model:detected.model,headerRow:detected.headerRow,readingPolicy:detected.readingPolicy,sourceIssues:detected.sourceIssues};}
  catch(e){return {name,range,documentCount:0,model:'unknown',warning:e.message||String(e)};}
 });}
 if(op==='parse'){const {book,bytes}=await readFile(input.file);if(!book.Sheets[input.sheet])throw Error('Selecione a aba de origem.');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  return {...C.parseWorksheet(book.Sheets[input.sheet],XLSX,{contract:input.contract,sourceFile:input.file.name,sourceSheet:input.sheet,sourceHash:sha,allocation:input.allocation||''}),sha256:sha};
 }
 if(op==='context'){cache.clear();context={...input,validateDocument:self.RECONAllocationNorms.validateDocument};
  // Catálogo de referências: o que foi localizado/carregado/validado/homologado. Falta de referência nunca vira conformidade.
  context.references=self.GrconAllocationAuditorReferences.buildCatalog({contract:context.contract,applicability:context.applicability,homologated:context.homologated,
   loadedBases:{tags:Boolean(context.bases?.appendix?.length),databook:Boolean(context.bases?.databook?.length),eap:Boolean(context.bases?.eap?.length),workflow:Boolean(context.bases?.workflows?.length)},
   validations:input.referenceValidations,homologations:input.referenceHomologations,referenceDate:input.referenceDate||new Date().toISOString().slice(0,10)});
  prepared=C.prepare(context);return {records:context.records.length,treeNodes:prepared.tree.size,references:context.references};}
 if(op==='batch'){if(!context)throw Error('Contexto ausente.');return Promise.all(context.records.slice(input.first,input.first+input.count).map(async r=>{
  const duplicateKey=JSON.stringify([r.document,r.revision||'',r.allocation||r.sourceFile||'']);
  const signature=JSON.stringify([C.VERSION,context.contract,context.versions,context.applicability,context.homologated,context.references&&context.references.fingerprint,r,prepared.ld.get(r.document),prepared.byDocument.get(r.document),prepared.batches.get(duplicateKey)]);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(cache.has(hash))return cache.get(hash);
  const result=C.auditRecord(r,context,prepared);cache.set(hash,result);if(cache.size>5000)cache.delete(cache.keys().next().value);return result;
 }));}
 if(op==='revise-allocation'){return self.GrconAllocationRevision.revise(input,{XLSX,JSZip,C});}
 if(op==='assistant-package')return self.GrconAllocationAuditPackage.build(input,{XLSX,JSZip,C});
 if(op==='export'){
  const book=XLSX.utils.book_new(),rows=input.rows||[],events=input.events||[];
  sheet(book,'Auditoria',[['Documento','Revisão','Título','Situação','Categoria','Gravidade','Apontamento','Fonte','Evidência','Versão regras'],...rows.flatMap(r=>r.findings.length?r.findings.map(f=>[r.document,r.revision,r.title,r.status,f.category,f.severity,f.message,f.source,JSON.stringify(f.evidence),r.ruleVersion]):[[r.document,r.revision,r.title,r.status,'','','Nenhuma não conformidade detectada','','',r.ruleVersion]])]);
  sheet(book,'Correções LD',[['Documento','Revisão','Arquivo origem','Aba','Linha','Coluna','Campo','Valor anterior','Valor proposto','Justificativa','Estado','Responsável','Data','Evidências'],...events.filter(e=>e.field).map(e=>{const r=rows.find(x=>x.lineage===e.lineage);return [e.document,e.revision,r?.origin?.file||'',r?.origin?.sheet||'',r?.origin?.row||'',e.field==='title'?r?.origin?.titleColumn||'':'',e.field,e.before,e.after,e.justification,e.state,e.actor,e.at,JSON.stringify(e.evidence)];})]);
  sheet(book,'Correções de alocação',[['Documento','Campo','Célula','Anterior','Proposto','Decisão','Justificativa','Evidências'],...events.filter(e=>['workflow','databook','N1','N2','N3','N4','N5','N6'].includes(e.field)).map(e=>{const r=rows.find(x=>x.lineage===e.lineage);const col=e.field==='workflow'?'C':e.field==='databook'?'J':String.fromCharCode(74+Number(e.field.slice(1)));return [e.document,e.field,r?.sourceRow?col+r.sourceRow:'',e.before,e.after,e.decision,e.justification,JSON.stringify(e.evidence)];})]);
  sheet(book,'Decisões',[['Documento','Revisão','Estado','Campo','Antes','Depois','Justificativa','Evidência','Responsável','Data'],...events.map(e=>[e.document,e.revision,e.state,e.field,e.before,e.after,e.justification,JSON.stringify(e.evidence),e.actor,e.at])]);
  sheet(book,'Histórico fiscal',[['Documento','Revisão','Alocação','LD','Versão LD','Retorno','Decisão','Comentário original','Arquivo','Aba','Linha'],...(input.history||[]).map(h=>[h.document,h.revision,h.allocation,h.ld||h.ldSheet,h.ldVersion,h.returnedAt,h.fiscalDecision,h.fiscalComment,h.sourceFile,h.sourceSheet,h.sourceRow])]);
  if(context&&context.references){const x=self.GrconAllocationAuditorReferences.exportRows(context.references);sheet(book,'Referências',x.references);sheet(book,'Rastreabilidade das regras',x.trace);}
  sheet(book,'Fontes e limites',[['Campo','Valor'],['Contrato',input.contract],['Versões',JSON.stringify(input.versions)],['Aplicabilidade',JSON.stringify(input.applicability)],['Limite','Ausência de apontamentos não constitui aprovação. Precedentes fiscais exigem revisão.'],['Modelo oficial','Correções aprovadas podem ser aplicadas em cópia do XLSX original com SHA-256 e verificação de células. A ausência de fonte oficial mantém o caso inconclusivo.']]);
  const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'}),zip=new JSZip();zip.file('Auditoria_e_Correcoes.xlsx',bytes);zip.file('Rastreabilidade.json',JSON.stringify({version:C.VERSION,contract:input.contract,versions:input.versions,sourceVersions:input.sourceVersions,rows,events},null,2));zip.file('Catalogo_Fiscal.json',JSON.stringify(C.catalogComments(input.history||[]),null,2));
  for(const file of input.files||[])zip.file(file.name,file.base64,{base64:true});return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }
 throw Error('Operação desconhecida.');
}
self.onmessage=async({data})=>{try{self.postMessage({id:data.id,result:await operation(data.operation,data.input)});}catch(e){self.postMessage({id:data.id,error:e.message||String(e)});}};
