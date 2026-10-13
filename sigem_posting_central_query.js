(function(root,factory){
  "use strict";
  const a=root.GrconSigemCentralCore||(typeof require==="function"?require("./sigem_posting_central_core.js"):null);
  const api=factory(a);
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.GrconSigemCentralQuery=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(A){
  "use strict";
  if(!A)return null;
  const {Conference:C,STATUSES:S,text,norm,revision,identity}=A;
  const Refinement=typeof require==="function"?require("./posting_conference_refinement.js"):globalThis.GrconPostingConferenceRefinement;
  function consolidate(rows,baseRecords){
    // Reutiliza a regra oficial: mesma revisão enviada novamente = repostagem,
    // confirmação de revisão antiga NÃO promove a última revisão.
    const documents=Refinement.buildDocumentAggregates(rows,C);
    documents.push(...A.baseOnly(baseRecords,new Set(documents.map(row=>row.documentIdentity))));
    return documents.sort((a,b)=>
      text(b.generatedAt).localeCompare(text(a.generatedAt))||
      text(a.document).localeCompare(text(b.document),"pt-BR"));
  }
  function build(historyRecords,base,previousState,options){
    const history=Array.isArray(historyRecords)?historyRecords:[];
    const records=Array.isArray(base&&base.records)?base.records:[];
    const meta=base&&base.meta||{};
    const compare=C.reconcile(history,records,previousState||{},{
      baseReferenceDate:meta.referenceDate||meta.importedAt||"",
      now:options&&options.now,waitHours:options&&options.waitHours});
    const events=Refinement.enrichRows(A.enrich(compare.rows,history),records,C);
    const documents=consolidate(events,records);
    return {documents,events,revisions:events.slice().sort((a,b)=>
      text(b.generatedAt).localeCompare(text(a.generatedAt))),
      grdts:C.aggregateByGrdt(events),meta,hasBase:records.length>0};
  }
  function tokenizeList(raw){
    return [...new Set(String(raw||"").split(/[\r\n;,|\t]+/).map(text).filter(Boolean).map(norm))];
  }
  function rowsForView(data,view){
    if(view==="grdts")return data.grdts.map(g=>({
      ...g,key:"grdt:"+(g.historyId||g.egrdtNumber),
      document:g.egrdtNumber,egrdtNumber:g.egrdtNumber,
      revisionSent:"",revisionFound:"",title:g.rows.length+" documento(s)/revisão(ões)",
      statusLabel:C.pendingScope(g).label,status:g.classification,sigemStatus:"",
      generatedAt:g.generatedAt,sendCount:g.rows.length,
      note:C.pendingScope(g).detail
    }));
    if(view==="revisoes")return data.revisions;
    if(view==="pendencias")return data.documents.filter(r=>
      r.status!==S.CONFIRMED&&r.status!=="SEM_ENVIO");
    return data.documents;
  }
  function matches(row,term){
    return [row.document,row.title,row.egrdtNumber,row.latestEgrdtNumber,
      row.revisionSent,row.revisionFound,row.sigemStatus,row.discipline,
      row.allocation,row.purpose,row.statusLabel,row.note].some(value=>
      norm(value).includes(term));
  }
  function filter(data,view,query,filters){
    const source=rowsForView(data,view),term=norm(query),list=tokenizeList(query);
    const batch=list.length>1,found=new Set(),wanted=new Set(list);
    let rows=source.filter(row=>{
      if(!batch)return !term||matches(row,term);
      let hit=false;
      for(const key of C.documentKeys(row.document)){
        const code=norm(key);
        if(wanted.has(code)){found.add(code);hit=true;}
      }
      return hit;
    });
    const f=filters||{};
    rows=rows.filter(row=>{
      const isGrdt=view==="grdts";
      const statusMatch=!f.status||(isGrdt?(
        (f.status==="CONFIRMADO"&&row.classification==="TOTALMENTE_CONFIRMADA")||
        (f.status==="AGUARDANDO"&&row.awaiting>0)||
        (f.status==="NAO_ENCONTRADO"&&row.notFound>0)||
        (f.status==="REVISAO_DIVERGENTE"&&row.divergent>0)||
        (f.status==="REQUER_ANALISE"&&row.review>0)||
        (f.status==="NAO_VERIFICADO"&&row.notVerified>0)
      ):row.status===f.status);
      const revisionMatch=!f.revision||(isGrdt?
        row.rows.some(r=>revision(r.revisionSent)===revision(f.revision)):
        revision(row.revisionSent)===revision(f.revision));
      return statusMatch&&revisionMatch&&
        (!f.allocationState||row.allocationState===f.allocationState)&&
        (!f.start||text(row.generatedAt).slice(0,10)>=f.start)&&
        (!f.end||text(row.generatedAt).slice(0,10)<=f.end);
    });
    return {rows,missing:batch?list.filter(code=>!found.has(code)):[],
      listMode:batch,searched:list.length};
  }
  function csv(rows,keys){
    const columns=Array.isArray(keys)?keys:A.COLUMNS.map(item=>item[0]);
    const labels=Object.fromEntries(A.COLUMNS);
    const escape=v=>'"'+text(v).replace(/"/g,'""').replace(/^[=+\-@\t\r]/,"'$&")+'"';
    return "\uFEFF"+[columns.map(k=>escape(labels[k]||k)).join(";"),
      ...rows.map(row=>columns.map(k=>escape(row[k])).join(";"))].join("\r\n");
  }
  return Object.freeze({build,consolidate,filter,rowsForView,tokenizeList,csv});
});