(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorReaudit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Reauditoria (Etapa 7): compara o resultado ANTERIOR com o POSTERIOR da mesma alocação. Só a comparação prova que um apontamento
 // deixou de existir; uma alteração na célula não prova. Documentos que só existem de um lado não entram na comparação de apontamentos.
 const VERSION='1.0.0';
 const text=v=>v==null?'':String(v).trim();
 const rowKey=r=>JSON.stringify([text(r.allocation),text(r.document),text(r.revision)]);
 const findingKey=f=>JSON.stringify([text(f.id),text(f.field)]);
 const proposalKey=p=>JSON.stringify([text(p.field),text(p.after)]);
 const STATUS={resolved:'resolvida',persisting:'persiste',introduced:'nova'};
 const LABEL={resolvida:'Resolvida (comprovada pela reauditoria)',persiste:'Persiste após a correção',nova:'Nova após a correção'};

 function compare(before,after){
  const b=new Map((before||[]).map(r=>[rowKey(r),r])),a=new Map((after||[]).map(r=>[rowKey(r),r]));
  const items=[],summary={documentsCompared:0,documentsOnlyBefore:0,documentsOnlyAfter:0,documentsFullyResolved:0,resolved:0,persisting:0,introduced:0,
   errorsResolved:0,errorsPersisting:0,errorsIntroduced:0};
  for(const key of b.keys())if(!a.has(key))summary.documentsOnlyBefore++;
  for(const key of a.keys())if(!b.has(key))summary.documentsOnlyAfter++;
  for(const [key,rowBefore] of b){
   const rowAfter=a.get(key);if(!rowAfter)continue;
   summary.documentsCompared++;
   const base={document:text(rowBefore.document),revision:text(rowBefore.revision),allocation:text(rowBefore.allocation),lineage:rowBefore.lineage};
   let hadOpen=0,resolvedHere=0;
   const push=(kind,status,item,counterpart)=>{
    const isError=kind==='ocorrencia'&&item.severity==='error';
    items.push({...base,kind,status,statusLabel:LABEL[status],id:kind==='ocorrencia'?text(item.id):'PROPOSTA',field:text(item.field),severity:kind==='ocorrencia'?text(item.severity):'proposta',
     message:kind==='ocorrencia'?text(item.message):'Valor sugerido para '+text(item.field),before:kind==='ocorrencia'?'':text(item.before),after:kind==='ocorrencia'?'':text(item.after),
     laterMessage:counterpart&&kind==='ocorrencia'?text(counterpart.message):''});
    if(status==='resolvida'){summary.resolved++;if(isError)summary.errorsResolved++;}
    if(status==='persiste'){summary.persisting++;if(isError)summary.errorsPersisting++;}
    if(status==='nova'){summary.introduced++;if(isError)summary.errorsIntroduced++;}
   };
   const openBefore=(rowBefore.findings||[]).filter(f=>f.severity!=='suggestion');
   const laterFindings=new Map((rowAfter.findings||[]).map(f=>[findingKey(f),f])),earlierFindings=new Map((rowBefore.findings||[]).map(f=>[findingKey(f),f]));
   for(const f of rowBefore.findings||[]){
    if(f.severity==='suggestion')continue;hadOpen++;
    const later=laterFindings.get(findingKey(f));
    if(later){push('ocorrencia','persiste',f,later);}else{push('ocorrencia','resolvida',f);resolvedHere++;}
   }
   for(const f of rowAfter.findings||[])if(f.severity!=='suggestion'&&!earlierFindings.has(findingKey(f)))push('ocorrencia','nova',f);
   const laterProposals=new Set((rowAfter.recommendations||[]).map(proposalKey)),earlierProposals=new Set((rowBefore.recommendations||[]).map(proposalKey));
   for(const p of rowBefore.recommendations||[]){hadOpen++;if(laterProposals.has(proposalKey(p)))push('proposta','persiste',p);else{push('proposta','resolvida',p);resolvedHere++;}}
   for(const p of rowAfter.recommendations||[])if(!earlierProposals.has(proposalKey(p)))push('proposta','nova',p);
   if(hadOpen&&resolvedHere===hadOpen&&!(rowAfter.findings||[]).some(f=>f.severity!=='suggestion')&&!(rowAfter.recommendations||[]).length)summary.documentsFullyResolved++;
   void openBefore;
  }
  const regressions=summary.introduced>0;
  return {version:VERSION,items,summary,regressions,comparable:summary.documentsCompared>0};
 }
 // Linhas da reauditoria no formato que o parecer (allocation_auditor_opinion.js) espera, ligadas à linhagem do resultado anterior.
 function asReaudit(before,after){
  const a=new Map((after||[]).map(r=>[rowKey(r),r]));
  return (before||[]).filter(r=>a.has(rowKey(r))).map(r=>{const x=a.get(rowKey(r));return {lineage:r.lineage,findings:x.findings||[],recommendations:x.recommendations||[]};});
 }
 function describe(cmp){
  if(!cmp||!cmp.comparable)return 'Sem resultado anterior comparável.';
  const s=cmp.summary;
  return 'Reauditoria de '+s.documentsCompared+' documento(s): '+s.resolved+' apontamento(s) resolvido(s) e comprovado(s), '+s.persisting+' persistente(s), '+s.introduced+' novo(s) após a correção.';
 }
 return Object.freeze({VERSION,compare,asReaudit,describe,LABEL,STATUS,rowKey});
});
