import {useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type React from 'react';
import {createPortal} from 'react-dom';
import {assistant,type Tab} from './assistantStore';
import {buildItems,buildStages,countKinds,filterItems,friendlyError,nextAction,type Filter,type Item} from './chatView';
import {PendenciasPanel} from './PendenciasPanel';
import {service,type Data} from './service';
export function AllocationAssistant(){
 const chat=useSyncExternalStore(assistant.subscribe,assistant.snapshot),s=useSyncExternalStore(service.subscribe,service.snapshot);
 const [text,setText]=useState(''),[expanded,setExpanded]=useState(false),[confirmIssue,setConfirmIssue]=useState(false),[confirmDiscard,setConfirmDiscard]=useState(false),[allocationNumber,setAllocationNumber]=useState(''),[filter,setFilter]=useState<Filter>({kind:'todas',query:'',onlyOpen:true});const panel=useRef<HTMLElement>(null),mascot=useRef<HTMLDivElement>(null),end=useRef<HTMLDivElement>(null);
 const busy=chat.pending||s.busy;const g=window as unknown as Data;
 const operation=useRef({busy:false,error:false});
 const lastReply=[...chat.messages].reverse().find(m=>m.role==='assistant'&&m.id!=='hello');
 const [toastId,setToastId]=useState('');
 useEffect(()=>{if(!lastReply)return;setToastId(lastReply.id);const t=setTimeout(()=>setToastId(''),7000);return()=>clearTimeout(t);},[lastReply?.id]);
 useLayoutEffect(()=>{
  if(!chat.open)return;
  const previouslyFocused=document.activeElement as HTMLElement|null;
  panel.current?.focus();
  let runtimeWatcher:MutationObserver|undefined;
  const present=()=>{
   if(!mascot.current?.isConnected||!g.GrconMascot?.presentIn)return false;
   g.GrconMascot.presentIn(mascot.current);
   const working=assistant.snapshot().pending||service.snapshot().busy;
   g.GrconMascot?.show?.(working?'analyzing':'hello',{source:'audit-chat-open',force:true});
   return true;
  };
  // The official mascot runtime can initialize after the assistant bundle.
  if(!present()){
   runtimeWatcher=new MutationObserver(()=>{
    if(present())runtimeWatcher?.disconnect();
   });
   runtimeWatcher.observe(document.documentElement,{
    attributes:true,attributeFilter:['data-grcon-mascot-runtime']
   });
  }
  const closeOnEscape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();assistant.close();}
  };
  document.addEventListener('keydown',closeOnEscape);
  return()=>{
   runtimeWatcher?.disconnect();
   document.removeEventListener('keydown',closeOnEscape);
   // Host ownership transfers back to the still-mounted launcher, not a new mascot.
   const launcher=document.querySelector<HTMLButtonElement>('.aac-launcher:not(.aac-launcher-hidden)');
   const target=launcher?.querySelector<HTMLElement>('.aac-launcher-mascot');
   g.GrconMascot?.presentIn?.(target||null);
   if(launcher?.isConnected&&!launcher.disabled)launcher.focus();
   else if(previouslyFocused?.isConnected)previouslyFocused.focus();
  };
 },[chat.open]);
 useEffect(()=>{
  if(!chat.open){operation.current={busy:false,error:false};return;}
  const error=Boolean(s.error||chat.error);
  const prior=operation.current;
  // Videos represent work or a real transition, not simply a pre-existing result.
  if(busy)g.GrconMascot?.show?.('analyzing',{source:'audit-chat-running'});
  else if(error&&!prior.error)g.GrconMascot?.show?.('warning',{source:'audit-chat-error'});
  else if(prior.busy&&s.total>0&&s.progress===s.total)
   g.GrconMascot?.show?.('success',{source:'audit-chat-complete'});
  else if(prior.busy)g.GrconMascot?.show?.('idle',{source:'audit-chat-rest'});
  operation.current={busy,error};
 },[chat.open,busy,s.error,chat.error,s.progress,s.total]);
 useEffect(()=>{if(!chat.open){setConfirmIssue(false);setConfirmDiscard(false);}},[chat.open]);
 useEffect(()=>{setConfirmIssue(false);},[s.records]);
 useEffect(()=>{
  const viewport=end.current?.parentElement;
  if(!viewport||!chat.open)return;
  // Conversa acompanha a última mensagem; as demais seções sempre abrem no topo.
  viewport.scrollTop=chat.tab==='conversa'?viewport.scrollHeight:0;
 },[chat.open,chat.messages,chat.tab]);

 const O=g.GrconAllocationAuditorOpinion,complete=s.rows.length>0&&s.total>0&&s.progress===s.total;
 const opinion=useMemo(()=>{
  if(!chat.open||!O||!s.rows.length)return null;
  try{return O.build({rows:s.rows,events:s.events,files:[],exceptions:[],contextWarning:s.context.contextWarning||''});}catch{return null;}
 },[chat.open,O,s.rows,s.events,s.context.contextWarning]);
 const items=useMemo(()=>chat.open?buildItems(s.rows,opinion,s.events):[],[chat.open,s.rows,opinion,s.events]);
 const kinds=countKinds(items),shown=useMemo(()=>filterItems(items,filter),[items,filter]);
 if(!chat.open)return null;
 const sources=(s.context.sources||[]) as Data[];
 const stages=buildStages({records:s.records,rows:s.rows,progress:s.progress,total:s.total,busy,sources,pendingSheets:chat.pendingSheets.length,pendingAllocations:chat.pendingAllocations.length,opinion,contextWarning:s.context.contextWarning});
 const next=nextAction({records:s.records,rows:s.rows,progress:s.progress,total:s.total,busy,sources,pendingSheets:chat.pendingSheets.length,pendingAllocations:chat.pendingAllocations.length,opinion});
 const describe=opinion&&O?O.describe(opinion.counts):null;
 const errorText=chat.error||s.error,recovery=errorText?friendlyError(errorText):null;
 const runNext=()=>{
  if(next.id==='audit')void assistant.auditFiles();
  else if(next.id==='resume')void assistant.resume();
  else if(next.id==='review')void assistant.details();
  else if(next.id==='report')void assistant.download();
 };
 const currentStage=stages.findIndex(x=>x.state==='current'||x.state==='attention');
 const tabs:Array<[Tab,string]>=[['conversa','Conversa'],['pendencias','Pendências'+(items.length?' ('+kinds.abertas+')':'')],['arquivos','Arquivos'+(sources.length?' ('+sources.length+')':'')],['historico','Histórico'+(chat.sessions.length?' ('+chat.sessions.length+')':'')]];
 const onTabKey=(e:React.KeyboardEvent<HTMLButtonElement>,i:number)=>{
  const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!d)return;
  e.preventDefault();const t=tabs[(i+d+tabs.length)%tabs.length][0];assistant.setTab(t);
  requestAnimationFrame(()=>document.getElementById('aac-tab-'+t)?.focus());
 };
 const upload=(kind:'allocation'|'ld')=>(e:React.ChangeEvent<HTMLInputElement>)=>{void assistant.upload([...e.target.files||[]],kind);e.target.value='';};
 const startNumber=()=>{const n=allocationNumber.trim();if(n){void assistant.send('Auditar a alocação '+n);setAllocationNumber('');}};
 const goProposals=()=>{setFilter({kind:'proposta',query:'',onlyOpen:true});assistant.setTab('pendencias');};
 const canStart=!s.records.length&&!s.rows.length&&!chat.pendingSheets.length&&!chat.pendingAllocations.length;
 return createPortal(<div className="aac-backdrop"><section id="aac-panel" ref={panel} tabIndex={-1} className={'aac-panel'+(expanded?' aac-expanded':'')} role="dialog" aria-modal={false} aria-labelledby="aac-title">
  <header className="aac-header"><div ref={mascot} className="aac-mascot" aria-label="Mascote oficial do GRCON"/><div><small>GRCON · AUDITORIA PREVENTIVA</small><h2 id="aac-title">Robô Auditor Preventivo</h2></div>
   <button type="button" onClick={()=>setExpanded(!expanded)} aria-label={expanded?'Reduzir conversa':'Expandir conversa'}>{expanded?'↙':'↗'}</button>
   <button type="button" onClick={assistant.close} title="Minimiza o chat sem descartar a análise; reabra pelo botão flutuante" aria-label="Minimizar conversa">–</button></header>
  <ol className="aac-stages" aria-label="Etapas da auditoria">{stages.map((st,i)=><li key={st.id} title={st.label+': '+st.detail} className={'aac-stage aac-stage-'+st.state+(i===Math.max(currentStage,0)?' aac-stage-now':'')} aria-current={i===currentStage?'step':undefined}><span className="aac-stage-dot" aria-hidden="true">{st.state==='done'?'✓':st.state==='attention'?'!':i+1}</span><span className="aac-sr">{st.label}: {st.detail}</span></li>)}</ol>
  <p className="aac-stage-compact" role="status" title={stages[Math.max(currentStage,0)].label+': '+stages[Math.max(currentStage,0)].detail}>Etapa {Math.max(currentStage,0)+1} de {stages.length} · {stages[Math.max(currentStage,0)].label}: {stages[Math.max(currentStage,0)].detail}</p>
  <div className="aac-tabs" role="tablist" aria-label="Seções do auditor">{tabs.map(([id,label],i)=><button key={id} id={'aac-tab-'+id} type="button" role="tab" aria-selected={chat.tab===id} aria-controls="aac-tabpanel" tabIndex={chat.tab===id?0:-1} className={chat.tab===id?'aac-tab aac-tab-active':'aac-tab'} onClick={()=>assistant.setTab(id)} onKeyDown={e=>onTabKey(e,i)}>{label}</button>)}</div>
  <div id="aac-tabpanel" role="tabpanel" aria-labelledby={'aac-tab-'+chat.tab} className="aac-messages">
  {chat.tab==='conversa'&&<>
   <div role="log" aria-live="polite" className="aac-log">{chat.messages.map(m=><article className={'aac-message aac-'+m.role} key={m.id}><small>{m.role==='user'?'Você':'Assistente GRCON'}</small><p>{m.text}</p></article>)}</div>
   {canStart&&<section className="aac-start" aria-label="Como começar">
    <strong>Como você quer começar?</strong>
    <form className="aac-start-number" onSubmit={e=>{e.preventDefault();startNumber();}}>
     <label>Informe o número da alocação<input value={allocationNumber} maxLength={120} placeholder="Ex.: C1O-ALOC-CM-0372-2026" disabled={busy} onChange={e=>setAllocationNumber(e.target.value)}/></label>
     <button className="primary-button" type="submit" disabled={busy||!allocationNumber.trim()}>Auditar esta alocação</button>
    </form>
    <div className="aac-options"><button type="button" disabled={busy} onClick={()=>void assistant.current()}>Auditar alocação atual</button>
     <label>Enviar outra alocação (.xlsx)<input type="file" multiple accept=".xlsx" disabled={busy} onChange={upload('allocation')}/></label></div>
    <small>Depois, anexe as LDs e referências necessárias em “Anexar LDs”. Nada é alterado nos arquivos originais.</small>
   </section>}
   {confirmDiscard&&<section className="aac-discard" role="group" aria-label="Excluir análise">
    <strong>Excluir a análise atual?</strong>
    <p>Os resultados e as decisões desta sessão serão descartados para você começar uma nova auditoria. Seus arquivos originais não são alterados.</p>
    <div className="aac-sheet-controls">
     <button className="primary-button" type="button" onClick={()=>{setConfirmDiscard(false);void assistant.discardAnalysis(false);}}>Excluir análise (manter LDs)</button>
     <button type="button" onClick={()=>{setConfirmDiscard(false);void assistant.discardAnalysis(true);}}>Excluir análise e LDs</button>
     <button type="button" onClick={()=>setConfirmDiscard(false)}>Cancelar</button>
    </div>
   </section>}
   {chat.pendingSheets.length>0&&<section className="aac-sheet-selection" aria-label="Selecionar abas das alocações">
    <strong>Confirmar abas documentais</strong>
    <p>Encontrei mais de uma aba compatível em alguns arquivos. Selecione a origem para evitar auditoria incorreta.</p>
    {chat.pendingSheets.map(entry=><label key={entry.name}>
     <span>{entry.name}</span>
     <select value={entry.selected} disabled={busy} aria-label={'Aba da alocação '+entry.name} onChange={e=>assistant.chooseSheet(entry.name,e.target.value)}>
      <option value="">Selecione uma aba</option>
      {entry.options.map(option=><option key={option.name} value={option.name}>{option.name} · {option.documentCount} documentos · {option.model==='official-16'?'16 colunas':'colunas mapeadas'}</option>)}
     </select>
    </label>)}
    <div className="aac-sheet-controls">
     <button className="primary-button" type="button" disabled={busy||chat.pendingSheets.some(x=>!x.selected)} onClick={()=>void assistant.confirmSheetSelection()}>Confirmar e auditar</button>
     <button type="button" disabled={busy} onClick={()=>assistant.cancelSheetSelection()}>Cancelar</button>
    </div>
   </section>}
   {chat.pendingAllocations.length>0&&<section className="aac-sheet-selection" aria-label="Confirmar identificação das alocações">
    <strong>Qual é a identificação destas alocações?</strong>
    <p>Não foi possível identificar o número com segurança. Informe-o ou confirme o uso como rascunho. Isso não cria numeração oficial.</p>
    {chat.pendingAllocations.map((entry:Data)=><div key={entry.sha256}>
     <label><span>{entry.name}</span><input aria-label={'Identificação de '+entry.name} maxLength={120} value={entry.value} disabled={busy||entry.draft} onChange={e=>assistant.identifyAllocation(entry.sha256,e.target.value)}/></label>
     <label><input type="checkbox" checked={entry.draft} disabled={busy} onChange={e=>assistant.identifyAllocation(entry.sha256,entry.value,e.target.checked)}/>Rascunho sem numeração — conferência preliminar</label>
    </div>)}
    <button className="primary-button" type="button" disabled={busy||chat.pendingAllocations.some((x:Data)=>!x.draft&&!x.value.trim())} onClick={()=>void assistant.confirmAllocationIdentities()}>Confirmar identificação e auditar</button>
   </section>}
   {s.rows.length>0&&<section className={'aac-result'+(chat.plan?' aac-plan':'')} aria-label="Resultado da auditoria preventiva">
    <strong>{s.progress} de {s.total} documentos analisados</strong>
    <p>{s.summary.errors||0} documento(s) com erro confirmado · {s.summary.pending||0} documento(s) com verificação pendente · {s.summary.suggestions||0} documento(s) com sugestão preventiva</p>
    {describe&&opinion&&<dl className="aac-indicators">
     <div><dt>Documentos</dt><dd>{opinion.counts.documents}</dd><small>{opinion.counts.documentsClear} sem apontamentos</small></div>
     <div><dt>Erros confirmados</dt><dd>{opinion.counts.occurrences.errors}</dd><small>ocorrências</small></div>
     <div><dt>Pendências</dt><dd>{opinion.counts.occurrences.pending}</dd><small>ocorrências a conferir</small></div>
     <div><dt>Propostas</dt><dd>{opinion.counts.proposals.total}</dd><small>{opinion.counts.proposals.suggested} aguardando decisão</small></div>
    </dl>}
    {opinion&&opinion.blockers.length>0&&<ul className="aac-blockers" aria-label="Impedimentos para concluir">{opinion.blockers.map((b:Data)=><li key={b.code}><b>{b.count}</b> {b.message}</li>)}</ul>}
    {opinion&&!opinion.blockers.length&&<p className="aac-ok">Nenhum impedimento registrado. A auditoria preventiva não equivale à aprovação fiscal.</p>}
    {complete&&chat.plan&&<div className="aac-plan-actions">
     {chat.plan.safe>chat.plan.safeAuthorized&&<button type="button" disabled={busy} onClick={()=>void assistant.applySafe()}>Aplicar {chat.plan.safe-chat.plan.safeAuthorized} correção(ões) segura(s)</button>}
     {chat.plan.proposed>0&&<button type="button" onClick={goProposals}>Revisar {chat.plan.proposed} proposta(s)</button>}
    </div>}
   </section>}
  </>}
  {chat.tab==='pendencias'&&<PendenciasPanel items={items} shown={shown} kinds={kinds} filter={filter} setFilter={setFilter} busy={busy} hasRows={s.rows.length>0} groups={s.groups} onGroup={g2=>void assistant.group(g2)} onDecide={(it:Item,decision,justification,evidence)=>assistant.decide({rowIndex:it.rowIndex,field:it.field,after:it.proposed,decision,justification,evidence})}/>}
  {chat.tab==='arquivos'&&<section className="aac-files" aria-label="Arquivos e referências">
   <strong>Arquivos recebidos ({sources.length})</strong>
   {!sources.length&&<p>Nenhum arquivo externo. Anexe alocações e LDs abaixo.</p>}
   <ul>{sources.map((f:Data)=><li key={f.sha256}>{f.name} · {f.kind==='ld'?'LD':'Alocação'}{f.model==='mapped'?' · layout mapeado (sem correção automática da planilha)':''}</li>)}</ul>
   <div className="aac-attachments"><label>Anexar alocações<input type="file" multiple accept=".xlsx" disabled={busy} onChange={upload('allocation')}/></label><label>Anexar LDs<input type="file" multiple accept=".xlsx" disabled={busy} onChange={upload('ld')}/></label></div>
   {s.context.contextWarning&&<p className="aac-warn" role="note">{s.context.contextWarning}</p>}
   <hr/>
   <strong>Emissão oficial (opcional)</strong>
   <p>Separada da auditoria preventiva. Cria nova numeração oficial no Gerador e não altera a Central compartilhada. Para corrigir uma alocação externa, use o relatório e os arquivos corrigidos.</p>
   {confirmIssue?<div className="aac-issue-confirm" role="group" aria-label="Confirmar nova emissão">
    <p>Confirme somente se deseja emitir uma nova alocação oficial.</p>
    <button className="primary-button" disabled={busy} onClick={()=>{setConfirmIssue(false);void assistant.generate();}}>Confirmar nova emissão oficial</button>
    <button type="button" disabled={busy} onClick={()=>setConfirmIssue(false)}>Cancelar</button>
   </div>:<button type="button" disabled={busy||!s.total||s.progress!==s.total||s.rows.length!==s.total} onClick={()=>setConfirmIssue(true)}>Emitir nova alocação oficial…</button>}
  </section>}
  {chat.tab==='historico'&&<section className="aac-history" aria-label="Conversas salvas">
   <strong>Conversas salvas</strong>
   <p>O histórico fica separado desta conversa. Abrir uma conversa salva substitui a análise atual por aquela.</p>
   {!chat.sessions.length&&<p>Nenhuma conversa salva neste contrato.</p>}
   {chat.sessions.map(item=><button type="button" disabled={busy} key={item.id} onClick={()=>void assistant.restore(item.id)}>{new Date(item.updated_at).toLocaleString('pt-BR')}</button>)}
  </section>}
  <div ref={end}/>
  </div>
  {chat.tab!=='conversa'&&lastReply&&toastId===lastReply.id&&<p className="aac-toast" role="status">{lastReply.text}</p>}
  {recovery&&<div className="aac-error" role="alert"><p><b>O que aconteceu:</b> {recovery.what}</p><p><b>O que ficou comprometido:</b> {recovery.compromised}</p><p><b>O que fazer:</b> {recovery.todo}</p></div>}
  {busy&&<div className="aac-progress" role="status">{s.total>0?<><progress max={s.total} value={s.progress}/><span>{s.progress} / {s.total} documentos</span></>:<span>Processando a operação solicitada…</span>}{s.total>0&&s.progress<s.total&&<button type="button" onClick={()=>assistant.pause()}>Pausar análise</button>}</div>}
  <div className={'aac-next'+(chat.tab==='conversa'?'':' aac-next-compact')} aria-label="Próxima ação">
   <p title={next.hint} className="aac-next-hint">{next.hint}</p>
   <div className="aac-next-actions">
    {['audit','resume','review','report'].includes(next.id)&&!(next.id==='review'&&chat.tab==='pendencias')&&<button className="primary-button" type="button" disabled={busy&&next.id!=='review'} onClick={runNext}>{next.label}</button>}
    {complete&&next.id!=='report'&&<button type="button" disabled={busy} onClick={()=>void assistant.download()}>Baixar relatório e arquivos</button>}
    <nav className="aac-quick-actions" aria-label="Ações secundárias do auditor">
     {chat.pendingSheets.length===0&&Boolean(s.records.length)&&(s.total===0||s.progress===s.total)&&s.rows.length>0&&<button type="button" disabled={busy} onClick={()=>void assistant.auditFiles()}>Reexecutar auditoria</button>}
     <button type="button" disabled={busy} onClick={()=>void assistant.status()}>Situação</button>
     <button type="button" disabled={busy} onClick={()=>void assistant.help()}>Ajuda</button>
     {(s.records.length>0||s.rows.length>0||sources.length>0)&&<button type="button" className="aac-danger" onClick={()=>{assistant.setTab("conversa");setConfirmDiscard(true);}}>Nova auditoria</button>}
    </nav>
   </div>
  </div>
  <footer><small role="status">{chat.saveState==='saving'?'Salvando conversa…':chat.saveState==='saved'?'Conversa salva.':chat.saveState==='failed'?'Conversa ainda não salva.':chat.saveState==='conflict'?'Conversa alterada em outra janela. Reabra a versão salva.':''}{chat.saveState==='failed'&&<button type="button" disabled={busy} onClick={()=>void assistant.retrySave()}>Tentar salvar conversa</button>}</small>
   {chat.tab==='conversa'&&<>
   <form onSubmit={e=>{e.preventDefault();if(text.trim()){void assistant.send(text.trim());setText('');}}}>
    <span className="aac-attachments aac-clips">
     <label className="aac-clip" title="Anexar alocações (.xlsx)">📎<span className="aac-sr">Anexar alocações</span><input type="file" multiple accept=".xlsx" disabled={busy} onChange={upload('allocation')}/></label>
     <label className="aac-clip" title="Anexar LDs (.xlsx)">LD<span className="aac-sr">Anexar LDs</span><input type="file" multiple accept=".xlsx" disabled={busy} onChange={upload('ld')}/></label>
    </span>
    <textarea aria-label="Mensagem para o Assistente de Auditoria" rows={1} maxLength={2000} placeholder="Ex.: audite esta alocação antes de enviar à fiscalização" value={text} disabled={busy} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
    <button className="primary-button" disabled={busy||!text.trim()} type="submit">Enviar</button></form>
   <small title="Apenas correções com evidência e regra validada são autorizadas.">Auditoria preventiva: não equivale à aprovação fiscal.</small></>}
  </footer>
 </section></div>,document.body);
}
