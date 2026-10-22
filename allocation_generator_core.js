(function(root,factory){
 const cjs=typeof module==='object'&&module.exports;
 const api=factory(root.RECONTriagemCore||(cjs?require('./vendor/recon/core.js'):null),root.AllocationCore||(cjs?require('./vendor/recon/allocation_core.js'):null),root.RECONAllocationNorms||(cjs?require('./vendor/recon/allocation_normative_rules.js'):null),root.ReconAllocationTitleQuality||(cjs?require('./vendor/recon/allocation_title_quality.js'):null),root.RECONDocumentTitleStandard||(cjs?require('./vendor/recon/document_title_standard_r.js'):null),root.RECONAuditCore||(cjs?require('./vendor/recon/audit_core.js'):null),root.RECONDatabookFinder||(cjs?require('./vendor/recon/allocation_databook_finder.js'):null),root.GrconAllocationLdExport||(cjs?require('./allocation_ld_export.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.GrconAllocationGeneratorCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,A,N,Q,T,Audit,Finder,L){
 'use strict';
 const text=x=>String(x??'').trim(),key=x=>A.key(x);
 const signature=versions=>JSON.stringify(Object.entries(versions||{}).sort(([a],[b])=>a.localeCompare(b)));
 // Contract instruction: repeated unit branches belong to U39S; the
 // document's RNEST group 3 chooses U32 or U39S, never the spreadsheet order
 // during ranking. Resolve the templates once at publication and retain them.
 const UNIT_ROUTING='document-U32-U39S';
 function documentUnit(document){
  const groups=text(document).toUpperCase().split('_');
  if(groups[1]!=='RNEST')return '';
  return /^U39S?$/.test(groups[2])?'U39S':groups[2]||'';
 }
 function pathUnit(path){const units=[...text(path).matchAll(/\bU-?(32|39S?)\b/gi)].map(m=>m[1].toUpperCase()==='32'?'U32':'U39S');return [...new Set(units)].join('/');}
 function resolveDatabookCatalog(rows,config={}){
  if(config.unitRouting!==UNIT_ROUTING)return rows;
  const occurrences=new Map();
  return rows.map(entry=>{
   const original=text(entry.sourceDatabook||entry.databook);
   const tokens=/\b(?:SE-XX00|U-X{2,3}|U-?32|U-?39S?)\b/gi;
   if(!tokens.test(original))return {...entry};
   tokens.lastIndex=0;const signature=key(original.replace(tokens,'{UNIDADE}'));
   const n=occurrences.get(signature)||0;occurrences.set(signature,n+1);
   if(n>1)throw Error('Mais de dois ramos repetidos no mapa. Confira a unidade na linha '+entry.rowNumber+'.');
   const unit=pathUnit(original)==='U39S'?'U39S':n===0?'U32':'U39S';
   tokens.lastIndex=0;const databook=original.replace(tokens,unit==='U32'?'U-32':'U-39S');
   return {...entry,sourceDatabook:original,databook,levels:databook.split('|'),documentUnit:unit,unitRouting:UNIT_ROUTING};
  });
 }
 function identity(document,record={}){
  const valid=N.validateDocument(document),family=A.documentFamily(document),parsed=valid.parsed||{};
  const inferred=C.buildEgrdtData(document,'0',document+'.pdf',record,C.inferSheetFromName(document)).discipline;
  return {unit:documentUnit(document),family:[family.key||document,documentUnit(document),parsed.installation||'',parsed.activityBase||''].join('|'),discipline:text(inferred||record.discipline||parsed.discipline),eap:A.documentEap(document)||text(record.eap),kind:valid.kind,validation:valid};
 }
 function levelsFor(record,path,bases){
  const control={projectLevelBase:bases.eap||[],levelsByEap:new Map(),levelsByDatabook:new Map()};
  const eap=A.levelResolutionForEap(control,record);
  const levels=[...((A.documentFamily(record.document).type==='ET'?eap.levels:A.levelsFromDatabookPath(path))||[])];
  if(bases.config?.[0]?.unitRouting===UNIT_ROUTING&&documentUnit(record.document)==='U39S'&&/\bU-?32\b/i.test(levels[0]||'')){levels[0]=levels[0].replace(/\bU-?32\b/gi,'U-39S');eap.reason+=' N1 corresponde à unidade U39S do Grupo 3; a estrutura EAP mantém a árvore mestre.';}
  return {levels:Array.from({length:10},(_,i)=>text(levels[i])),resolution:eap};
 }
 function pathErrors(record,path,bases){
  const errors=[],config=bases.config?.[0],unit=config?.unit;
  const wanted=documentUnit(record.document),actual=pathUnit(path);
  if(wanted&&actual&&wanted!==actual)errors.push('Unidade do caminho Databook diverge do Grupo 3 do documento ('+wanted+').');
  if(config?.unitRouting===UNIT_ROUTING&&/\b(?:SE-XX00|U-X{2,3})\b/i.test(path))errors.push('O caminho ainda contém unidade genérica. Republique o mapa com a regra U32/U39S.');
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
  const catalog=bases.databook||[],paths=new Set(catalog.map(x=>x.databook)),ldLayouts=L.layoutIndex(records);
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
   const unitCatalog=catalog.filter(p=>!pathErrors(record,p.databook,bases).some(error=>/Unidade|unidade/.test(error)));
   const inference=A.suggestCatalogDatabook(record,unitCatalog);
   const usable=p=>paths.has(p)&&!pathErrors(record,p,bases).length;
   let path=ldConflictBlocked?'':usable(base.output?.databook)?base.output.databook:usable(record.databook)?record.databook:'';
   const exactCentral=central.filter(x=>key(x.document)===key(document));
   if(!ldConflictBlocked&&!path&&examples.length&&usable(examples[0].confirmed_path))path=examples[0].confirmed_path;
   if(!ldConflictBlocked&&!path&&usable(inference?.databook))path=inference.databook;
   const finderQuery=Finder.parseQueries(document+'\t'+title.title)[0];
   const ranked=finderQuery?Finder.rankQuery(unitCatalog,finderQuery,3):[];
   const alternativePaths=[...new Set([path,...(inference?.alternatives||[]).map(x=>x.databook),...ranked.map(x=>x.entry?.databook||x.databook)].filter(p=>paths.has(p)))];
   const candidates=ldConflictBlocked?[]:alternativePaths.filter(p=>!pathErrors(record,p,bases).length).map(p=>catalog.find(x=>x.databook===p)).filter(Boolean);
   if(!path&&candidates.length)path=candidates[0].databook;
   const levels=levelsFor(record,path,bases),standard=normative(record,bases);
   const existing=exactCentral.map(x=>({allocation:x.allocation,status:x.allocationStatus||x.status}));
   const allocated=planned.some(x=>key(x.document)===key(document));
   const blockers=[...(ldConflictBlocked?[base.reason||'Conflito técnico na LD: nenhuma linha foi escolhida.']:[]),...standard.errors.map(e=>e.message||e.code),...(path?pathErrors(record,path,bases):['Caminho não identificado na base ativa.']),...(!title.title?['Título requer revisão.']:[]),...(!record.discipline?['Disciplina não identificada.']:[]),...(levels.resolution?.blockFallback?['EAP não comprovada na base ativa.']:[])];
   const confidence=blockers.length||!standard.compatible?'baixa':alternativePaths.length>1||!located?'media':'alta';
   return {...base,document,revision:text(input.revision||record.revision||'0'),record,ldLocated:located,plannedAllocated:allocated,existing,identity:id,
    sourceObservation:base.output?.observation||'',ldLayout:L.layoutFor(record,ldLayouts),originalTitle:title.original,titleSource:title.source,title:title.title,output:{...(base.output||A.outputFromRecord(record,null,null,control,date,inference)),databook:path,levels:levels.levels,observation:[base.output?.observation,...blockers].filter(Boolean).join(' · ')},
    sourceDatabook:catalog.find(p=>p.databook===path)?.sourceDatabook||path,suggestedPath:path,candidates,levelEvidence:levels.resolution,standard,confidence,blockers,ldConflictBlocked,versions,decisionId:'',confirmed:false,ai:null,
    origin:examples.length&&!located?'experiencia-validada':located?'motor-recon':'catalogo-recon',
    statusLabel:blockers.length||!standard.compatible?'Com observações':'Automático',
    adjusted:false,selected:true};
  });
 }
 function review(row,changes,bases){
  const path=text(changes.path),entry=(bases.databook||[]).find(x=>x.databook===path);
  if(path&&!entry)throw Error('Escolha um caminho existente na base ativa.');
  const title=Audit.upperCaseTitle(Q.normalizeTitle(changes.title));
  const record={...row.record,title,discipline:text(changes.discipline||row.record.discipline),workflow:text(changes.workflow||row.output.workflow)};
  const errors=path?pathErrors(record,path,bases):[];if(errors.length)throw Error(errors.join(' '));
  const resolved=levelsFor(record,path,bases),standard=normative(record,bases);
  const blockers=[...standard.errors.map(e=>e.message||e.code),...(!path?['Caminho não identificado na base ativa.']:[]),...(!title?['Título não identificado.']:[]),...(!record.discipline?['Disciplina não identificada.']:[]),...(resolved.resolution?.blockFallback?['EAP não comprovada na base ativa.']:[])];
  return {...row,record,title,sourceDatabook:entry?.sourceDatabook||path,identity:identity(row.document,record),levelEvidence:resolved.resolution,output:{...row.output,workflow:record.workflow,discipline:record.discipline,databook:path,levels:resolved.levels,observation:[row.sourceObservation,...blockers].filter(Boolean).join(' · ')},standard,confirmed:false,decisionId:'',adjusted:true,statusLabel:'Ajustado',confidence:standard.errors.length?'baixa':'media',blockers};
 }
 function decisionPayload(row,justification,status='corrected'){
  if(row.ldConflictBlocked)throw Error('Conflito na LD não resolvido. Corrija a fonte antes de confirmar.');
  return {document:row.document,revision:row.revision,family:row.identity.family,discipline:row.identity.discipline,eap:row.identity.eap,title:row.title,
   suggestedPath:row.suggestedPath,confirmedPath:row.output.databook,levels:row.output.levels,versions:row.versions,
   evidence:[...(row.sourceDatabook&&row.sourceDatabook!==row.output.databook?[{id:'unit-routing:'+row.versions.config,source:'Regra do contrato — unidade no Grupo 3',unit:row.identity.unit,sourcePath:row.sourceDatabook,resolvedPath:row.output.databook}]:[]),...row.standard.refs.map(x=>({id:x.id,source:x.source,requirement:x.requirement})),...(row.identity.eap?[{id:'eap:'+row.versions.eap,source:row.levelEvidence?.source||'Hierarquia EAP ativa',eap:row.identity.eap}]:[]),{id:'databook:'+row.versions.databook,source:'Mapa Databook ativo',path:row.output.databook}],changes:{titleFrom:row.originalTitle,titleTo:row.title,pathFrom:row.suggestedPath,pathTo:row.output.databook},
   origin:row.origin,confidence:row.confidence,status,justification};
 }
 return {documentUnit,pathUnit,resolveDatabookCatalog,prepare,review,identity,normative,levelsFor,pathErrors,titleFor,eligibleExperience,signature,decisionPayload,Audit};
});
