import {useEffect,useMemo,useRef,useState} from 'react';
type Evidence={field:string;value:string;source:string;reference?:string;verified:boolean};
type TitleRow={id:string;document:string;sheet:string;row:number;discipline:string;current:string;proposed:string;originalProposed:string;issue:string;reason:string;confidence:string;classification:string;tag:string;descriptionSource:string;facts:Evidence[];hasConflict:boolean;reviewRequired:boolean;decision:'pending'|'approved'|'kept';evidenceSummary:string;sourceRows:Record<string,number[]>};
type Analysis={rows:TitleRow[];unmatched:string[];coverage?:{sheets?:Array<{sheet:string;rows:number;role:string}>;skippedSheets?:Array<{sheet:string;reason:string}>};sourceCounts:Record<string,number>;standard:string};
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
 const call=useTitleWorker(),[file,setFile]=useState<File|null>(null),[reference,setReference]=useState<File|null>(null),
 [codeText,setCodeText]=useState(''),[sourceMode,setSourceMode]=useState('auto'),[analysis,setAnalysis]=useState<Analysis|null>(null),
 [rows,setRows]=useState<TitleRow[]>([]),[selected,setSelected]=useState<Set<string>>(new Set()),[detail,setDetail]=useState<string|null>(null),
 [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[sheet,setSheet]=useState(''),[busy,setBusy]=useState(false),
 [message,setMessage]=useState(''),[scrollTop,setScrollTop]=useState(0);
 const inputRef=useRef<HTMLInputElement>(null);
 const visible=useMemo(()=>rows.filter(row=>{
    const hay=[row.document,row.current,row.proposed,row.sheet,row.discipline,row.tag].join(' ').toLocaleUpperCase('pt-BR');
    return (!search||hay.includes(search.toLocaleUpperCase('pt-BR'))) && (!sheet||row.sheet===sheet) &&
      (filter==='all'||filter==='approved'&&row.decision==='approved'||filter==='review'&&row.reviewRequired||
      filter==='pending'&&row.decision==='pending'&&row.issue!=='ok'||filter==='ok'&&row.issue==='ok'||
      filter==='conflict'&&row.hasConflict||filter==='kept'&&row.decision==='kept');
 }),[rows,search,filter,sheet]);
 const active=rows.find(r=>r.id===detail)||null;
 const sheets=useMemo(()=>[...new Set(rows.map(r=>r.sheet).filter(Boolean))].sort(),[rows]);
 const totalApproved=rows.filter(r=>r.decision==='approved'&&r.proposed.trim()&&r.proposed.trim()!==r.current.trim()&&!r.hasConflict).length;
 const metrics=[['Analisados',rows.length],['Adequados',rows.filter(r=>r.issue==='ok').length],['Revisão pendente',rows.filter(r=>r.decision==='pending'&&r.issue!=='ok').length],['Aprovados',totalApproved]];
 const resetResult=()=>{setAnalysis(null);setRows([]);setSelected(new Set());setDetail(null);setScrollTop(0);setMessage('');};
 const alter=(id:string,change:Partial<TitleRow>)=>setRows(previous=>previous.map(row=>row.id===id?{...row,...change}:row));
 const decide=(id:string,decision:TitleRow['decision'])=>alter(id,{decision});
 const selectedInView=visible.filter(r=>selected.has(r.id));
 const selectView=(checked:boolean)=>setSelected(prev=>{const next=new Set(prev);visible.forEach(r=>{if(checked)next.add(r.id);else next.delete(r.id);});return next;});
 const approveSelection=()=>{const ids=new Set(selectedInView.filter(row=>!row.hasConflict&&row.proposed.trim()).map(r=>r.id));setRows(prev=>prev.map(r=>ids.has(r.id)?{...r,decision:'approved'}:r));setSelected(new Set());setMessage(ids.size+' título(s) aprovado(s) para geração da cópia.');};
 const analyze=async()=>{
   if(!file)return setMessage('Selecione a LD para iniciar a análise.');
   setBusy(true);resetResult();
   try{
     if(file.size>50*1024*1024)throw Error('A LD ultrapassa 50 MB. Divida a operação ou revise o arquivo.');
     const codes=[...new Set(codeText.split(/[;\n\r\t,]+/).map(s=>s.trim()).filter(Boolean))];
     const data:Analysis=await call('analyze',{bytes:await file.arrayBuffer(),name:file.name,codes,sourceMode,
       referenceBytes:reference?await reference.arrayBuffer():null});
     setAnalysis(data);setRows(data.rows);
     setMessage(data.rows.length+' documento(s) avaliados. '+(data.unmatched.length?data.unmatched.length+' código(s) não localizado(s).':'Confira as evidências antes de aprovar.'));
   }catch(error){setMessage('Falha na análise: '+(error instanceof Error?error.message:String(error)));}
   finally{setBusy(false);}
 };
 const exportLd=async()=>{
   setBusy(true);setMessage('');
   try{
     const output:Output=await call('export',{rows:rows.filter(row=>row.decision==='approved')});
     if(!output.preservation?.valid)throw Error('A preservação da LD não foi confirmada.');
     fileDownload(output.bytes,output.name,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
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
 const ITEM_HEIGHT=106,viewport=500,start=Math.max(0,Math.floor(scrollTop/ITEM_HEIGHT)-4),end=Math.min(visible.length,start+Math.ceil(viewport/ITEM_HEIGHT)+9);
 return <div className="tc-root">
   <header className="tc-header"><div><small>FERRAMENTAS ADICIONAIS / QUALIDADE DOCUMENTAL</small><h2>Corretor Inteligente de Títulos</h2><p>Identifique o que é, onde se aplica e para que serve — com evidências verificáveis e aprovação antes da alteração.</p></div><button type="button" className="secondary-button" data-grcon-view="additional-tools">Voltar às ferramentas</button></header>
   <section className="tc-panel tc-source" aria-label="Preparar análise">
     <div className="tc-source-grid">
       <label className="tc-upload"><strong>1. LD original (XLSX/XLSM)</strong><input ref={inputRef} type="file" accept=".xlsx,.xlsm" onChange={e=>{setFile(e.currentTarget.files?.[0]||null);resetResult();}}/><small>{file?file.name:'Selecione a LD. O arquivo permanece no seu navegador.'}</small></label>
       <label className="tc-upload"><strong>2. Base complementar (opcional)</strong><input type="file" accept=".xlsx,.xlsm" onChange={e=>{setReference(e.currentTarget.files?.[0]||null);resetResult();}}/><small>{reference?reference.name:'SCON TAG SGP ou relação controlada de títulos'}</small></label>
       <label><strong>3. Fonte da descrição</strong><select value={sourceMode} onChange={e=>{setSourceMode(e.target.value);resetResult();}}><option value="auto">Automático — bases oficiais</option><option value="scon_only">Somente SCON TAG SGP</option><option value="appendix_only">Somente Apêndice 3</option></select></label>
     </div>
     <label className="tc-codes"><strong>4. Códigos específicos (opcional)</strong><textarea rows={2} value={codeText} onChange={e=>setCodeText(e.target.value)} placeholder="Cole um código por linha. Em branco, analisa toda a LD."/></label>
     <div className="tc-actions"><p>ET Rev. R · LI de válvulas Rev. C · Apêndice 3 · SCON ESCOPO · correções controladas do RECON</p><button className="primary-button" disabled={!file||busy} onClick={()=>void analyze()}>{busy?'Processando…':'Analisar títulos da LD'}</button></div>
   </section>
   {message&&<p className="tc-feedback" role="status">{message}</p>}
   {analysis&&<><div className="tc-metrics">{metrics.map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
   <section className="tc-panel"><div className="tc-section-heading"><div><h3>Resultados da análise</h3><p>{analysis.standard} · {analysis.sourceCounts.controlled} referências controladas · {analysis.sourceCounts.valve} válvulas ativas · {analysis.sourceCounts.appendix} registros no Apêndice · {analysis.sourceCounts.escopo} registros SCON ESCOPO</p></div></div>
     {analysis.unmatched.length>0&&<details className="tc-warning"><summary>{analysis.unmatched.length} código(s) não localizado(s) na LD</summary><p>{analysis.unmatched.join(' · ')}</p></details>}
     {Boolean(analysis.coverage?.skippedSheets?.length)&&<details className="tc-warning"><summary>Abas sem leitura técnica: {analysis.coverage?.skippedSheets?.length}</summary>{analysis.coverage?.skippedSheets?.map(x=><p key={x.sheet}>{x.sheet}: {x.reason}</p>)}</details>}
     <div className="tc-filters"><input aria-label="Pesquisar documento e título" placeholder="Buscar código, TAG, título ou disciplina" value={search} onChange={e=>{setSearch(e.target.value);setScrollTop(0);}}/><select aria-label="Filtrar situação" value={filter} onChange={e=>{setFilter(e.target.value);setScrollTop(0);}}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="review">Conferência necessária</option><option value="conflict">Conflitos</option><option value="ok">Adequados</option><option value="approved">Aprovados</option><option value="kept">Mantidos</option></select><select aria-label="Filtrar aba" value={sheet} onChange={e=>{setSheet(e.target.value);setScrollTop(0);}}><option value="">Todas as abas</option>{sheets.map(s=><option key={s}>{s}</option>)}</select></div>
     <div className="tc-toolbar"><label><input type="checkbox" checked={Boolean(visible.length&&visible.every(r=>selected.has(r.id)))} onChange={e=>selectView(e.target.checked)}/> Selecionar filtrados ({selectedInView.length})</label><button className="secondary-button" disabled={!selectedInView.length||busy} onClick={approveSelection}>Aprovar selecionados elegíveis</button><span className="tc-spacer"/><span>{visible.length} resultado(s)</span></div>
     <div className="tc-table-header"><span>Documento</span><span>Título atual</span><span>Recomendação</span><span>Situação</span><span></span></div>
     <div className="tc-list" style={{height:Math.min(viewport,Math.max(110,visible.length*ITEM_HEIGHT))}} onScroll={e=>setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{height:visible.length*ITEM_HEIGHT,position:'relative'}}>
       {visible.slice(start,end).map((row,i)=><div className="tc-row" key={row.id} style={{position:'absolute',top:(start+i)*ITEM_HEIGHT,height:ITEM_HEIGHT}}>
        <div className="tc-row-code"><label><input type="checkbox" checked={selected.has(row.id)} onChange={e=>setSelected(prev=>{const n=new Set(prev);e.target.checked?n.add(row.id):n.delete(row.id);return n;})}/><strong title={row.document}>{row.document}</strong></label><small>{row.sheet} · {row.discipline}</small></div>
        <p title={row.current}>{row.current||'Título vazio'}</p><p className="tc-suggested" title={row.proposed}>{row.proposed||'Sem sugestão segura'}</p><div className="tc-status"><strong>{labels[row.issue]||row.issue}</strong><small>{row.decision==='approved'?'Aprovado':row.decision==='kept'?'Mantido':row.hasConflict?'Revisão manual':row.confidence}</small></div>
        <button className="secondary-button" onClick={()=>setDetail(row.id)}>Revisar</button>
       </div>)}
      </div>
     </div>
     <div className="tc-actions"><p>Somente os títulos aprovados serão escritos na cópia. Todos os demais dados da LD permanecem preservados.</p><button className="secondary-button" disabled={!visible.length||busy} onClick={exportReport}>Relatório CSV filtrado</button><button className="primary-button" disabled={!totalApproved||busy} onClick={()=>void exportLd()}>Gerar cópia da LD ({totalApproved})</button></div>
   </section></>}
   {active&&<div className="tc-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null);}}><aside className="tc-drawer" role="dialog" aria-modal="true" aria-label="Revisar título">
      <header><div><small>REVISÃO DOCUMENTAL</small><h3>{active.document}</h3><p>{labels[active.issue]||active.issue} · {active.confidence}</p></div><button className="secondary-button" onClick={()=>setDetail(null)} aria-label="Fechar painel">Fechar</button></header>
      <div className="tc-drawer-body"><section><h4>Título atual</h4><p>{active.current||'Vazio'}</p></section>
      <section><h4>Evidências — o que, onde e para que</h4>{['objeto','localizacao','finalidade_documental','eap_classificacao'].map(field=>{const fact=active.facts.find(f=>f.field===field);return <div className="tc-fact" key={field}><strong>{factLabels[field]}</strong><p>{fact?.value||'Não comprovado nas bases consultadas'}</p>{fact&&<small>{fact.source}{fact.reference?' · '+fact.reference:''}</small>}</div>})}</section>
      <section><h4>Referência normativa</h4>{active.facts.filter(f=>f.field==='tipo').map((fact,i)=><p key={i}>{fact.value}<br/><small>{fact.source}</small></p>)}<p>{active.reason}</p></section>
      <section><label className="tc-edit"><strong>Título final proposto</strong><textarea rows={5} spellCheck={false} value={active.proposed} onChange={e=>alter(active.id,{proposed:e.target.value,decision:'pending'})}/></label><button className="secondary-button" onClick={()=>alter(active.id,{proposed:active.originalProposed,decision:'pending'})}>Restaurar recomendação técnica</button></section>
      {active.hasConflict&&<p className="tc-warning">Existem conflitos ou fontes ambíguas. A exportação desta linha fica bloqueada até uma conferência documental segura.</p>}
      <section><h4>Fontes e referências</h4><p>{active.evidenceSummary}</p>{Object.entries(active.sourceRows).filter(([,value])=>value.length).map(([kind,value])=><p key={kind}><strong>{kind.toUpperCase()}:</strong> registro(s) {value.join(', ')}</p>)}</section>
      </div><footer className="tc-actions"><button className="secondary-button" onClick={()=>{decide(active.id,'kept');setDetail(null);}}>Manter título atual</button><button className="primary-button" disabled={active.hasConflict||!active.proposed.trim()} onClick={()=>{decide(active.id,'approved');setDetail(null);}}>Aprovar título</button></footer>
   </aside></div>}
 </div>;
}
