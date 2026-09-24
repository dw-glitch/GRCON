import { useState, type ChangeEvent } from "react";
import { UiDrawer } from "../../core/ui/UiPrimitives";
import { useSigemPwEvolution } from "./hooks/useSigemPwEvolution";
import {
  EVOLUTION_LIST_LABELS,
  EVOLUTION_PAGE_SIZE,
  type EvolutionListMode,
  type EvolutionRecord,
  type EvolutionSnapshot,
  type EvolutionSystem,
  type EvolutionUiState,
} from "./types/domain";

function fmt(value: unknown): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function fmtDate(value: unknown): string {
  const date = new Date(String(value || ""));
  return value && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "—";
}

function classSummary(rows: EvolutionRecord[]): string {
  const counts = { ET: 0, "N-1710": 0 };
  rows.forEach((row) => {
    if (row.documentClass === "ET" || row.documentClass === "N-1710") counts[row.documentClass] += 1;
  });
  return `ET ${fmt(counts.ET)} · N-1710 ${fmt(counts["N-1710"])}`;
}

function optionLabel(snapshot: EvolutionSnapshot): string {
  return `${fmtDate(snapshot.importedAt)} · ${snapshot.fileName || "base"} · ${fmt(snapshot.audit?.acceptedRecords)} registros`;
}

