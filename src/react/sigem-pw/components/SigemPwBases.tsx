import { useRef } from "react";
import type { SigemPwBase, SigemPwResult, SigemPwState } from "../types/domain";

function fmt(value: number): string { return Number(value || 0).toLocaleString("pt-BR"); }
function fmtDate(value: unknown): string {
  const source = value == null ? "" : String(value);
  const date = new Date(source);
  return source && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "—";
}
function BaseInfo({ kind, title, empty, base, result }: { kind: "sigem" | "pw" | "ld"; title: string; empty: string; base: SigemPwBase; result: SigemPwResult | null; }) {
  if (!base.meta) return <div id={`spw-${kind}-base`}><span>{title}</span><strong>{empty}</strong><small>Carregue uma base válida para iniciar.</small><em>{kind === "ld" ? "Sem a LD, N-1710 não entra nos cálculos." : "Base ausente não é tratada como zero."}</em></div>;
  const count = kind === "sigem" ? result?.quality.sigemEntries : kind === "pw" ? result?.quality.pwEntries : result?.quality.ldDocumentCount;
  const suffix = kind === "ld" ? "códigos N-1710 elegíveis" : "registros/revisões válidos";
  const originalDate = base.meta.sourceImportedAt && base.meta.sourceImportedAt !== base.meta.importedAt ? ` · importada originalmente em ${fmtDate(base.meta.sourceImportedAt)}` : "";
  return <div id={`spw-${kind}-base`}><span>{title}</span><strong title={String(base.meta.fileName || "")}>{String(base.meta.fileName || title)}</strong><small>Data da base: {fmtDate(base.meta.importedAt)}{originalDate}</small><em>{fmt(Number(count) || 0)} {suffix}</em></div>;
}
function UploadIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M5 14v5h14v-5"></path></svg>;}
export function SigemPwBases({ state, onImportSigem, onImportPw, onImportLd, onEditDate }: {
  state: SigemPwState; onImportSigem(file: File): void; onImportPw(file: File): void; onImportLd(file: File): void; onEditDate(system: "sigem" | "pw"): void;
}) {
  const sigemRef=useRef<HTMLInputElement>(null), pwRef=useRef<HTMLInputElement>(null), ldRef=useRef<HTMLInputElement>(null);
  const onFile=(handler:(file:File)=>void)=>(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value="";if(file)handler(file);};
  return <section className="spw-base-grid" aria-label="Bases vigentes">
    <article className="spw-base-card"><BaseInfo kind="sigem" title="BASE SIGEM · CONSULTA GERAL" empty="Consulta Geral não carregada" base={state.sigem} result={state.result}/><div className="spw-base-actions"><button className="secondary-button" data-edit-base-date="sigem" type="button" disabled={state.busy} onClick={()=>onEditDate("sigem")}><span>Editar data</span></button><button className="secondary-button" id="spw-sigem-update" type="button" disabled={state.busy} onClick={()=>sigemRef.current?.click()}><UploadIcon/><span>Atualizar Consulta Geral</span></button><input ref={sigemRef} id="spw-sigem-file" hidden type="file" accept=".xlsx,.xls,.xlsm" onChange={onFile(onImportSigem)}/></div></article>
    <article className="spw-base-card"><BaseInfo kind="pw" title="BASE PROJECTWISE" empty="Relação PW não carregada" base={state.pw} result={state.result}/><div className="spw-base-actions"><button className="secondary-button" data-edit-base-date="pw" type="button" disabled={state.busy} onClick={()=>onEditDate("pw")}><span>Editar data</span></button><button className="secondary-button" id="spw-pw-update" type="button" disabled={state.busy} onClick={()=>pwRef.current?.click()}><UploadIcon/><span>Atualizar base PW</span></button><input ref={pwRef} id="spw-pw-file" hidden type="file" accept=".csv,.txt,text/csv" onChange={onFile(onImportPw)}/></div></article>
    <article className="spw-base-card"><BaseInfo kind="ld" title="REFERÊNCIA N-1710 · LD DA QUALIDADE" empty="LD da Qualidade não carregada" base={state.ld} result={state.result}/><div className="spw-base-actions"><button className="secondary-button" id="spw-ld-update" type="button" disabled={state.busy} onClick={()=>ldRef.current?.click()}><UploadIcon/><span>Atualizar LD da Qualidade</span></button><input ref={ldRef} id="spw-ld-file" hidden type="file" accept=".xlsx,.xls,.xlsm" onChange={onFile(onImportLd)}/></div></article>
  </section>;
}