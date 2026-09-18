/**
 * GRCON — Componentes de apresentação da ilha React de Consultas.
 *
 * Reaproveitam literalmente as classes de requests.css (nenhum CSS novo) para
 * preservar o visual atual. Nenhum componente acessa `window`/módulos legados
 * diretamente — todo dado chega via props vindas do hook `useConsultas` (que
 * por sua vez só fala com o legado através do adaptador).
 */
import { useEffect, useRef, useState } from "react";
import type {
  AllocationCenterIndex,
  ConsultationRow,
  DocumentEntry,
  ExportTemplate,
  LdEntry,
} from "../types/domain";

function formatBr(n: number | undefined): string {
  return Number(n || 0).toLocaleString("pt-BR");
}

export function StepsIndicator({ ldsReady, documentsCount, resultsCount }: {
  ldsReady: number; documentsCount: number; resultsCount: number;
}) {
  const step3Current = ldsReady > 0 && documentsCount > 0 && !resultsCount;
  return (
    <ol className="requests-steps" aria-label="Etapas da consulta">
      <li className={`requests-step${ldsReady ? " is-done" : " is-current"}`}>
        <b>1</b>
        <span><strong>Anexar as LDs</strong><small>{ldsReady ? `${ldsReady} LD(s) carregada(s)` : "Nenhuma LD carregada"}</small></span>
      </li>
      <li className={`requests-step${documentsCount ? " is-done" : ldsReady ? " is-current" : ""}`}>
        <b>2</b>
        <span><strong>Informar os documentos</strong><small>{documentsCount ? `${formatBr(documentsCount)} documento(s) na lista` : "Nenhum documento na lista"}</small></span>
      </li>
      <li className={`requests-step${resultsCount ? " is-done" : step3Current ? " is-current" : ""}`}>
        <b>3</b>
        <span><strong>Consultar e exportar</strong><small>{resultsCount ? `${formatBr(resultsCount)} consultado(s)` : "Aguardando consulta"}</small></span>
      </li>
    </ol>
  );
}

export function LdPanel({ lds, lastLd, onAddFiles, onRemove, onClear, onReuseHint }: {
  lds: LdEntry[];
  lastLd: { name: string } | null;
  onAddFiles: (files: FileList | null | undefined) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onReuseHint: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const openPicker = () => inputRef.current?.click();
  return (
    <section className="requests-panel" aria-labelledby="requests-ld-title">
      <div className="requests-panel-head">
        <h3 id="requests-ld-title">Listas de documentos (LD)</h3>
        <small>Pode anexar várias. O mesmo documento é procurado em todas.</small>
      </div>
      <div
        className={`requests-drop${dragOver ? " is-over" : ""}`}
        tabIndex={0}
        role="button"
        aria-describedby="requests-drop-hint"
        onClick={openPicker}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPicker(); } }}
        onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragOver(false); }}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); onAddFiles(event.dataTransfer?.files); }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        <strong>Arraste as LDs aqui</strong>
        <span id="requests-drop-hint">ou clique para escolher os arquivos (.xlsx, .xls, .xlsm)</span>
        <input
          ref={inputRef} accept=".xlsx,.xls,.xlsm" multiple type="file" hidden
          onChange={(event) => { onAddFiles(event.target.files); event.target.value = ""; }}
        />
      </div>
      <div className="requests-ld-list">
        {lds.map((item) => (
          <div className={`requests-ld-item${item.error ? " has-error" : ""}`} key={item.id}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /></svg>
            <span className="requests-ld-name">{item.name}</span>
            {item.error
              ? <span className="requests-ld-error">{item.error}</span>
              : item.records.length
                ? <span className="requests-ld-ok">{`${formatBr(item.records.length)} linha(s) de documento`}</span>
                : <span className="requests-ld-loading">Lendo…</span>}
            <button className="requests-ld-remove" title="Remover esta LD" type="button" aria-label={`Remover ${item.name}`} onClick={() => onRemove(item.id)}>{"\u00d7"}</button>
          </div>
        ))}
      </div>
      <div className="requests-inline-actions">
        <button className="secondary-button compact" type="button" onClick={openPicker}>Adicionar LDs</button>
        {lastLd && !lds.length && <button className="text-button" type="button" onClick={onReuseHint}>{`Reutilizar "${lastLd.name}"`}</button>}
        {Boolean(lds.length) && <button className="text-button danger" type="button" onClick={onClear}>Remover todas</button>}
      </div>
    </section>
  );
}

