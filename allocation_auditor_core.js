(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='1.0.1';
 const text=v=>v==null?'':Object.prototype.toString.call(v)==='[object Date]'?v.toISOString():String(v).trim();
 const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
 const key=r=>JSON.stringify([text(r.contract),text(r.document),text(r.revision),ldIdentity(r).id||text(r.ld),ldIdentity(r).sheet]);
 const ET='ET-5290.00-22000-912-1LV-001';
 const STATES=['Aberto','Correção proposta','Corrigido na origem','Reapresentado','Aguardando avaliação','Resolvido com evidência','Aceito com ressalvas','Exceção justificada','Não comprovado'];
 const TAXONOMY=[
  ['title','Título',/TITULO|DESCRICAO|ORTOGRAF|FORMACAO DO CABO|CLASSE DE TENSAO|CONDUTORES/,'title','LD'],
  ['code','Codificação',/CODIFIC|SEQUENCIAL|N-1710|NT-|CARACTER|GRUPO 7/,'document','LD'],
  ['tag','TAG',/\bTAG\b|EQUIPAMENTO|MOTOR/,'tag','Cadastro de TAGs / LD'],
  ['databook','Data Book',/CAM\.?\s?DB|CAMINHO|DATA\s?BOOK|PASTA|SUBGRUPO/,'databook','LD / Base Data Book'],
  ['hierarchy','Hierarquia / EAP',/\bEAP\b|\bN(?:[1-9]|10)\b|NIVE[LIS]|HIERARQUIA|ETAPA/,'levels','LD / EAP'],
  ['workflow','Workflow',/WORKFLOW|\bWF\b/,'workflow','LD / Workflow'],
  ['scope','Atividade / escopo',/REPARO|MONTAGEM|COMISSIONAMENTO|HVAC|ESCOPO|DISCIPLINA/,'discipline','LD / Informação técnica'],
  ['history','Pendência documental',/HISTORICO|VERSAO|ATUALIZAR ALOCACAO|NAO LOCALIZAD|JUSTIFICATIVA|LD DESATUALIZ/,'allocation','LD']
 ];
 const RULES=[
  {id:'ET-717-PRESERVE',item:'7.1.7',field:'tag',description:'Identificador exato da referência, sem normalização do TAG.'},
  {id:'ET-7171-SEPARATOR',item:'7.1.7.1',field:'tag',description:'Separação de nomes de itens não tagueados por hífen.'},
  {id:'ET-7172-CHARACTERS',item:'7.1.7.2',field:'tag',description:'Caracteres proibidos no Grupo 7.'},
  {id:'ET-7173-NT',item:'7.1.7.3',field:'tag',description:'Prefixo nt- minúsculo para itens comprovadamente não tagueados.'}
 ].map(r=>Object.freeze({...r,source:ET,revisions:['N','P','Q','R'],version:VERSION,severity:'error',contracts:[],condition:'Revisão e aplicabilidade confirmadas na base do contrato; relatórios ET.'}));
 function classifyComment(original){
  const value=norm(original);if(!value)return [];
  if(/^(?:OK|ACEIT[OA] SEM COMENTARIOS)\.?$/.test(value))return [];
  const matches=TAXONOMY.filter(x=>x[2].test(value));
  return (matches.length?matches:[['unconfirmed','Comentário não classificado',null,'','Informação técnica']]).map(([category,label,_,field,origin])=>({category,label,field,origin,original:original==null?'':String(original),learning:'precedente-especifico',certainty:category==='unconfirmed'?'baixa':'media',humanReview:true,references:[...new Set(text(original).match(/(?:7\.1\.7(?:\.[1-3])?|N-1710|ET-[\dA-Z.-]+)/g)||[])],requestedCorrection:text(original)}));
 }
 function decision(comment,status){
  const c=norm(comment),s=norm(status);
  if(/RECUSAD/.test(c))return 'recusado';
  if(/ACEIT[OA] COM|AJUSTAR|CORRIGIR|AVALIAR/.test(c))return 'aceito-com-ressalvas';
  if(/^(OK|ACEIT[OA] SEM COMENTARIOS)\.?$/.test(c))return 'aceito-sem-comentarios';
  if(/RECUSAD/.test(s))return 'recusado';
  return 'nao-comprovado';
 }
 function headerMap(row){
  const h=row.map(norm),find=(...names)=>h.findIndex(v=>names.includes(v));
  return {document:find('NOMEDOCUMENTO','DOCUMENTO','CODIGO','NUMERO DO DOCUMENTO'),revision:find('REVISAO','REV.','REV'),title:find('TITULO','TITULO DO DOCUMENTO'),allocation:find('ALOCACAO','NUMERO DA ALOCACAO'),ld:find('LD','LD DE ORIGEM'),ldSheet:find('ABA'),ldVersion:find('VERSAO DA LD'),sentAt:find('DATA DO ENVIO DA ALOC','DATA DO ENVIO'),returnedAt:h.findIndex(v=>/^RETORNO DA FISCAL 01/.test(v)),fiscalComment:h.findIndex(v=>/^RESPOSTA DA FISCAL 01/.test(v)),fiscal02:h.findIndex(v=>/^RETORNO DA FISCAL 02/.test(v)),status:find('STATUS DA ALOCACAO','STATUS/ OBSERVACAO','STATUS'),databook:find('CAMINHO DATA BOOK','CAMINHO DATABOOK'),workflow:find('WORKFLOW'),discipline:find('DISCIPLINA'),eap:find('EAP'),tag:find('TAG'),levels:Array.from({length:10},(_,i)=>find('N'+(i+1)))};
 }
 function parseRows(rows,meta={}){
  let header=-1,map;
  for(let i=0;i<Math.min(80,rows.length);i++){const m=headerMap(rows[i]||[]);if(m.document>=0){header=i;map=m;break;}}
  if(header<0)throw Error('Cabeçalho documental não reconhecido. Nenhuma coluna foi presumida.');
  const records=[];for(let i=header+1;i<rows.length;i++){
   const row=rows[i]||[],get=n=>map[n]>=0?text(row[map[n]]):'';if(!get('document'))continue;
   const r={...meta,document:get('document'),rawDocument:row[map.document]==null?'':String(row[map.document]),revision:get('revision'),title:get('title'),allocation:get('allocation')||text(meta.allocation),ld:get('ld'),ldSheet:get('ldSheet'),ldVersion:get('ldVersion'),sentAt:get('sentAt'),returnedAt:get('returnedAt'),fiscalComment:get('fiscalComment'),fiscal02:get('fiscal02'),status:get('status'),databook:get('databook'),workflow:get('workflow'),discipline:get('discipline'),eap:get('eap'),tag:get('tag'),levels:map.levels.map(j=>j>=0?text(row[j]):''),sourceRow:i+1,columns:Object.fromEntries(Object.entries(map).filter(([_,v])=>typeof v==='number'&&v>=0).map(([k,v])=>[k,v+1]))};
   // Fiscal text is preserved verbatim, including spacing and line breaks.
   if(map.fiscalComment>=0){const raw=row[map.fiscalComment];r.fiscalComment=typeof raw==='string'?raw:'';if(raw!=null&&raw!==''&&typeof raw!=='string'){r.fiscalCommentRaw=raw;r.commentDataIssue='Resposta fiscal contém valor não textual.';}}
   // Status/observação in returned allocation workbooks is evidence; sheet names are not decisions.
   if(!r.fiscalComment&&map.fiscalComment<0&&map.status>=0&&norm(rows[header][map.status])==='STATUS/ OBSERVACAO')r.fiscalComment=row[map.status]==null?'':String(row[map.status]);
   r.fiscalDecision=decision(r.fiscalComment,r.status);r.commentFindings=classifyComment(r.fiscalComment);records.push(r);
  }
  return {records,headerRow:header+1,columns:map};
 }
 function parts(document){const p=text(document).split('_');return p.length>=7?{supplier:p[0],project:p[1],unit:p[2],eap:p[3],discipline:p[4],report:p[5],tag:p.slice(6).join('_')}:null;}
 function ldIdentity(r){const file=text(r.ld||r.origin?.file),sheet=norm(r.ldSheet||r.origin?.sheet);const id=file.match(/LD-[\d.]+-[\dA-Z]+-[\dA-Z]+-[\dA-Z]+-(\d{3})/i)?.[1]||sheet.match(/LD[_\s-]*(\d{3})/)?.[1]||'';return {id,sheet:sheet.replace(/[_\s-]*LD[_\s-]*\d{3}.*$/,'').trim()};}
 function sameLd(a,b){const x=ldIdentity(a),y=ldIdentity(b);if(x.id&&y.id&&x.id!==y.id)return false;if(x.sheet&&y.sheet&&x.sheet!==y.sheet)return false;return true;}
 function applicable(context){const a=context.applicability||{};return a.confirmed===true&&a.contract===context.contract&&a.source===ET&&['N','P','Q','R'].includes(a.revision)&&Boolean(text(a.evidence));}
 function finding(id,category,field,message,evidence,opts={}){return {id,category,field,message,evidence,ruleVersion:VERSION,source:opts.source||'Integridade operacional',severity:opts.severity||'pending',origin:opts.origin||'LD',humanReview:true,...opts};}
 function buildTree(paths,version){const nodes=new Map();for(const entry of paths||[]){const p=text(entry.databook||entry.path).split('|');if(p.some(x=>!x.trim()))continue;for(let i=0;i<p.length;i++){const full=p.slice(0,i+1).join('|');nodes.set(full,{id:JSON.stringify([version,full]),parent:i?JSON.stringify([version,p.slice(0,i).join('|')]):null,label:p[i],path:full,version});}}return nodes;}
 function prepare(context){
  const byDocument=new Map(),batches=new Map(),tags=new Map(),paths=new Map(),eaps=new Map(),ld=new Map();
  for(const h of context.history||[]){if(h.contract&&h.contract!==context.contract)continue;const a=byDocument.get(h.document)||[];a.push(h);byDocument.set(h.document,a);}
  for(const r of context.records||[]){const k=JSON.stringify([r.document,r.revision||'',r.allocation||r.sourceFile||'']);batches.set(k,(batches.get(k)||0)+1);}
  for(const kind of ['appendix','li','scon'])for(const t of context.bases?.[kind]||[]) {const tag=text(t.tag||t.TAG);if(tag)tags.set(tag,{...t,kind});}
  for(const p of context.bases?.databook||[])paths.set(text(p.databook),p);
  for(const e of context.bases?.eap||[])eaps.set(text(e.code),e);
  for(const r of context.ldRecords||[]){const list=ld.get(text(r.document))||[];list.push(r);ld.set(text(r.document),list);}
  return {byDocument,batches,tags,paths,eaps,ld,tree:buildTree(context.bases?.databook,context.versions?.databook)};
 }
 function auditRecord(input,context,index=prepare(context)){
  if(!text(context.contract))throw Error('Contrato obrigatório.');
  if(input.contract&&input.contract!==context.contract)throw Error('Documento de outro contrato.');
  const r={...input,contract:context.contract},f=[],p=parts(r.document),add=(...a)=>f.push(finding(...a)),enforced=applicable(context);
  if(r.rawDocument&&r.rawDocument!==r.document)add('SOURCE-CODE-WHITESPACE','code','document','O código de origem contém espaços externos. Confira a fonte; o valor original foi preservado.',[{original:r.rawDocument,matchingKey:r.document}]);
  const originals=index.ld.get(r.document)||[],compatible=originals.filter(x=>!r.revision||!x.revision||String(x.revision)===r.revision);
  const source=compatible.length===1?compatible[0]:null;
  if(source){for(const k of ['title','revision','discipline','workflow','eap','tag'])if(!text(r[k]))r[k]=text(source[k]);r.ld=r.ld||text(source.source);r.ldSheet=r.ldSheet||text(source.sheet);r.ldVersion=r.ldVersion||text(source.ldVersion);r.origin={file:source.source||source.sourceFile,sheet:source.sheet||source.sourceSheet,row:source.row||source.sourceRow,titleColumn:source.titleColumn||source.columns?.title||source.ldColumns?.find(c=>norm(c.header)==='TITULO')?.column};}
  if(compatible.length>1)add('LD-AMBIGUOUS','history','ld','Mais de uma linha da LD corresponde ao documento. Confirme a origem.',compatible.map(x=>({file:x.source,sheet:x.sheet,row:x.row})));
  if(!text(r.revision))add('REVISION-UNKNOWN','history','revision','Revisão não informada; não foi presumida revisão 0.',[{file:r.sourceFile,row:r.sourceRow}]);
  if(!text(r.title))add('TITLE-MISSING','title','title','Título não disponível. Importe a LD para verificar.',[{file:r.sourceFile,row:r.sourceRow}]);
  if(!enforced)add('ET-APPLICABILITY','code','document','Aplicabilidade e revisão da ET ainda não comprovadas para este contrato.',[],{origin:'Base normativa'});
  if(context.validateDocument){
   const validation=context.validateDocument(r.document);
   for(const error of validation.errors||[]){
    const et=/^ET-/.test(error.code),matched=(context.bases?.norms||[]).find(n=>n.source===error.source&&n.contract===context.contract&&n.applicabilityEvidence&&n.confirmed===true);
    const confirmed=et?enforced&&context.applicability.revision==='R':Boolean(matched);
    add('CATALOG-'+error.code,'code',error.field||'document',error.message,[{value:r.document,source:error.source,baseVersion:context.versions?.norms,applicability:matched?.applicabilityEvidence||context.applicability?.evidence||''}],{severity:confirmed?'error':'pending',source:error.source||'Catálogo normativo incorporado'});
   }
   if(validation.kind==='unknown')add('NORMATIVE-UNRECOGNIZED','code','document','Documento não reconhecido pelos validadores normativos incorporados.',[{value:r.document}]);
  }
  const n1710=text(r.document).match(/^(?:[A-Z]-)?[A-Z]{2}-\d{4}\.\d{2}-[0-9A-Z]{4,5}-[0-9A-Z]{3}-[A-Z0-9]{3}-([A-Z0-9]+)$/i);
  if(n1710&&!/^\d{3}$/.test(n1710[1])&&!(/^[1-9]\d{3}$/.test(n1710[1])))add('N1710-SEQUENCE','code','document','Confira o sequencial: três algarismos; quatro quando ultrapassar 999. Letras não compõem o sequencial numérico.',[{source:'N-1710 Rev. N',item:'6.7',value:n1710[1]}],{source:'N-1710 Rev. N §6.7',severity:'pending'});
  if(p){
   r.tag=r.tag||p.tag;r.eap=r.eap||p.eap;r.discipline=r.discipline||p.discipline;
   const reference={source:ET,revision:context.applicability?.revision||'',contract:context.contract,evidence:context.applicability?.evidence||''};
   const rule=(id,item,message)=>add(id,'code','document',message,[{...reference,item,value:p.tag}],{severity:enforced?'error':'pending',source:ET+' '+item,origin:'LD'});
   if(/[çÇ?|!@#$%¨&*(),\s]/.test(p.tag))rule('ET-7172-CHARACTERS','7.1.7.2','Grupo 7 contém caractere proibido na ET.');
   const nonTagged=r.nonTagged===true||/^nt-/i.test(p.tag);
   if(nonTagged&&!p.tag.startsWith('nt-'))rule('ET-7173-NT','7.1.7.3','Item não tagueado: o Grupo 7 deve iniciar com nt- minúsculo.');
   if(nonTagged&&p.tag.includes('_'))rule('ET-7171-SEPARATOR','7.1.7.1','Confira a separação dos nomes do item não tagueado por hífen.');
   if(!nonTagged){const tag=index.tags.get(p.tag);if(!tag)add('TAG-NOT-PROVEN','tag','tag','TAG não comprovado nas referências carregadas. Verifique outras fontes autorizadas.',[{tag:p.tag,version:context.versions?.appendix}],{origin:'Cadastro de TAGs / LD'});}
   const codedUnit=norm(p.unit).replace(/-/g,''),destUnit=norm(r.databook).match(/\b(?:U-?32|U-?39S|SE-?3200)\b/)?.[0]?.replace(/-/g,'');
   if(destUnit&&codedUnit!==destUnit)add('UNIT-PATH-MISMATCH','databook','databook','A unidade do documento diverge da unidade explícita do caminho.',[{code:p.unit,path:r.databook}],{severity:'error',origin:'LD'});
   if(text(r.title)&&p.report==='RIR'&&!norm(r.title).startsWith('RELATORIO DE INSPECAO DE RECEBIMENTO'))add('RIR-TITLE-PRECEDENT','title','title','Confira a identificação de relatório de inspeção de recebimento no título.',[{title:r.title,report:p.report}],{severity:'suggestion',source:'Critério fiscal a confirmar'});
   if(p.report==='RIR'&&/BOBINA|CABO/.test(norm(p.tag+' '+r.title))){
    const missing=[];if(!/\b(?:KV|VOLT|TENSAO)\b|\d\s*[Kk][Vv]/.test(norm(r.title)))missing.push('classe de tensão');if(!/\d+(?:[.,]\d+)?\s*MM(?:2|²)?(?![A-Z])|\b(?:MM|MM2|MM²|SECAO|CONDUTOR|CONDUTORES|\d+C#)\b/.test(norm(r.title)))missing.push('configuração / seção');if(!/EPR|XLPE|PVC|FORMACAO|ISOLACAO|CONSTRUT/.test(norm(r.title)))missing.push('formação / características construtivas');
    if(missing.length)add('CABLE-DETAILS','title','title','Conferir '+missing.join(', ')+'. Não completar com características presumidas.',[{title:r.title,missing}],{severity:'suggestion',source:'Precedente fiscal para RIR de cabos'});
   }
  }else if(!/^\w+-\d{4}\.\d{2}-/.test(r.document))add('CODE-UNRECOGNIZED','code','document','Codificação não reconhecida pelo auditor. Requer conferência.',[{value:r.document}]);
  if(!index.paths.size)add('DATABOOK-BASE-MISSING','databook','databook','Base Data Book indisponível.',[],{origin:'Base Data Book'});
  else if(!text(r.databook))add('DATABOOK-MISSING','databook','databook','Caminho não informado.',[]);
  else if(!index.paths.has(r.databook))add('DATABOOK-NOT-FOUND','databook','databook','Caminho completo não encontrado na versão carregada.',[{path:r.databook,version:context.versions?.databook}],{severity:context.homologated?.databook?'error':'pending'});
  else {const entry=index.paths.get(r.databook);if(entry.discipline&&norm(entry.discipline)!==norm(r.discipline))add('PATH-DISCIPLINE','databook','databook','Disciplina incompatível com a classificação explícita do caminho.',[{path:r.databook,discipline:r.discipline,expected:entry.discipline}],{severity:'error'});}
  if(!index.eaps.size)add('EAP-BASE-MISSING','hierarchy','eap','EAP contratual não disponível. Hierarquia oficial não foi inferida do histórico.',[],{origin:'EAP'});
  else {const e=index.eaps.get(r.eap);if(!context.homologated?.eap)add('EAP-APPLICABILITY','hierarchy','eap','A hierarquia carregada não comprova a EAP contratual. Confirme o Anexo III — Apêndice A aplicável.',[{version:context.versions?.eap}],{origin:'EAP'});if(!e)add('EAP-NOT-FOUND','hierarchy','eap','Item não comprovado na EAP carregada.',[{eap:r.eap,version:context.versions?.eap}],{severity:context.homologated?.eap?'error':'pending'});else if(Array.isArray(e.levels)&&Array.isArray(r.levels)&&r.levels.some((v,i)=>text(v)&&text(v)!==text(e.levels[i])))add('EAP-LEVEL-MISMATCH','hierarchy','levels','Níveis informados divergem da hierarquia da EAP.',[{actual:r.levels,expected:e.levels,source:e.source}],{severity:context.homologated?.eap?'error':'pending'});}
  const workflows=context.bases?.workflows||[];
  if(!text(r.workflow))add('WORKFLOW-MISSING','workflow','workflow','Workflow não informado. Verifique a necessidade de definição.',[]);
  else if(workflows.length&&!workflows.some(w=>text(w.workflow)===r.workflow))add('WORKFLOW-UNKNOWN','workflow','workflow','Workflow não localizado na referência carregada.',[{workflow:r.workflow}]);
  const dup=JSON.stringify([input.document,input.revision||'',input.allocation||input.sourceFile||'']);
  if((index.batches.get(dup)||0)>1)add('DUPLICATE-IN-BATCH','history','document','Mesmo código e revisão aparecem mais de uma vez no mesmo lote. Confira antes de gerar.',[{allocation:r.allocation,file:r.sourceFile}],{severity:r.revision?'error':'pending'});
  const history=(index.byDocument.get(r.document)||[]).filter(h=>(!h.revision||!r.revision||h.revision===r.revision)&&sameLd(h,r));
  if(classifyComment(r.fiscalComment).length)add('FISCAL-CURRENT','history','fiscalComment','A planilha contém apontamento fiscal cujo atendimento precisa ser conferido.',[{comment:r.fiscalComment,decision:decision(r.fiscalComment,r.status),file:r.sourceFile,sheet:r.sourceSheet,row:r.sourceRow}],{source:'Retorno fiscal específico'});
  if(r.commentDataIssue)add('FISCAL-NON-TEXT','history','fiscalComment',r.commentDataIssue,[{value:r.fiscalCommentRaw,row:r.sourceRow}],{source:'Qualidade da fonte fiscal'});
  for(const h of history){if(classifyComment(h.fiscalComment).length)add('FISCAL-PRECEDENT','history','fiscalComment','Apontamento fiscal anterior requer avaliação de atendimento.',[{comment:h.fiscalComment,decision:h.fiscalDecision,allocation:h.allocation,file:h.sourceFile,sheet:h.sourceSheet,row:h.sourceRow,date:h.returnedAt,revisionKnown:Boolean(h.revision)}],{source:'Precedente específico',origin:'Consultar apontamento original'});}
  const status=f.some(x=>x.severity==='error')?'Correções pendentes':f.some(x=>x.severity==='pending')?'Verificações inconclusivas':f.some(x=>x.severity==='suggestion')?'Sugestões de melhoria':'Sem não conformidades detectadas';
  return {...r,findings:f,history,status,lineage:key(r),ruleVersion:VERSION,versions:context.versions||{},state:'Aberto'};
 }
 function compare(a,b){const changes=[],unknown=[];for(const k of ['document','revision','title','tag','discipline','eap','databook','levels','workflow']){if(a[k]==null||b[k]==null||a[k]===''||b[k]===''){unknown.push(k);continue;}if(JSON.stringify(a[k])!==JSON.stringify(b[k]))changes.push({field:k,before:a[k],after:b[k]});}return {changes,unknown,resolved:false};}
 function reviewEvent(row,{state,field,value,justification,evidence=[],decision='proposed'},actor){
  if(!STATES.includes(state)||!text(actor)||text(justification).length<5)throw Error('Estado, responsável e justificativa são obrigatórios.');
  if(['Resolvido com evidência','Corrigido na origem','Exceção justificada'].includes(state)&&!evidence.length)throw Error('Este estado exige evidência.');
  if(field&&!['title','databook','eap','tag','discipline'].includes(field))throw Error('Campo de correção inválido.');
  if(!['proposed','accepted','rejected','exception'].includes(decision))throw Error('Decisão inválida.');
  if(decision==='accepted'&&['databook','eap','tag','discipline'].includes(field)&&!evidence.length)throw Error('Alteração de classificação exige evidência.');
  return {document:row.document,revision:row.revision,lineage:row.lineage,state,decision,field:field||'',before:field?row[field]:'',after:value??'',justification,evidence,actor,at:new Date().toISOString(),humanReview:true};
 }
 function summary(rows){return {total:rows.length,errors:rows.filter(r=>r.findings.some(f=>f.severity==='error')).length,pending:rows.filter(r=>r.findings.some(f=>f.severity==='pending')).length,suggestions:rows.filter(r=>r.findings.some(f=>f.severity==='suggestion')).length,clear:rows.filter(r=>r.findings.length===0).length};}
 function approvedChanges(events){const latest=new Map();for(const e of events||[])if(e.field)latest.set(JSON.stringify([e.lineage,e.field]),e);return [...latest.values()].filter(e=>e.decision==='accepted');}
 function mergeHistory(existing,incoming){const out=existing.slice(),keys=new Set(out.map(h=>JSON.stringify([h.contract,h.sourceVersion||h.sourceHash||h.sourceFile,h.sourceSheet,h.sourceRow])));for(const h of incoming){const k=JSON.stringify([h.contract,h.sourceVersion||h.sourceHash||h.sourceFile,h.sourceSheet,h.sourceRow]);if(!keys.has(k)){keys.add(k);out.push(h);}}return out;}
 function catalogComments(history){const groups=new Map();for(const r of history||[]){if(!text(r.fiscalComment))continue;const k=norm(r.fiscalComment),g=groups.get(k)||{id:'comment:'+groups.size,originals:[],occurrences:[],findings:classifyComment(r.fiscalComment)};
  if(!g.originals.includes(r.fiscalComment))g.originals.push(r.fiscalComment);
  g.occurrences.push({document:r.document,revision:r.revision,contract:r.contract,ld:r.ld,ldSheet:r.ldSheet,ldVersion:r.ldVersion,allocation:r.allocation,date:r.returnedAt,decision:r.fiscalDecision,file:r.sourceFile,sheet:r.sourceSheet,row:r.sourceRow});groups.set(k,g);}
  return [...groups.values()].map(g=>({...g,learning:g.findings.length&&new Set(g.occurrences.map(o=>o.document)).size>=3?'criterio-fiscal-recorrente':g.findings.length?'precedente-especifico':'avaliacao-sem-apontamento',normativeProof:false,humanReview:true}));
 }
 function splitGroup(r){let h=2166136261;for(const c of text(r.contract)+'|'+text(r.document))h=Math.imul(h^c.charCodeAt(0),16777619);const n=(h>>>0)%10;return n<6?'development':n<8?'validation':'holdout';}
 return {VERSION,ET,RULES,STATES,TAXONOMY:TAXONOMY.map(([id,label])=>({id,label})),text,norm,key,parts,ldIdentity,sameLd,classifyComment,decision,headerMap,parseRows,applicable,buildTree,prepare,auditRecord,compare,reviewEvent,summary,approvedChanges,mergeHistory,catalogComments,splitGroup};
});
