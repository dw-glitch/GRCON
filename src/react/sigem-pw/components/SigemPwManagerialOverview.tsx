import { useEffect, useMemo, useState } from "react";
import type { SigemPwState } from "../types/domain";
import { SigemPwKpiCharts } from "./SigemPwKpiCharts";
import { filterPwOperations, PW_ACTIONS, PW_INDICATORS, reconcilePwOperations, sigemStatusText, type PwFilters, type PwIndicator } from "../services/sigemPwOperations";

const PAGE_SIZE = 25;
const fmt = (value: number) => value.toLocaleString("pt-BR");
const REVISION_SCOPE_EVENT = "grcon:sigem-pw-revision-scope-changed";
const globalRevisionScope = (): "all" | "revision0" =>
  typeof document !== "undefined" && document.documentElement.dataset.sigemPwRevisionScope === "revision0" ? "revision0" : "all";
/** Revisão 0 / Todas as revisões é uma escolha única do módulo: a Evolução e os demais painéis escutam este evento. */
function broadcastRevisionScope(scope: "all" | "revision0") {
  if (typeof document === "undefined" || globalRevisionScope() === scope) return;
  document.documentElement.dataset.sigemPwRevisionScope = scope;
  window.dispatchEvent(new CustomEvent(REVISION_SCOPE_EVENT, { detail: { scope } }));
}
export function SigemPwManagerialOverview({ state, onExport }: { state: SigemPwState; onExport(filters: PwFilters): void }) {
  const [filters, setFilters] = useState<PwFilters>(() => ({ revisionScope: globalRevisionScope(), indicator: "all" }));
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState("");
  const base = useMemo(() => reconcilePwOperations(state), [state.ld, state.pw, state.sigem, state.model, state.analysisError]);
  const report = useMemo(() => filterPwOperations(base, filters), [base, filters]);
  useEffect(() => {
    const onScope = (event: Event) => {
      const scope = (event as CustomEvent<{ scope?: string }>).detail?.scope === "revision0" ? "revision0" : "all";
      setFilters(current => current.revisionScope === scope ? current : { ...current, revisionScope: scope, revision: "" });
      setPage(1);
    };
    window.addEventListener(REVISION_SCOPE_EVENT, onScope);
    return () => window.removeEventListener(REVISION_SCOPE_EVENT, onScope);
  }, []);
  // Abas por revisão: contagem de cada revisão dentro dos demais filtros (sem o próprio filtro de revisão).
  const revisionTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of filterPwOperations(base, { ...filters, revision: "" }).rows) counts.set(row.revision, (counts.get(row.revision) || 0) + 1);
    // A aba escolhida nunca some, mesmo que os demais filtros a deixem sem linhas: é por ela que se volta para "Todas".
    if (filters.revision && !counts.has(filters.revision)) counts.set(filters.revision, 0);
    const keys = [...counts.keys()].sort((a, b) => (a === "0" ? -1 : b === "0" ? 1 : a.localeCompare(b, "pt-BR", { numeric: true })));
    return { total: [...counts.values()].reduce((sum, value) => sum + value, 0), items: keys.map(key => ({ key, count: counts.get(key) || 0 })) };
  }, [base, filters]);
  const change = (value: Partial<PwFilters>) => {
    // Trocar o escopo (todas / só revisão 0) volta para "todas as abas": a revisão escolhida pode nem existir no novo escopo.
    if (value.revisionScope !== undefined && value.revision === undefined) value = { ...value, revision: "" };
    setFilters(current => ({ ...current, ...value })); setPage(1);
    if (value.revisionScope) broadcastRevisionScope(value.revisionScope);
  };
  const pages = Math.max(1, Math.ceil(report.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = report.rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = report.rows.find(row => row.key === selectedKey);
  const r = base.reconciliation;
  return <section className="spw-managerial spw-pw-operations" id="spw-managerial-overview" aria-label="Demanda da equipe PW">
    {!base.ready ? <div className="spw-empty spw-managerial-warning" role="status"><strong>Comparação incompleta</strong><span>{base.reason} Os indicadores ficam indisponíveis até a conclusão.</span></div> : null}
    <p className="spw-operation-unit"><strong>Como ler os números:</strong> cada revisão de cada documento conta uma vez. Exemplo: o documento X nas revisões 0 e A são <strong>2 revisões de documentos</strong>. Os indicadores, o gráfico, a lista e o Excel usam sempre o mesmo escopo e os mesmos filtros.</p>
    <p className="spw-operation-unit"><strong>Regra do PW:</strong> só a <strong>revisão 0 é cadastro</strong>; da revisão A em diante cada revisão é uma <strong>emissão</strong>. As emissões saem em sequência: se o SIGEM está na revisão B, o PW precisa emitir a 0, a A e depois a B.</p>
    <details className="spw-advanced-area spw-glossary"><summary>Entenda os números</summary>
      <dl>
        <div><dt>Revisão de documento</dt><dd>Uma revisão específica de um documento das LDs (exemplo: o documento X, revisão A).</dd></div>
        <div><dt>Constam no SIGEM</dt><dd>Revisões que aparecem na Consulta Geral do SIGEM.</dd></div>
        <div><dt>A cadastrar no PW — já constam no SIGEM</dt><dd>Revisão 0 que já aparece no SIGEM e ainda não foi cadastrada no PW.</dd></div>
        <div><dt>A cadastrar no PW — não constam no SIGEM</dt><dd>Revisão 0 exigida pelas LDs, que não aparece na Consulta Geral e não foi cadastrada no PW. Não constar na consulta não prova que falta postar.</dd></div>
        <div><dt>Cadastradas no PW</dt><dd>Revisões 0 com cadastro comprovado no PW (empresas CSG/QTM). Só a revisão 0 é cadastro; ela pode estar a emitir ou já emitida.</dd></div>
        <div><dt>A emitir no PW</dt><dd>Revisão 0 já cadastrada, ou revisão A em diante, com emissão pendente. Se o SIGEM está em B, entram a 0, a A e a B.</dd></div>
        <div><dt>Emitidas no PW</dt><dd>Emissão comprovada no PW. Na lista aparecem como “Concluído” e não recebem X.</dd></div>
        <div><dt>X na lista</dt><dd>Marca a revisão que ainda precisa de trabalho da equipe PW (cadastrar a revisão 0 ou emitir uma revisão).</dd></div>
      </dl>
    </details>
    {base.ready ? <SigemPwKpiCharts totals={report.totals} pairs={report.rows.length} reconciliation={base.reconciliation}
      selection={filters.indicator || "all"} onSelect={(key) => change({ indicator: filters.indicator === key ? "all" : key })}
      revisionScope={filters.revisionScope || "all"} onRevisionScopeChange={(value) => change({ revisionScope: value })} /> : null}
    <div className="spw-operation-kpis" aria-label="Indicadores da equipe PW">
      {PW_INDICATORS.map(item => <button key={item.key} type="button" disabled={!base.ready} className="spw-operation-kpi" data-indicator={item.key}
        aria-pressed={filters.indicator === item.key} onClick={() => change({ indicator: filters.indicator === item.key ? "all" : item.key })}>
        <span>{item.label}</span><strong>{base.ready ? fmt(report.totals[item.key]) : "—"}</strong>
        <small>{({ sigem: "Revisões que aparecem na Consulta Geral", registerSigem: "Revisão 0 já no SIGEM, sem cadastro no PW", registerAbsent: "Revisão 0 exigida pelas LDs, fora da Consulta Geral, sem cadastro no PW", registered: "Só a revisão 0 é cadastro", issue: "Revisão 0 cadastrada ou revisão A em diante, falta emitir", issued: "Emissão comprovada no PW" } as Record<string, string>)[item.key]}</small>
      </button>)}
    </div>
    <div className="spw-managerial-toolbar">
      <label><span>Localizar documento</span><input type="search" placeholder="Código, título ou fonte" value={filters.query || ""} onChange={event => change({ query: event.target.value })} /></label>
      <label><span>Classe</span><select value={filters.documentClass || ""} onChange={event => change({ documentClass: event.target.value })}><option value="">Todas as classes</option>{base.byClass.map(row => <option key={row.documentClass}>{row.documentClass}</option>)}</select></label>
      <label><span>Ação</span><select value={filters.action || ""} onChange={event => change({ action: event.target.value })}><option value="">Todas as ações</option>{PW_ACTIONS.map(action => <option key={action}>{action}</option>)}</select></label>
      <label><span>Situação SIGEM</span><select value={filters.sigem || ""} onChange={event => change({ sigem: event.target.value })}><option value="">Todas</option><option>Consta no SIGEM</option><option>Não consta na Consulta Geral</option></select></label>
      <label><span>Revisões</span><select value={filters.revisionScope || "all"} onChange={event => change({ revisionScope: event.target.value as "all" | "revision0" })}><option value="all">Todas as revisões</option><option value="revision0">Somente revisão 0</option></select></label>
      <label><span>Mostrar apenas</span><select value={filters.indicator || "all"} onChange={event => change({ indicator: event.target.value as PwIndicator })}><option value="all">Todos</option>{PW_INDICATORS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <button type="button" className="secondary-button" onClick={() => { setFilters({ revisionScope: "all", indicator: "all", revision: "" }); setPage(1); broadcastRevisionScope("all"); }}>Limpar filtros</button>
    </div>
    {base.ready && (revisionTabs.items.length > 1 || filters.revision) ? <div className="spw-revision-tabs" role="group" aria-label="Revisão de documento">
      <span>Revisão</span>
      <button type="button" data-revision-tab="" aria-pressed={!filters.revision} onClick={() => change({ revision: "" })}>Todas <b>{fmt(revisionTabs.total)}</b></button>
      {revisionTabs.items.map(item => <button type="button" key={item.key} data-revision-tab={item.key} aria-pressed={filters.revision === item.key}
        onClick={() => change({ revision: filters.revision === item.key ? "" : item.key })}>Revisão {item.key} <b>{fmt(item.count)}</b></button>)}
    </div> : null}
    <div className="spw-managerial-list-heading"><div><h3>Relação de trabalho do PW</h3><p>Uma linha por revisão de documento. “Não constam no SIGEM” significa que a revisão não aparece na Consulta Geral; isso não comprova que falta postar.</p></div>
      <button type="button" className="primary-button" disabled={state.busy || !base.ready || !report.rows.length} onClick={() => onExport(filters)}>Exportar este escopo</button>
    </div>
    <span className="spw-managerial-count">{base.ready ? fmt(report.rows.length) : "—"} revisões de documentos no escopo · {base.ready ? fmt(new Set(report.rows.map(row => row.documentKey)).size) : "—"} documentos únicos</span>
    <div className="spw-managerial-table-wrap" tabIndex={0} aria-label="Relação operacional do PW"><table>
      <caption>Revisão 0 = cadastro; revisão A em diante = emissão, em sequência. X identifica uma revisão pendente; linhas concluídas ficam sem X.</caption>
      <thead><tr><th scope="col">Documento</th><th scope="col">Título</th><th scope="col">Classe</th><th scope="col">Revisão</th><th scope="col">Situação SIGEM</th><th scope="col" title="Status do código na Consulta Geral do SIGEM">Status SIGEM</th><th scope="col">Ação</th><th scope="col" title="X = revisão que ainda precisa de trabalho da equipe PW">Falta fazer (X)</th></tr></thead>
      <tbody>{visible.map(row => <tr key={row.key}><td className="spw-managerial-code"><button type="button" className="text-button" onClick={() => setSelectedKey(selectedKey === row.key ? "" : row.key)} aria-label={`Examinar evidências ${row.code} revisão ${row.revision}`}>{row.code}</button></td>
        <td className="spw-managerial-title" title={row.title}>{row.title || "Título não informado"}</td><td>{row.documentClass}</td><td>{row.revision}</td><td>{row.sigemSituation}</td><td className="spw-sigem-status">{sigemStatusText(row)}</td>
        <td><span className="spw-operation-action" data-action={row.action}>{row.action}</span>{row.missingBefore.length ? <span className="spw-operation-sequence" data-out-of-sequence="true" title={`Esta revisão foi emitida, mas faltam emitir antes: ${row.missingBefore.join(", ")}`}>Fora de sequência: falta {row.missingBefore.join(", ")}</span> : null}</td><td>{row.pwEmitted ? "" : "X"}</td></tr>)}</tbody>
    </table></div>
    {!visible.length ? <div className="spw-empty" role="status"><strong>{base.ready ? "Nenhum documento para estes filtros" : "Aguardando bases válidas"}</strong><span>{base.ready ? "Limpe os filtros ou consulte as exceções na conciliação." : base.reason}</span></div> : null}
    <nav className="spw-managerial-pagination" aria-label="Paginação da relação PW"><span>Página {fmt(currentPage)} de {fmt(pages)}</span><button type="button" className="secondary-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><button type="button" className="secondary-button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Próxima</button></nav>
    {selected ? <aside className="spw-managerial-evidence" aria-label="Evidências do documento"><div className="spw-managerial-evidence-head"><h4>{selected.code} · Rev. {selected.revision}</h4><button type="button" className="secondary-button" onClick={() => setSelectedKey("")}>Fechar detalhes</button></div>
      <dl><div><dt>Fontes</dt><dd>{selected.sources.join(", ")}</dd></div><div><dt>Consulta Geral</dt><dd>{selected.sigemStatus || selected.sigemSituation}</dd></div><div><dt>PW</dt><dd>{selected.pwEvidence ? `${selected.pwEvidence.state || "Cadastrado"} · Revisão ${selected.pwEvidence.revisionComplete || selected.pwEvidence.revision || "não informada"} · Linha ${selected.pwEvidence.sourceRow || "não informada"}` : "Sem cadastro da revisão requerida nas empresas CSG/QTM"}</dd></div></dl>
    </aside> : null}
    {base.ready ? <details className="spw-advanced-area"><summary>Pendências por classe</summary><div className="spw-managerial-table-wrap"><table><thead><tr><th>Classe</th><th>A cadastrar — já constam no SIGEM</th><th>A cadastrar — não constam no SIGEM</th><th>A emitir no PW</th></tr></thead><tbody>{report.byClass.map(row => <tr key={row.documentClass}><th>{row.documentClass}</th><td>{fmt(row.registerSigem)}</td><td>{fmt(row.registerAbsent)}</td><td>{fmt(row.issue)}</td></tr>)}</tbody><tfoot><tr><th>TOTAL</th><td>{fmt(report.totals.registerSigem)}</td><td>{fmt(report.totals.registerAbsent)}</td><td>{fmt(report.totals.issue)}</td></tr></tfoot></table></div></details> : null}
    <details className="spw-advanced-area"><summary>Conciliação da Consulta Geral integral e exceções</summary><p>Esta conferência considera a Consulta Geral integral, antes dos filtros operacionais. CV, cancelados e inconsistências não entram nas pendências PW.</p>
      <dl className="spw-operation-reconciliation"><div><dt>Registros disponíveis</dt><dd>{fmt(r.records)}</dd></div><div><dt>Documentos únicos</dt><dd>{fmt(r.documents)}</dd></div><div><dt>Revisões de documentos únicas e válidas</dt><dd>{fmt(r.pairs)}</dd></div><div><dt>Revisões que constam nas LDs</dt><dd>{fmt(r.inScopePairs)}</dd></div><div><dt>Revisões que não constam nas LDs</dt><dd>{fmt(r.outsidePairs)}</dd></div><div><dt>Repetições adicionais</dt><dd>{fmt(r.duplicates)}</dd></div><div><dt>Sem código ou revisão</dt><dd>{fmt(r.invalid)}</dd></div></dl>
      {r.omitted === null ? <p>O importador não informou a quantidade de linhas omitidas da fonte.</p> : r.omitted > 0 ? <p role="status">{fmt(r.omitted)} linha(s) da fonte não foram disponibilizadas pelo importador.</p> : null}
      <p>{fmt(base.diagnostics.length)} ocorrência(s) de diagnóstico · {fmt(base.outside.length)} registro(s) fora das LDs. A exportação inclui a conciliação completa.</p>
      <div className="spw-managerial-table-wrap"><table><thead><tr><th>Origem</th><th>Documento</th><th>Revisão</th><th>Motivo</th></tr></thead><tbody>{[...base.diagnostics, ...base.outside].slice(0, 50).map((row, index) => <tr key={index}><td>{row.source}</td><td>{row.code}</td><td>{row.revision}</td><td>{row.reason}</td></tr>)}</tbody></table></div>
    </details>
  </section>;
}
