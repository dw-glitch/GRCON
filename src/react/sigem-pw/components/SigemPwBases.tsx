import { useRef, useState } from "react";
import type { SigemPwBase, SigemPwResult, SigemPwState } from "../types/domain";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function fmtDate(value: unknown): string {
  const source = value == null ? "" : String(value);
  const date = new Date(source);
  return source && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "—";
}

function BaseInfo({ kind, title, empty, base, result }: {
  kind: "sigem" | "pw" | "ld";
  title: string;
  empty: string;
  base: SigemPwBase;
  result: SigemPwResult | null;
}) {
  if (!base.meta) {
    return (
      <div id={`spw-${kind}-base`}>
        <div className="spw-base-title-row">
          <span>{title}</span>
          <b className="spw-base-status pending">Pendente</b>
        </div>
        <strong>{empty}</strong>
        <small>Carregue uma base válida para iniciar.</small>
        <em>{kind === "ld" ? "LD opcional: a presença no PW já comprova cadastro." : "Base ausente não é tratada como zero."}</em>
      </div>
    );
  }

  const count = kind === "sigem"
    ? result?.quality.sigemEntries
    : kind === "pw"
      ? result?.quality.pwEntries
      : result?.quality.ldDocumentCount;
  const suffix = kind === "ld" ? "códigos N-1710 elegíveis" : "registros/revisões válidos";
  const originalDate = base.meta.sourceImportedAt && base.meta.sourceImportedAt !== base.meta.importedAt
    ? ` · importada originalmente em ${fmtDate(base.meta.sourceImportedAt)}`
    : "";

  return (
    <div id={`spw-${kind}-base`}>
      <div className="spw-base-title-row">
        <span>{title}</span>
        <b className="spw-base-status loaded">{kind === "pw" && base.meta.source === "shared-projectwise" ? "Compartilhada" : "Carregada"}</b>
      </div>
      <strong title={String(base.meta.fileName || "")}>{String(base.meta.fileName || title)}</strong>
      <small>Data da base: {kind === "sigem" && base.meta.referenceDate ? String(base.meta.referenceDate).split("-").reverse().join("/") : fmtDate(base.meta.importedAt)}{originalDate}{kind === "sigem" && base.meta.referenceDate ? ` · Upload: ${fmtDate(base.meta.importedAt)}` : ""}</small>
      <em>{fmt(Number(count) || 0)} {suffix}</em>
    </div>
  );
}

function ImportOptions({base}: {base: SigemPwBase}) {
  const [,redraw]=useState(0);
  const [message,setMessage]=useState("");
  const service=window.GrconImportReview;
  if(!service)return null;
  const labels: Record<string,string>={document:"Código do documento",revision:"Revisão",documentType:"Tipo do documento",state:"Status PW",lastEmission:"Última emissão"};
  const selected=service.profile();
  return <details className="spw-import-options"><summary>Prévia e perfis de importação</summary>
    <label><input type="checkbox" id="spw-import-review-enabled" checked={service.enabled()} onChange={e=>{service.setEnabled(e.target.checked);redraw(n=>n+1);}} />Revisar impacto antes de ativar SIGEM, PW ou LD</label>
    <label>Perfil de colunas PW<select id="spw-import-profile" value={selected?.name||""} onChange={e=>{service.selectProfile(e.target.value);redraw(n=>n+1);}}><option value="">Detecção automática</option>{service.profiles().map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select></label>
    <form key={String(base.meta?.snapshotId||"")+String(selected?.name||"")} onSubmit={e=>{e.preventDefault();try{const values=new FormData(e.currentTarget);const columns={...selected?.columns};for(const field of Object.keys(labels))columns[field]=String(values.get(field)||"");service.saveProfile(String(values.get('name')||""),{columns,delimiter:String(values.get('delimiter')||";")});setMessage("Perfil salvo neste navegador para esta conta e contrato.");redraw(n=>n+1);}catch(error){setMessage(error instanceof Error?error.message:"Não foi possível salvar o perfil.");}}}>
      <details><summary>Configurar mapeamento PW</summary><label>Nome do perfil<input name="name" maxLength={80} defaultValue={selected?.name||""} required /></label>
      {Object.entries(labels).map(([field,label])=><label key={field}>{label}<input name={field} maxLength={160} defaultValue={selected?.columns[field]||String((base.meta?.columns as Record<string,string>|undefined)?.[field]||"")} required /></label>)}
      <label>Separador<select name="delimiter" defaultValue={selected?.delimiter||String(base.meta?.delimiter||";")}><option value=";">Ponto e vírgula</option><option value=",">Vírgula</option><option value="\t">Tabulação</option></select></label><button type="submit">Salvar perfil</button>
      {selected?<button type="button" onClick={()=>{service.removeProfile(selected.name);redraw(n=>n+1);}}>Excluir perfil</button>:null}</details>
    </form><small>O perfil só é usado quando selecionado. Colunas ausentes ou ambíguas impedem a substituição da base.</small><p role="status">{message}</p>
  </details>;
}

function UploadIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M5 14v5h14v-5"></path></svg>;
}