export function CentralPanel({ central, onAttach, onClear }: {
  central: AllocationCenterIndex | null;
  onAttach: (file: File | null | undefined) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  let statusText = "Nenhuma central anexada. A consulta responde sem as colunas da fiscal.";
  let hasError = false;
  if (central) {
    if (!central.ok) { statusText = central.error || ""; hasError = true; }
    else statusText = `${central.nomeArquivo} · aba "${central.sheetName}" · ${formatBr(central.count)} envio(s) de ALOC para ${formatBr(central.documents)} documento(s).`;
  }
  return (
    <section className="requests-panel" aria-labelledby="requests-central-title">
      <div className="requests-panel-head">
        <h3 id="requests-central-title">Central de alocação (opcional)</h3>
        <small>A planilha de Controle de Solicitações. Traz o status da alocação e o comentário da fiscal para cada documento consultado.</small>
      </div>
      <div className="requests-inline-actions">
        <button className="secondary-button compact" type="button" onClick={() => inputRef.current?.click()}>Anexar o Controle de Solicitações</button>
        <input
          ref={inputRef} accept=".xlsx,.xls,.xlsm" hidden type="file"
          onChange={(event) => { onAttach(event.target.files?.[0]); event.target.value = ""; }}
        />
        {Boolean(central) && <button className="text-button danger" type="button" onClick={onClear}>Remover</button>}
      </div>
      <p aria-live="polite" className={`requests-central-status${hasError ? " tem-erro" : ""}`}>{statusText}</p>
    </section>
  );
}

export function DocumentsPanel({ count, onAdd, onPasteClipboard }: {
  count: number;
  onAdd: (texto: string) => void;
  onPasteClipboard: (setValue: (value: string) => void) => void;
}) {
  const [value, setValue] = useState("");
  const submit = () => { onAdd(value); setValue(""); };
  return (
    <section className="requests-panel" aria-labelledby="requests-docs-title">
      <div className="requests-panel-head">
        <h3 id="requests-docs-title">Documentos a consultar</h3>
        <small>Cole um por linha. Código e título podem vir separados por tabulação, direto da planilha.</small>
      </div>
      <label className="requests-paste-label" htmlFor="requests-paste">Lista de documentos</label>
      <textarea
        id="requests-paste" rows={5} spellCheck={false}
        placeholder={"C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019\nC1O_RNEST_U32_10.2.1.2_TUB_RIR_nt-NF-1288-CONEXOES"}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); submit(); } }}
      />
      <div className="requests-inline-actions">
        <button className="secondary-button compact" type="button" onClick={submit}>Adicionar à lista</button>
        <button className="text-button" type="button" onClick={() => onPasteClipboard(setValue)}>Colar da área de transferência</button>
        <span className="requests-count">{`${formatBr(count)} documento(s) na lista`}</span>
      </div>
    </section>
  );
}

