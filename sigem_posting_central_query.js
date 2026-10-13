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
    const previous=new Map();
    for(const row of events.slice().sort((a,b)=>text(a.generatedAt).localeCompare(text(b.generatedAt)))){
      const id=row.documentIdentity+"|"+revision(row.revisionSent);
      row.repostCount=previous.get(id)||0;previous.set(id,row.repostCount+1);
    }
    const now=Date.parse(options?.now||new Date().toISOString());
    for(const row of [...events,...documents]){
      const when=Date.parse(row.generatedAt);
      row.ageHours=Number.isFinite(when)?Math.max(0,Math.floor((now-when)/3600000)):"";
      row.egrdtHistory=(row.egrdtNumbers||[row.egrdtNumber]).filter(Boolean).join(" | ");
    }
    const revisions=events.slice().sort((a,b)=>text(b.generatedAt).localeCompare(text(a.generatedAt)));
    const grdts=C.aggregateByGrdt(events).map(g=>({...g,key:"grdt:"+(g.historyId||g.egrdtNumber),
      document:g.egrdtNumber,egrdtNumber:g.egrdtNumber,revisionSent:"",revisionFound:"",
      title:g.rows.length+" documento(s)/revisão(ões)",statusLabel:C.pendingScope(g).label,
      status:g.classification,sigemStatus:"",sendCount:g.rows.length,note:C.pendingScope(g).detail}));
    const indices={documentos:new Map(),revisoes:new Map(),grdts:new Map()};
    for(const [view,rows] of [["documentos",documents],["revisoes",revisions],["grdts",grdts]]){
      for(const row of rows){
        const items=view==="grdts"?row.rows||[]:[row];
        for(const item of items)for(const key of C.documentKeys(item.document)){
          const code=norm(key),map=indices[view];
          if(!map.has(code))map.set(code,new Set());
          map.get(code).add(row);
        }
      }
    }
    return {documents,events,revisions,grdts,indices,meta,confirmationState:compare.state,hasBase:records.length>0};
  }
  function tokenizeList(raw){
    return [...new Set(String(raw||"").split(/[\r\n;,|\t]+/).map(text).filter(Boolean).map(norm))];
  }
  function rowsForView(data,view){
    if(view==="grdts")return data.grdts;
    if(view==="revisoes")return data.revisions;
    if(view==="pendencias")return data.documents.filter(r=>
      r.status!==S.CONFIRMED&&r.status!=="SEM_ENVIO");
    return data.documents;
  }
  const searchCache=new WeakMap();
  function matches(row,term){
    if(!searchCache.has(row))searchCache.set(row,norm([
      row.document,row.title,row.egrdtNumber,row.latestEgrdtNumber,row.revisionSent,
      row.revisionFound,row.sigemStatus,row.discipline,row.allocation,row.purpose,
      row.statusLabel,row.note,row.egrdtHistory
    ].filter(Boolean).join(" ")));
    return searchCache.get(row).includes(term);
  }
  function filter(data,view,query,filters,sort){
    const source=rowsForView(data,view),term=norm(query),list=tokenizeList(query);
    const batch=Boolean(filters?.listMode)||list.length>1,found=new Set();
    let rows;
    if(batch&&data.indices){
      const index=data.indices[view==="pendencias"?"documentos":view];
      for(const code of list){
        const matching=index?.get(code);
        if(matching?.size){
          found.add(code);
        }
      }
      const allowed=new Set(source);
      rows=[];const added=new Set();
      for(const code of list)for(const item of index?.get(code)||[])
        if(allowed.has(item)&&!added.has(item)){added.add(item);rows.push(item);}
    }else{
      rows=source.filter(row=>!term||matches(row,term)||
        (view==="grdts"&&(row.rows||[]).some(item=>matches(item,term))));
    }
    const f=filters||{};
    const memberMatch=item=>
      (!f.status||item.status===f.status)&&
      (!f.revision||revision(item.revisionSent)===revision(f.revision))&&
      (!f.allocationState||item.allocationState===f.allocationState)&&
      (!f.discipline||norm(item.discipline)===norm(f.discipline))&&
      (!f.purpose||norm(item.purpose).includes(norm(f.purpose)))&&
      (!f.fiscal||norm([item.fiscalComment,item.fiscal2Comment].join(" ")).includes(norm(f.fiscal)))&&
      (!f.sigemStatus||norm(item.sigemStatus).includes(norm(f.sigemStatus)))&&
      (!f.reposts||(item.repostCount||0)>0)&&
      (!f.multipleRevisions||(item.revisionCount||0)>1)&&
      (!f.ageMinHours||(item.ageHours!==""&&Number(item.ageHours)>=Number(f.ageMinHours)))&&
      Object.entries(f.columns||{}).every(([key,value])=>!value||norm(item[key]).includes(norm(value)));
    rows=rows.filter(row=>{
      // Todos os filtros documentais devem corresponder ao MESMO integrante.
      const candidates=view==="grdts"?row.rows||[]:[row];
      return candidates.some(memberMatch)&&
        (!f.start||dateKey(row.generatedAt)>=f.start)&&
        (!f.end||Boolean(dateKey(row.generatedAt))&&dateKey(row.generatedAt)<=f.end);
    });
    return {rows:sortRows(rows,sort),missing:batch?list.filter(code=>!found.has(code)):[],
      listMode:batch,searched:list.length};
  }
  function dateKey(value){
    const raw=text(value);if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
    const br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return br?br[3]+"-"+br[2]+"-"+br[1]:"";
  }
  function sortRows(rows,sort){
    if(!sort?.key)return rows;
    const {key,dir="asc"}=sort,desc=dir==="desc"?-1:1;
    return rows.slice().sort((a,b)=>{
      const av=a[key],bv=b[key];
      if(key==="revisionSent"||key==="revisionFound")
        return desc*(C.revisionRank(av)-C.revisionRank(bv));
      if(key==="generatedAt")return desc*((Date.parse(dateKey(av))||0)-(Date.parse(dateKey(bv))||0));
      if(typeof av==="number"||typeof bv==="number")
        return desc*(Number(av||0)-Number(bv||0));
      return desc*text(av).localeCompare(text(bv),"pt-BR",{numeric:true,sensitivity:"base"});
    });
  }
  function csv(rows,keys){
    const columns=Array.isArray(keys)?keys:A.COLUMNS.map(item=>item[0]);
    const labels=Object.fromEntries(A.COLUMNS);
    const escape=v=>'"'+text(v).replace(/"/g,'""').replace(/^[=+\-@\t\r]/,"'$&")+'"';
    return "\uFEFF"+[columns.map(k=>escape(labels[k]||k)).join(";"),
      ...rows.map(row=>columns.map(k=>escape(row[k])).join(";"))].join("\r\n");
  }
  return Object.freeze({build,consolidate,filter,rowsForView,tokenizeList,sortRows,csv});
});