function SourceSelector({
  system,
  label,
  list,
  selections,
  unavailable,
  enabled,
  onSelect,
}: {
  system: EvolutionSystem;
  label: string;
  list: EvolutionSnapshot[];
  selections: EvolutionUiState["selections"];
  unavailable: number;
  enabled: boolean;
  onSelect(key: keyof EvolutionUiState["selections"], value: string): void;
}) {
  const previousKey = `${system}Prev` as keyof EvolutionUiState["selections"];
  const currentKey = `${system}Current` as keyof EvolutionUiState["selections"];
  const selectedLabel = (key: keyof EvolutionUiState["selections"]) => {
    const snapshot = list.find((item) => item.id === selections[key]);
    return snapshot ? optionLabel(snapshot) : "";
  };
  return (
    <section className="spw-evo-source">
      <header>
        <strong>{label}</strong>
        <small>
          {fmt(list.length)} base(s) utilizável(is)
          {unavailable ? ` · ${fmt(unavailable)} antiga(s) sem payload bruto` : ""}
        </small>
      </header>
      <div className="spw-evo-pair">
        <label>
          <span>Base anterior</span>
          <select title={selectedLabel(previousKey)}
            data-evo-select={previousKey}
            disabled={!enabled}
            value={selections[previousKey]}
            onChange={(event) => onSelect(previousKey, event.target.value)}
          >
            <option value="">— sem anterior —</option>
            {list.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{optionLabel(snapshot)}</option>)}
          </select>
        </label>
        <span className="spw-evo-arrow" aria-hidden="true">→</span>
        <label>
          <span>Base atual</span>
          <select title={selectedLabel(currentKey)}
            data-evo-select={currentKey}
            disabled={!enabled || list.length === 0}
            value={selections[currentKey]}
            onChange={(event) => onSelect(currentKey, event.target.value)}
          >
            {!list.length ? <option value="">— sem base —</option> : null}
            {list.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{optionLabel(snapshot)}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

function Timeline({ rows }: { rows: EvolutionUiState["timeline"] }) {
  const visible = rows.slice(-14);
  if (!visible.length) {
    return (
      <div className="spw-evo-timeline" id="spw-evo-timeline">
        <header>
          <div>
            <strong>Histórico diário</strong><br />
            <small>Será formado após existir mais de uma base válida do mesmo sistema.</small>
          </div>
        </header>
      </div>
    );
  }
  const max = Math.max(1, ...visible.flatMap((row) => [row.sigemAdded, row.sigemRemoved, row.pwAdded, row.pwRemoved, row.pwEmitted]));
  const height = (value: number) => Math.max(value ? 6 : 2, Math.round((Number(value || 0) / max) * 68));
  const dayLabel = (value: string) => {
    const [year, month, day] = value.split("-");
    return year && month && day ? `${day}/${month}` : value;
  };
  return (
    <div className="spw-evo-timeline" id="spw-evo-timeline">
      <header>
        <div>
          <strong>Histórico diário · últimas {fmt(visible.length)} datas</strong><br />
          <small>Cada barra soma as movimentações entre snapshots consecutivos daquele dia.</small>
        </div>
        <div className="spw-evo-legend">
          <span><i className="sigem"></i>SIGEM</span>
          <span><i className="sigem-removed"></i>Saíram SIGEM</span>
          <span><i className="pw"></i>PW</span>
          <span><i className="pw-removed"></i>Saíram PW</span>
          <span><i className="emitted"></i>Emitidos PW</span>
        </div>
      </header>
      <div className="spw-evo-days">
        {visible.map((row) => (
          <div
            className="spw-evo-day"
            key={row.date}
            title={`${row.date} · SIGEM +${row.sigemAdded} / −${row.sigemRemoved} · PW +${row.pwAdded} / −${row.pwRemoved} · emitidos ${row.pwEmitted}`}
            tabIndex={0}
            aria-label={`${row.date}: SIGEM entraram ${row.sigemAdded}, saíram ${row.sigemRemoved}; PW entraram ${row.pwAdded}, saíram ${row.pwRemoved}, emitidos ${row.pwEmitted}`}
          >
            <div className="spw-evo-bars">
              <i className="spw-evo-bar sigem" style={{ height: height(row.sigemAdded) }}></i>
              <i className="spw-evo-bar sigem-removed" style={{ height: height(row.sigemRemoved) }}></i>
              <i className="spw-evo-bar pw" style={{ height: height(row.pwAdded) }}></i>
              <i className="spw-evo-bar pw-removed" style={{ height: height(row.pwRemoved) }}></i>
              <i className="spw-evo-bar emitted" style={{ height: height(row.pwEmitted) }}></i>
            </div>
            <span>{dayLabel(row.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditArticle({ label, snapshot }: { label: string; snapshot: EvolutionSnapshot | null }) {
  if (!snapshot) return <article><strong>{label}</strong><p>Selecione uma base para ver a auditoria.</p></article>;
  const audit = snapshot.audit || {};
  return (
    <article>
      <strong>{label} · {snapshot.fileName || "base"}</strong>
      <p>
        {fmt(audit.uniqueDocuments)} documentos únicos · {fmt(audit.validRevisionRecords)} registros/revisões válidos · {fmt(audit.technicalDuplicates)} duplicidade(s) técnica(s).
      </p>
    </article>
  );
}

function DetailDrawer({
  row,
  listMode,
  onClose,
  selected,
}: {
  row: EvolutionRecord | null;
  listMode: EvolutionListMode;
  onClose(): void;
  selected(system: EvolutionSystem, role: "previous" | "current"): EvolutionSnapshot | null;
}) {
  if (!row) return null;
  const removed = listMode === "removed-sigem" || listMode === "removed-pw";
  const snapshot = selected(row.system === "pw" ? "pw" : "sigem", removed ? "previous" : "current");
  const existed = removed
    ? "Sim, na base anterior"
    : ["sigem-new", "pw-new", "both", "missing-pw"].includes(listMode)
      ? "Não como esta ocorrência"
      : "Não entrou no universo válido";
  const emission = row.system === "pw"
    ? (row.emitted ? `Emitido (${row.lastEmission || "evidência"})` : row.lastEmission || "Não indicada")
    : row.matchedPw
      ? (row.matchedPw.emitted ? `Emitido (${row.matchedPw.lastEmission || "evidência"})` : row.matchedPw.lastEmission || "Não indicada")
      : "—";
  const fields: Array<[string, unknown]> = [
    ["Código", row.document],
    ["Revisão", row.revision],
    ["Título", row.title],
    ["Classe", row.documentClass],
    ["Tipo documental", row.documentType],
    ["TAG", row.tag],
    ["EAP", row.eap],
    ["Disciplina", row.discipline],
    ["Status SIGEM", row.system === "sigem" ? row.status : ""],
    ["Status PW", row.matchedPw?.status || (row.system === "pw" ? row.status : "")],
    ["Data SIGEM", row.system === "sigem" ? row.date : ""],
    ["Data PW", row.matchedPw?.date || (row.system === "pw" ? row.date : "")],
    ["Origem", (row.system || "").toUpperCase()],
    ["Movimento", row.movement],
    ["Snapshot", snapshot ? `${fmtDate(snapshot.importedAt)} · ${snapshot.fileName || "base"}` : "—"],
    ["Existia anteriormente?", existed],
    ["Emissão PW", emission],
    ["LD", row.ldSource ? `${row.ldSource}${row.ldSheet ? ` · ${row.ldSheet}` : ""}${row.ldRow ? ` · linha ${row.ldRow}` : ""}` : (row.ldValidated ? "Validado" : "—")],
    ["Prazo LD", row.ldPrazo],
    ["Chave da ocorrência", row.occurrenceKey],
    ["Situação SIGEM × PW", row.matchedPw ? `Correspondência: ${row.matchedPw.document} · Rev. ${row.matchedPw.revision}` : listMode === "missing-pw" ? "Ainda não identificada no PW atual" : "—"],
  ];
  return (
    <UiDrawer
      open={Boolean(row)}
      onClose={onClose}
      labelledBy="spw-evo-detail-title"
      drawerClassName="spw-evo-drawer"
      overlayClassName="spw-evo-overlay"
      drawerId="spw-evo-drawer"
      overlayId="spw-evo-overlay"
    >
      <header>
        <div>
          <span className="spw-kicker">RASTREABILIDADE</span>
          <h3 id="spw-evo-detail-title">{row.document || "Registro"}{row.revision ? ` · Rev. ${row.revision}` : ""}</h3>
        </div>
        <button className="spw-evo-close" id="spw-evo-close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
      </header>
      <div className="spw-evo-detail" id="spw-evo-detail-body">
        {[
          ["Documento", fields.slice(0, 5)],
          ["Localização", fields.slice(5, 8)],
          ["Status e movimento", fields.slice(8, 14).concat(fields.slice(16, 17))],
          ["Histórico", fields.slice(14, 16).concat(fields.slice(17))],
        ].map(([heading, group]) => (
          <section className="spw-evo-detail-group" key={heading as string}>
            <h4>{heading as string}</h4>
            <div className="spw-evo-detail-grid">{(group as Array<[string, unknown]>).map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{String(value || "—")}</strong></div>
            ))}</div>
          </section>
        ))}
      </div>
    </UiDrawer>
  );
}

export function SigemPwEvolutionApp() {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { state, periodSigem, periodPw, pageData, adapter } = useSigemPwEvolution();
  const hasValidatedLd = Boolean(state.ldUniverse?.qualityAvailable);
  const comparison = state.comparison;
  const relation = comparison?.relation;
  const selectedSigem = adapter.selectedSnapshot("sigem", "current");
  const selectedPw = adapter.selectedSnapshot("pw", "current");

  const counts: Record<EvolutionListMode, number> = {
    "sigem-new": comparison?.sigem?.added.length || 0,
    "pw-new": comparison?.pw?.added.length || 0,
    "pw-emitted": comparison?.pwEmissions.length || 0,
    both: relation?.newInBoth.length || 0,
    "missing-pw": relation?.newSigemMissingPw.length || 0,
    "removed-sigem": comparison?.sigem?.removed.length || 0,
    "removed-pw": comparison?.pw?.removed.length || 0,
  };

  const value = (deltaAvailable: boolean, amount: number, plus = false) =>
    hasValidatedLd && deltaAvailable ? `${plus ? "+" : ""}${fmt(amount)}` : "—";

  const periodLabel = state.period.start || state.period.end
    ? `${state.period.start ? `desde ${state.period.start.split("-").reverse().join("/")}` : "desde o início"} · ${state.period.end ? `até ${state.period.end.split("-").reverse().join("/")}` : "até hoje"}`
    : "Período completo";

  const [listTitle, listSubtitle] = EVOLUTION_LIST_LABELS[state.listMode];
  const onSimpleFilter = (key: "documentClass" | "documentType" | "revision" | "status" | "discipline" | "source") =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => adapter.setFilter(key, event.target.value);
  const advancedCount = [state.rawFilters.tag, state.rawFilters.eap, state.filters.documentType, state.filters.revision, state.filters.status, state.filters.discipline].filter(Boolean).length;
  const activeFilterCount = advancedCount + [state.rawFilters.query, state.filters.documentClass, state.filters.source].filter(Boolean).length;

  return (
    <section id="spw-evolution-section" className="spw-evo-v2 spw-evolution-react" data-evolution-version="react-phase-a">
      <header className="spw-evo-head">
        <div>
          <span className="spw-kicker">EVOLUÇÃO SIGEM × PW</span>
          <h3>O que mudou entre as bases</h3>
          <p>A comparação usa os dois snapshots escolhidos. Cada código + revisão é uma entrada independente; revisão 0 e revisão A do mesmo documento contam como duas linhas.</p>
        </div>
        <div className="spw-evo-actions">
          <button className="text-button" id="spw-history-manage" type="button" onClick={() => adapter.openHistoryManager()}>
            Gerenciar histórico
          </button>
        </div>
      </header>

      <div className={`spw-evo-scope${hasValidatedLd ? "" : " required"}`} id="spw-evo-scope">
        {hasValidatedLd ? (
          <>
            <strong>Universo validado</strong>
            <span>{fmt(state.ldUniverse?.qualityDocumentCount)} códigos N-1710 da LD da Qualidade. ET é validado pela codificação e as demais LDs carregadas enriquecem TAG, EAP e disciplina.</span>
            <button type="button" className="text-button" id="spw-evo-refresh-ld" disabled={state.busy} onClick={() => { void adapter.refresh(true); }}>
              Revalidar LD
            </button>
          </>
        ) : (
          <>
            <strong>LD da Qualidade necessária</strong>
            <span>Atualize a LD N-1710 no dashboard geral. A evolução não calcula números sem validar primeiro esse universo.</span>
          </>
        )}
      </div>

      {state.error ? <div className="spw-evo-message error" role="alert">{state.error}</div> : null}
      {state.busy ? <div className="spw-evo-message" role="status" aria-live="polite">Carregando snapshots da evolução…</div> : null}

      <div className="spw-evo-period">
        <strong className="spw-evo-section-label">1 · Período</strong>
        <label>
          <span>Data inicial</span>
          <input id="spw-evo-date-start" type="date" value={state.period.start} onChange={(event) => adapter.setPeriod("start", event.target.value)} />
        </label>
        <label>
          <span>Data final</span>
          <input id="spw-evo-date-end" type="date" value={state.period.end} onChange={(event) => adapter.setPeriod("end", event.target.value)} />
        </label>
        <button className="text-button" id="spw-evo-date-clear" type="button" onClick={() => adapter.clearPeriod()}>Todo o histórico</button>
        <small id="spw-evo-period-summary">
          {periodLabel}. SIGEM: {fmt(periodSigem.length)} base(s); PW: {fmt(periodPw.length)} base(s).
        </small>
      </div>

      <div className="spw-evo-selectors" id="spw-evo-selectors">
        <strong className="spw-evo-section-label">2 · Bases comparadas</strong>
        <SourceSelector
          system="sigem"
          label="SIGEM"
          list={periodSigem}
          selections={state.selections}
          unavailable={state.unavailable.sigem}
          enabled={hasValidatedLd}
          onSelect={(key, value) => adapter.setSelection(key, value)}
        />
        <SourceSelector
          system="pw"
          label="ProjectWise"
          list={periodPw}
          selections={state.selections}
          unavailable={state.unavailable.pw}
          enabled={hasValidatedLd}
          onSelect={(key, value) => adapter.setSelection(key, value)}
        />
      </div>

      <div className="spw-evo-kpis" id="spw-evo-kpis">
        <button className="spw-evo-kpi sigem" data-evo-list="sigem-new" aria-pressed={state.listMode === "sigem-new"} disabled={!hasValidatedLd || !comparison?.sigem} onClick={() => adapter.setListMode("sigem-new")}>
          <span>Entraram no SIGEM</span><strong>{value(Boolean(comparison?.sigem), counts["sigem-new"], true)}</strong><small>Código + revisão novos na Consulta Geral</small>
        </button>
        <button className="spw-evo-kpi pw" data-evo-list="pw-new" aria-pressed={state.listMode === "pw-new"} disabled={!hasValidatedLd || !comparison?.pw} onClick={() => adapter.setListMode("pw-new")}>
          <span>Entraram no PW</span><strong>{value(Boolean(comparison?.pw), counts["pw-new"], true)}</strong><small>Cadastros novos na relação ProjectWise</small>
        </button>
        <button className="spw-evo-kpi emitted" data-evo-list="pw-emitted" aria-pressed={state.listMode === "pw-emitted"} disabled={!hasValidatedLd || !comparison?.pw} onClick={() => adapter.setListMode("pw-emitted")}>
          <span>Emitidos no PW</span><strong>{value(Boolean(comparison?.pw), counts["pw-emitted"], true)}</strong><small>Novos emitidos ou emissão confirmada</small>
        </button>
        <button className="spw-evo-kpi pending" data-evo-list="missing-pw" aria-pressed={state.listMode === "missing-pw"} disabled={!hasValidatedLd || !comparison?.sigem} onClick={() => adapter.setListMode("missing-pw")}>
          <span>SIGEM novo sem PW</span><strong>{value(Boolean(comparison?.sigem), counts["missing-pw"])}</strong><small>Entradas ainda não localizadas no PW atual</small>
        </button>
      </div>

      <div className="spw-evo-net" id="spw-evo-net">
        {!hasValidatedLd ? <span>Os indicadores serão liberados após a validação das LDs.</span> : (
          <>
            <span>
              <b>SIGEM</b>{" "}
              {comparison?.sigem ? (
                <>
                  {classSummary(comparison.sigem.added)} · <button type="button" data-evo-list="removed-sigem" onClick={() => adapter.setListMode("removed-sigem")}>não encontrados −{fmt(comparison.sigem.removed.length)}</button> · líquido {comparison.sigem.net > 0 ? "+" : ""}{fmt(comparison.sigem.net)}
                </>
              ) : "selecione duas bases"}
            </span>
            <span>
              <b>PW</b>{" "}
              {comparison?.pw ? (
                <>
                  {classSummary(comparison.pw.added)} · <button type="button" data-evo-list="removed-pw" onClick={() => adapter.setListMode("removed-pw")}>não encontrados −{fmt(comparison.pw.removed.length)}</button> · líquido {comparison.pw.net > 0 ? "+" : ""}{fmt(comparison.pw.net)}
                </>
              ) : "selecione duas bases"}
            </span>
            <span><button type="button" data-evo-list="both" onClick={() => adapter.setListMode("both")}>Entraram nos dois: {fmt(counts.both)}</button></span>
          </>
        )}
      </div>

      <Timeline rows={state.timeline} />

      <div className="spw-evo-audit" id="spw-evo-audit">
        {hasValidatedLd ? (
          <>
            <AuditArticle label="SIGEM atual" snapshot={selectedSigem} />
            <AuditArticle label="PW atual" snapshot={selectedPw} />
          </>
        ) : (
          <>
            <article><strong>Auditoria SIGEM</strong><p>Aguardando LD válida.</p></article>
            <article><strong>Auditoria PW</strong><p>Aguardando LD válida.</p></article>
          </>
        )}
      </div>

      <nav className="spw-evo-tabs" id="spw-evo-tabs" aria-label="Listas da evolução">
        {(Object.entries(EVOLUTION_LIST_LABELS) as Array<[EvolutionListMode, readonly [string, string]]>).map(([key, [label]]) => (
          <button
            type="button"
            key={key}
            className={state.listMode === key ? "active" : ""}
            data-evo-list={key}
            disabled={!hasValidatedLd}
            aria-pressed={state.listMode === key}
            onClick={() => adapter.setListMode(key)}
          >
            {label} · {hasValidatedLd ? fmt(counts[key]) : "—"}
          </button>
        ))}
      </nav>

      <div className="spw-evo-filters">
        <div className="spw-evo-filter-heading"><strong>Filtros</strong>{activeFilterCount ? <button type="button" className="text-button spw-evo-clear" onClick={() => adapter.clearFilters()}>Limpar {activeFilterCount} filtro(s)</button> : null}</div>
        <div className="spw-evo-primary-filters">
        <label>
          <span>Código / lista de códigos</span>
          <input id="spw-evo-filter-query" placeholder="Cole códigos separados por linha, vírgula ou ;" value={state.rawFilters.query} onChange={(event) => adapter.setRawFilter("query", event.target.value)} />
        </label>
        <label><span>Classe</span><select id="spw-evo-filter-class" value={state.filters.documentClass} onChange={onSimpleFilter("documentClass")}><option value="">Todas</option><option>ET</option><option>N-1710</option></select></label>
        <label><span>Origem</span><select id="spw-evo-filter-source" value={state.filters.source} onChange={onSimpleFilter("source")}><option value="">SIGEM + PW</option><option value="sigem">SIGEM</option><option value="pw">PW</option></select></label>
        </div>
        <button type="button" id="spw-evo-more-filters" className="spw-evo-more" aria-expanded={advancedOpen} aria-controls="spw-evo-advanced-filters" onClick={() => setAdvancedOpen(!advancedOpen)}>
          Mais filtros{advancedCount ? ` · ${advancedCount} ativo(s)` : ""}<span aria-hidden="true">{advancedOpen ? "▴" : "▾"}</span>
        </button>
        <div className="spw-evo-advanced-filters" id="spw-evo-advanced-filters" hidden={!advancedOpen}>
        <label><span>Tipo documental</span><input id="spw-evo-filter-document-type" placeholder="REP, RL, DE..." value={state.filters.documentType} onChange={onSimpleFilter("documentType")} /></label>
        <label><span>Revisão</span><input id="spw-evo-filter-revision" placeholder="A" value={state.filters.revision} onChange={onSimpleFilter("revision")} /></label>
        <label><span>Status</span><input id="spw-evo-filter-status" placeholder="Status" value={state.filters.status} onChange={onSimpleFilter("status")} /></label>
        <label><span>Disciplina</span><input id="spw-evo-filter-discipline" placeholder="Disciplina" value={state.filters.discipline} onChange={onSimpleFilter("discipline")} /></label>
        <label><span>TAG</span><input id="spw-evo-filter-tag" placeholder="TAG" value={state.rawFilters.tag} onChange={(event) => adapter.setRawFilter("tag", event.target.value)} /></label>
        <label><span>EAP</span><input id="spw-evo-filter-eap" placeholder="1.1.1.1" value={state.rawFilters.eap} onChange={(event) => adapter.setRawFilter("eap", event.target.value)} /></label>
        </div>
      </div>

      <div className="spw-evo-list-head">
        <div><strong id="spw-evo-list-title">{listTitle}</strong><br /><small id="spw-evo-list-subtitle">{listSubtitle}</small></div>
        <div className="spw-evo-list-actions"><strong id="spw-evo-list-count">{hasValidatedLd ? `${fmt(state.filteredRows.length)} resultados` : "LD necessária"}</strong><button className="secondary-button compact" id="spw-evo-export" type="button" disabled={state.exporting || state.filteredRows.length === 0} onClick={() => { void adapter.exportFilteredRows(); }}>{state.exporting ? "Gerando Excel..." : "Exportar lista"}</button></div>
      </div>

      <p className="spw-evo-scroll-hint">Deslize a tabela para ver todas as colunas →</p>
      <div className="spw-evo-table-wrap" id="spw-evo-table" tabIndex={0} aria-label="Tabela da Evolução SIGEM × ProjectWise">
        {!hasValidatedLd ? (
          <div className="spw-evo-empty"><strong>Evolução não calculada.</strong>Carregue as LDs para validar o universo documental antes da comparação.</div>
        ) : !pageData.visible.length ? (
          <div className="spw-evo-empty"><strong>{activeFilterCount ? "Nenhum resultado para estes filtros." : comparison ? "Nenhum registro nesta relação." : "Selecione as bases para comparar."}</strong>{activeFilterCount ? "Ajuste ou limpe os filtros para ver os documentos." : "A contagem e a lista usam exatamente a mesma origem de dados."}</div>
        ) : (
          <table className="spw-evo-table">
            <thead><tr><th>Código</th><th>Rev.</th><th>Classe</th><th>Tipo</th><th>Status</th><th>Disciplina</th><th>TAG</th><th>EAP</th><th>Data</th><th>Origem</th></tr></thead>
            <tbody>
              {pageData.visible.map((row, index) => (
                <tr
                  key={`${row.occurrenceKey || row.document}:${row.technicalFingerprint || index}`}
                  data-evo-row={pageData.start + index}
                  data-analysis-id={`evolution:${row.occurrenceKey || row.document}:${row.technicalFingerprint || ""}`}
                  aria-label={`Abrir detalhes de ${row.document || "registro"} · revisão ${row.revision || "—"}`}
                  tabIndex={0}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    adapter.openDetail(row);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      adapter.openDetail(row);
                    }
                  }}
                >
                  <td><strong>{row.document || "—"}</strong></td><td>{row.revision || "—"}</td><td>{row.documentClass || "—"}</td><td>{row.documentType || "—"}</td><td><span className="spw-evo-cell-badge">{row.status || "—"}</span></td><td>{row.discipline || "—"}</td><td>{row.tag || "—"}</td><td>{row.eap || "—"}</td><td>{row.date || "—"}</td><td><span className="spw-evo-cell-badge">{(row.system || "").toUpperCase() || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="spw-evo-pager" id="spw-evo-pager">
        {hasValidatedLd && state.filteredRows.length ? (
          <>
            <button className="secondary-button compact" type="button" data-evo-page="prev" disabled={state.page <= 1} onClick={() => adapter.setPage(state.page - 1)}>Anterior</button>
            <span>{fmt(pageData.start + 1)}–{fmt(Math.min(pageData.start + EVOLUTION_PAGE_SIZE, state.filteredRows.length))} de {fmt(state.filteredRows.length)} · Página {fmt(state.page)} de {fmt(pageData.pages)}</span>
            <button className="secondary-button compact" type="button" data-evo-page="next" disabled={state.page >= pageData.pages} onClick={() => adapter.setPage(state.page + 1)}>Próxima</button>
          </>
        ) : null}
      </div>

      <span className={`spw-evo-export-feedback ${state.exportMessageKind}`} role="status" aria-live="polite">{state.exportMessage}</span>

      <DetailDrawer
        row={state.detailRow}
        listMode={state.listMode}
        onClose={() => adapter.closeDetail()}
        selected={(system, role) => adapter.selectedSnapshot(system, role)}
      />
    </section>
  );
}
