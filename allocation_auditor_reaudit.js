(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorReaudit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Reauditoria (Etapa 7): compara o resultado ANTERIOR com o POSTERIOR da mesma alocação. Só a comparação prova que um apontamento
 // deixou de existir; uma alteração na célula não prova. Documentos que só existem de um lado não entram na comparação de apontamentos.
 const VERSION='1.0.1';
 const text=v=>v==null?'':String(v).trim();
 const rowKey=r=>JSON.stringify([text(r.contract),text(r.allocation),text(r.document),text(r.revision)]);
 const occurrenceKey=r=>text(r.sourceFile)&&text(r.sourceSheet)&&Number.isInteger(r.sourceRow)?JSON.stringify(['source',r.sourceFile,r.sourceSheet,r.sourceRow]):text(r.lineage)?JSON.stringify(['lineage',r.lineage]):null;
 function matchRows(before,after){
  const group=rows=>{const out=new Map();for(const r of rows||[]){const key=rowKey(r);if(!out.has(key))out.set(key,[]);out.get(key).push(r);}return out;};
  const b=group(before),a=group(after),pairs=[];
  const compatible=(x,y)=>!x.ruleVersion||!y.ruleVersion||x.ruleVersion===y.ruleVersion;
  for(const [key,left] of b){const right=a.get(key)||[];
   if(left.length===1&&right.length===1){if(compatible(left[0],right[0]))pairs.push([left[0],right[0]]);continue;}
   const indexed=rows=>{const out=new Map();for(const r of rows){const id=occurrenceKey(r);if(id){if(!out.has(id))out.set(id,[]);out.get(id).push(r);}}return out;};
   const old=indexed(left),next=indexed(right);
   for(const [id,rows] of old){const targets=next.get(id)||[];if(rows.length===1&&targets.length===1&&compatible(rows[0],targets[0]))pairs.push([rows[0],targets[0]]);}
  }
  return {b,a,pairs};
 }
 const findingKey=f=>JSON.stringify([text(f.id),text(f.field)]);
 const proposalKey=p=>JSON.stringify([text(p.field),text(p.after)]);
 const STATUS={resolved:'resolvida',persisting:'persiste',introduced:'nova'};
 const LABEL={resolvida:'Resolvida (comprovada pela reauditoria)',persiste:'Persiste após a correção',nova:'Nova após a correção'};

 function compare(before,after){
  const {b,a,pairs}=matchRows(before,after);
  const matchedByDoc=new Map();for(const [r] of pairs){const key=rowKey(r);matchedByDoc.set(key,(matchedByDoc.get(key)||0)+1);}
  const items=[],summary={documentsCompared:matchedByDoc.size,documentsOnlyBefore:0,documentsOnlyAfter:0,documentsFullyResolved:0,occurrencesCompared:pairs.length,occurrencesOnlyBefore:(before||[]).length-pairs.length,occurrencesOnlyAfter:(after||[]).length-pairs.length,resolved:0,persisting:0,introduced:0,
   errorsResolved:0,errorsPersisting:0,errorsIntroduced:0};
  for(const key of b.keys())if(!a.has(key))summary.documentsOnlyBefore++;
  for(const key of a.keys())if(!b.has(key))summary.documentsOnlyAfter++;
  for(const [rowBefore,rowAfter] of pairs){
   const base={document:text(rowBefore.document),revision:text(rowBefore.revision),allocation:text(rowBefore.allocation),lineage:rowBefore.lineage,afterLineage:rowAfter.lineage,sourceFile:rowAfter.sourceFile||rowBefore.sourceFile,sourceSheet:rowAfter.sourceSheet||rowBefore.sourceSheet,sourceRow:rowAfter.sourceRow||rowBefore.sourceRow};
   const push=(kind,status,item,counterpart)=>{
    const isError=kind==='ocorrencia'&&item.severity==='error';
    items.push({...base,kind,status,statusLabel:LABEL[status],id:kind==='ocorrencia'?text(item.id):'PROPOSTA',field:text(item.field),severity:kind==='ocorrencia'?text(item.severity):'proposta',
     message:kind==='ocorrencia'?text(item.message):'Valor sugerido para '+text(item.field),before:kind==='ocorrencia'?'':text(item.before),after:kind==='ocorrencia'?'':text(item.after),
     laterMessage:counterpart&&kind==='ocorrencia'?text(counterpart.message):''});
    if(status==='resolvida'){summary.resolved++;if(isError)summary.errorsResolved++;}
    if(status==='persiste'){summary.persisting++;if(isError)summary.errorsPersisting++;}
    if(status==='nova'){summary.introduced++;if(isError)summary.errorsIntroduced++;}
   };
   const laterFindings=new Map((rowAfter.findings||[]).map(f=>[findingKey(f),f])),earlierFindings=new Map((rowBefore.findings||[]).map(f=>[findingKey(f),f]));
   for(const f of rowBefore.findings||[]){
    if(f.severity==='suggestion')continue;
    const later=laterFindings.get(findingKey(f));
    if(later){push('ocorrencia','persiste',f,later);}else{push('ocorrencia','resolvida',f);}
   }
   for(const f of rowAfter.findings||[])if(f.severity!=='suggestion'&&!earlierFindings.has(findingKey(f)))push('ocorrencia','nova',f);
   const laterProposals=new Set((rowAfter.recommendations||[]).map(proposalKey)),earlierProposals=new Set((rowBefore.recommendations||[]).map(proposalKey));
   for(const p of rowBefore.recommendations||[]){if(laterProposals.has(proposalKey(p)))push('proposta','persiste',p);else{push('proposta','resolvida',p);}}
   for(const p of rowAfter.recommendations||[])if(!earlierProposals.has(proposalKey(p)))push('proposta','nova',p);
  }
  for(const [key,left] of b){const right=a.get(key)||[],matched=matchedByDoc.get(key)||0;
   if(left.length===right.length&&matched===left.length&&left.some(r=>(r.findings||[]).some(f=>f.severity!=='suggestion')||(r.recommendations||[]).length)&&right.every(r=>!(r.findings||[]).some(f=>f.severity!=='suggestion')&&!(r.recommendations||[]).length))summary.documentsFullyResolved++;
  }
  const regressions=summary.introduced>0;
  return {version:VERSION,items,summary,regressions,comparable:summary.documentsCompared>0};
 }
 // Linhas da reauditoria no formato que o parecer (allocation_auditor_opinion.js) espera, ligadas à linhagem do resultado anterior.
 function asReaudit(before,after){
  return matchRows(before,after).pairs.map(([r,x])=>({lineage:r.lineage,findings:x.findings||[],recommendations:x.recommendations||[]}));
 }
 function describe(cmp){
  if(!cmp||!cmp.comparable)return 'Sem resultado anterior comparável.';
  const s=cmp.summary;
  return 'Reauditoria de '+s.documentsCompared+' documento(s): '+s.resolved+' apontamento(s) resolvido(s) e comprovado(s), '+s.persisting+' persistente(s), '+s.introduced+' novo(s) após a correção.';
 }
 return Object.freeze({VERSION,compare,asReaudit,describe,LABEL,STATUS,rowKey});
});