export function ActionsBar(props: {
  canQuery: boolean; hasSelection: boolean; hasDocuments: boolean; hasResults: boolean; canUndo: boolean;
  onRun: (onlySelected?: boolean) => void; onRunSelected: () => void; onSelectAll: () => void; onSelectNone: () => void;
  onDedupe: () => void; onCopy: () => void; onExport: () => void; onUndo: () => void; onClear: () => void;
  selectionNote: string; templates: ExportTemplate[]; selectedTemplateId: string; onTemplateChange: (id: string) => void;
  lastExport: { id: string; name: string } | null; onRepeat: () => void;
}) {
  const {
    canQuery, hasSelection, hasDocuments, hasResults, canUndo,
    onRun, onSelectAll, onSelectNone, onDedupe, onCopy, onExport,
    onUndo, onClear, selectionNote, templates, selectedTemplateId, onTemplateChange, lastExport, onRepeat,
  } = props;
  return (
    <section className="requests-actions" aria-label="Ações da consulta">
      <button className="primary-button" disabled={!canQuery} type="button" onClick={() => onRun(false)}>Consultar todos</button>
      <button className="secondary-button compact" disabled={!canQuery || !hasSelection} type="button" onClick={() => onRun(true)}>Consultar selecionados</button>
      <span className="requests-actions-divider" aria-hidden="true" />
      <button className="secondary-button compact" disabled={!hasDocuments} type="button" onClick={onSelectAll}>Selecionar todos</button>
      <button className="secondary-button compact" disabled={!hasSelection} type="button" onClick={onSelectNone}>Limpar seleção</button>
      <button className="secondary-button compact" disabled={!hasDocuments} type="button" onClick={onDedupe}>Remover duplicados</button>
      <span className="requests-actions-divider" aria-hidden="true" />
      <button className="secondary-button compact" disabled={!hasResults} type="button" onClick={onCopy}>Copiar resultados</button>
      <label className="requests-modelo-escolha">
        <span>Modelo</span>
        <select value={selectedTemplateId} onChange={(event) => onTemplateChange(event.target.value)}>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </label>
      <button className="secondary-button compact" disabled={!hasResults} type="button" onClick={onExport}>Exportar para Excel</button>
      {lastExport && <button className="text-button" type="button" onClick={onRepeat}>{`Repetir "${lastExport.name}"`}</button>}
      <span className="requests-actions-divider" aria-hidden="true" />
      <span className="requests-actions-divider" aria-hidden="true" />
      <button className="text-button" disabled={!canUndo} type="button" onClick={onUndo}>Desfazer</button>
      <button className="text-button danger" disabled={!hasDocuments && !hasResults} type="button" onClick={onClear}>Limpar consulta</button>
      <span className="requests-selection-note" aria-live="polite">{selectionNote}</span>
    </section>
  );
}

export function FiltersBar({ search, situation, allocation, sort, onSearch, onSituation, onAllocation, onSort }: {
  search: string; situation: string; allocation: string; sort: string;
  onSearch: (value: string) => void; onSituation: (value: string) => void; onAllocation: (value: string) => void; onSort: (value: string) => void;
}) {
  return (
    <div className="requests-results-tools">
      <label className="requests-search">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx={10} cy={10} r={6} /><path d="M14.5 14.5L21 21" /></svg>
        <input value={search} placeholder="Buscar código, título ou LD" type="search" onChange={(event) => onSearch(event.target.value)} />
      </label>
      <label>
        <span>Situação</span>
        <select value={situation} onChange={(event) => onSituation(event.target.value)}>
          <option value="">Todas</option>
          <option value="Localizado">Localizado</option>
          <option value="Requer validação manual">Requer validação manual</option>
          <option value="Não localizado">Não localizado</option>
        </select>
      </label>
      <label>
        <span>Alocação</span>
        <select value={allocation} onChange={(event) => onAllocation(event.target.value)}>
          <option value="">Todas</option>
          <option value="sim">Alocado</option>
          <option value="nao">Não alocado</option>
          <option value="revisar">A revisar</option>
        </select>
      </label>
      <label>
        <span>Ordem</span>
        <select value={sort} onChange={(event) => onSort(event.target.value)}>
          <option value="entrada">Ordem informada</option>
          <option value="documento">Código</option>
          <option value="situacao">Situação</option>
          <option value="ld">LD</option>
        </select>
      </label>
    </div>
  );
}

export function ProgressBar({ running, progress }: { running: boolean; progress: { done: number; total: number } }) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div aria-live="polite" className="requests-progress" hidden={!running}>
      <div className="requests-progress-bar"><i style={{ width: `${percent}%` }} /></div>
      <span>{`Consultando ${formatBr(progress.done)} de ${formatBr(progress.total)}…`}</span>
    </div>
  );
}

function celulaVazio(texto?: string) {
  return <span className="requests-vazio">{texto || "\u2014"}</span>;
}

