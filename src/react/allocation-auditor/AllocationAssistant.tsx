import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {assistant} from './assistantStore';
import {service,type Data} from './service';
export function AllocationAssistant(){
 const chat=useSyncExternalStore(assistant.subscribe,assistant.snapshot),s=useSyncExternalStore(service.subscribe,service.snapshot);
 const [text,setText]=useState(''),[expanded,setExpanded]=useState(false),[confirmIssue,setConfirmIssue]=useState(false);const panel=useRef<HTMLElement>(null),mascot=useRef<HTMLDivElement>(null),end=useRef<HTMLDivElement>(null);
 const busy=chat.pending||s.busy;const g=window as unknown as Data;
 const operation=useRef({busy:false,error:false});
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
 useEffect(()=>{if(!chat.open)setConfirmIssue(false);},[chat.open]);
 useEffect(()=>{
  const viewport=end.current?.parentElement;
  if(viewport&&chat.open)viewport.scrollTop=viewport.scrollHeight;
 },[chat.open,chat.messages]);
 if(!chat.open)return null;
 const groups=s.groups;
 return createPortal(<div className="aac-backdrop"><section id="aac-panel" ref={panel} tabIndex={-1} className={'aac-panel'+(expanded?' aac-expanded':'')} role="dialog" aria-modal={false} aria-labelledby="aac-title">
  <header className="aac-header"><div ref={mascot} className="aac-mascot" aria-label="Mascote oficial do GRCON"/><div><small>GRCON · AUDITORIA PREVENTIVA</small><h2 id="aac-title">Robô Auditor Preventivo</h2></div><button type="button" onClick={()=>setExpanded(!expanded)} aria-label={expanded?'Reduzir conversa':'Expandir conversa'}>{expanded?'↙':'↗'}</button><button type="button" onClick={assistant.close} aria-label="Fechar conversa">×</button></header>
  <div className="aac-messages" role="log" aria-live="polite">{chat.messages.map(m=><article className={'aac-message aac-'+m.role} key={m.id}><small>{m.role==='user'?'Você':'Assistente GRCON'}</small><p>{m.text}</p></article>)}
   {!s.records.length&&<div className="aac-options"><button disabled={busy} onClick={()=>void assistant.current()}>Auditar alocação atual</button><label>Enviar outra alocação<input type="file" multiple accept=".xlsx" disabled={busy} onChange={e=>{void assistant.upload([...e.target.files||[]],'allocation');e.target.value='';}}/></label></div>}
   <nav className="aac-quick-actions" aria-label="Ações rápidas do auditor">
    {Boolean(s.records.length)&&<button type="button" disabled={busy} onClick={()=>void assistant.auditFiles()}>Auditar arquivos</button>}
    {s.total>0&&s.progress<s.total&&!busy&&<button type="button" onClick={()=>void assistant.resume()}>Retomar análise</button>}
    <button type="button" disabled={busy} onClick={()=>void assistant.status()}>Situação</button>
    {s.rows.length>0&&<button type="button" disabled={busy} onClick={()=>void assistant.details()}>Ver pendências</button>}
    <button type="button" disabled={busy} onClick={()=>void assistant.help()}>Ajuda</button>
   </nav>
   {Boolean(s.context.sources?.length)&&<details><summary>Arquivos recebidos ({s.context.sources.length})</summary>{s.context.sources.map((f:Data)=><p key={f.sha256}>{f.name} · {f.kind==='ld'?'LD':'Alocação'}</p>)}</details>}
   {s.rows.length>0&&<div className="aac-result"><strong>{s.progress} de {s.total} documentos analisados</strong><p>{s.summary.errors||0} com erros confirmados · {s.summary.pending||0} com verificações pendentes</p><button className="primary-button" disabled={busy||s.progress!==s.total} onClick={()=>void assistant.download()}>Baixar pacote completo</button>
   <details><summary>Nova alocação e linhas da Central</summary><p>Emissão opcional, separada da auditoria preventiva. Esta ação cria nova numeração oficial no Gerador e não altera a Central compartilhada.</p>
    {confirmIssue?<div className="aac-issue-confirm" role="group" aria-label="Confirmar nova emissão">
     <p>Confirme somente se deseja emitir uma nova alocação oficial. Para corrigir uma alocação externa, utilize Baixar pacote completo.</p>
     <button className="primary-button" disabled={busy} onClick={()=>{setConfirmIssue(false);void assistant.generate();}}>Confirmar nova emissão oficial</button>
     <button type="button" disabled={busy} onClick={()=>setConfirmIssue(false)}>Cancelar</button>
    </div>:<button disabled={busy||!s.total||s.progress!==s.total||s.rows.length!==s.total} onClick={()=>setConfirmIssue(true)}>Gerar nova alocação e pacote</button>}
   </details>
   <details><summary>Resolver propostas agrupadas ({groups.length})</summary>{groups.map((group:Data)=><article key={group.id}><p>{group.rows.length} ocorrência(s) · {group.field}: {group.before||'vazio'} → {group.after}</p><small>{group.justification}</small><button disabled={busy} onClick={()=>void assistant.group(group)}>Aplicar esta decisão ao grupo</button></article>)}{!groups.length&&<p>Não há propostas determinísticas agrupáveis. Consulte as fontes indicadas no relatório.</p>}</details></div>}
   {chat.sessions.length>0&&<details><summary>Conversas salvas</summary>{chat.sessions.map(item=><button disabled={busy} key={item.id} onClick={()=>void assistant.restore(item.id)}>{new Date(item.updated_at).toLocaleString('pt-BR')}</button>)}</details>}
   <div ref={end}/>
  </div>
  {(chat.error||s.error)&&<p className="aac-error" role="alert">{chat.error||s.error}</p>}
  {busy&&<div className="aac-progress" role="status">{s.total>0?<><progress max={s.total} value={s.progress}/><span>{s.progress} / {s.total} documentos</span></>:<span>Processando a operação solicitada…</span>}{s.total>0&&s.progress<s.total&&<button type="button" onClick={()=>assistant.pause()}>Pausar análise</button>}</div>}
  <footer><div className="aac-attachments"><label>Anexar alocações<input type="file" multiple accept=".xlsx" disabled={busy} onChange={e=>{void assistant.upload([...e.target.files||[]],'allocation');e.target.value='';}}/></label><label>Anexar LDs<input type="file" multiple accept=".xlsx" disabled={busy} onChange={e=>{void assistant.upload([...e.target.files||[]],'ld');e.target.value='';}}/></label></div><form onSubmit={e=>{e.preventDefault();if(text.trim()){void assistant.send(text.trim());setText('');}}}><textarea aria-label="Mensagem para o Assistente de Auditoria" rows={2} maxLength={2000} placeholder="Ex.: audite esta alocação antes de enviar à fiscalização" value={text} disabled={busy} onChange={e=>setText(e.target.value)}/><button className="primary-button" disabled={busy||!text.trim()} type="submit">Enviar</button></form><small>Auditoria preventiva: não equivale à aprovação fiscal. Apenas correções com evidência e regra validada são autorizadas.</small></footer>
 </section></div>,document.body);
}
