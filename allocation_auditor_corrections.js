(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationCorrections=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Fase 6 — classificação operacional das correções do Robô Auditor Preventivo.
 //   A  correção automática segura (regra homologada ativa + todas as portas verificadas)
 //   B  correção proposta (fundamentada, mas depende de autorização humana)
 //   C  verificação complementar (evidência ausente, ambígua ou conflitante)
 //   D  sem alteração necessária
 // Este módulo é puro: não lê nem grava arquivos. Os escritores XLSX aplicam as
 // portas de gravação (SHA-256, valor anterior, fórmula, mescla, proteção) de novo.
 const VERSION='1.0.0';
 const CLASSES=Object.freeze({A:'Correção automática segura',B:'Correção proposta',C:'Verificação complementar',D:'Sem alteração necessária'});
 const text=v=>v==null?'':String(v).trim();
 const OFFICIAL_FIELDS=field=>field==='workflow'||field==='databook'||/^N[1-6]$/.test(field);
 const LD_FIELDS=new Set(['title']);
 // Quem é a fonte responsável quando o erro NÃO está em arquivo editável (Situação C).
 const REFERENCE_OWNER={tag:'Cadastro de TAGs (Apêndice 3 / LI / SCON)',databook:'Base Data Book ativa',hierarchy:'EAP contratual',workflow:'Tabela de Workflows',code:'Catálogo normativo / ET',history:'LD de origem'};
 // Achados que indicam fontes em conflito ou identidade ambígua: nunca escolher automaticamente (Situação D).
 const CONFLICT_IDS=new Set(['LD-AMBIGUOUS','EAP-DISCIPLINE-AMBIGUOUS','DUPLICATE-IN-BATCH','WORKFLOW-DISCIPLINE-CONFLICT']);
 const value=(row,field)=>/^N[1-6]$/.test(field)?text((row.levels||[])[Number(field.slice(1))-1]):text(row[field]);
 const hex64=v=>/^[a-f0-9]{64}$/.test(text(v));

 // Portas de elegibilidade para execução automática. Retorna os motivos que a impedem.
 function automaticBlockers(row,rec,context,rule,assistant){
  const why=[];
  if(!rule)return ['Nenhuma regra homologada ativa cobre esta transformação'];
  if(text(context.contextWarning))why.push('Bases complementares indisponíveis nesta auditoria');
  if(!text(context.contract)||row.contract!==context.contract)why.push('Contrato não confirmado');
  if(!row.officialAllocation)why.push('Layout sem escritor homologado');
  if(!hex64(row.sourceHash))why.push('Hash da origem ausente');
  if(!Number.isInteger(row.sourceRow)||row.sourceRow<2)why.push('Linha física não localizada');
  if(!text(row.revision)||text(row.origin?.revision)!==text(row.revision))why.push('Revisão documental não confirmada');
  if(!rec.evidence||!rec.evidence.some(x=>text(x)))why.push('Sem evidência');
  if(rec.humanReview===true&&rec.confidence!=='fonte documental exata'&&rec.confidence!=='EAP homologada')why.push('Proposta depende de interpretação');
  if(rec.field==='workflow'&&!context.homologated?.workflows&&rec.confidence!=='fonte documental exata')why.push('Workflow sem referência oficial');
  if(/^N[1-6]$/.test(rec.field)&&!context.homologated?.eap)why.push('EAP contratual não homologada');
  if(assistant){const check=assistant.evaluate(row,rule,context);if(!check.eligible)why.push(...check.reasons);}
  return [...new Set(why)];
 }

 function findRule(row,rec,rules){
  return (rules||[]).find(r=>{
   const p=r.payload||r;
   return r.state==='active'&&p.field===rec.field&&p.before===rec.before&&p.after===rec.after&&p.document===row.document&&p.revision===row.revision;
  })||null;
 }

 // 6.2 — onde corrigir.
 function route(row,rec){
  const f=rec.field;
  const ev=(rec.evidence||[]).join(' ');
  if(OFFICIAL_FIELDS(f)&&!row.officialAllocation)return {situation:'A',target:'external',reason:'Layout externo auditado, sem escritor homologado: gerar proposta e saída compatível identificada; a planilha original não é editada.'};
  if(OFFICIAL_FIELDS(f)&&row.officialAllocation){
   const fromLd=/LD exata/.test(ev)||rec.confidence==='fonte documental exata';
   return fromLd
    ?{situation:'A',target:'allocation',reason:'LD correta e alocação divergente: corrigir a cópia da alocação com o valor verificado na LD.'}
    :{situation:'C',target:'none',reason:'O valor de referência não vem de uma fonte exata; identificar a fonte responsável antes de editar.'};
  }
  if(LD_FIELDS.has(f))return {situation:'B',target:'ld',reason:'O título reside na LD: corrigir primeiro a cópia da LD; o modelo oficial de 16 colunas não possui título.'};
  return {situation:'C',target:'none',reason:'Campo sem escritor homologado; atualizar a fonte responsável.'};
 }

 function classifyProposal(row,rec,context,assistant){
  const r=route(row,rec);
  const rule=findRule(row,rec,context.rules);
  const blockers=automaticBlockers(row,rec,context,rule,assistant);
  const base={lineage:row.lineage,document:row.document,revision:row.revision,field:rec.field,before:rec.before,after:rec.after,
   source:rec.confidence||'',evidence:rec.evidence||[],justification:rec.justification||'',situation:r.situation,target:r.target,routing:r.reason,
   ruleId:rule?.id||'',ruleVersion:rule?.version||0,affected:[rec.field],file:row.sourceFile,sheet:row.sourceSheet,
   cell:OFFICIAL_FIELDS(rec.field)&&row.sourceRow?(rec.field==='workflow'?'C':rec.field==='databook'?'J':String.fromCharCode(74+Number(rec.field.slice(1))))+row.sourceRow:''};
  if(r.target==='none')return {...base,klass:'C',reasons:[r.reason],missing:['Fonte responsável identificada e atualizada']};
  if(!blockers.length)return {...base,klass:'A',reasons:[]};
  return {...base,klass:'B',reasons:blockers,impact:'Altera '+rec.field+' em '+(r.target==='ld'?'cópia da LD':r.target==='external'?'saída compatível (layout externo)':'cópia da alocação')+'; aprovação humana necessária.'};
 }

 // Achados sem proposta: severidade pendente/erro sem correção = verificação complementar.
 function classifyFindings(row){
  const items=[];
  for(const f of row.findings||[]){
   if(f.severity==='suggestion')continue;
   const conflict=CONFLICT_IDS.has(f.id);
   items.push({lineage:row.lineage,document:row.document,revision:row.revision,field:f.field,findingId:f.id,
    klass:'C',situation:conflict?'D':'C',target:'none',
    reasons:[f.message],evidence:f.evidence||[],
    owner:REFERENCE_OWNER[f.category]||'Fonte documental',
    missing:conflict?['Decisão humana entre fontes conflitantes']:['Evidência ou fonte oficial que comprove o valor correto'],
    conflict});
  }
  return items;
 }

 // Resumo real: nenhum número demonstrativo.
 function plan(rows,context,assistant,events){
  const proposals=[],complementary=[];
  // A decisão VIGENTE é a última por (linhagem, campo, valor): aceitar e depois rejeitar/revogar remove a autorização.
  const ordered=(events||[]).map((e,i)=>({e,i})).sort((a,b)=>(a.e.at&&b.e.at?String(a.e.at).localeCompare(String(b.e.at)):0)||a.i-b.i).map(x=>x.e);
  const latest=new Map();for(const e of ordered)if(e.field)latest.set(JSON.stringify([e.lineage,e.field,e.after]),e.decision);
  const accepted={has:key=>latest.get(key)==='accepted'};
  let clear=0,withProposal=0,withPending=0;
  for(const row of rows||[]){
   const recs=row.recommendations||[];
   // Duas propostas diferentes para o mesmo campo = fontes em conflito: nenhuma é executada.
   const byField=new Map();
   for(const rec of recs){const list=byField.get(rec.field)||[];list.push(rec);byField.set(rec.field,list);}
   let rowProposals=0;
   for(const [field,list] of byField){
    if(new Set(list.map(x=>x.after)).size>1){
     complementary.push({lineage:row.lineage,document:row.document,revision:row.revision,field,klass:'C',situation:'D',target:'none',findingId:'SOURCE-CONFLICT',reasons:['Fontes divergentes propõem valores diferentes para '+field],evidence:list.flatMap(x=>x.evidence||[]),missing:['Decisão humana entre fontes conflitantes'],conflict:true});
     continue;
    }
    // Valor vigente já igual ao proposto: não há o que corrigir.
    if(value(row,field)===list[0].after)continue;
    const item=classifyProposal(row,list[0],context||{},assistant);item.authorized=accepted.has(JSON.stringify([row.lineage,item.field,item.after]));proposals.push(item);rowProposals++;
   }
   const pend=classifyFindings(row);
   complementary.push(...pend);
   if(rowProposals)withProposal++;
   if(pend.length)withPending++;
   if(!(row.findings||[]).length&&!rowProposals)clear++;
  }
  const A=proposals.filter(x=>x.klass==='A'),B=proposals.filter(x=>x.klass==='B'),Cp=proposals.filter(x=>x.klass==='C');
  return {version:VERSION,analyzed:(rows||[]).length,
   safe:A.length,safeAuthorized:A.filter(x=>x.authorized).length,proposed:B.length,proposalsDecided:B.filter(x=>x.authorized).length,pending:complementary.length+Cp.length,clear,
   rowsWithProposals:withProposal,rowsWithPending:withPending,
   items:[...A,...B,...Cp,...complementary],automatic:A,proposals:B};
 }

 // 6.6 — agrupar apenas com equivalência comprovada; cada item mantém a própria evidência.
 function groupItems(items){
  const groups=new Map();
  for(const item of items){
   if(!item.after&&item.after!=='')continue;
   const k=JSON.stringify([item.klass,item.ruleId,item.ruleVersion,item.field,item.before,item.after,item.target,item.situation,item.source,item.discipline||'',item.workflow||'']);
   const g=groups.get(k)||{id:k,klass:item.klass,ruleId:item.ruleId,field:item.field,before:item.before,after:item.after,target:item.target,items:[]};
   g.items.push({lineage:item.lineage,document:item.document,revision:item.revision,cell:item.cell,evidence:item.evidence,justification:item.justification});
   groups.set(k,g);
  }
  return [...groups.values()];
 }

 // Resultado final de uma cópia: vincula cada alteração às suas portas de verificação.
 function traceChange(change,event={},meta={}){
  return {
   contract:meta.contract||'',document:change.document,revision:change.revision||event.revision||'',allocation:meta.allocation||'',
   file:meta.file||'',fileHash:meta.fileHash||'',sheet:meta.sheet||'GERAL',row:change.row||Number(String(change.cell).match(/\d+$/)?.[0]||0),
   column:change.column||String(change.cell).replace(/\d+$/,''),cell:change.cell,field:change.field,before:change.before,after:change.after,
   ruleId:event.ruleId||'',ruleVersion:event.ruleVersion||0,reference:(event.evidence||[]).slice(0,3),
   actor:event.actor||'',decision:event.decision||'',lineage:change.lineage,outputHash:meta.outputHash||'',verified:meta.verified===true
  };
 }

 return Object.freeze({VERSION,CLASSES,REFERENCE_OWNER,OFFICIAL_FIELDS,route,classifyProposal,classifyFindings,plan,groupItems,traceChange,findRule});
});
