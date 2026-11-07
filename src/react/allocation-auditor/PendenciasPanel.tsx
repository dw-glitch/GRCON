import {useEffect,useState} from 'react';
import type {Data,Filter,Item,Kind} from './chatView';

const KIND_LABEL:Record<Kind|'todas',string>={todas:'Todas',erro:'Erros',pendencia:'Pendências',proposta:'Propostas',sugestao:'Sugestões'};
const KIND_TAG:Record<Kind,string>={erro:'Erro confirmado',pendencia:'Pendência',proposta:'Proposta',sugestao:'Sugestão preventiva'};
const PAGE=25;
type Decide=(item:Item,decision:'accepted'|'rejected'|'exception',justification:string,evidence:string)=>Promise<unknown>|void;
type Props={items:Item[];shown:Item[];kinds:Record<string,number>;filter:Filter;setFilter:(f:Filter)=>void;busy:boolean;hasRows:boolean;groups:Data[];onGroup:(g:Data)=>void;onDecide:Decide};

function ItemCard({item,busy,onDecide}:{item:Item;busy:boolean;onDecide:Decide}){
 const [open,setOpen]=useState(false),[justification,setJustification]=useState(''),[evidence,setEvidence]=useState('');
 const proposal=item.kind==='proposta',valid=justification.trim().length>=5;
 const send=(d:'accepted'|'rejected'|'exception')=>{void onDecide(item,d,justification,evidence);setOpen(false);setJustification('');setEvidence('');};
 return <article className={'aac-item aac-item-'+item.kind} aria-label={KIND_TAG[item.kind]+' em '+item.document}>
  <header><span className="aac-tag">{KIND_TAG[item.kind]}</span><span className={'aac-status'+(item.open?' aac-status-open':'')}>{item.status}</span></header>
  <h4>{item.document} <small>rev. {item.revision||'—'}{item.allocation?' · '+item.allocation:''}</small></h4>
  <p className="aac-item-title">{item.title}</p>
  <dl>
   <div><dt>Campo</dt><dd>{item.fieldLabel}</dd></div>
   {item.found&&<div><dt>Valor encontrado</dt><dd>{item.found}</dd></div>}
   {item.proposed&&<div><dt>{proposal?'Valor sugerido':'Valor de referência'}</dt><dd>{item.proposed}{proposal?' (não aplicado)':''}</dd></div>}
   <div><dt>Por que importa</dt><dd>{item.why}</dd></div>
   {item.reference&&<div><dt>Referência consultada</dt><dd>{item.reference}</dd></div>}
   <div><dt>O que fazer</dt><dd>{item.action}</dd></div>
   <div><dt>Onde corrigir</dt><dd>{item.where}</dd></div>
   <div><dt>Como verificar</dt><dd>{item.verify}</dd></div>
  </dl>
  {item.canDecide&&item.open&&<div className="aac-item-actions">
   <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Fechar decisão':proposal?'Decidir sobre a proposta':'Registrar exceção justificada'}</button>
  </div>}
  {open&&<form className="aac-decision" onSubmit={e=>e.preventDefault()}>
   <label>Justificativa (mínimo 5 caracteres)<input value={justification} maxLength={400} onChange={e=>setJustification(e.target.value)}/></label>
   <label>Evidência / referência{proposal?' (obrigatória para campos de classificação)':' (obrigatória para exceção)'}<input value={evidence} maxLength={400} onChange={e=>setEvidence(e.target.value)}/></label>
   <div className="aac-sheet-controls">
    {proposal?<><button className="primary-button" type="button" disabled={busy||!valid} onClick={()=>send('accepted')}>Autorizar proposta</button>
     <button type="button" disabled={busy||!valid} onClick={()=>send('rejected')}>Recusar proposta</button></>
    :<button className="primary-button" type="button" disabled={busy||!valid||!evidence.trim()} onClick={()=>send('exception')}>Registrar exceção</button>}
   </div>
   <small>A decisão fica registrada com seu nome e horário. Autorizar não altera arquivos: a correção só conta depois de gerar os arquivos e reexecutar a auditoria.</small>
  </form>}
 </article>;
}

export function PendenciasPanel({items,shown,kinds,filter,setFilter,busy,hasRows,groups,onGroup,onDecide}:Props){
 const [limit,setLimit]=useState(PAGE);
 useEffect(()=>{setLimit(PAGE);},[filter]);
 if(!hasRows)return <section className="aac-pend" aria-label="Pendências"><p>Ainda não há resultados. Execute a auditoria para ver aqui cada pendência, com orientação individual.</p></section>;
 const set=(patch:Partial<Filter>)=>setFilter({...filter,...patch});
 return <section className="aac-pend" aria-label="Pendências da auditoria">
  <div className="aac-filters" role="group" aria-label="Filtrar por tipo">{(['todas','erro','pendencia','proposta','sugestao'] as const).map(k=>
   <button key={k} type="button" aria-pressed={filter.kind===k} className={filter.kind===k?'aac-chip aac-chip-on':'aac-chip'} onClick={()=>set({kind:k})}>{KIND_LABEL[k]} ({kinds[k]})</button>)}</div>
  <div className="aac-search"><input type="search" aria-label="Buscar por documento ou texto" placeholder="Buscar por documento ou texto" value={filter.query} onChange={e=>set({query:e.target.value})}/>
   <label className="aac-check"><input type="checkbox" checked={filter.onlyOpen} onChange={e=>set({onlyOpen:e.target.checked})}/>Somente em aberto ({kinds.abertas})</label></div>
  <p className="aac-count" role="status">{shown.length} de {items.length} item(ns)</p>
  {shown.slice(0,limit).map(it=><ItemCard key={it.id} item={it} busy={busy} onDecide={onDecide}/>)}
  {!shown.length&&<p>{items.length?'Nenhum item neste filtro. Ajuste o tipo, a busca ou desmarque “Somente em aberto”.':'A auditoria não registrou apontamentos.'}</p>}
  {shown.length>limit&&<button type="button" onClick={()=>setLimit(limit+PAGE)}>Mostrar mais ({shown.length-limit} restantes)</button>}
  {groups.length>0&&(filter.kind==='todas'||filter.kind==='proposta')&&<section className="aac-groups" aria-label="Decisões em grupo">
   <strong>Decidir em grupo ({groups.length})</strong>
   {groups.map(group=><article key={group.id}><p>{group.rows.length} ocorrência(s) · {group.field}: {group.before||'vazio'} → {group.after}</p><small>{group.justification}</small>
    <button type="button" disabled={busy} onClick={()=>onGroup(group)}>Aplicar esta decisão ao grupo</button></article>)}
  </section>}
 </section>;
}
