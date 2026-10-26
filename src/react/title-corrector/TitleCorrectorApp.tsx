import {useEffect,useMemo,useRef,useState} from 'react';
type Evidence={field:string;value:string;source:string;reference?:string;verified:boolean};
type TitleRow={id:string;sourceId?:string;sourceFile?:string;document:string;sheet:string;row:number;discipline:string;current:string;proposed:string;originalProposed:string;issue:string;reason:string;confidence:string;classification:string;tag:string;descriptionSource:string;facts:Evidence[];hasConflict:boolean;reviewRequired:boolean;decision:'pending'|'approved'|'kept';evidenceSummary:string;sourceRows:Record<string,number[]>};
type Analysis={rows:TitleRow[];files?:Array<{file:string;count:number}>;unmatched:string[];coverage?:{sheets?:Array<{sheet:string;rows:number;role:string}>;skippedSheets?:Array<{sheet:string;reason:string}>};sourceCounts:Record<string,number>;standard:string};
type Output={bytes:Uint8Array;name:string;changes:unknown[];preservation:{valid:boolean}};
type Responder={resolve:(value:any)=>void;reject:(reason:Error)=>void};
const labels:Record<string,string>={ok:'Adequado',empty:'Título vazio',generic:'Pouco específico',document_type:'Tipo documental',description_mismatch:'Descrição divergente',missing_tag:'TAG ausente',wrong_tag:'TAG incorreta',possible_identifier:'Identificador incerto',format:'Padronização',conflict:'Conflito'};
const factLabels:Record<string,string>={tipo:'Tipo documental',objeto:'O que é',localizacao:'Onde é',finalidade_documental:'Para que é / objetivo documental',eap_classificacao:'EAP — classificação, não localização física'};
const fileDownload=(bytes:Uint8Array,name:string,kind:string)=>{const blob=new Blob([new Uint8Array(bytes)],{type:kind}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
const csvEscape=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"';
function useTitleWorker(){
 const worker=useRef<Worker|null>(null),seq=useRef(0),pending=useRef(new Map<number,Responder>());
 useEffect(()=>()=>{worker.current?.terminate();pending.current.forEach(item=>item.reject(new Error('Operação interrompida.')));pending.current.clear();},[]);
 function call<T>(op:string,input:object):Promise<T>{
   if(!worker.current){
     const target=new Worker(new URL('workers/title-corrector.worker.js',document.baseURI));
     target.onmessage=event=>{const {id,result,error}=event.data||{},task=pending.current.get(id);if(!task)return;pending.current.delete(id);error?task.reject(new Error(error)):task.resolve(result);};
     target.onerror=event=>{const error=new Error(event.message||'Falha no motor documental.');pending.current.forEach(item=>item.reject(error));pending.current.clear();};
     worker.current=target;
   }
   return new Promise((resolve,reject)=>{const id=++seq.current;pending.current.set(id,{resolve,reject});worker.current!.postMessage({id,op,input});});
 }
 return call;
}
export function TitleCorrectorApp(){
 const call=useTitleWorker(),[files,setFiles]=useState<File[]>([]),[reference,setReference]=useState<File|null>(null),
 [codeText,setCodeText]=useState(''),[sourceMode,setSourceMode]=useState('auto'),[analysis,setAnalysis]=useState<Analysis|null>(null),
 [rows,setRows]=useState<TitleRow[]>([]),[selected,setSelected]=useState<Set<string>>(new Set()),[detail,setDetail]=useState<string|null>(null),
 [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[sheet,setSheet]=useState(''),[busy,setBusy]=useState(false),
 [message,setMessage]=useState(''),[scrollTop,setScrollTop]=useState(0),[history,setHistory]=useState<Array<{id:string;approved_title:string;approved_at:string;actor_id:string;source_reference:string}>>([]);
 const inputRef=useRef<HTMLInputElement>(null);
 const cloud=()=> (window as unknown as {GrconCloud?:{state?:any}}).GrconCloud?.state;
 const scope=()=>String(cloud()?.membership?.workspace_id||'');
 const visible=useMemo(()=>rows.filter(row=>{
    const hay=[row.document,row.current,row.proposed,row.sheet,row.sourceFile||'',row.discipline,row.tag].join(' ').toLocaleUpperCase('pt-BR');
    return (!search||hay.includes(search.toLocaleUpperCase('pt-BR'))) && (!sheet||row.sheet===sheet) &&
      (filter==='all'||filter==='approved'&&row.decision==='approved'||filter==='review'&&row.reviewRequired||
      filter==='pending'&&row.decision==='pending'&&row.issue!=='ok'||filter==='ok'&&row.issue==='ok'||
      filter==='conflict'&&row.hasConflict||filter==='kept'&&row.decision==='kept');
 }),[rows,search,filter,sheet]);
 const active=rows.find(r=>r.id===detail)||null;
 const sheets=useMemo(()=>[...new Set(rows.map(r=>r.sheet).filter(Boolean))].sort(),[rows]);
 const totalApproved=rows.filter(r=>r.decision==='approved'&&r.proposed.trim()&&r.proposed.trim()!==r.current.trim()&&!r.hasConflict).length;
 const metrics=[['Analisados',rows.length],['Adequados',rows.filter(r=>r.issue==='ok').length],['Revisão pendente',rows.filter(r=>r.decision==='pending'&&r.issue!=='ok').length],['Aprovados',totalApproved]];
 const resetResult=()=>{setAnalysis(null);setRows([]);setSelected(new Set());setDetail(null);setHistory([]);setScrollTop(0);setMessage('');};
 useEffect(()=>{
  const reset=()=>{setFiles([]);resetResult();};
  window.addEventListener('grcon:contract-context-changed',reset);
  window.addEventListener('grcon:cloud-signed-out',reset);
  return ()=>{window.removeEventListener('grcon:contract-context-changed',reset);window.removeEventListener('grcon:cloud-signed-out',reset);};
 },[]);
 async function decisionRpc(operation:'list'|'approve'|'invalidate',input:Record<string,unknown>){
   const context=cloud(),workspace=context?.membership?.workspace_id;
   if(!workspace||!context?.session?.user?.id||!context?.client?.rpc||context.online===false)throw Error('Entre no contrato para consultar ou compartilhar decisões.');
   const result=await context.client.rpc('grcon_title_decisions',{target_workspace:workspace,operation,input});
   if(scope()!==workspace)throw Error('O contrato foi alterado. Repita a operação no contrato atual.');
   if(result.error)throw Error(result.error.message||'Não foi possível registrar a decisão.');
   return result.data;
 }
 useEffect(()=>{
   const row=rows.find(r=>r.id===detail);if(!row){setHistory([]);return;}
   let cancelled=false;const workspace=scope();
   void decisionRpc('list',{q:row.document}).then(data=>{if(!cancelled&&scope()===workspace)setHistory(data?.rows||[]);}).catch(()=>{if(!cancelled)setHistory([]);});
   return ()=>{cancelled=true;};
 },[detail]);
 async function publishDecision(row:TitleRow){
   return decisionRpc('approve',{document:row.document,title:row.proposed,current:row.current,source:row.descriptionSource,
      evidence:row.facts.filter(f=>f.verified).slice(0,30).map(f=>({field:f.field,value:f.value,source:f.source}))});
 }
 async function approveOne(row:TitleRow){
   setBusy(true);
   try{if(!row.hasConflict&&row.proposed.trim()){await publishDecision(row);decide(row.id,'approved');setDetail(null);setMessage('Título aprovado e registrado no histórico compartilhado do contrato.');}}
   catch(e){setMessage('Aprovação não registrada: '+(e instanceof Error?e.message:String(e)));}
   finally{setBusy(false);}
 }
 async function invalidate(id:string){
   setBusy(true);
   try{await decisionRpc('invalidate',{id});setHistory(prev=>prev.filter(x=>x.id!==id));setMessage('Decisão invalidada no histórico compartilhado.');}
   catch(e){setMessage('Não foi possível invalidar: '+(e instanceof Error?e.message:String(e)));}
   finally{setBusy(false);}
 }
 async function runAi(row:TitleRow){
   const ctx=cloud(),workspace=scope(),token=ctx?.session?.access_token;
   if(!workspace||!token){setMessage('Conecte-se ao contrato para consultar a IA. A análise por regras continua disponível.');return;}
   const facts=row.facts.filter(f=>f.verified&&['tipo','objeto','localizacao','finalidade_documental','eap_classificacao'].includes(f.field)).slice(0,12);
   if(!facts.length||!row.proposed.trim()){setMessage('Não há evidências suficientes para a IA. Revise manualmente.');return;}
   setBusy(true);
   try{
    const choices=[row.proposed,...(row.current&&row.current!==row.proposed?[row.current]:[])].map((title,i)=>({id:'title:'+i,title}));
    const resp=await fetch('/api/document-vault/title-ai',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
      body:JSON.stringify({workspaceId:workspace,document:row.document,candidates:choices,evidence:facts.map((f,i)=>({id:'fact:'+i,field:f.field,value:f.value,source:f.source}))})});
    const data=await resp.json();if(!resp.ok||!data.ok)throw Error(data.message||'IA indisponível.');
    if(scope()!==workspace)throw Error('Contrato alterado durante a consulta.');
    const chosen=choices.find(c=>c.id===data.candidateId);if(!chosen||chosen.title!==data.title)throw Error('Resposta da IA não foi validada.');
    alter(row.id,{proposed:chosen.title,decision:'pending'});
    setMessage('IA (revisão auxiliar, sem aprovação): '+data.reason+' · '+(data.citations||[]).map((e:Evidence)=>e.source).join(' / '));
   }catch(e){setMessage('IA indisponível: '+(e instanceof Error?e.message:String(e))+' A sugestão técnica permanece disponível.');}
   finally{setBusy(false);}
 }

 const alter=(id:string,change:Partial<TitleRow>)=>setRows(previous=>previous.map(row=>row.id===id?{...row,...change}:row));
 const decide=(id:string,decision:TitleRow['decision'])=>alter(id,{decision});
 const selectedInView=visible.filter(r=>selected.has(r.id));
 const selectView=(checked:boolean)=>setSelected(prev=>{const next=new Set(prev);visible.forEach(r=>{if(checked)next.add(r.id);else next.delete(r.id);});return next;});
 const approveSelection=async()=>{
  const eligible=selectedInView.filter(row=>!row.hasConflict&&row.proposed.trim()).slice(0,50),approved=new Set<string>(),failed:string[]=[];
  setBusy(true);
  try{
   for(const row of eligible){
    try{await publishDecision(row);approved.add(row.id);}catch(e){failed.push(row.document+': '+(e instanceof Error?e.message:String(e)));}
   }
   setRows(prev=>prev.map(r=>approved.has(r.id)?{...r,decision:'approved'}:r));
   setSelected(new Set());
   setMessage(approved.size+' título(s) aprovados e registrados no contrato. '+(failed.length?failed.length+' não registrados — consulte a situação e repita.':''));
  }finally{setBusy(false);}
 };
 const analyze=async()=>{
   if(!files.length)return setMessage('Selecione ao menos uma LD para iniciar a análise.');
   setBusy(true);resetResult();
   try{
     if(files.length>8||files.some(file=>file.size>50*1024*1024)||files.reduce((sum,file)=>sum+file.size,0)>120*1024*1024)throw Error('Máximo: 8 LDs, 50 MB por arquivo e 120 MB no lote.');
     const codes=[...new Set(codeText.split(/[;\n\r\t,]+/).map(s=>s.trim()).filter(Boolean))];
     const data:Analysis=await call('analyzeBatch',{files:await Promise.all(files.map(async file=>({name:file.name,bytes:await file.arrayBuffer()}))),codes,sourceMode,
       referenceBytes:reference?await reference.arrayBuffer():null});
     setAnalysis(data);setRows(data.rows);
     setMessage(data.rows.length+' documento(s) avaliados. '+(data.unmatched.length?data.unmatched.length+' código(s) não localizado(s).':'Confira as evidências antes de aprovar.'));
   }catch(error){setMessage('Falha na análise: '+(error instanceof Error?error.message:String(error)));}
   finally{setBusy(false);}
 };
 const exportLd=async()=>{
   setBusy(true);setMessage('');
   try{
     const output:Output=await call('exportBatch',{rows:rows.filter(row=>row.decision==='approved')});
     if(!output.preservation?.valid)throw Error('A preservação da LD não foi confirmada.');
     fileDownload(output.bytes,output.name,output.name.endsWith('.zip')?'application/zip':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
     setMessage('Cópia conferida: '+output.changes.length+' célula(s) aprovadas alteradas. Original preservado.');
   }catch(error){setMessage('Exportação interrompida: '+(error instanceof Error?error.message:String(error)));}
   finally{setBusy(false);}
 };
 const exportReport=()=>{
   const header=['DOCUMENTO','ABA','LINHA','DISCIPLINA','TITULO ATUAL','TITULO RECOMENDADO','DECISAO','SITUACAO','CONFIANCA','FONTE PRINCIPAL','EVIDENCIAS'];
   const data=visible.map(row=>[row.document,row.sheet,row.row,row.discipline,row.current,row.proposed,row.decision,labels[row.issue]||row.issue,row.confidence,row.descriptionSource,row.facts.map(f=>f.field+': '+f.value+' ('+f.source+')').join(' | ')]);
   const csv='\ufeff'+[header,...data].map(line=>line.map(csvEscape).join(';')).join('\r\n');
   fileDownload(new TextEncoder().encode(csv),'GRCON_Relatorio_Titulos.csv','text/csv;charset=utf-8');
 };
 const exportExcel=async()=>{
   setBusy(true);setMessage('');
   try{const result:{bytes:Uint8Array;name:string}=await call('report',{rows:visible});
     fileDownload(result.bytes,result.name,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
     setMessage('Relatório Excel das '+visible.length+' linhas filtradas gerado.');
   }catch(error){setMessage('Falha no relatório: '+(error instanceof Error?error.message:String(error)));}
   finally{setBusy(false);}
 };
 const exportPackage=async()=>{
   setBusy(true);setMessage('');
   try{const result:{bytes:Uint8Array;name:string;items:string[]}=await call('packageBatch',{rows:rows.filter(r=>r.decision==='approved'),reportRows:visible});
     fileDownload(result.bytes,result.name,'application/zip');
     setMessage('Pacote gerado com '+result.items.length+' arquivo(s).');
   }catch(error){setMessage('Falha no pacote: '+(error instanceof Error?error.message:String(error)));}
   finally{setBusy(false);}
 };
 const ITEM_HEIGHT=106,viewport=500,start=Math.max(0,Math.floor(scrollTop/ITEM_HEIGHT)-4),end=Math.min(visible.length,start+Math.ceil(viewport/ITEM_HEIGHT)+9);
 return <div className="tc-root">
   <header className="tc-header"><div><small>FERRAMENTAS ADICIONAIS / QUALIDADE DOCUMENTAL</small><h2>Corretor Inteligente de Títulos</h2><p>Identifique o que é, onde se aplica e para que serve — com evidências verificáveis e aprovação antes da alteração.</p></div><button type="button" className="secondary-button" data-grcon-view="additional-tools">Voltar às ferramentas</button></header>
   <section className="tc-panel tc-source" aria-label="Preparar análise">
     <div className="tc-source-grid">
       <label className="tc-upload"><strong>1. LDs originais (até 8 XLSX/XLSM)</strong><input ref={inputRef} type="file" multiple accept=".xlsx,.xlsm" onChange={e=>{setFiles(Array.from(e.currentTarget.files||[]));resetResult();}}/><small>{files.length?files.map(f=>f.name).join(' · '):'Selecione uma ou várias LDs. Os arquivos permanecem no navegador.'}</small></label>
       <label className="tc-upload"><strong>2. Base complementar (opcional)</strong><input type="file" accept=".xlsx,.xlsm" onChange={e=>{setReference(e.currentTarget.files?.[0]||null);resetResult();}}/><small>{reference?reference.name:'SCON TAG SGP ou relação controlada de títulos'}</small></label>
       <label><strong>3. Fonte da descrição</strong><select value={sourceMode} onChange={e=>{setSourceMode(e.target.value);resetResult();}}><option value="auto">Automático — bases oficiais</option><option value="scon_only">Somente SCON TAG SGP</option><option value="appendix_only">Somente Apêndice 3</option></select></label>
     </div>
     <label className="tc-codes"><strong>4. Códigos específicos (opcional)</strong><textarea rows={2} value={codeText} onChange={e=>setCodeText(e.target.value)} placeholder="Cole um código por linha. Em branco, analisa toda a LD."/></label>
     <div className="tc-actions"><p>ET Rev. R · LI de válvulas Rev. C · Apêndice 3 · SCON ESCOPO · correções controladas do RECON</p><button className="primary-button" disabled={!files.length||busy} onClick={()=>void analyze()}>{busy?'Processando…':'Analisar títulos da LD'}</button></div>
   </section>
   {message&&<p className="tc-feedback" role="status">{message}</p>}
   {analysis&&<><div className="tc-metrics">{metrics.map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
   <section className="tc-panel"><div className="tc-section-heading"><div><h3>Resultados da análise</h3><p>{analysis.files?.length||1} LD(s) · {analysis.standard} · {analysis.sourceCounts.controlled} referências controladas · {analysis.sourceCounts.valve} válvulas ativas · {analysis.sourceCounts.appendix} registros no Apêndice · {analysis.sourceCounts.escopo} registros SCON ESCOPO</p></div></div>
     {analysis.unmatched.length>0&&<details className="tc-warning"><summary>{analysis.unmatched.length} código(s) não localizado(s) na LD</summary><p>{analysis.unmatched.join(' · ')}</p></details>}
     {Boolean(analysis.coverage?.skippedSheets?.length)&&<details className="tc-warning"><summary>Abas sem leitura técnica: {analysis.coverage?.skippedSheets?.length}</summary>{analysis.coverage?.skippedSheets?.map(x=><p key={x.sheet}>{x.sheet}: {x.reason}</p>)}</details>}
     <div className="tc-filters"><input aria-label="Pesquisar documento e título" placeholder="Buscar código, TAG, título ou disciplina" value={search} onChange={e=>{setSearch(e.target.value);setScrollTop(0);}}/><select aria-label="Filtrar situação" value={filter} onChange={e=>{setFilter(e.target.value);setScrollTop(0);}}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="review">Conferência necessária</option><option value="conflict">Conflitos</option><option value="ok">Adequados</option><option value="approved">Aprovados</option><option value="kept">Mantidos</option></select><select aria-label="Filtrar aba" value={sheet} onChange={e=>{setSheet(e.target.value);setScrollTop(0);}}><option value="">Todas as abas</option>{sheets.map(s=><option key={s}>{s}</option>)}</select></div>
     <div className="tc-toolbar"><label><input type="checkbox" checked={Boolean(visible.length&&visible.every(r=>selected.has(r.id)))} onChange={e=>selectView(e.target.checked)}/> Selecionar filtrados ({selectedInView.length})</label><button className="secondary-button" disabled={!selectedInView.length||busy} onClick={()=>void approveSelection()}>Aprovar selecionados elegíveis (máx. 50)</button><span className="tc-spacer"/><span>{visible.length} resultado(s)</span></div>
     <div className="tc-table-header"><span>Documento</span><span>Título atual</span><span>Recomendação</span><span>Situação</span><span></span></div>
     <div className="tc-list" style={{height:Math.min(viewport,Math.max(110,visible.length*ITEM_HEIGHT))}} onScroll={e=>setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{height:visible.length*ITEM_HEIGHT,position:'relative'}}>
       {visible.slice(start,end).map((row,i)=><div className="tc-row" key={row.id} style={{position:'absolute',top:(start+i)*ITEM_HEIGHT,height:ITEM_HEIGHT}}>
        <div className="tc-row-code"><label><input type="checkbox" checked={selected.has(row.id)} onChange={e=>setSelected(prev=>{const n=new Set(prev);e.target.checked?n.add(row.id):n.delete(row.id);return n;})}/><strong title={row.document}>{row.document}</strong></label><small>{row.sourceFile?row.sourceFile+' / ':''}{row.sheet} · {row.discipline}</small></div>
        <p title={row.current}>{row.current||'Título vazio'}</p><p className="tc-suggested" title={row.proposed}>{row.proposed||'Sem sugestão segura'}</p><div className="tc-status"><strong>{labels[row.issue]||row.issue}</strong><small>{row.decision==='approved'?'Aprovado':row.decision==='kept'?'Mantido':row.hasConflict?'Revisão manual':row.confidence}</small></div>
        <button className="secondary-button" onClick={()=>setDetail(row.id)}>Revisar</button>
       </div>)}
      </div>
     </div>
     <div className="tc-actions"><p>Somente os títulos aprovados serão escritos na cópia. Todos os demais dados da LD permanecem preservados.</p><button className="secondary-button" disabled={!visible.length||busy} onClick={exportReport}>Relatório CSV filtrado</button><button className="secondary-button" disabled={!visible.length||busy} onClick={()=>void exportExcel()}>Relatório Excel</button><button className="secondary-button" disabled={!visible.length||busy} onClick={()=>void exportPackage()}>Baixar pacote ZIP</button><button className="primary-button" disabled={!totalApproved||busy} onClick={()=>void exportLd()}>Gerar cópia da LD ({totalApproved})</button></div>
   </section></>}
   {active&&<div className="tc-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null);}}><aside className="tc-drawer" role="dialog" aria-modal="true" aria-label="Revisar título">
      <header><div><small>REVISÃO DOCUMENTAL</small><h3>{active.document}</h3><p>{labels[active.issue]||active.issue} · {active.confidence}</p></div><button className="secondary-button" onClick={()=>setDetail(null)} aria-label="Fechar painel">Fechar</button></header>
      <div className="tc-drawer-body"><section><h4>Título atual</h4><p>{active.current||'Vazio'}</p></section>
      <section><h4>Evidências — o que, onde e para que</h4>{['objeto','localizacao','finalidade_documental','eap_classificacao'].map(field=>{const fact=active.facts.find(f=>f.field===field);return <div className="tc-fact" key={field}><strong>{factLabels[field]}</strong><p>{fact?.value||'Não comprovado nas bases consultadas'}</p>{fact&&<small>{fact.source}{fact.reference?' · '+fact.reference:''}</small>}</div>})}</section>
      <section><h4>Referência normativa</h4>{active.facts.filter(f=>f.field==='tipo').map((fact,i)=><p key={i}>{fact.value}<br/><small>{fact.source}</small></p>)}<p>{active.reason}</p></section>
      <section><label className="tc-edit"><strong>Título final proposto</strong><textarea rows={5} spellCheck={false} value={active.proposed} onChange={e=>alter(active.id,{proposed:e.target.value,decision:'pending'})}/></label><button className="secondary-button" onClick={()=>alter(active.id,{proposed:active.originalProposed,decision:'pending'})}>Restaurar recomendação técnica</button></section>
      {active.hasConflict&&<p className="tc-warning">Existem conflitos ou fontes ambíguas. A exportação desta linha fica bloqueada até uma conferência documental segura.</p>}
      <section><h4>Histórico de títulos aprovados neste contrato</h4>{history.length?history.map(decision=><div className="tc-fact" key={decision.id}><strong>{decision.approved_title}</strong><p><small>{new Date(decision.approved_at).toLocaleString('pt-BR')} · {decision.source_reference||'Revisão humana'}</small></p><button className="secondary-button" disabled={busy} onClick={()=>void invalidate(decision.id)}>Invalidar (administração)</button></div>):<p>Não há correções compartilhadas ativas para este documento.</p>}</section>
      <section><h4>Fontes e referências</h4><p>{active.evidenceSummary}</p>{Object.entries(active.sourceRows).filter(([,value])=>value.length).map(([kind,value])=><p key={kind}><strong>{kind.toUpperCase()}:</strong> registro(s) {value.join(', ')}</p>)}</section>
      </div><footer className="tc-actions"><button className="secondary-button" onClick={()=>{decide(active.id,'kept');setDetail(null);}}>Manter título atual</button><button className="secondary-button" disabled={busy||active.hasConflict||!active.proposed.trim()} onClick={()=>void runAi(active)}>Consultar IA</button><button className="primary-button" disabled={busy||active.hasConflict||!active.proposed.trim()} onClick={()=>void approveOne(active)}>Aprovar e registrar</button></footer>
   </aside></div>}
 </div>;
}
