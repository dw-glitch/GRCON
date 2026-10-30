import { useEffect, useMemo, useRef, useState } from "react";
import type { SigemPwState } from "../types/domain";
import { reconcileManagerial, type ManagerialDocument } from "../services/sigemPwManagerial";

type KpiKey = "active" | "registered" | "emitted" | "posted" | "compliant" | "pending";
type Selection = KpiKey | "all";
const PAGE_SIZE = 25;

function fmt(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("pt-BR");
}
function eligible(row: ManagerialDocument): boolean {
  return row.situation !== "Cancelado";
}
function matchesKpi(row: ManagerialDocument, key: Selection): boolean {
  if (key === "all") return true;
  if (!eligible(row)) return false;
  switch (key) {
    case "active": return true;
    case "registered": return row.pwRegistered;
    case "emitted": return row.pwEmitted;
    case "posted": return row.sigemPosted;
    case "compliant": return row.situation === "Em conformidade";
    case "pending": return row.situation === "Com pendência" || row.situation === "Em andamento";
  }
}
function priority(row: ManagerialDocument): number {
  if (row.situation === "Com pendência") return 0;
  if (row.situation === "Em andamento") return 1;
  if (row.situation === "Dados insuficientes") return 2;
  if (row.situation === "Em preparação") return 3;
  if (row.situation === "Em conformidade") return 4;
  return 5;
}