export function SigemPwBases({ state, onImportSigem, onImportPw, onImportLd, onEditDate, onPublishPw }: {
  state: SigemPwState;
  onImportSigem(file: File): void;
  onImportPw(file: File): void;
  onImportLd(file: File): void;
  onEditDate(system: "sigem" | "pw"): void;
  onPublishPw(): void;
}) {
  const sigemRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const ldRef = useRef<HTMLInputElement>(null);
  const onFile = (handler: (file: File) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) handler(file);
  };

  return (
    <section className="spw-base-grid" aria-label="Bases vigentes">
      <article className="spw-base-card" data-loaded={Boolean(state.sigem.meta)}>
        <BaseInfo kind="sigem" title="BASE SIGEM · CONSULTA GERAL" empty="Consulta Geral não carregada" base={state.sigem} result={state.result} />
        <div className="spw-base-actions">
          <button className="text-button" data-edit-base-date="sigem" type="button" disabled={state.busy || !state.sigem.meta} onClick={() => onEditDate("sigem")}><span>Editar data</span></button>
          <button className="secondary-button" id="spw-sigem-update" type="button" disabled={state.busy} onClick={() => sigemRef.current?.click()}><UploadIcon /><span>{state.sigem.meta ? "Atualizar Consulta Geral" : "Carregar Consulta Geral"}</span></button>
          <input ref={sigemRef} id="spw-sigem-file" hidden type="file" accept=".xlsx,.xls,.xlsm" onChange={onFile(onImportSigem)} />
        </div>
      </article>

      <article className="spw-base-card" data-loaded={Boolean(state.pw.meta)}>
        <BaseInfo kind="pw" title="BASE PROJECTWISE" empty="Relação PW não carregada" base={state.pw} result={state.result} />
        <div className="spw-base-actions">
          <button className="text-button" data-edit-base-date="pw" type="button" disabled={state.busy || !state.pw.meta || (state.pw.meta.source === "shared-projectwise" && !window.GrconSharedPwQuery?.canEditDate())} onClick={() => onEditDate("pw")}><span>Editar data</span></button>
          <button className="secondary-button" id="spw-pw-update" type="button" disabled={state.busy} onClick={() => pwRef.current?.click()}><UploadIcon /><span>{state.pw.meta ? "Atualizar base PW" : "Carregar base PW"}</span></button>
          {state.pw.meta && window.GrconSharedPwQuery?.canPublish() && state.pw.meta.source !== "shared-projectwise" ? <button className="secondary-button" id="spw-pw-publish" type="button" disabled={state.busy} onClick={onPublishPw}>Publicar PW para a equipe</button> : null}
          <input ref={pwRef} id="spw-pw-file" hidden type="file" accept=".csv,.txt,text/csv" onChange={onFile(onImportPw)} />
        </div>
        <ImportOptions base={state.pw} />
      </article>

      <article className="spw-base-card" data-loaded={Boolean(state.ld.meta)}>
        <BaseInfo kind="ld" title="REFERÊNCIA N-1710 · LD DA QUALIDADE" empty="LD da Qualidade não carregada" base={state.ld} result={state.result} />
        <div className="spw-base-actions">
          <button className="secondary-button" id="spw-ld-update" type="button" disabled={state.busy} onClick={() => ldRef.current?.click()}><UploadIcon /><span>{state.ld.meta ? "Atualizar LD da Qualidade" : "Carregar LD da Qualidade"}</span></button>
          <input ref={ldRef} id="spw-ld-file" hidden type="file" accept=".xlsx,.xls,.xlsm" onChange={onFile(onImportLd)} />
        </div>
      </article>
    </section>
  );
}
