/**
 * GRCON — Componentes de apresentação da ilha React de Consultas.
 *
 * FASE B reorganiza somente apresentação, interação e feedback. Nenhum
 * componente acessa motores legados diretamente; toda regra continua chegando
 * pelo hook/useConsultas através do adapter.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
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

function SetupPanel({
  step,
  title,
  description,
  complete,
  summary,
  defaultExpanded = true,
  optional = false,
  className = "",
  children,
}: {
  step: string;
  title: string;
  description: string;
  complete: boolean;
  summary: string;
  defaultExpanded?: boolean;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded && !complete);
  const wasComplete = useRef(complete);

  useEffect(() => {
    if (complete && !wasComplete.current) setExpanded(false);
    if (!complete && wasComplete.current && defaultExpanded) setExpanded(true);
    wasComplete.current = complete;
  }, [complete, defaultExpanded]);

  return (
    <section className={`requests-setup-panel ui-panel${complete ? " is-complete" : ""}${className ? ` ${className}` : ""}`}>
      <div className="requests-setup-head">
        <span className="requests-setup-status" aria-hidden="true">{complete ? "✓" : step}</span>
        <div className="requests-setup-copy">
          <h3>{title}{optional ? " (opcional)" : ""}</h3>
          <p>{complete ? summary : description}</p>
        </div>
        <button
          className="text-button compact requests-setup-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Recolher" : complete ? "Alterar" : optional ? "Configurar" : "Abrir"}
        </button>
      </div>
      <div className="requests-setup-body" hidden={!expanded}>{children}</div>
    </section>
  );
}

export function StepsIndicator({ ldsReady, documentsCount, resultsCount, compact = false }: {
  ldsReady: number;
  documentsCount: number;
  resultsCount: number;
  compact?: boolean;
}) {
  const step3Current = ldsReady > 0 && documentsCount > 0 && !resultsCount;
  return (
    <ol className={`requests-steps${compact ? " is-compact" : ""}`} aria-label="Etapas da consulta">
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

export function LdPanel({ lds, readyCount, lastLd, onAddFiles, onRemove, onClear, onReuseHint }: {
  lds: LdEntry[];
  readyCount: number;
  lastLd: { name: string } | null;
  onAddFiles: (files: FileList | null | undefined) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onReuseHint: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const openPicker = () => inputRef.current?.click();
  const summary = readyCount
    ? `${formatBr(readyCount)} LD(s) válida(s) · ${formatBr(lds.length)} arquivo(s) anexado(s)`
    : "Nenhuma LD válida carregada";

  return (
    <SetupPanel
      step="1"
      title="Listas de documentos (LD)"
      description="Anexe uma ou mais LDs para formar a base da consulta."
      complete={readyCount > 0}
      summary={summary}
    >
      <div
        className={`requests-drop${dragOver ? " is-over" : ""}`}
        tabIndex={0}
        role="button"
        aria-describedby="requests-drop-hint"
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragOver(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          onAddFiles(event.dataTransfer?.files);
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        <strong>Arraste as LDs aqui</strong>
        <span id="requests-drop-hint">ou clique para escolher os arquivos (.xlsx, .xls, .xlsm)</span>
        <input
          ref={inputRef}
          accept=".xlsx,.xls,.xlsm"
          multiple
          type="file"
          hidden
          onChange={(event) => {
            onAddFiles(event.target.files);
            event.target.value = "";
          }}
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
            <button
              className="requests-ld-remove"
              title="Remover esta LD"
              type="button"
              aria-label={`Remover ${item.name}`}
              onClick={() => onRemove(item.id)}
            >×</button>
          </div>
        ))}
      </div>

      <div className="requests-inline-actions">
        <button className="secondary-button compact" type="button" onClick={openPicker}>Adicionar LDs</button>
        {lastLd && !lds.length
          ? <button className="text-button" type="button" onClick={onReuseHint}>{`Reutilizar "${lastLd.name}"`}</button>
          : null}
        {Boolean(lds.length)
          ? <button className="text-button danger" type="button" onClick={onClear}>Remover todas</button>
          : null}
      </div>
    </SetupPanel>
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
    if (!central.ok) {
      statusText = central.error || "Não foi possível ler a central.";
      hasError = true;
    } else {
      statusText = `${central.nomeArquivo} · aba "${central.sheetName}" · ${formatBr(central.count)} envio(s) de ALOC para ${formatBr(central.documents)} documento(s).`;
    }
  }

  return (
    <SetupPanel
      step="+"
      title="Central de alocação"
      description="Anexe o Controle de Solicitações somente quando precisar do status de alocação e da resposta da fiscal."
      complete={Boolean(central?.ok)}
      summary={central?.ok ? statusText : "Central não anexada"}
      defaultExpanded={false}
      optional
      className="requests-central-panel"
    >
      <p aria-live="polite" className={`requests-central-status${hasError ? " tem-erro" : ""}`}>{statusText}</p>
      <div className="requests-inline-actions">
        <button className="secondary-button compact" type="button" onClick={() => inputRef.current?.click()}>
          Anexar o Controle de Solicitações
        </button>
        <input
          ref={inputRef}
          accept=".xlsx,.xls,.xlsm"
          hidden
          type="file"
          onChange={(event) => {
            onAttach(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {Boolean(central)
          ? <button className="text-button danger" type="button" onClick={onClear}>Remover</button>
          : null}
      </div>
    </SetupPanel>
  );
}

export function DocumentsPanel({ count, onAdd, onPasteClipboard }: {
  count: number;
  onAdd: (texto: string) => void;
  onPasteClipboard: (setValue: (value: string) => void) => void;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    onAdd(value);
    setValue("");
  };

  return (
    <SetupPanel
      step="2"
      title="Documentos a consultar"
      description="Cole códigos, um por linha. Código e título podem vir separados por tabulação."
      complete={count > 0}
      summary={`${formatBr(count)} documento(s) pronto(s) para consulta`}
    >
      <label className="requests-paste-label" htmlFor="requests-paste">Lista de documentos</label>
      <textarea
        id="requests-paste"
        rows={5}
        spellCheck={false}
        placeholder={"C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019\nC1O_RNEST_U32_10.2.1.2_TUB_RIR_nt-NF-1288-CONEXOES"}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="requests-inline-actions">
        <button className="secondary-button compact" type="button" onClick={submit}>Adicionar à lista</button>
        <button className="text-button" type="button" onClick={() => onPasteClipboard(setValue)}>Colar da área de transferência</button>
        <span className="requests-count">{`${formatBr(count)} documento(s) na lista`}</span>
      </div>
    </SetupPanel>
  );
}

export function ActionsBar(props: {
  canQuery: boolean;
  hasSelection: boolean;
  hasDocuments: boolean;
  hasResults: boolean;
  canUndo: boolean;
  selectedCount: number;
  documentsCount: number;
  onRun: (onlySelected?: boolean) => void;
  onRunSelected: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onDedupe: () => void;
  onCopy: () => void;
  onExport: () => void;
  onUndo: () => void;
  onClear: () => void;
  selectionNote: string;
  templates: ExportTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (id: string) => void;
  lastExport: { id: string; name: string } | null;
  onRepeat: () => void;
}) {
  const {
    canQuery,
    hasSelection,
    hasDocuments,
    hasResults,
    canUndo,
    selectedCount,
    documentsCount,
    onRun,
    onRunSelected,
    onSelectAll,
    onSelectNone,
    onDedupe,
    onCopy,
    onExport,
    onUndo,
    onClear,
    selectionNote,
    templates,
    selectedTemplateId,
    onTemplateChange,
    lastExport,
    onRepeat,
  } = props;

  const partialSelection = hasSelection && selectedCount < documentsCount;

  return (
    <section className="requests-commandbar" aria-label="Ações da consulta">
      <div className="requests-command-primary">
        <button className="primary-button" disabled={!canQuery} type="button" onClick={() => onRun(false)}>
          Consultar documentos
        </button>
        <button className="secondary-button compact" disabled={!canQuery || !partialSelection} type="button" onClick={onRunSelected}>
          Consultar selecionados
        </button>
      </div>

      <div className="requests-command-results">
        <button className="secondary-button compact" disabled={!hasResults} type="button" onClick={onCopy}>Copiar</button>
        <label className="requests-modelo-escolha">
          <span>Modelo</span>
          <select value={selectedTemplateId} onChange={(event) => onTemplateChange(event.target.value)}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        <button className="secondary-button compact" disabled={!hasResults} type="button" onClick={onExport}>Exportar Excel</button>
        {lastExport
          ? <button className="text-button" type="button" onClick={onRepeat}>{`Repetir "${lastExport.name}"`}</button>
          : null}
      </div>

      <div className="requests-command-secondary">
        <button className="text-button" disabled={!hasDocuments} type="button" onClick={onSelectAll}>Selecionar todos</button>
        <button className="text-button" disabled={!hasSelection} type="button" onClick={onSelectNone}>Limpar seleção</button>
        <details className="requests-more-actions">
          <summary className="secondary-button compact">Mais ações</summary>
          <div className="requests-more-popover">
            <button className="text-button" disabled={!hasDocuments} type="button" onClick={onDedupe}>Remover duplicados</button>
            <button className="text-button" disabled={!canUndo} type="button" onClick={onUndo}>Desfazer</button>
            <button className="text-button danger" disabled={!hasDocuments && !hasResults} type="button" onClick={onClear}>Limpar consulta</button>
          </div>
        </details>
        <span className="requests-selection-note" aria-live="polite">{selectionNote}</span>
      </div>
    </section>
  );
}

export function FiltersBar({
  search,
  situation,
  allocation,
  sort,
  totalCount,
  shownCount,
  onSearch,
  onSituation,
  onAllocation,
  onSort,
  onClear,
}: {
  search: string;
  situation: string;
  allocation: string;
  sort: string;
  totalCount: number;
  shownCount: number;
  onSearch: (value: string) => void;
  onSituation: (value: string) => void;
  onAllocation: (value: string) => void;
  onSort: (value: string) => void;
  onClear: () => void;
}) {
  const hasFilters = Boolean(search || situation || allocation);
  const situationLabel: Record<string, string> = {
    Localizado: "Localizados",
    "Requer validação manual": "A validar",
    "Não localizado": "Não localizados",
  };

  return (
    <div className="requests-filterbar" aria-label="Filtros dos resultados">
      <label className="requests-search">
        <span>Buscar</span>
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx={10} cy={10} r={6} /><path d="M14.5 14.5L21 21" /></svg>
        <input
          value={search}
          placeholder="Código, título ou LD"
          type="search"
          onChange={(event) => onSearch(event.target.value)}
        />
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

      <div className="requests-inline-actions">
        {situation
          ? <button className="requests-active-filter" type="button" onClick={() => onSituation("")}>
              {situationLabel[situation] || situation} ×
            </button>
          : null}
        <button className="text-button compact" disabled={!hasFilters} type="button" onClick={onClear}>Limpar filtros</button>
      </div>

      <span className="requests-filter-count" aria-live="polite">
        {hasFilters ? `Exibindo ${formatBr(shownCount)} de ${formatBr(totalCount)}` : `${formatBr(totalCount)} documento(s)`}
      </span>
    </div>
  );
}

export function ProgressBar({ running, progress }: {
  running: boolean;
  progress: { done: number; total: number };
}) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div aria-live="polite" className="requests-progress" hidden={!running}>
      <div className="requests-progress-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
      <span>{`Consultando ${formatBr(progress.done)} de ${formatBr(progress.total)}…`}</span>
    </div>
  );
}

function celulaVazio(texto?: string) {
  return <span className="requests-vazio">{texto || "—"}</span>;
}

function celulaEmitido(linha: ConsultationRow | null) {
  if (!linha) return celulaVazio();
  if (!linha.issuedEgrdt) return <span className="requests-nao-emitido">Não emitido</span>;
  const anteriores = Number(linha.issuedCount) > 1
    ? <small className="requests-multi">{`+${Number(linha.issuedCount) - 1} anterior(es)`}</small>
    : null;
  const titulo = (linha.issuedAll || [])
    .map((item) => `${item.egrdt}${item.revision ? ` — Rev. ${item.revision}` : " — revisão não registrada"}${item.date ? ` — ${item.date}` : ""}`)
    .join("\n");
  return <span className="requests-emitido" title={titulo}><strong>{linha.issuedEgrdt}</strong>{linha.issuedAt ? <small>{linha.issuedAt}</small> : null}{anteriores}</span>;
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
  const anteriores = Number(linha.sigemLdRevisionCount) > 1
    ? <small className="requests-multi">{`+${Number(linha.sigemLdRevisionCount) - 1} anterior(es)`}</small>
    : null;
  const titulo = (linha.sigemLdRevisionAll || [])
    .map((item) => `Rev. ${item.revision}${item.status ? ` — ${item.status}` : ""}`)
    .join("\n") || linha.sigemLdRevisionLabel || "Revisão encontrada na Colar SIGEM";
  return (
    <span className="requests-revisao-emitida" title={titulo}>
      <strong>{`Rev. ${linha.sigemLdRevision}`}</strong><small>Colar SIGEM</small>{anteriores}
    </span>
  );
}

function celulaCodigoLocalizado(linha: ConsultationRow | null) {
  if (!linha || !linha.ldDocument) {
    return <span className="requests-vazio" title={linha?.ntSearchMessage || ""}>Não localizado</span>;
  }
  const badge = linha.codeAdjusted
    ? <span className="requests-badge ajuste" title={linha.codeAdjustmentNote}>Código ajustado</span>
    : null;
  const duasFormas = linha.bothNtFormsInLd
    ? <span className="requests-badge alerta" title={linha.ntFormsDetail || ""}>Consta com e sem nt-</span>
    : null;
  return <><code title={linha.ntSearchMessage || ""}>{linha.ldDocument}</code>{badge}{duasFormas}</>;
}

function celulaTaxonomiaInterna(linha: ConsultationRow | null) {
  const value = linha?.internalTaxonomy;
  if (!value) return celulaVazio();
  return <span title="Taxonomia Interna da mesma linha da LD considerada">{value}</span>;
}

function celulaCentralStatus(central: AllocationCenterIndex | null, linha: ConsultationRow | null) {
  if (!central || !central.ok) return celulaVazio("sem central");
  if (!linha || !linha.centerFound) return celulaVazio("não consta na central");
  const extra = linha.centerAllocation
    ? <small className="requests-multi">{`${linha.centerAllocation}${linha.centerSentAt ? ` · ${linha.centerSentAt}` : ""}`}</small>
    : null;
  const envios = Number(linha.centerSubmissions) > 1
    ? <small className="requests-rule">{`${linha.centerSubmissions} envios; vale o mais recente.`}</small>
    : null;
  return <>{linha.centerStatus || celulaVazio()}{extra}{envios}</>;
}

function selo(linha: ConsultationRow | null) {
  if (!linha) return <span className="requests-badge pendente">Não consultado</span>;
  if (linha.situation === "Localizado") return <span className="requests-badge ok">✓ Localizado</span>;
  if (linha.situation === "Requer validação manual") return <span className="requests-badge alerta">! Validar</span>;
  return <span className="requests-badge erro">✕ Não localizado</span>;
}

function ResultsRow({ item, linha, onToggle, onOpen }: {
  item: DocumentEntry;
  linha: ConsultationRow | null;
  onToggle: (id: string, selected: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <tr data-doc={item.id} className={linha?.needsManualValidation ? "precisa-validar" : undefined}>
      <td className="requests-col-check">
        <input
          aria-label={`Selecionar ${item.document}`}
          type="checkbox"
          checked={item.selected}
          onChange={(event) => onToggle(item.id, event.target.checked)}
        />
      </td>
      <td className="requests-col-status">{selo(linha)}</td>
      <td className="requests-col-doc">
        <code>{item.document}</code>
        {linha?.needsManualValidation && linha.rule
          ? <small className="requests-table-subtext">{linha.rule}</small>
          : null}
      </td>
      <td className="requests-col-title">{linha?.title || celulaVazio()}</td>
      <td className="requests-col-taxonomia">{celulaTaxonomiaInterna(linha)}</td>
      <td className="requests-col-allocation">{linha?.allocated || celulaVazio()}</td>
      <td className="requests-col-sigem">{linha?.sigemStatus || celulaVazio()}</td>
      <td className="requests-col-ld">
        {linha?.ld || celulaVazio()}
        {linha && Number(linha.occurrenceCount) > 1
          ? <small className="requests-multi">{`${linha.occurrenceCount} LDs`}</small>
          : null}
      </td>
      <td className="requests-col-details">
        <button className="text-button compact" type="button" onClick={onOpen} aria-label={`Abrir detalhes de ${item.document}`}>
          Detalhes
        </button>
      </td>
    </tr>
  );
}

const COLUMN_HEADERS = ["Situação", "Documento", "Título", "Taxonomia Interna", "Alocação", "Status SIGEM", "LD", "Detalhes"];

function CheckAll({ allSelected, someSelected, onToggleAll }: {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (selected: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  return (
    <input
      ref={ref}
      aria-label="Selecionar todos os resultados"
      type="checkbox"
      checked={allSelected}
      onChange={(event) => onToggleAll(event.target.checked)}
    />
  );
}

function DetailField({ label, children, wide = false }: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`requests-detail-field${wide ? " requests-detail-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children || celulaVazio()}</dd>
    </div>
  );
}

export function DocumentDetailsDrawer({ entry, central, onClose }: {
  entry: { item: DocumentEntry; linha: ConsultationRow | null } | null;
  central: AllocationCenterIndex | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!entry) return undefined;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose]);

  if (!entry) return null;
  const { item, linha } = entry;
  const issuedHistory = linha?.issuedAll || [];
  const sigemHistory = linha?.sigemLdRevisionAll || [];

  return (
    <>
      <button className="requests-detail-overlay" type="button" aria-label="Fechar detalhes" onClick={onClose} />
      <aside className="requests-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="requests-detail-title">
        <header className="requests-detail-head">
          <div>
            <h3 id="requests-detail-title">Detalhes do documento</h3>
            <code>{item.document}</code>
          </div>
          <button ref={closeRef} className="icon-button compact" type="button" aria-label="Fechar detalhes" onClick={onClose}>×</button>
        </header>

        <div className="requests-detail-body">
          <section className="requests-detail-section">
            <h4>Identificação e localização</h4>
            <dl className="requests-detail-grid">
              <DetailField label="Situação">{selo(linha)}</DetailField>
              <DetailField label="Título informado">{item.requestedTitle || celulaVazio()}</DetailField>
              <DetailField label="Código localizado na LD" wide>{celulaCodigoLocalizado(linha)}</DetailField>
              <DetailField label="Forma localizada">{linha?.ldForm || celulaVazio()}</DetailField>
              <DetailField label="Título na LD">{linha?.title || celulaVazio()}</DetailField>
              <DetailField label="Taxonomia interna">{celulaTaxonomiaInterna(linha)}</DetailField>
              <DetailField label="Pesquisa com/sem nt-" wide>{linha?.ntSearchMessage || celulaVazio()}</DetailField>
              <DetailField label="Evidência da forma localizada" wide>{linha?.ntFormsDetail || celulaVazio()}</DetailField>
              <DetailField label="Ajuste de código" wide>{linha?.codeAdjustmentNote || celulaVazio()}</DetailField>
            </dl>
          </section>

          <section className="requests-detail-section">
            <h4>GRDT, eGRDT e SIGEM</h4>
            <dl className="requests-detail-grid">
              <DetailField label="Última GRDT">{linha?.lastGrdt || celulaVazio()}</DetailField>
              <DetailField label="Emitido pelo GRCON">{celulaEmitido(linha)}</DetailField>
              <DetailField label="Revisão emitida no SIGEM">{celulaRevisaoEmitida(linha)}</DetailField>
              <DetailField label="Revisão Colar SIGEM">{celulaRevisaoColarSigem(linha)}</DetailField>
              <DetailField label="Status SIGEM" wide>{linha?.sigemStatus || celulaVazio()}</DetailField>
              <DetailField label="Histórico de emissões" wide>
                {issuedHistory.length
                  ? <ul className="requests-detail-list">{issuedHistory.map((entryItem, index) => (
                      <li key={`${entryItem.egrdt || "egrdt"}-${entryItem.revision || ""}-${index}`}>
                        {entryItem.egrdt || "eGRDT não registrada"}{entryItem.revision ? ` · Rev. ${entryItem.revision}` : ""}{entryItem.date ? ` · ${entryItem.date}` : ""}
                      </li>
                    ))}</ul>
                  : celulaVazio("sem histórico de emissão")}
              </DetailField>
              <DetailField label="Histórico Colar SIGEM" wide>
                {sigemHistory.length
                  ? <ul className="requests-detail-list">{sigemHistory.map((entryItem, index) => (
                      <li key={`${entryItem.revision || "rev"}-${entryItem.status || ""}-${index}`}>
                        {entryItem.revision ? `Rev. ${entryItem.revision}` : "Revisão não registrada"}{entryItem.status ? ` · ${entryItem.status}` : ""}
                      </li>
                    ))}</ul>
                  : celulaVazio("sem revisão registrada na Colar SIGEM")}
              </DetailField>
            </dl>
          </section>

          <section className="requests-detail-section">
            <h4>Alocação e fiscal</h4>
            <dl className="requests-detail-grid">
              <DetailField label="Alocado?">{linha?.allocated || celulaVazio()}</DetailField>
              <DetailField label="Alocação">{linha?.allocation || celulaVazio()}</DetailField>
              <DetailField label="Status da central" wide>{celulaCentralStatus(central, linha)}</DetailField>
              <DetailField label="Resposta fiscal" wide>{linha?.centerFiscalAnswer || celulaVazio()}</DetailField>
            </dl>
          </section>

          <section className="requests-detail-section">
            <h4>LD e evidências</h4>
            <dl className="requests-detail-grid">
              <DetailField label="LD">{linha?.ld || celulaVazio()}</DetailField>
              <DetailField label="Ocorrências">{linha?.occurrenceCount ? formatBr(linha.occurrenceCount) : celulaVazio()}</DetailField>
              <DetailField label="Todas as LDs" wide>{linha?.allLds || celulaVazio()}</DetailField>
              <DetailField label="Regra / evidência" wide>{linha?.rule || celulaVazio()}</DetailField>
            </dl>
          </section>
        </div>
      </aside>
    </>
  );
}

const PAGE_SIZE = 100;

export function ResultsTable({
  visibleRows,
  hasDocuments,
  onToggle,
  onToggleAll,
  allSelected,
  someSelected,
  central,
  filterKey = "",
}: {
  visibleRows: Array<{ item: DocumentEntry; linha: ConsultationRow | null }>;
  hasDocuments: boolean;
  onToggle: (id: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
  allSelected: boolean;
  someSelected: boolean;
  central: AllocationCenterIndex | null;
  filterKey?: string;
}) {
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<{ item: DocumentEntry; linha: ConsultationRow | null } | null>(null);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [filterKey]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const start = (page - 1) * PAGE_SIZE;
  const pageRows = visibleRows.slice(start, start + PAGE_SIZE);
  const hasFilteredRows = pageRows.length > 0;

  return (
    <>
      <div className="requests-table-wrap" hidden={!hasDocuments || !hasFilteredRows}>
        <table className="requests-table">
          <thead>
            <tr>
              <th className="requests-col-check">
                <CheckAll allSelected={allSelected} someSelected={someSelected} onToggleAll={onToggleAll} />
              </th>
              {COLUMN_HEADERS.map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ item, linha }) => (
              <ResultsRow
                key={item.id}
                item={item}
                linha={linha}
                onToggle={onToggle}
                onOpen={() => setDetail({ item, linha })}
              />
            ))}
          </tbody>
        </table>
      </div>

      {hasDocuments && !visibleRows.length
        ? <empty-state className="requests-filter-empty">
            <strong>Nenhum documento corresponde aos filtros</strong>
            <span>Limpe ou ajuste os filtros para voltar a exibir os resultados.</span>
          </empty-state>
        : null}

      <empty-state className="requests-empty" hidden={hasDocuments}>
        <strong>Nenhuma consulta ainda</strong>
        <span>Adicione uma ou mais LDs e informe os documentos para iniciar a consulta.</span>
      </empty-state>

      {visibleRows.length > PAGE_SIZE
        ? <nav className="requests-pagination" aria-label="Paginação dos resultados">
            <span>{`Mostrando ${formatBr(start + 1)}–${formatBr(Math.min(start + PAGE_SIZE, visibleRows.length))} de ${formatBr(visibleRows.length)}`}</span>
            <button className="secondary-button compact" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
            <span>{`Página ${formatBr(page)} de ${formatBr(pageCount)}`}</span>
            <button className="secondary-button compact" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Próxima</button>
          </nav>
        : null}

      <DocumentDetailsDrawer entry={detail} central={central} onClose={() => setDetail(null)} />
    </>
  );
}

export function SummaryBar({ summary, activeSituation, onFilter }: {
  summary: { total: number; localizados: number; validar: number; ausentes: number } | null;
  activeSituation: string;
  onFilter: (value: string) => void;
}) {
  if (!summary) return null;

  const metrics = [
    { label: "Total", count: summary.total, value: "", className: "" },
    { label: "Localizados", count: summary.localizados, value: "Localizado", className: "ok" },
    { label: "A validar", count: summary.validar, value: "Requer validação manual", className: "alerta" },
    { label: "Não localizados", count: summary.ausentes, value: "Não localizado", className: "erro" },
  ];

  return (
    <div className="requests-summary" aria-label="Resumo da consulta">
      {metrics.map((metric) => (
        <button
          key={metric.label}
          className={`requests-kpi${metric.className ? ` ${metric.className}` : ""}`}
          type="button"
          aria-pressed={activeSituation === metric.value}
          onClick={() => onFilter(metric.value)}
        >
          <span>{metric.label}</span>
          <strong>{formatBr(metric.count)}</strong>
          <b aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
