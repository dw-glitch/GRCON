import type { ChangeEvent } from "react";
import type { UseCoverToolReturn } from "../hooks/useCoverTool";
import type { CoverDocumentData, LdDocumentRecord } from "../types/domain";

export function CoverLdSource({ vm }: { vm: UseCoverToolReturn }) {
  return <section className="cover-card">
    <div className="cover-card-head"><div><span className="cover-step">1</span><h3>LD de referência</h3><p>A LD é a fonte da verdade para título, código, taxonomia e revisão.</p></div>
      <button className="secondary-button compact" type="button" onClick={vm.useSharedLds}>Usar LD do Controle de GRDT</button></div>
    <label className="cover-file-drop">
      <input type="file" multiple accept=".xlsx,.xls,.xlsm" onChange={(e) => vm.importFiles([...(e.target.files || [])])}/>
      <strong>Anexar uma ou mais LDs</strong><span>Excel · LD_001, LD_003, LD_004, LD_005 ou outras reconhecidas pelo GRCON</span>
    </label>
    {vm.lds.length ? <div className="cover-chip-row">{vm.lds.map((ld) => <span className={ld.error ? "cover-chip is-error" : "cover-chip"} key={ld.id}>{ld.name}{ld.error ? " · erro" : ` · ${ld.records.length.toLocaleString("pt-BR")} linhas`}</span>)}</div> : null}
  </section>;
}

function Match({ record, onSelect }: { record: LdDocumentRecord; onSelect: () => void }) {
  return <button className="cover-match" type="button" onClick={onSelect}>
    <strong>{record.title || "Sem título"}</strong>
    <span>{record.document || "Sem código"}</span>
    <small>{[record.source, record.sheet && `aba ${record.sheet}`, record.eap && `EAP ${record.eap}`, record.discipline, record.revision && `Rev. ${record.revision}`].filter(Boolean).join(" · ")}</small>
  </button>;
}
export function CoverSearch({ vm }: { vm: UseCoverToolReturn }) {
  return <section className="cover-card">
    <div className="cover-card-head"><div><span className="cover-step">2</span><h3>Documento na LD</h3><p>Pesquise pelo título; a grafia final sempre volta a ser exatamente a da linha selecionada.</p></div></div>
    <label className="cover-search-label" htmlFor="cover-title-search">Título na LD
      <input id="cover-title-search" type="search" value={vm.query} disabled={!vm.records.length}
        placeholder={vm.records.length ? "Digite parte do título…" : "Anexe a LD primeiro"}
        onChange={(e) => vm.setQuery(e.target.value)}/>
    </label>
    {vm.query.length >= 2 && !vm.selected ? <div className="cover-matches">
      {vm.matches.length ? vm.matches.map(({ record }) => <Match key={record.id} record={record} onSelect={() => vm.selectRecord(record)}/>)
        : <p className="cover-empty">Nenhuma correspondência. O GRCON não escolhe um documento por adivinhação.</p>}
    </div> : null}
    {vm.selected ? <div className="cover-selected">
      <div><strong>{vm.selected.title}</strong><span>{vm.selected.document}</span><small>{vm.selected.source} · {vm.selected.sheet} · linha {vm.selected.row}{vm.selected.eap ? ` · EAP ${vm.selected.eap}` : ""}</small></div>
      <button type="button" className="secondary-button compact" onClick={() => vm.clear()}>Trocar</button>
    </div> : null}
  </section>;
}

export function CoverSource({ vm }: { vm: UseCoverToolReturn }) {
  const change = (e: ChangeEvent<HTMLInputElement>) => vm.attachSource(e.target.files?.[0] || null);
  return <section className="cover-card">
    <div className="cover-card-head"><div><span className="cover-step">3</span><h3>Documento original</h3><p>PDF gera PDF final preservando páginas. DOCX gera Word editável sem conversão externa.</p></div></div>
    <label className="cover-file-drop">
      <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={change}/>
      <strong>{vm.source ? vm.source.file.name : "Anexar PDF ou DOCX"}</strong>
      <span>{vm.source ? [vm.source.format.toUpperCase(), vm.source.pages ? `${vm.source.pages} página(s) de origem` : "paginação não disponível"].join(" · ") : "Outros formatos não são convertidos silenciosamente."}</span>
    </label>
    {vm.source?.warning ? <p className="cover-note is-warn">{vm.source.warning}</p> : null}
  </section>;
}