function celulaEmitido(linha: ConsultationRow | null) {
  if (!linha) return celulaVazio();
  if (!linha.issuedEgrdt) return <span className="requests-nao-emitido">Não emitido</span>;
  const anteriores = Number(linha.issuedCount) > 1 ? <small className="requests-multi">{`+${Number(linha.issuedCount) - 1} anterior(es)`}</small> : null;
  const titulo = (linha.issuedAll || []).map((item) => `${item.egrdt}${item.revision ? ` — Rev. ${item.revision}` : " — revisão não registrada"}${item.date ? ` — ${item.date}` : ""}`).join("\n");
  return <span className="requests-emitido" title={titulo}><strong>{linha.issuedEgrdt}</strong>{linha.issuedAt && <small>{linha.issuedAt}</small>}{anteriores}</span>;
}

function celulaRevisaoEmitida(linha: ConsultationRow | null) {
  if (!linha) return celulaVazio();
  if (!linha.issuedEgrdt) return <span className="requests-nao-emitido">Não emitido</span>;
  if (!linha.issuedRevision) return <span className="requests-revisao-ausente">Não registrada no histórico</span>;
  return (
    <span className="requests-revisao-emitida" title={`Revisão registrada pelo GRCON na ${linha.issuedEgrdt}`}>
      <strong>{`Rev. ${linha.issuedRevision}`}</strong><small>{linha.issuedEgrdt}</small>
    </span>
  );
}

function celulaRevisaoColarSigem(linha: ConsultationRow | null) {
  if (!linha) return celulaVazio();
  if (!linha.sigemLdRevision) return <span className="requests-nao-emitido">Não encontrado</span>;
  const anteriores = Number(linha.sigemLdRevisionCount) > 1 ? <small className="requests-multi">{`+${Number(linha.sigemLdRevisionCount) - 1} anterior(es)`}</small> : null;
  const titulo = (linha.sigemLdRevisionAll || []).map((item) => `Rev. ${item.revision}${item.status ? ` — ${item.status}` : ""}`).join("\n") || linha.sigemLdRevisionLabel || "Revisão encontrada na Colar SIGEM";
  return (
    <span className="requests-revisao-emitida" title={titulo}>
      <strong>{`Rev. ${linha.sigemLdRevision}`}</strong><small>Colar SIGEM</small>{anteriores}
    </span>
  );
}

function celulaCodigoLocalizado(linha: ConsultationRow | null) {
  if (!linha || !linha.ldDocument) return <span className="requests-vazio" title={linha?.ntSearchMessage || ""}>Não localizado</span>;
  const badge = linha.codeAdjusted ? <span className="requests-badge ajuste" title={linha.codeAdjustmentNote}>Código ajustado</span> : null;
  const duasFormas = linha.bothNtFormsInLd ? <span className="requests-badge alerta" title={linha.ntFormsDetail || ""}>Consta com e sem nt-</span> : null;
  return <><code title={linha.ntSearchMessage || ""}>{linha.ldDocument}</code>{badge}{duasFormas}</>;
}

function celulaCentralStatus(central: AllocationCenterIndex | null, linha: ConsultationRow | null) {
  if (!central || !central.ok) return celulaVazio("sem central");
  if (!linha || !linha.centerFound) return celulaVazio("não consta na central");
  const extra = linha.centerAllocation ? <small className="requests-multi">{`${linha.centerAllocation}${linha.centerSentAt ? ` · ${linha.centerSentAt}` : ""}`}</small> : null;
  const envios = Number(linha.centerSubmissions) > 1 ? <small className="requests-rule">{`${linha.centerSubmissions} envios; vale o mais recente.`}</small> : null;
  return <>{linha.centerStatus || celulaVazio()}{extra}{envios}</>;
}

function selo(linha: ConsultationRow | null) {
  if (!linha) return <span className="requests-badge pendente">Não consultado</span>;
  if (linha.situation === "Localizado") return <span className="requests-badge ok">{"\u2713 Localizado"}</span>;
  if (linha.situation === "Requer validação manual") return <span className="requests-badge alerta">! Validar</span>;
  return <span className="requests-badge erro">{"\u2715 Não localizado"}</span>;
}

