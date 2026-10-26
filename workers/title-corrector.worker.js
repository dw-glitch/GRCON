'use strict';
// Corretor de títulos: os arquivos e as bases são processados no próprio navegador.
importScripts('../xlsx.full.min.js','../jszip.min.js','title-corrector-reports.js',
  '../vendor/recon/recon_contracts.js','../vendor/recon/core.js',
  '../vendor/recon/ld_conflicts.js','../vendor/recon/allocation_confirmation_sources.js',
  '../vendor/recon/non_tagged_title_rules.js','../vendor/recon/allocation_core.js',
  '../vendor/recon/databook_allocation_sources.js',
  '../vendor/recon/document_title_standard.js','../vendor/recon/document_title_standard_r.js',
  '../vendor/recon/global_tag_title_core.js','../vendor/recon/audit_core.js',
  '../vendor/recon/ld_preservation.js','../vendor/recon/ld_title_writer.js',
  '../vendor/recon/offline_resources.js','../vendor/recon/offline_recon_audit_bases.js',
  '../vendor/recon/tag_reference_catalog.js','../vendor/recon/valve_list_catalog.js',
  '../vendor/recon/valve_reparo_catalog.js','../vendor/recon/scon_escopo_title_catalog.js',
  '../vendor/recon/scon_andaime.js',
  '../vendor/recon/scon_apoio.js',
  '../vendor/recon/scon_canteiro.js',
  '../vendor/recon/scon_civil.js',
  '../vendor/recon/scon_eletrica.js',
  '../vendor/recon/scon_eqp_dinamico.js',
  '../vendor/recon/scon_eqp_estatico.js',
  '../vendor/recon/scon_est_metalica.js',
  '../vendor/recon/scon_hvac.js',
  '../vendor/recon/scon_instrumentacao.js',
  '../vendor/recon/scon_loa.js',
  '../vendor/recon/scon_recursos_etf.js',
  '../vendor/recon/scon_seguranca.js',
  '../vendor/recon/scon_tubulacao.js');