export function SigemPwManagerialOverview({ state }: { state: SigemPwState }) {
  const [selection, setSelection] = useState<Selection>("all");
  const [situation, setSituation] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCode, setSelectedCode] = useState("");
  const evidenceRef = useRef<HTMLElement>(null);
  useEffect(() => { if (selectedCode) evidenceRef.current?.scrollIntoView({ block: "nearest" }); }, [selectedCode]);
  const report = useMemo(() => reconcileManagerial(state), [state.ld, state.pw, state.sigem, state.model, state.result]);
  const kpis: { key: KpiKey; label: string; value: number | null; tip: string }[] = [
    { key: "active", label: "Documentos ativos", value: report.summary.active, tip: "Documentos únicos vigentes nas referências." },
    { key: "registered", label: "Cadastrados no PW", value: report.summary.registered, tip: "Inclui cadastrados como Previsto; empresas CSG e QTM." },
    { key: "emitted", label: "Emitidos no PW", value: report.summary.emitted, tip: "Documentos com evidência de emissão no ProjectWise." },
    { key: "posted", label: "Postados no SIGEM", value: report.summary.posted, tip: "Registros localizados na Consulta Geral; não significa aprovação." },
    { key: "compliant", label: "Em conformidade", value: report.summary.compliant, tip: "Revisões alinhadas, avaliação favorável e sem ressalvas." },
    { key: "pending", label: "Com pendências", value: report.summary.pending, tip: "Requerem ação ou aguardam conclusão do processo." },
  ];
  const filtered = useMemo(() => report.rows.filter(row => {
    if (!matchesKpi(row, selection)) return false;
    if (situation && row.situation !== situation) return false;
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return !needle || [row.code, row.title, row.action, row.referenceRevision].some(value =>
      value.toLocaleLowerCase("pt-BR").includes(needle));
  }).sort((a, b) => priority(a) - priority(b) || a.code.localeCompare(b.code, "pt-BR")),
  [report.rows, selection, situation, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = report.rows.find(row => row.code === selectedCode);
  const setKpi = (key: Selection) => { setSelection(key); setSituation(""); setPage(1); };
  const clearFilters = () => { setSelection("all"); setSituation(""); setQuery(""); setPage(1); };

  return (
    <section aria-label="Controle documental gerencial" className="spw-managerial" id="spw-managerial-overview">
      {!report.ready ? (
        <div className="spw-empty spw-managerial-warning" role="status">
          <strong>Conciliação incompleta</strong>
          <span>{report.reason} Um dado ausente aparece como “—”, nunca como zero confirmado.</span>
        </div>
      ) : null}
      <div className="spw-managerial-grid" role="group" aria-label="Indicadores gerenciais — clique para filtrar documentos">
        {kpis.map(card => (
          <button
            type="button"
            key={card.key}
            className="spw-managerial-card"
            data-kpi={card.key}
            aria-pressed={selection === card.key}
            aria-label={card.label + ": " + fmt(card.value) + ". " + card.tip}
            title={card.tip}
            disabled={card.value === null}
            onClick={() => setKpi(card.key)}
          >
            <span>{card.label}</span>
            <strong>{fmt(card.value)}</strong>
            <small>{card.tip}</small>
          </button>
        ))}
      </div>

      <div className="spw-managerial-workspace" aria-labelledby="spw-managerial-list-title">
        <div className="spw-managerial-list-heading">
          <div>
            <span className="spw-kicker">CONCILIAÇÃO DOCUMENTAL</span>
            <h3 id="spw-managerial-list-title">Relação de documentos e providências</h3>
            <p>Uma linha por documento. Consulte o código para examinar revisões, fontes e evidências.</p>
          </div>
          <span className="spw-managerial-count">{fmt(filtered.length)} de {fmt(report.rows.length)} documento(s)</span>
        </div>
        <div className="spw-managerial-toolbar">
          <label>
            <span>Localizar documento</span>
            <input type="search" aria-label="Buscar código, título, revisão ou ação" placeholder="Código, título ou providência" value={query}
              onChange={event => { setQuery(event.target.value); setPage(1); }} />
          </label>
          <label>
            <span>Indicador</span>
            <select value={selection} onChange={event => setKpi(event.target.value as Selection)}>
              <option value="all">Todos os documentos</option>
              {kpis.map(card => <option key={card.key} value={card.key} disabled={card.value === null}>{card.label}</option>)}
            </select>
          </label>
          <label>
            <span>Situação</span>
            <select value={situation} onChange={event => { setSituation(event.target.value); setPage(1); }}>
              <option value="">Todas as situações</option>
              {["Com pendência", "Em andamento", "Em preparação", "Em conformidade", "Dados insuficientes", "Cancelado"].map(value =>
                <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={clearFilters}>Limpar filtros</button>
        </div>
        <div className="spw-managerial-table-wrap" tabIndex={0} aria-label="Tabela de conciliação documental">
          <table>
            <caption>Documentos conciliados das referências ativas. Cadastro, emissão e postagem são evidências distintas.</caption>
            <thead><tr><th scope="col">Documento</th><th scope="col">Título</th><th scope="col">Rev. ref.</th><th scope="col">PW</th><th scope="col">SIGEM</th><th scope="col">Situação</th><th scope="col">Próxima ação</th></tr></thead>
            <tbody>
              {visible.map(row => (
                <tr key={row.code}>
                  <td className="spw-managerial-code"><button type="button" className="text-button" onClick={() => setSelectedCode(row.code)} aria-label={"Examinar evidências do documento " + row.code}>{row.code}</button></td>
                  <td className="spw-managerial-title" title={row.title}>{row.title || "Título não informado"}</td>
                  <td>{row.referenceRevision || "—"}</td>
                  <td>{row.pwNotApplicable ? "Não aplicável (CV)" : row.pwEmitted ? "Emitido" : row.pwRegistered ? "Cadastrado" : "Não cadastrado"}{row.pwRevision ? <small>Rev. {row.pwRevision}</small> : null}</td>
                  <td>{row.sigemPosted ? "Postado" : "Não localizado"}{row.sigemRevision ? <small>Rev. {row.sigemRevision}</small> : null}</td>
                  <td><span className="spw-managerial-situation" data-situation={row.situation}>{row.situation}</span></td>
                  <td className="spw-managerial-action">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length ? <div className="spw-empty" role="status">
          <strong>{report.rows.length ? "Nenhum documento para estes filtros" : "Nenhum documento disponível"}</strong>
          <span>{report.rows.length ? "Altere os filtros para consultar outras situações." : report.reason || "Carregue as fontes e execute a conciliação."}</span>
        </div> : null}
        <nav className="spw-managerial-pagination" aria-label="Paginação da relação gerencial">
          <span>Página {fmt(currentPage)} de {fmt(pages)}</span>
          <button type="button" className="secondary-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <button type="button" className="secondary-button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Próxima</button>
        </nav>
      </div>
      {selected ? (
        <aside ref={evidenceRef} className="spw-managerial-evidence" role="region" aria-label={"Evidências do documento " + selected.code}>
          <div className="spw-managerial-evidence-head"><div><span className="spw-kicker">RASTREABILIDADE</span><h4>{selected.code}</h4></div>
            <button type="button" className="secondary-button" onClick={() => setSelectedCode("")}>Fechar detalhes</button>
          </div>
          <p>{selected.title || "Título não informado"}</p>
          <dl>
            <div><dt>Referência</dt><dd>Rev. {selected.referenceRevision || "não identificada"} · {selected.referenceStatus || "Situação não informada"}</dd></div>
            <div><dt>ProjectWise</dt><dd>{selected.pwNotApplicable ? "Não aplicável (CV)" : selected.pwState || (selected.pwRegistered ? "Cadastrado" : "Não cadastrado")} · Rev. {selected.pwRevision || "—"}</dd></div>
            <div><dt>Consulta Geral</dt><dd>{selected.sigemStatus || (selected.sigemPosted ? "Status indisponível para a revisão de referência" : "Não localizado")} · Rev. {selected.sigemRevision || "—"}</dd></div>
            <div><dt>Fontes documentais</dt><dd>{selected.sources.filter(Boolean).join(", ") || "Não identificadas"}</dd></div>
            <div><dt>Situação</dt><dd>{selected.situation}</dd></div>
            <div><dt>Providência</dt><dd>{selected.action}</dd></div>
          </dl>
          {selected.conflict ? <p role="alert">Há divergência entre as referências. Não confirmar conformidade antes de reconciliar a origem.</p> : null}
          {selected.sigemReviewOutcome === "remarks" ? <p role="alert">A avaliação contém comentários ou ressalvas; não equivale a conformidade plena.</p> : null}
          {selected.sigemReviewOutcome === "other-revision" ? <p role="status">A situação da Consulta Geral pertence a outra revisão. É necessária evidência da revisão de referência.</p> : null}
        </aside>
      ) : null}
      {report.summary.conflicts > 0 ? <p className="spw-managerial-conflicts" role="alert">{fmt(report.summary.conflicts)} documento(s) com referências divergentes exigem verificação.</p> : null}
    </section>
  );
}
