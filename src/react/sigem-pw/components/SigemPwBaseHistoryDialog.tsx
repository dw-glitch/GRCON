import { useEffect, useRef } from "react";
import type { SigemPwState } from "../types/domain";

function fmt(value:number):string{return Number(value||0).toLocaleString("pt-BR");}
function fmtDate(value:unknown):string{const source=value==null?"":String(value);const date=new Date(source);return source&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(date):"—";}

export function SigemPwBaseHistoryDialog({state,onClose,onEdit,onDelete,onSelectShared}:{state:SigemPwState;onClose():void;onEdit(kind:"sigem"|"pw",snapshotId:string):void;onDelete(snapshotId:string):void;onSelectShared(snapshotId:string):void;}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(state.historyDialogOpen&&!dialog.open)dialog.showModal?.();if(!state.historyDialogOpen&&dialog.open)dialog.close();},[state.historyDialogOpen]);
 const hasSharedHistory=state.sharedSigemHistory.length>0;
 const snapshots=[...(state.history.snapshots||[])].filter((item)=>!(hasSharedHistory&&item.meta.kind==="sigem")).sort((a,b)=>(window.GrconSigemPwDashboard?.parseDateMs(b.meta.importedAt)||0)-(window.GrconSigemPwDashboard?.parseDateMs(a.meta.importedAt)||0));
 const labels:Record<string,string>={sigem:"SIGEM",pw:"PW",ld:"LD"};
 const sharedCurrent=state.sharedSigemHistory.find((item)=>item.isCurrent);

 return <dialog ref={ref} className="spw-history" id="spw-base-history" onClose={onClose}>
  <header className="spw-history-head"><div><span className="spw-kicker">BASES IMPORTADAS</span><h3>Gerenciar histórico</h3><p>Versões compartilhadas da Consulta Geral e bases auxiliares deste navegador.</p></div><button className="secondary-button" id="spw-base-history-close" type="button" onClick={onClose}>Fechar</button></header>
  <div className="spw-history-body" id="spw-base-history-body">
   <section className="spw-history-section" aria-labelledby="spw-shared-sigem-history-title">
    <div className="spw-history-section-head"><div><span className="spw-kicker">CONSULTA GERAL</span><h4 id="spw-shared-sigem-history-title">Histórico compartilhado SIGEM</h4></div>{sharedCurrent?<span className="spw-current">ATUAL</span>:<span className="spw-history-empty-state">Nenhuma Consulta Geral ativa</span>}</div>
    {!sharedCurrent&&<p className="spw-history-guidance">Carregue e publique uma nova Consulta Geral para reativar os indicadores do SIGEM.</p>}
    {state.sharedSigemHistory.length?state.sharedSigemHistory.map((item)=><article className="spw-history-row spw-history-row-shared" key={item.snapshotId}>
      <div className="spw-history-kind">SIGEM</div>
      <div className="spw-history-main">
       <strong>{item.fileName||"Base sem nome"}{item.isCurrent&&<span className="spw-current">ATUAL</span>}</strong>
       <small>{fmtDate(item.publishedAt||item.createdAt)} · publicado por {item.createdByName||item.createdByEmail||"usuário identificado"}</small>
       <div className="spw-history-metrics" aria-label="Resumo da base">
        <span><b>{fmt(item.recordCount)}</b> registros</span>
        <span><b>{fmt(item.uniqueDocumentCount)}</b> documentos</span>
        <span><b>{fmt(item.etCount)}</b> ET</span>
        <span><b>{fmt(item.n1710Count)}</b> N-1710</span>
       </div>
      </div>
      <div className="spw-history-actions">
       {!item.isCurrent&&state.canManageSharedSigem&&<button className="secondary-button" type="button" data-select-shared-sigem={item.snapshotId} onClick={()=>onSelectShared(item.snapshotId)}>Selecionar como atual</button>}
       {state.canManageSharedSigem&&<button className="secondary-button spw-danger-button" type="button" data-delete-shared-sigem={item.snapshotId} onClick={()=>onDelete(item.snapshotId)}>Excluir</button>}
      </div>
     </article>):<div className="spw-empty"><div><strong>Nenhuma Consulta Geral salva</strong><span>As versões publicadas aparecerão aqui.</span></div></div>}
   </section>

   {snapshots.length?<section className="spw-history-section" aria-labelledby="spw-local-base-history-title">
    <div className="spw-history-section-head"><div><span className="spw-kicker">BASES AUXILIARES</span><h4 id="spw-local-base-history-title">Histórico local PW / LD</h4></div></div>
    {snapshots.map((item)=>{const kind=String(item.meta.kind||"");const currentId=kind==="sigem"||kind==="pw"||kind==="ld"?state[kind].meta?.snapshotId:"";const current=currentId===item.meta.snapshotId;const editable=kind==="sigem"||kind==="pw";const original=item.meta.sourceImportedAt&&item.meta.sourceImportedAt!==item.meta.importedAt?` · original ${fmtDate(item.meta.sourceImportedAt)}`:"";return <div className="spw-history-row" key={String(item.meta.snapshotId)}><div className="spw-history-kind">{labels[kind]||"BASE"}</div><div><strong>{String(item.meta.fileName||"Base sem nome")}{current&&<span className="spw-current">ATUAL</span>}</strong><small>Data da base {fmtDate(item.meta.importedAt)}{original} · {fmt(item.records.length)} registros armazenados</small></div><div className="spw-history-actions">{editable&&<button className="secondary-button" type="button" data-edit-snapshot-kind={kind} data-edit-snapshot-date={String(item.meta.snapshotId)} onClick={()=>onEdit(kind as "sigem"|"pw",String(item.meta.snapshotId))}>Editar data</button>}<button className="secondary-button spw-danger-button" type="button" data-delete-snapshot={String(item.meta.snapshotId)} onClick={()=>onDelete(String(item.meta.snapshotId))}>Excluir</button></div></div>;})}
   </section>:null}
  </div>
 </dialog>;
}
