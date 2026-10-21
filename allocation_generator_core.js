(function(root,factory){
 const cjs=typeof module==='object'&&module.exports;
 const api=factory(root.RECONTriagemCore||(cjs?require('./vendor/recon/core.js'):null),root.AllocationCore||(cjs?require('./vendor/recon/allocation_core.js'):null),root.RECONAllocationNorms||(cjs?require('./vendor/recon/allocation_normative_rules.js'):null),root.ReconAllocationTitleQuality||(cjs?require('./vendor/recon/allocation_title_quality.js'):null),root.RECONDocumentTitleStandard||(cjs?require('./vendor/recon/document_title_standard_r.js'):null),root.RECONAuditCore||(cjs?require('./vendor/recon/audit_core.js'):null),root.RECONDatabookFinder||(cjs?require('./vendor/recon/allocation_databook_finder.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.GrconAllocationGeneratorCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,A,N,Q,T,Audit,Finder){
 'use strict';
 const text=x=>String(x??'').trim(),key=x=>A.key(x);
 const signature=versions=>JSON.stringify(Object.entries(versions||{}).sort(([a],[b])=>a.localeCompare(b)));
 function identity(document,record={}){
  const valid=N.validateDocument(document),family=A.documentFamily(document),parsed=valid.parsed||{};
  const inferred=C.buildEgrdtData(document,'0',document+'.pdf',record,C.inferSheetFromName(document)).discipline;
  return {family:[family.key||document,parsed.installation||'',parsed.activityBase||''].join('|'),discipline:text(inferred||record.discipline||parsed.discipline),eap:A.documentEap(document)||text(record.eap),kind:valid.kind,validation:valid};
 }
 function levelsFor(record,path,bases){
  const control={projectLevelBase:bases.eap||[],levelsByEap:new Map(),levelsByDatabook:new Map()};
  const eap=A.levelResolutionForEap(control,record);
  const levels=(A.documentFamily(record.document).type==='ET'?eap.levels:A.levelsFromDatabookPath(path))||[];
  return {levels:Array.from({length:10},(_,i)=>text(levels[i])),resolution:eap};
 }
 function pathErrors(record,path,bases){
  const errors=[],config=bases.config?.[0],unit=config?.unit;
  const units=Array.isArray(config?.units)&&config.units.length?config.units:[unit].filter(Boolean);
  if(units.length&&!units.includes(text(path).split('|')[0].trim()))errors.push('Unidade do caminho diverge da configuração do contrato.');
  if(!A.levelsCompatibleWithRecord(text(path).split('|'),record))errors.push('Disciplina do caminho Databook diverge do documento ou workflow.');
  return errors;
 }
 function normative(record,bases){
  const validation=N.validateDocument(record.document),available=new Map((bases.norms||[]).map(x=>[x.id,x]));
  const coded=C.buildEgrdtData(record.document,'0',record.document+'.pdf',{},C.inferSheetFromName(record.document)).discipline;
  const provided=C.buildEgrdtData(record.document,'0',record.document+'.pdf',record,C.inferSheetFromName(record.document)).discipline;
  if(coded&&provided&&coded!==provided)validation.errors.push({code:'DISCIPLINE_CODE_MISMATCH',message:'A disciplina informada diverge da disciplina codificada no documento.'});
  const refs=(validation.rules||[]).map(id=>available.get(id)).filter(Boolean);
  // Rules imported from a different revision remain consultable, but cannot silently
  // inherit executable validators from the RECON revision embedded in this build.
  const compatible=refs.length>0&&refs.every(ref=>N.RULES.some(rule=>rule.id===ref.id&&rule.source===ref.source&&rule.requirement===ref.requirement));
  return {validation,refs,compatible,errors:validation.errors||[],warnings:validation.warnings||[]};
 }
 function eligibleExperience(d,id,versions,paths){return d.trusted&&d.status!=='invalidated'&&signature(d.base_versions)===signature(versions)&&d.family===id.family&&d.discipline===id.discipline&&d.eap===id.eap&&paths.has(d.confirmed_path);}
 function titleFor(record,bases,experiences=[]){
  const normalize=value=>Audit.upperCaseTitle(Q.normalizeTitle(value));
  if(text(record.title)&&Q.titleQuality(record.title,record.document).status==='good')return {title:normalize(record.title),source:record.source||'LD/base documental',original:record.title};
  const official=(bases.titles||[]).find(x=>key(x.document)===key(record.document));
  if(official)return {title:normalize(official.title),source:official.source||'Base de títulos aprovada',original:record.title||''};
  const exactTitle=experiences.find(x=>key(x.document)===key(record.document));
  if(exactTitle)return {title:normalize(exactTitle.title),source:'Experiência validada '+exactTitle.id,original:record.title||''};
  const refs={byDocument:new Map(),byTagDiscipline:new Map(),tagReference:Audit.parseTagReferenceCatalog({entries:bases.appendix||[]})};
  if(bases.scon?.length){const columns=Object.keys(bases.scon[0]),catalog={columns,rows:bases.scon.map(x=>columns.map(k=>x[k]))};if(columns.includes('eap')&&columns.includes('tag'))refs.sconEscopo=Audit.parseSconEscopoTitleCatalog(catalog);else refs.scon=Audit.parseSconTitleCatalog(catalog);}
  if(bases.li?.length){const columns=Object.keys(bases.li[0]);const book={SheetNames:['LI'],Sheets:{LI:{rows:[columns,...bases.li.map(row=>columns.map(k=>row[k]))]}}};
   const references=Audit.parseTitleReferenceWorkbook(book,{utils:{sheet_to_json:s=>s.rows}});Object.assign(refs,references);
  }
  try{const audit=Audit.auditTitles(C.buildIndex([record],[]),refs,{});const suggestion=audit[0];if(suggestion?.proposed&&suggestion.proposed!==record.title)return {title:normalize(suggestion.proposed),source:suggestion.source||suggestion.reason||'Motor de correção de títulos RECON',original:record.title||''};}catch{}
  const standard=T.resolve(record.document,{currentTitle:'',previousTitles:[]});
  return {title:normalize(standard?.title||record.title||''),source:standard?.title?'Motor de títulos RECON — '+T.STANDARD.document+' Rev. '+T.STANDARD.revision:record.title?'Título da LD — revisão necessária':'Sem título comprovado',original:record.title||''};
 }
 function prepare({documents,records=[],central=[],confirmations=[],planned=[],bases={},versions={},decisions=[],date=new Date().toISOString().slice(0,10)}){
  const catalog=bases.databook||[],paths=new Set(catalog.map(x=>x.databook));
  const control={rows:central,latestByDocument:new Map(central.map(x=>[key(x.document),x])),baseDocuments:new Map(),levelsByEap:new Map(),levelsByDatabook:new Map(),projectLevelBase:bases.eap||[]};
  const entries=documents.map(d=>({raw:text(typeof d==='string'?d:d.document),hintedSheet:C.inferSheetFromName(typeof d==='string'?d:d.document)}));
  const original=A.analyze(entries,records,control,{allocationDate:date,catalogEntries:catalog,historyRows:central,confirmationRows:confirmations,ldHistory:[]});
  return original.results.map((base,i)=>{
   const input=documents[i]||{},document=base.document;
   // Preserve the RECON-selected record; never replace a rejected LD conflict
   // with whichever duplicate row happened to be imported last.
   const ldConflictBlocked=base.allocationDiagnosisKind==='technical_conflict'||base.allocationDiagnosisKind==='ambiguous';
   const located=Boolean(base.record)||records.some(r=>key(r.document)===key(document));
   const record={...(base.record||{}),...(!base.record&&!ldConflictBlocked?{title:input.title||'',discipline:input.discipline||'',workflow:input.workflow||''}:{}),document,documentKey:key(document),looseDocumentKey:C.looseKey(document)};
   const id=identity(document,record);record.discipline=id.discipline;record.sheet=record.sheet||C.inferSheetFromName(document);
   const examples=decisions.filter(d=>eligibleExperience(d,id,versions,paths));
   const title=titleFor(record,bases,examples);record.title=title.title;
   const inference=A.suggestCatalogDatabook(record,catalog);
   let path=ldConflictBlocked?'':paths.has(base.output?.databook)?base.output.databook:paths.has(record.databook)?record.databook:'';
   const exactCentral=central.filter(x=>key(x.document)===key(document));
   if(!ldConflictBlocked&&!path&&examples.length)path=examples[0].confirmed_path;
   if(!ldConflictBlocked&&!path&&paths.has(inference?.databook))path=inference.databook;
   const finderQuery=Finder.parseQueries(document+'\t'+title.title)[0];
   const ranked=finderQuery?Finder.rankQuery(catalog,finderQuery,3):[];
   const alternativePaths=[...new Set([path,...(inference?.alternatives||[]).map(x=>x.databook),...ranked.map(x=>x.entry?.databook||x.databook)].filter(p=>paths.has(p)))];
   const candidates=ldConflictBlocked?[]:alternativePaths.filter(p=>!pathErrors(record,p,bases).length).map(p=>catalog.find(x=>x.databook===p)).filter(Boolean);
   const levels=levelsFor(record,path,bases),standard=normative(record,bases);
   const existing=exactCentral.map(x=>({allocation:x.allocation,status:x.allocationStatus||x.status}));
   const allocated=planned.some(x=>key(x.document)===key(document));
   const blockers=[...(ldConflictBlocked?[base.reason||'Conflito técnico na LD: nenhuma linha foi escolhida.']:[]),...standard.errors.map(e=>e.message||e.code),...(path?pathErrors(record,path,bases):['Nenhum caminho comprovado na base ativa.']),...(!title.title?['Título requer revisão.']:[]),...(!record.discipline?['Disciplina não identificada.']:[]),...(levels.resolution?.blockFallback?['EAP não comprovada na base ativa.']:[])];
   const confidence=blockers.length||!standard.compatible?'baixa':alternativePaths.length>1||!located?'media':'alta';
   return {...base,document,revision:text(input.revision||record.revision||'0'),record,ldLocated:located,plannedAllocated:allocated,existing,identity:id,
    originalTitle:title.original,titleSource:title.source,title:title.title,output:{...(base.output||A.outputFromRecord(record,null,null,control,date,inference)),databook:path,levels:levels.levels},
    suggestedPath:path,candidates,levelEvidence:levels.resolution,standard,confidence,blockers,ldConflictBlocked,versions,decisionId:'',confirmed:false,ai:null,
    origin:examples.length&&!located?'experiencia-validada':located?'motor-recon':'catalogo-recon',
    statusLabel:ldConflictBlocked?'Conflito na LD — corrigir fonte':blockers.length||!standard.compatible?'Revisão necessária':located?'Revisar sugestão':'Não localizado na LD — revisar sugestão',
    selected:false};
  });
 }
 function review(row,changes,bases){
  if(row.ldConflictBlocked)throw Error('Conflito técnico ou identificação ambígua na LD. Corrija a fonte e reanalise.');
  const path=text(changes.path),entry=(bases.databook||[]).find(x=>x.databook===path);
  if(!entry)throw Error('Escolha um caminho existente na base ativa.');
  const title=Audit.upperCaseTitle(Q.normalizeTitle(changes.title));if(!title)throw Error('Informe o título.');
  const record={...row.record,title,discipline:text(changes.discipline||row.record.discipline),workflow:text(changes.workflow||row.output.workflow)};
  const errors=pathErrors(record,path,bases);if(errors.length)throw Error(errors.join(' '));
  const resolved=levelsFor(record,path,bases),standard=normative(record,bases);
  return {...row,record,title,identity:identity(row.document,record),levelEvidence:resolved.resolution,output:{...row.output,workflow:record.workflow,discipline:record.discipline,databook:path,levels:resolved.levels},standard,confirmed:false,decisionId:'',confidence:standard.errors.length?'baixa':'media',blockers:[...standard.errors.map(e=>e.message||e.code),...(resolved.resolution?.blockFallback?['EAP não comprovada na base ativa.']:[])]};
 }
 function decisionPayload(row,justification,status='corrected'){
  if(row.ldConflictBlocked)throw Error('Conflito na LD não resolvido. Corrija a fonte antes de confirmar.');
  return {document:row.document,revision:row.revision,family:row.identity.family,discipline:row.identity.discipline,eap:row.identity.eap,title:row.title,
   suggestedPath:row.suggestedPath,confirmedPath:row.output.databook,levels:row.output.levels,versions:row.versions,
   evidence:[...row.standard.refs.map(x=>({id:x.id,source:x.source,requirement:x.requirement})),...(row.identity.eap?[{id:'eap:'+row.versions.eap,source:row.levelEvidence?.source||'Hierarquia EAP ativa',eap:row.identity.eap}]:[]),{id:'databook:'+row.versions.databook,source:'Mapa Databook ativo',path:row.output.databook}],changes:{titleFrom:row.originalTitle,titleTo:row.title,pathFrom:row.suggestedPath,pathTo:row.output.databook},
   origin:row.origin,confidence:row.confidence,status,justification};
 }
 return {prepare,review,identity,normative,levelsFor,pathErrors,titleFor,eligibleExperience,signature,decisionPayload,Audit};
});