const C=self.RECONTriagemCore,A=self.RECONAuditCore;
let original=null,originalName='',report=[];
const clean=x=>String(x==null?'':x).trim();
const normal=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
const reading=bytes=>XLSX.read(bytes,{type:'array',cellDates:true,cellFormula:true,bookVBA:true});
const mapRows=rows=>new Map((rows||[]).map(row=>[String(row.id),row]));
const addUnique=(list,value)=>{if(value&&!list.some(v=>normal(v)===normal(value)))list.push(value);};
function referenceWorkbook(bytes){return A.parseTitleReferenceWorkbook(reading(bytes),XLSX);}
function merge(base,extras){
  const result={entries:[...(base?.entries||[]),...(extras?.entries||[])],byDocument:new Map(base?.byDocument||[]),byTagDiscipline:new Map(base?.byTagDiscipline||[])};
  for(const [key,value] of extras?.byDocument||[])if(!result.byDocument.has(key))result.byDocument.set(key,value);
  for(const [key,values] of extras?.byTagDiscipline||[])result.byTagDiscipline.set(key,[...(result.byTagDiscipline.get(key)||[]),...values]);
  const chunks=Object.values(self.RECON_SCON_CHUNKS||{}).filter(chunk=>Array.isArray(chunk.rows));
  const columns=['document','titleComplement','fullDescription','sconTag','discipline','itemType','drawingReference','row'];
  const embedded=A.parseSconTitleCatalog({columns,rows:chunks.flatMap(chunk=>chunk.rows),sourceFile:'SCON - COMPONENTES E PROGRAMAÇÃO 2 (1).xlsx',sheet:'EXTRATO_COMPONENTES + PROGRAMACAO'});
  const uploaded=extras?.scon?.entries?.length?extras.scon:base?.scon;
  result.scon=uploaded?.entries?.length
    ? A.buildSconReferenceIndex([...embedded.entries,...uploaded.entries],{sourceFile:'SCON controlada + base complementar',sheet:'FONTES COMBINADAS'})
    : embedded;
  result.tagReference=A.parseTagReferenceCatalog(self.RECONTagReferenceCatalog);
  result.valveList=A.parseValveListCatalog(self.RECONValveListCatalog);
  result.valveReparo=A.parseValveReparoCatalog(self.RECONValveReparoCatalog);
  result.sconEscopo=A.parseSconEscopoTitleCatalog(self.RECONSconEscopoTitleCatalog);
  return result;
}
function areaFor(row,refs){
  if(row.sconEscopoMatch!=='SIM'||!row.sconEscopoEapMatched||row.sconEscopoEapFallback||row.sconEscopoTagFallback)return null;
  const target=clean(row.tag||row.sconEscopoLookupTag);
  const eap=normal(row.sconEscopoDocumentEap).replace(/\s/g,'');
  if(!target||!eap)return null;
  const matches=(refs.sconEscopo.byExactTag.get(target.toUpperCase())||[])
    .filter(entry=>normal(entry.eap).replace(/\s/g,'')===eap&&clean(entry.area));
  const names=[...new Set(matches.map(entry=>normal(entry.area)))];
  if(names.length!==1)return null;
  return {value:names[0],source:refs.sconEscopo.sourceFile||'SCON ESCOPO',reference:'TAG '+target+' / EAP '+eap};
}
function titleWithArea(row,where){
  const title=clean(row.proposed),area='AREA '+where.value;
  if(!title||normal(title).includes(normal(area))||normal(title).includes(normal(where.value)))return title;
  const tag=clean(row.tag);
  if(tag&&title.endsWith(' - '+tag))return title.slice(0,-(' - '+tag).length)+' - '+area+' - '+tag;
  return title+' - '+area;
}
function shape(row,refs){
  const area=areaFor(row,refs);
  const facts=[];
  if(row.titleStandard)facts.push({field:'tipo',value:row.titleStandard,source:row.titleStandardSource||'ET Rev. R',verified:true});
  const what=clean(row.valveTitle||row.sconTitleComplement||row.appendixTitle||row.globalTagTitle||row.nonTaggedWhat||row.sconEscopoTitle);
  if(what)facts.push({field:'objeto',value:what,source:row.descriptionSource||row.nonTaggedSource||'Base documental',verified:row.confidence==='alta'});
  if(area)facts.push({field:'localizacao',value:'AREA '+area.value,source:area.source,reference:area.reference,verified:true});
  const purpose=clean(row.titleStandard||row.titlePrefix);
  if(purpose)facts.push({field:'finalidade_documental',value:purpose,source:row.titleStandardSource||'Tipo documental',verified:Boolean(row.titleStandard)});
  const eap=clean(row.sconEscopoDocumentEap);
  if(eap)facts.push({field:'eap_classificacao',value:eap,source:'Grupo 4 / SCON',verified:true});
  const unsafe=Boolean(row.ldConflict?.hasConflict||row.issue==='conflict'||row.valveCancelled&&!row.valveFromReparoMap||
    row.globalTagConflict||row.sconMatch==='AMBÍGUO'||row.sconEscopoMatch==='AMBÍGUO'||row.titleStandardAmbiguous||
    row.sconEscopoEapFallback||row.sconEscopoTagFallback);
  const safeArea=area&&!unsafe?area:null;
  const suggested=safeArea?titleWithArea(row,safeArea):clean(row.proposed);
  return {id:String(row.id),document:row.document,sheet:row.sheet,row:row.row,discipline:row.discipline||'',
    current:clean(row.current),proposed:suggested,originalProposed:clean(row.proposed),issue:row.issue,
    reason:row.reason||'',confidence:unsafe?'baixa':row.confidence||'nenhuma',
    classification:unsafe?'manual_review':row.classification||'suggestion',tag:row.tag||'',
    descriptionSource:row.descriptionSource||'',facts,hasConflict:unsafe,
    sourceRows:{valve:row.valveSourcePages||[],scon:row.sconSourceRows||[],appendix:row.appendixSourceRows||[],escopo:row.sconEscopoSourceRows||[]},
    evidenceSummary:row.descriptionSource||'Sem descrição confirmada',reviewRequired:unsafe||!suggested||row.confidence==='baixa',
    decision:'pending'};
}
async function analyze(input){
  if(!/\.(xlsx|xlsm)$/i.test(input.name||''))throw Error('A LD precisa estar em XLSX ou XLSM.');
  original=input.bytes;originalName=input.name; report=[];
  const book=reading(original);
  const parsed=C.parseWorkbook(book,input.name,Date.now());
  if(!parsed.records?.length)throw Error('A LD não contém registros técnicos reconhecidos. Confira os cabeçalhos e as abas.');
  const index=C.buildIndex(parsed.records,parsed.history||[]);
  const bundled=referenceWorkbook(self.RECONOfflineResources.arrayBuffer('Analise_descricoes_Planilha1.xlsx'));
  const supplemental=input.referenceBytes?referenceWorkbook(input.referenceBytes):null;
  const refs=merge(bundled,supplemental);
  let codes=null,unmatched=[];
  if(input.codes&&input.codes.length){
    const requested=new Set(input.codes.map(code=>C.key(code)).filter(Boolean));
    const found=new Set(index.documents.map(item=>item.documentKey));
    unmatched=[...requested].filter(code=>!found.has(code));
    codes=new Set([...requested].filter(code=>found.has(code)));
  }
  const audited=A.auditTitles(index,refs,{titleSourceMode:input.sourceMode||'auto',...(codes?{documentKeys:codes}:{})});
  report=audited.map(row=>shape(row,refs));
  return {rows:report,coverage:parsed.coverage||null,unmatched,sourceCounts:{
    controlled:bundled.entries.length,supplemental:supplemental?.entries.length||0,
    scon:refs.scon?.entries?.length||0,appendix:refs.tagReference?.entries?.length||0,
    valve:refs.valveList?.activeTagCount||0,escopo:refs.sconEscopo?.entries?.length||0},
    standard:'ET-5290.00-22000-912-1LV-001 Rev. R'};
}
async function exportLd(rows){
 if(!original)throw Error('Analise uma LD antes de exportar.');
 const originalMap=mapRows(report);
 const authorized=(rows||[]).filter(row=>{
   const from=originalMap.get(String(row.id));
   return from&&from.sheet===row.sheet&&from.row===row.row&&from.document===row.document
     &&row.decision==='approved'&&clean(row.proposed)&&normal(row.proposed)!==normal(from.current)
     &&!from.hasConflict;
 }).map(row=>({...originalMap.get(String(row.id)),proposed:clean(row.proposed),decision:'approved'}));
 if(!authorized.length)throw Error('Selecione e aprove pelo menos uma alteração válida.');
 const file={name:originalName,arrayBuffer:async()=>original};
 const result=await self.RECONTitleWriter.apply(file,authorized,XLSX,JSZip);
 return {bytes:result.buffer,name:result.fileName.replace('_RECON_','_GRCON_'),changes:result.changes,preservation:result.preservation};
}
self.onmessage=async({data})=>{
 const {id,op,input}=data;
 try{
   let result;
   if(op==='analyze')result=await analyze(input);
   else if(op==='export')result=await exportLd(input.rows);
   else if(op==='report')result=self.GrconTitleReports.report(input.rows);
   else if(op==='package')result=await self.GrconTitleReports.package(input.rows,input.reportRows,exportLd);
   else throw Error('Operação desconhecida.');
   const transfers=result?.bytes instanceof Uint8Array?[result.bytes.buffer]:[];
   self.postMessage({id,result},transfers);
 }catch(error){self.postMessage({id,error:error?.message||String(error)});}
};