function ResultsRow({ item, linha, central, onToggle }: {
  item: DocumentEntry; linha: ConsultationRow | null; central: AllocationCenterIndex | null;
  onToggle: (id: string, selected: boolean) => void;
}) {
  return (
    <tr data-doc={item.id} className={linha?.needsManualValidation ? "precisa-validar" : undefined}>
      <td className="requests-col-check"><input aria-label={`Selecionar ${item.document}`} type="checkbox" checked={item.selected} onChange={(event) => onToggle(item.id, event.target.checked)} /></td>
      <td>{selo(linha)}</td>
      <td className="requests-col-doc"><code>{item.document}</code>{linha?.rule && linha.needsManualValidation ? <div className="requests-rule">{linha.rule}</div> : null}</td>
      <td className="requests-col-ld-doc">{celulaCodigoLocalizado(linha)}</td>
      <td>{linha?.title || celulaVazio()}</td>
      <td>{linha?.allocated || celulaVazio()}</td>
      <td>{linha?.lastGrdt || celulaVazio()}</td>
      <td className="requests-col-emitido">{celulaEmitido(linha)}</td>
      <td className="requests-col-revisao-emitida">{celulaRevisaoEmitida(linha)}</td>
      <td className="requests-col-revisao-colar-sigem">{celulaRevisaoColarSigem(linha)}</td>
      <td>{linha?.sigemStatus || celulaVazio()}</td>
      <td className="requests-col-central">{celulaCentralStatus(central, linha)}</td>
      <td className="requests-col-fiscal">{linha?.centerFiscalAnswer || celulaVazio()}</td>
      <td>{linha?.ld || celulaVazio()}{linha && Number(linha.occurrenceCount) > 1 ? <small className="requests-multi">{`${linha.occurrenceCount} LDs`}</small> : null}</td>
    </tr>
  );
}

const COLUMN_HEADERS = ["Situação", "Documento", "Código localizado na LD", "Título na LD", "Alocado?", "Última GRDT", "Emitido pelo GRCON", "Revisão emitida no SIGEM", "Revisão na Colar SIGEM", "Status SIGEM", "Status da alocação (central)", "Resposta da fiscal 01", "LD"];

function CheckAll({ allSelected, someSelected, onToggleAll }: {
  allSelected: boolean; someSelected: boolean; onToggleAll: (selected: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);
  return (
    <input
      ref={ref} aria-label="Selecionar todos os resultados" type="checkbox"
      checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)}
    />
  );
}

export function ResultsTable({ visibleRows, hasDocuments, onToggle, onToggleAll, allSelected, someSelected, central }: {
  visibleRows: Array<{ item: DocumentEntry; linha: ConsultationRow | null }>;
  hasDocuments: boolean;
  onToggle: (id: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
  allSelected: boolean;
  someSelected: boolean;
  central: AllocationCenterIndex | null;
}) {
  return (
    <>
      <div className="requests-table-wrap" hidden={!hasDocuments}>
        <table className="requests-table">
          <thead>
            <tr>
              <th className="requests-col-check"><CheckAll allSelected={allSelected} someSelected={someSelected} onToggleAll={onToggleAll} /></th>
              {COLUMN_HEADERS.map((header, index) => <th key={index}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ item, linha }) => (
              <ResultsRow key={item.id} item={item} linha={linha} central={central} onToggle={onToggle} />
            ))}
          </tbody>
        </table>
      </div>
      <empty-state className="requests-empty" hidden={hasDocuments}>
        <strong>Nenhuma consulta ainda</strong>
        <span>{"Anexe uma LD, informe os documentos e clique em \u201cConsultar todos\u201d."}</span>
      </empty-state>
    </>
  );
}

export function SummaryBar({ summary }: {
  summary: { total: number; localizados: number; validar: number; ausentes: number } | null;
}) {
  if (!summary) return <div className="requests-summary" hidden />;
  return (
    <div className="requests-summary">
      <div><span>Consultados</span><strong>{formatBr(summary.total)}</strong></div>
      <div className="ok"><span>Localizados</span><strong>{formatBr(summary.localizados)}</strong></div>
      <div className="alerta"><span>A validar</span><strong>{formatBr(summary.validar)}</strong></div>
      <div className="erro"><span>Não localizados</span><strong>{formatBr(summary.ausentes)}</strong></div>
    </div>
  );
}
