(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorOpinion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Parecer canônico do Robô Auditor (Etapa 5). UMA fonte para o estado final, as contagens, o chat e o relatório.
 // Separa três unidades que não se misturam: DOCUMENTOS (linhas/documentos analisados), OCORRÊNCIAS (apontamentos do motor)
 // e PROPOSTAS (valores sugeridos). Cada ocorrência e cada proposta tem um ciclo de vida; só a reauditoria comprova resolução.
 //   proposta:   sugerida → autorizada | recusada → aplicada → resolvida-comprovada | contradita
 //   ocorrência: aberta/pendente → aplicada → resolvida-comprovada | resolucao-contradita ; ou excecao-justificada
 // A decisão VIGENTE é a última por (linhagem, campo, valor); revogar ou recusar depois de autorizar remove a autorização.
 const VERSION='1.0.0';
 const text=v=>v==null?'':String(v).trim();
 const fieldMatches=(finding,change)=>finding.field===change.field||(finding.field==='levels'&&/^N[1-6]$/.test(text(change.field)));
 const keyOf=(...p)=>JSON.stringify(p.map(text));

 function ordered(events){
  return (events||[]).map((e,i)=>({e,i})).sort((a,b)=>(a.e.at&&b.e.at?String(a.e.at).localeCompare(String(b.e.at)):0)||a.i-b.i).map(x=>x.e);
 }
 // Última decisão por (linhagem, campo, valor) e último evento de revisão por (linhagem, campo).
 function latestDecisions(events){
  const byValue=new Map(),byField=new Map();
  for(const e of ordered(events)){
   if(!e||!e.field)continue;
   byValue.set(keyOf(e.lineage,e.field,e.after),e);
   byField.set(keyOf(e.lineage,e.field),e);
  }
  return {byValue,byField};
 }
 const isException=e=>Boolean(e)&&e.state==='Exceção justificada'&&text(e.justification).length>=5&&Array.isArray(e.evidence)&&e.evidence.some(x=>text(x));

 function build(input={}){
  const rows=input.rows||[],decisions=latestDecisions(input.events);
  const files=input.files||[];
  const changes=files.flatMap(f=>(f.changes||[]).filter(c=>c.verified!==false).map(c=>({...c,file:f.name,consumed:false})));
  // Reauditoria (segunda auditoria das cópias geradas), quando existe: única prova de que um apontamento deixou de existir.
  const reaudit=Array.isArray(input.reaudit)?new Map(input.reaudit.map(r=>[r.lineage,r])):null;
  const lifecycle=[];
  const counts={
   rows:rows.length,documents:0,documentsClear:0,documentsWithErrors:0,documentsWithPending:0,
   occurrences:{total:0,errors:0,pending:0,suggestions:0,open:0,appliedUnproven:0,resolvedProven:0,contradicted:0,exceptions:0},
   proposals:{total:0,suggested:0,authorized:0,rejected:0,applied:0,resolvedProven:0,contradicted:0}
  };
  const docs=new Set(),docsErr=new Set(),docsPend=new Set(),docsClear=new Set();

  // Uma alteração só comprova o que diz resolver: cita achados (findingIds) → esses; senão, no máximo UM erro do mesmo campo.
  const coverOccurrence=(row,f)=>{
   const explicit=changes.find(c=>c.lineage===row.lineage&&Array.isArray(c.findingIds)&&f.id&&c.findingIds.includes(f.id));
   if(explicit)return explicit;
   const generic=changes.find(c=>!c.consumed&&c.lineage===row.lineage&&!Array.isArray(c.findingIds)&&fieldMatches(f,c));
   if(generic){generic.consumed=true;return generic;}
   return null;
  };
  // Uma proposta é coberta por alteração do MESMO valor (ou, sem valor informado, do mesmo campo) — sem gastar a cota dos achados.
  const coverProposal=(row,rec)=>changes.find(c=>c.lineage===row.lineage&&text(c.field)===text(rec.field)&&(c.after===undefined||text(c.after)===text(rec.after)))||null;

  for(const row of rows){
   const docKey=keyOf(row.document,row.revision);docs.add(docKey);
   const findings=row.findings||[],recs=row.recommendations||[];
   if(!findings.length&&!recs.length){docsClear.add(docKey);}
   for(const f of findings){
    counts.occurrences.total++;
    const entry={kind:'ocorrencia',lineage:row.lineage,document:row.document,revision:row.revision,id:f.id,field:f.field,severity:f.severity,state:'',evidence:[]};
    if(f.severity==='suggestion'){counts.occurrences.suggestions++;entry.state='sugestao';lifecycle.push(entry);continue;}
    f.severity==='error'?counts.occurrences.errors++:counts.occurrences.pending++;
    (f.severity==='error'?docsErr:docsPend).add(docKey);
    const change=coverOccurrence(row,f),review=decisions.byField.get(keyOf(row.lineage,f.field));
    if(change){
     entry.evidence.push({file:change.file,cell:change.cell,before:change.before,after:change.after});
     if(!reaudit){entry.state='aplicada';counts.occurrences.resolvedProven++;} // sem reauditoria separada: vale a verificação da própria cópia (verified !== false)
     else{
      const second=reaudit.get(row.lineage);
      if(!second){entry.state='aplicada-sem-reauditoria';counts.occurrences.appliedUnproven++;}
      else if((second.findings||[]).some(x=>x.id===f.id)){entry.state='resolucao-contradita';counts.occurrences.contradicted++;}
      else{entry.state='resolvida-comprovada';counts.occurrences.resolvedProven++;}
     }
    }else if(isException(review)){entry.state='excecao-justificada';entry.evidence=review.evidence;entry.actor=review.actor;counts.occurrences.exceptions++;}
    else{entry.state=f.severity==='error'?'aberta':'pendente';counts.occurrences.open++;}
    lifecycle.push(entry);
   }
   const seen=new Set();
   for(const rec of recs){
    if(!rec||!rec.field)continue;
    const k=keyOf(row.lineage,rec.field,rec.after);if(seen.has(k))continue;seen.add(k);
    counts.proposals.total++;
    const latest=decisions.byValue.get(k),entry={kind:'proposta',lineage:row.lineage,document:row.document,revision:row.revision,field:rec.field,before:rec.before,after:rec.after,state:'sugerida',decision:latest?latest.decision:'',actor:latest?latest.actor:'',decidedAt:latest?latest.at:'',evidence:rec.evidence||[]};
    const change=coverProposal(row,rec);
    if(change){
     entry.applied={file:change.file,cell:change.cell};
     if(!reaudit){entry.state='aplicada';counts.proposals.applied++;}
     else{
      const second=reaudit.get(row.lineage);
      if(second&&!(second.recommendations||[]).some(p=>p.field===rec.field&&text(p.after)===text(rec.after))){entry.state='resolvida-comprovada';counts.proposals.resolvedProven++;}
      else if(second){entry.state='contradita';counts.proposals.contradicted++;}
      else{entry.state='aplicada';counts.proposals.applied++;}
     }
    }else if(latest&&latest.decision==='accepted'){entry.state='autorizada';counts.proposals.authorized++;}
    else if(latest&&latest.decision==='rejected'){entry.state='recusada';counts.proposals.rejected++;}
    else counts.proposals.suggested++;
    lifecycle.push(entry);
   }
  }
  counts.documents=docs.size;counts.documentsClear=docsClear.size;counts.documentsWithErrors=docsErr.size;counts.documentsWithPending=docsPend.size;

  // Prontidão: só "pronta" sem nenhum impedimento. Sugestão preventiva não bloqueia; proposta aberta, pendência, referência bloqueada,
  // resolução contradita ou sem reauditoria bloqueiam. Nunca se declara prontidão por existir uma alteração no campo.
  const exceptions=(input.exceptions||[]).length,warning=input.contextWarning?1:0;
  const blockers=[];
  const add=(code,count,message)=>{if(count)blockers.push({code,count,message});};
  const openErrors=lifecycle.filter(x=>x.kind==='ocorrencia'&&(x.state==='aberta'||x.state==='resolucao-contradita')).length;
  add('ERRO-ABERTO',openErrors,'não conformidade(s) confirmada(s) sem correção comprovada');
  add('PENDENCIA-ABERTA',lifecycle.filter(x=>x.kind==='ocorrencia'&&x.state==='pendente').length,'verificação(ões) pendente(s) ou bloqueada(s) por falta de referência');
  add('PROPOSTA-ABERTA',lifecycle.filter(x=>x.kind==='proposta'&&(x.state==='sugerida'||x.state==='autorizada')).length,'proposta(s) de correção sem alteração verificada');
  add('SEM-REAUDITORIA',counts.occurrences.appliedUnproven,'correção(ões) aplicada(s) ainda sem reauditoria que comprove a resolução');
  add('PROPOSTA-CONTRADITA',counts.proposals.contradicted,'proposta(s) aplicada(s) que continuam aparecendo na reauditoria');
  add('EXCECAO-JUSTIFICADA',counts.occurrences.exceptions,'exceção(ões) justificada(s) que exigem conferência humana final');
  add('ARQUIVO-NAO-PRODUZIDO',exceptions,'arquivo(s) não produzido(s)');
  add('CONTEXTO-LIMITADO',warning,'bases complementares indisponíveis ou limitadas');
  const state=openErrors?'fix':blockers.length?'verify':'ready';
  return {version:VERSION,state,ready:state==='ready',blockers,counts,lifecycle,
   // Campos de compatibilidade com o estado final anterior.
   uncorrectedErrors:openErrors,pendingFindings:lifecycle.filter(x=>x.kind==='ocorrencia'&&x.state==='pendente').length,
   openProposals:lifecycle.filter(x=>x.kind==='proposta'&&(x.state==='sugerida'||x.state==='autorizada')).length,
   inconclusive:blockers.filter(b=>b.code!=='ERRO-ABERTO').reduce((n,b)=>n+b.count,0)};
 }

 // Frases prontas, com a unidade sempre dita (documento, ocorrência, proposta) — o chat e o relatório usam as mesmas.
 function describe(counts){
  const c=counts,o=c.occurrences,p=c.proposals;
  return {
   documents:c.rows+' linha(s) analisada(s), '+c.documents+' documento(s) distinto(s), '+c.documentsClear+' sem apontamentos',
   occurrences:o.total+' ocorrência(s): '+o.errors+' erro(s) confirmado(s), '+o.pending+' pendência(s), '+o.suggestions+' sugestão(ões) preventiva(s)',
   proposals:p.total+' proposta(s) de correção: '+p.suggested+' sugerida(s), '+p.authorized+' autorizada(s), '+p.rejected+' recusada(s), '+p.applied+' aplicada(s), '+p.resolvedProven+' com resolução comprovada'
  };
 }
 return Object.freeze({VERSION,build,describe,latestDecisions,isException,fieldMatches});
});
