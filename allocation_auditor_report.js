(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorReport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Modelo do relatório didático (Etapa 7, RA-04 e RA-15). Puro: transforma linhas auditadas, decisões, alterações verificadas e o parecer
 // (allocation_auditor_opinion.js) nas linhas das abas O QUE CORRIGIR, PROPOSTAS PARA REVISÃO, CORREÇÕES VERIFICADAS, REFERÊNCIAS E DECISÕES
 // e REAUDITORIA. Regra obrigatória: sugestão não é correção realizada — valor sugerido e valor corrigido nunca dividem a mesma coluna,
 // e "valor correto" só aparece quando há decisão humana autorizada ou aplicação verificada.
 const VERSION='1.0.0';
 const text=v=>v==null?'':String(v).trim();
 const FIELD_LABEL={title:'Título',workflow:'Workflow',databook:'Caminho do Data Book',document:'Código do documento',tag:'TAG',levels:'Níveis da EAP',fiscalComment:'Histórico fiscal',plannedDate:'Data prevista',action:'Ação',purpose:'Propósito de emissão',revision:'Revisão',ld:'LD de origem',eap:'EAP',discipline:'Disciplina',allocation:'Identificação da alocação'};
 const labelOf=f=>FIELD_LABEL[f]||(/^N[1-6]$/.test(text(f))?'Nível '+text(f).slice(1)+' da EAP':text(f));
 // Mesmo texto da orientação do chat (chatView.ts); o teste da Etapa 7 confere que as duas tabelas não divergem.
 const WHY={
  title:'O título é parte da identificação do documento: precisa ser completo e inequívoco para que ele seja localizado sem depender do código.',
  tag:'A TAG liga o documento ao item físico; divergência entre LD, código e alocação impede rastrear o registro.',
  databook:'Define onde o documento será arquivado; caminho errado esconde o documento da fiscalização.',
  workflow:'O workflow determina quem analisa o documento; o valor precisa existir na base de workflows do contrato.',
  eap:'A EAP define o item de medição e a pasta N1–N5 do documento.',
  discipline:'A disciplina deve coincidir com a do código e a da LD.',
  levels:'Os níveis da alocação precisam seguir a hierarquia da EAP para o arquivamento correto.',
  document:'O código precisa seguir a estrutura de sete grupos da norma, sem caracteres não permitidos.',
  ld:'Sem a LD correspondente não é possível confirmar os dados do documento.',
  allocation:'A auditoria precisa saber a qual alocação os documentos pertencem.',
  revision:'A revisão define a versão da ET e da LD aplicáveis.'
 };
 const WHY_FALLBACK='A conferência encontrou uma divergência ou lacuna neste dado.';
 const whyOf=f=>WHY[/^N[1-6]$/.test(text(f))?'levels':text(f)]||WHY_FALLBACK;
 const STATUS_LABEL={aberta:'Aberta',pendente:'Pendente de verificação',sugestao:'Sugestão preventiva',aplicada:'Correção aplicada na cópia','aplicada-sem-reauditoria':'Aplicada — falta reauditar','resolvida-comprovada':'Resolvida (comprovada)','resolucao-contradita':'Persiste após a correção','excecao-justificada':'Exceção justificada',sugerida:'Aguardando decisão',autorizada:'Autorizada — falta aplicar',recusada:'Recusada',contradita:'Persiste após a correção'};
 const OPEN_OCCURRENCE=new Set(['aberta','pendente','resolucao-contradita','aplicada-sem-reauditoria']);
 const COLUMN={workflow:'C',databook:'J',N1:'K',N2:'L',N3:'M',N4:'N',N5:'O',N6:'P'};
 const safeEvidence=list=>(list||[]).map(e=>{
  if(e==null)return '';let v=e;if(typeof e==='string'){try{v=JSON.parse(e);}catch{return e.slice(0,300);}}
  if(typeof v!=='object')return String(v).slice(0,300);
  return Object.entries(v).filter(([,x])=>x!==''&&x!=null&&typeof x!=='object').map(([k,x])=>k+': '+x).join(' · ').slice(0,300);
 }).filter(Boolean).slice(0,3).join(' | ');
 const firstEvidence=f=>{const e=(f.evidence||[]).find(x=>x&&typeof x==='object');return e||{};};
 const valueOf=(row,field)=>/^N[1-6]$/.test(text(field))?text((row.levels||[])[Number(text(field).slice(1))-1]):text(row[field]);

 // Onde corrigir: arquivo · aba · linha (e célula quando o campo é editável na alocação oficial).
 function whereOf(row,finding,plan){
  const ev=finding?firstEvidence(finding):{},origin=text(finding&&finding.origin);
  if(finding&&/LD/i.test(origin)){
   const file=text(ev.file||row.origin?.file||row.ld),sheet=text(ev.sheet||row.origin?.sheet||row.ldSheet),line=text(ev.row||row.origin?.row);
   return ['LD',[file,sheet&&'aba '+sheet,line&&'linha '+line].filter(Boolean).join(' · ')||'LD de origem (conferir)'].filter(Boolean).join(': ');
  }
  const field=text((finding&&finding.field)||''),cell=plan&&plan.cell?plan.cell:(COLUMN[field]&&row.sourceRow?COLUMN[field]+row.sourceRow:'');
  const where=[text(row.sourceFile),text(row.sourceSheet)&&'aba '+text(row.sourceSheet),cell?'célula '+cell:row.sourceRow?'linha '+row.sourceRow:''].filter(Boolean).join(' · ');
  const label=origin&&!/LD/i.test(origin)?origin+' → ':'';
  return label+(where||'arquivo da alocação');
 }

 function decisionIndex(events){
  const ordered=(events||[]).map((e,i)=>({e,i})).sort((a,b)=>(a.e.at&&b.e.at?String(a.e.at).localeCompare(String(b.e.at)):0)||a.i-b.i).map(x=>x.e);
  const byValue=new Map();
  for(const e of ordered)if(e&&e.field)byValue.set(JSON.stringify([e.lineage,e.field,e.after].map(text)),e);
  return {ordered,byValue};
 }
const when=v=>{const t=text(v);if(!/^\d{4}-\d{2}-\d{2}T/.test(t))return t;const d=new Date(t);if(Number.isNaN(d.getTime()))return t;const p=n=>String(n).padStart(2,'0');return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+'/'+d.getUTCFullYear()+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+' UTC';};
 const DECISION_LABEL={accepted:'Autorizada',rejected:'Recusada',exception:'Exceção justificada',proposed:'Proposta registrada'};

 const HEADERS={
  toFix:['Prioridade','Alocação','Documento','Revisão','Problema identificado','Por que isso importa','Valor encontrado','Valor de referência encontrado (a confirmar)','Valor correto (somente quando comprovado)','Referência consultada','Ação recomendada','Onde corrigir','Status','Como verificar a resolução','Regra'],
  proposals:['Tipo','Alocação','Documento','Revisão','Campo','Valor atual (recebido)','Valor sugerido (NÃO aplicado)','Por que sugerimos','Evidência / referência','Confiança','Decisão','Decidido por','Decidido em','Justificativa da decisão','Onde aplicar','Termos alterados','Como decidir'],
  verified:['Origem da verificação','Alocação','Documento','Revisão','Campo','Valor original (recebido)','Valor corrigido','Arquivo corrigido','Aba','Célula','Autorizado por','Verificação feita','Prova de resolução'],
  decisions:['Data / hora','Responsável','Documento','Revisão','Campo','Valor anterior','Valor decidido','Decisão','Estado informado','Justificativa','Evidência','Regra ativa'],
  sources:['Arquivo','Tipo','SHA-256','Observação'],
  versions:['Referência','Versão'],
  reaudit:['Documento','Revisão','Alocação','Regra','Campo','Situação','Descrição','Valor anterior','Valor sugerido anterior']
 };

 function build({rows=[],events=[],approved=[],files=[],opinion=null,plan={items:[]},comparison=null,sources=[],versions={},exceptions=[],contract=''}={}){
  const byLineage=new Map(rows.map(r=>[r.lineage,r]));
  const decisions=decisionIndex(events);
  const planByKey=new Map((plan.items||[]).filter(i=>i.field&&i.after!==undefined).map(i=>[JSON.stringify([i.lineage,i.field,i.after].map(text)),i]));
  const lifecycle=opinion?opinion.lifecycle:[];
  const approvedByField=new Map(approved.map(e=>[JSON.stringify([e.lineage,e.field].map(text)),e]));
  const verifiedChanges=files.flatMap(f=>(f.changes||[]).filter(c=>c.verified!==false).map(c=>({...c,file:f.name})));
  const stateOf=x=>STATUS_LABEL[x]||x;

  // O QUE CORRIGIR — ocorrências confirmadas ou pendentes ainda abertas.
  const toFix=[];
  for(const x of lifecycle){
   if(x.kind!=='ocorrencia'||!OPEN_OCCURRENCE.has(x.state)||x.severity==='suggestion')continue;
   const row=byLineage.get(x.lineage);if(!row)continue;
   const f=(row.findings||[]).find(y=>y.id===x.id&&y.field===x.field)||{id:x.id,field:x.field,message:'',severity:x.severity};
   const ev=firstEvidence(f),found=text(ev.alocacao??ev.actual??ev.informada)||valueOf(row,f.field);
   const reference=text(ev.ld??ev.expected??ev.grupo7);
   const approvedEvent=approvedByField.get(JSON.stringify([x.lineage,f.field].map(text)));
   const proven=approvedEvent?text(approvedEvent.after)+' (autorizado por '+(approvedEvent.ruleId?'regra ativa '+approvedEvent.ruleId:text(approvedEvent.actor)||'responsável')+'; ainda não aplicado na cópia)':'';
   toFix.push({rank:f.severity==='error'?0:1,cells:[
    f.severity==='error'?'Corrigir antes do envio':'Conferir antes do envio',text(row.allocation||row.sourceFile),text(row.document),text(row.revision),
    text(f.message),whyOf(f.field),found,reference,proven||'Sem valor comprovado — não há decisão autorizada nem aplicação verificada',
    [text(f.source),safeEvidence(f.evidence)].filter(Boolean).join(' — '),
    f.severity==='error'?'Corrija na origem indicada ao lado e reexecute a auditoria.':'Confira a referência indicada e registre o resultado; sem comprovação, o item continua pendente.',
    whereOf(row,f,null),stateOf(x.state),
    'Corrija, anexe o arquivo corrigido e use "Reexecutar auditoria": «'+text(f.id)+'» deve aparecer como "Resolvida" na aba REAUDITORIA.',
    text(f.id)+' · motor '+text(f.ruleVersion||row.ruleVersion)]});
  }
  toFix.sort((a,b)=>a.rank-b.rank);

  // PROPOSTAS PARA REVISÃO — propostas de correção e sugestões preventivas. Nada aqui é correção realizada.
  const proposals=[];
  for(const x of lifecycle){
   const row=byLineage.get(x.lineage);if(!row)continue;
   if(x.kind==='proposta'&&['sugerida','autorizada','recusada'].includes(x.state)){
    const rec=(row.recommendations||[]).find(p=>text(p.field)===text(x.field)&&text(p.after)===text(x.after));if(!rec)continue;
    const d=decisions.byValue.get(JSON.stringify([x.lineage,x.field,x.after].map(text))),item=planByKey.get(JSON.stringify([x.lineage,x.field,x.after].map(text)));
    let terms='';try{terms=(JSON.parse((rec.evidence||[])[0]||'{}').ajustes||[]).map(a=>a.de+' → '+a.para).join('; ');}catch{terms='';}
    proposals.push({rank:x.state==='sugerida'?0:x.state==='autorizada'?1:2,cells:['Proposta de correção',text(row.allocation||row.sourceFile),text(row.document),text(row.revision),labelOf(x.field),text(rec.before),text(rec.after),text(rec.justification),safeEvidence(rec.evidence),text(rec.confidence),stateOf(x.state),d?text(d.actor):'',d?when(d.at):'',d?text(d.justification):'',whereOf(row,{field:x.field,origin:/^title$/.test(x.field)?'LD':''},item),terms,'No chat do Robô Auditor (aba Pendências): Autorizar ou Recusar com justificativa. Depois gere os arquivos e reexecute a auditoria.']});
   }else if(x.kind==='ocorrencia'&&x.state==='sugestao'){
    const f=(row.findings||[]).find(y=>y.id===x.id&&y.field===x.field);if(!f)continue;
    proposals.push({rank:3,cells:['Sugestão preventiva (precedente, não normativa)',text(row.allocation||row.sourceFile),text(row.document),text(row.revision),labelOf(f.field),valueOf(row,f.field),text(f.suggestion?.after),text(f.message),[text(f.source),safeEvidence(f.evidence)].filter(Boolean).join(' — '),'','Avaliar (não exige decisão registrada)','','','',whereOf(row,f,null),'','Avalie com a fiscalização; não é erro confirmado e não impede o envio.']});
   }
  }
  proposals.sort((a,b)=>a.rank-b.rank);

  // CORREÇÕES VERIFICADAS — alterações lidas de volta na cópia gerada + resoluções comprovadas por reauditoria anterior.
  const verified=[];
  for(const c of verifiedChanges){
   const row=byLineage.get(c.lineage)||{};
   const prop=lifecycle.find(x=>x.kind==='proposta'&&x.lineage===c.lineage&&text(x.field)===text(c.field)&&text(x.after)===text(c.after));
   const occ=lifecycle.find(x=>x.kind==='ocorrencia'&&x.lineage===c.lineage&&x.severity!=='suggestion'&&(x.field===c.field||(x.field==='levels'&&/^N[1-6]$/.test(text(c.field)))));
   // A prova mais fraca vence: persiste > falta reauditar > aplicada > resolvida.
   const precedence=['resolucao-contradita','contradita','aplicada-sem-reauditoria','aplicada','resolvida-comprovada'];
   const states=[occ&&occ.state,prop&&(prop.unproven?'aplicada-sem-reauditoria':prop.state)].filter(Boolean);
   const proof=precedence.find(x=>states.includes(x))||'aplicada';
   const approvedEvent=approvedByField.get(JSON.stringify([c.lineage,c.field].map(text)));
   verified.push({cells:['Cópia gerada nesta auditoria',text(row.allocation||row.sourceFile),text(c.document||row.document),text(c.revision||row.revision),labelOf(c.field),text(c.before),text(c.after),text(c.file),text(c.sheet),text(c.cell),c.ruleId?'Regra ativa '+c.ruleId:text(c.actor||approvedEvent?.actor)||'Responsável registrado',
    'Releitura da célula na cópia gerada'+(proof==='resolvida-comprovada'?' e reauditoria da cópia':''),stateOf(proof)]});
  }
  for(const i of (comparison&&comparison.items)||[]){
   if(i.status!=='resolvida')continue;
   verified.push({cells:['Reauditoria (execução anterior × atual)',i.allocation,i.document,i.revision,labelOf(i.field),i.before,i.after,'—','—','—','—','Comparação entre os resultados anterior e posterior','Resolvida (comprovada pela reauditoria): '+i.id]});
  }

  // REFERÊNCIAS E DECISÕES
  const decisionRows=decisions.ordered.filter(e=>e&&(e.decision||e.state)).map(e=>{
   const row=byLineage.get(e.lineage)||{};
   return [when(e.at),text(e.actor)||(e.ruleId?'regra ativa':''),text(e.document||row.document),text(e.revision||row.revision),labelOf(e.field),text(e.before),text(e.after),DECISION_LABEL[e.decision]||text(e.decision),text(e.state),text(e.justification),(e.evidence||[]).map(text).filter(Boolean).join(' | '),e.ruleId?text(e.ruleId)+' v'+text(e.ruleVersion):''];
  });
  const sourceRows=sources.map(s=>[text(s.name),s.kind==='ld'?'LD':'Alocação',text(s.sha256),s.model==='mapped'?'Layout mapeado: sem correção automática da planilha':'']);
  const versionRows=Object.entries(versions||{}).map(([k,v])=>[k,text(v)]);
  const reaudit=((comparison&&comparison.items)||[]).map(i=>[i.document,i.revision,i.allocation,i.id,labelOf(i.field),i.statusLabel,i.message,i.before,i.after]);

  const strip=list=>list.map(x=>x.cells);
  return {version:VERSION,contract,toFix:strip(toFix),proposals:strip(proposals),verified:strip(verified),
   references:{sources:sourceRows,versions:versionRows,decisions:decisionRows,exceptions:(exceptions||[]).map(e=>[text(e)])},reaudit,
   counts:{toFix:toFix.length,toFixErrors:toFix.filter(x=>x.rank===0).length,proposals:proposals.filter(x=>x.rank<3).length,preventive:proposals.filter(x=>x.rank===3).length,verified:verified.length,verifiedCopies:verified.filter(x=>x.cells[0].startsWith('Cópia')).length,verifiedByReaudit:verified.filter(x=>x.cells[0].startsWith('Reauditoria')).length,decisions:decisionRows.length,reaudit:reaudit.length}};
 }
 return Object.freeze({VERSION,HEADERS,build,labelOf,whyOf,WHY,STATUS_LABEL,whereOf,safeEvidence,valueOf});
});
