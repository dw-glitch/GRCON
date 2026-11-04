import { useMemo, useState } from "react";
import type { SigemPwState } from "../types/domain";
import { SigemPwKpiCharts } from "./SigemPwKpiCharts";
import { filterPwOperations, PW_ACTIONS, PW_INDICATORS, reconcilePwOperations, type PwFilters, type PwIndicator } from "../services/sigemPwOperations";

const PAGE_SIZE = 25;
const fmt = (value: number) => value.toLocaleString("pt-BR");
export function SigemPwManagerialOverview({ state, onExport }: { state: SigemPwState; onExport(filters: PwFilters): void }) {
  const [filters, setFilters] = useState<PwFilters>({ revisionScope: "all", indicator: "all" });
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState("");
  const base = useMemo(() => reconcilePwOperations(state), [state.ld, state.pw, state.sigem, state.model, state.analysisError]);
  const report = useMemo(() => filterPwOperations(base, filters), [base, filters]);
  const change = (value: Partial<PwFilters>) => { setFilters(current => ({ ...current, ...value })); setPage(1); };
  const pages = Math.max(1, Math.ceil(report.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = report.rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = report.rows.find(row => row.key === selectedKey);
  const r = base.reconciliation;
  return <section className="spw-managerial spw-pw-operations" id="spw-managerial-overview" aria-label="Demanda da equipe PW">
    {!base.ready ? <div className="spw-empty spw-managerial-warning" role="status"><strong>Comparação incompleta</strong><span>{base.reason} Os indicadores ficam indisponíveis até a conclusão.</span></div> : null}
    <p className="spw-operation-unit"><strong>Como ler os números:</strong> cada revisão de cada documento conta uma vez. Exemplo: o documento X nas revisões 0 e A são <strong>2 revisões de documentos</strong>. Os indicadores, o gráfico, a lista e o Excel usam sempre o mesmo escopo e os mesmos filtros.</p>
    <details className="spw-advanced-area spw-glossary"><summary>Entenda os números</summary>
      <dl>
        <div><dt>Revisão de documento</dt><dd>Uma revisão específica de um documento das LDs (exemplo: o documento X, revisão A).</dd></div>
        <div><dt>Constam no SIGEM</dt><dd>Revisões que aparecem na Consulta Geral do SIGEM.</dd></div>
        <div><dt>A cadastrar no PW — já constam no SIGEM</dt><dd>Já aparecem no SIGEM e ainda não foram cadastradas no PW.</dd></div>
        <div><dt>A cadastrar no PW — não constam no SIGEM</dt><dd>Exigidas pelas LDs, não aparecem na Consulta Geral e não foram cadastradas no PW. Não constar na consulta não prova que falta postar.</dd></div>
        <div><dt>Cadastradas no PW</dt><dd>Revisões com cadastro comprovado no PW (empresas CSG/QTM): as que aguardam emissão mais as já emitidas.</dd></div>
        <div><dt>A emitir no PW</dt><dd>Já cadastradas no PW; falta emitir.</dd></div>
        <div><dt>Emitidas no PW</dt><dd>Emissão comprovada no PW. Na lista aparecem como “Concluído” e não recebem X.</dd></div>
        <div><dt>X na lista</dt><dd>Marca a revisão que ainda precisa de trabalho da equipe PW (cadastrar ou emitir).</dd></div>
      </dl>
    </details>
    {base.ready ? <SigemPwKpiCharts totals={report.totals} pairs={report.rows.length} reconciliation={base.reconciliation}
      selection={filters.indicator || "all"} onSelect={(key) => change({ indicator: filters.indicator === key ? "all" : key })}
      revisionScope={filters.revisionScope || "all"} onRevisionScopeChange={(value) => change({ revisionScope: value })} /> : null}
    <div className="spw-operation-kpis" aria-label="Indicadores da equipe PW">
      {PW_INDICATORS.map(item => <button key={item.key} type="button" disabled={!base.ready} className="spw-operation-kpi" data-indicator={item.key}
        aria-pressed={filters.indicator === item.key} onClick={() => change({ indicator: filters.indicator === item.key ? "all" : item.key })}>
        <span>{item.label}</span><strong>{base.ready ? fmt(report.totals[item.key]) : "—"}</strong>
        <small>{({ sigem: "Revisões que aparecem na Consulta Geral", registerSigem: "Já no SIGEM, ainda sem cadastro no PW", registerAbsent: "Exigidas pelas LDs, fora da Consulta Geral, sem cadastro no PW", registered: "A emitir + emitidas", issue: "Cadastradas no PW, falta emitir", issued: "Emissão comprovada no PW" } as Record<string, string>)[item.key]}</small>
      </button>)}
    </div>
    <div className="spw-managerial-toolbar">
      <label><span>Localizar documento</span><input type="search" placeholder="Código, título ou fonte" value={filters.query || ""} onChange={event => change({ query: event.target.value })} /></label>
      <label><span>Classe</span><select value={filters.documentClass || ""} onChange={event => change({ documentClass: event.target.value })}><option value="">Todas as classes</option>{base.byClass.map(row => <option key={row.documentClass}>{row.documentClass}</option>)}</select></label>
      <label><span>Ação</span><select value={filters.action || ""} onChange={event => change({ action: event.target.value })}><option value="">Todas as ações</option>{PW_ACTIONS.map(action => <option key={action}>{action}</option>)}</select></label>
      <label><span>Situação SIGEM</span><select value={filters.sigem || ""} onChange={event => change({ sigem: event.target.value })}><option value="">Todas</option><option>Consta no SIGEM</option><option>Não consta na Consulta Geral</option></select></label>
      <label><span>Revisões</span><select value={filters.revisionScope || "all"} onChange={event => change({ revisionScope: event.target.value as "all" | "revision0" })}><option value="all">Todas as revisões</option><option value="revision0">Somente revisão 0</option></select></label>
      <label><span>Mostrar apenas</span><select value={filters.indicator || "all"} onChange={event => change({ indicator: event.target.value as PwIndicator })}><option value="all">Todos</option>{PW_INDICATORS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <button type="button" className="secondary-button" onClick={() => { setFilters({ revisionScope: "all", indicator: "all" }); setPage(1); }}>Limpar filtros</button>
    </div>
    <div className="spw-managerial-list-heading"><div><h3>Relação de trabalho do PW</h3><p>Uma linha por revisão de documento. “Não constam no SIGEM” significa que a revisão não aparece na Consulta Geral; isso não comprova que falta postar.</p></div>
      <button type="button" className="primary-button" disabled={state.busy || !base.ready || !report.rows.length} onClick={() => onExport(filters)}>Exportar este escopo</button>
    </div>
    <span className="spw-managerial-count">{base.ready ? fmt(report.rows.length) : "—"} revisões de documentos no escopo · {base.ready ? fmt(new Set(report.rows.map(row => row.documentKey)).size) : "—"} documentos únicos</span>
    <div className="spw-managerial-table-wrap" tabIndex={0} aria-label="Relação operacional do PW"><table>
      <caption>Cadastro e emissão por revisão. X identifica uma revisão pendente; linhas concluídas ficam sem X.</caption>
      <thead><tr><th scope="col">Documento</th><th scope="col">Título</th><th scope="col">Classe</th><th scope="col">Revisão</th><th scope="col">Situação SIGEM</th><th scope="col">Ação</th><th scope="col" title="X = revisão que ainda precisa de trabalho da equipe PW">Falta fazer (X)</th></tr></thead>
      <tbody>{visible.map(row => <tr key={row.key}><td className="spw-managerial-code"><button type="button" className="text-button" onClick={() => setSelectedKey(selectedKey === row.key ? "" : row.key)} aria-label={`Examinar evidências ${row.code} revisão ${row.revision}`}>{row.code}</button></td>
        <td className="spw-managerial-title" title={row.title}>{row.title || "Título não informado"}</td><td>{row.documentClass}</td><td>{row.revision}</td><td>{row.sigemSituation}</td>
        <td><span className="spw-operation-action" data-action={row.action}>{row.action}</span></td><td>{row.pwEmitted ? "" : "X"}</td></tr>)}</tbody>
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