const fieldLabels: Partial<Record<keyof CoverDocumentData, string>> = {
  documentCategory: "Categoria", documentNumber: "Código do documento", title: "Título", internalDocumentCode: "Cód. documento interno",
  taxonomy: "Taxonomia da LD", revision: "Revisão", revisionDescription: "Descrição da revisão", revisionDate: "Data",
  executor: "Execução", checker: "Verificação", approver: "Aprovação",
};
export function CoverReview({ vm }: { vm: UseCoverToolReturn }) {
  if (!vm.data || !vm.selected) return null;
  return <section className="cover-card cover-review">
    <div className="cover-card-head"><div><span className="cover-step">4</span><h3>Revisar dados da capa</h3><p>Campos alterados aqui não modificam a LD e podem ser restaurados.</p></div></div>
    <div className="cover-form-grid">
      {vm.editableFields.map((field) => <label key={field} className={field === "title" ? "span-2" : ""}>
        <span>{fieldLabels[field] || field}{vm.manual.has(field) ? <em>Alterado manualmente</em> : null}</span>
        <input value={String(vm.data?.[field] ?? "")} onChange={(e) => vm.updateField(field, e.target.value as never)}/>
        {vm.manual.has(field) ? <button type="button" className="cover-restore" onClick={() => vm.restoreField(field)}>Restaurar valor da LD</button> : null}
      </label>)}
    </div>
    <div className="cover-facts">
      <span><b>LD</b>{vm.selected.source}</span><span><b>EAP</b>{vm.selected.eap || "Não informado"}</span>
      <span><b>Disciplina</b>{vm.selected.discipline || "Não informada"}</span><span><b>Taxonomia</b>{vm.data.taxonomy || "Não informada na LD"}</span>
    </div>
  </section>;
}

export function CoverValidation({ vm }: { vm: UseCoverToolReturn }) {
  return <section className="cover-validation" aria-live="polite">
    {vm.validation.errors.map((m) => <p className="is-error" key={"e"+m}>✕ {m}</p>)}
    {vm.validation.warnings.map((m) => <p className="is-warn" key={"w"+m}>⚠ {m}</p>)}
    {!vm.validation.errors.length && vm.selected ? <p className="is-ok">✓ Dados mínimos prontos para geração.</p> : null}
  </section>;
}

export function CoverPreviewAndActions({ vm }: { vm: UseCoverToolReturn }) {
  if (!vm.data || !vm.selected) return null;
  const pdfReady = vm.source?.format === "pdf" && vm.validation.valid;
  const docxReady = vm.source?.format === "docx" && vm.validation.valid;
  return <section className="cover-output-grid">
    <div className="cover-preview-card">
      <div className="cover-preview-head"><strong>Preview da capa real</strong><span>{vm.previewBusy ? "Atualizando…" : vm.totalPages ? `1 de ${vm.totalPages}` : "total pendente"}</span></div>
      {vm.previewUrl ? <iframe title="Preview da capa" src={vm.previewUrl}/> : <div className="cover-preview-empty">Preview indisponível até a capa estar preenchida.</div>}
    </div>
    <div className="cover-actions-card">
      <h3>Gerar arquivo final</h3>
      <CoverValidation vm={vm}/>
      <button className="primary-button" type="button" disabled={!pdfReady || vm.busy} onClick={vm.generatePdf}>Gerar PDF</button>
      <small>{vm.source?.format === "docx" ? "PDF a partir de DOCX não é oferecido sem conversor confiável no navegador." : "Capa + PDF original, sem rasterizar as páginas existentes."}</small>
      <button className="secondary-button" type="button" disabled={!docxReady || vm.busy} onClick={vm.generateDocx}>Gerar Word editável</button>
      <small>{vm.source?.format === "pdf" ? "PDF → Word editável não é prometido; use a saída PDF." : "A capa permanece editável e o DOCX original é incorporado para abertura no Microsoft Word."}</small>
      {vm.busy ? <div className="cover-progress"><i/><span>{vm.progress || "Processando…"}</span></div> : null}
      <p className="cover-privacy">Processamento local no navegador. Nenhum documento é enviado a serviço externo de conversão.</p>
    </div>
  </section>;
}