import { useMemo, useState } from "react";
import type { SigemPwState } from "../types/domain";
import { reconcileManagerial, type ManagerialDocument } from "../services/sigemPwManagerial";

function fmt(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("pt-BR");
}

export function SigemPwManagerialOverview({ state }: { state: SigemPwState }) {
  const [filter, setFilter] = useState("Com pendência");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCode, setSelectedCode] = useState("");
  const report = useMemo(() => reconcileManagerial(state), [state.ld, state.pw, state.sigem, state.model, state.result]);
  const cards = [
    { label: "Documentos ativos", value: report.summary.active, tip: "Códigos únicos vigentes nas referências documentais." },
    { label: "Cadastrados no PW", value: report.summary.registered, tip: "Código localizado no ProjectWise das empresas CSG e QTM, inclusive Previsto." },
    { label: "Emitidos no PW", value: report.summary.emitted, tip: "Código com evidência de emissão atual (Última emissão: Sim)." },
    { label: "Postados no SIGEM", value: report.summary.posted, tip: "Documento com situação de postagem reconhecida na Consulta Geral." },
    { label: "Em conformidade", value: report.summary.compliant, tip: "Emissão e postagem correspondentes à revisão de referência, sem recusa comprovada." },
    { label: "Com pendências", value: report.summary.pending, tip: "Documentos com providência documental necessária, sem contar itens em preparação." },
  ];
  const filtered = report.rows.filter(row => row.situation === filter && (!query || row.code.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * 25, Math.min(page, pageCount) * 25);
  const selected = report.rows.find(row => row.code === selectedCode);
  return <section aria-label="Indicadores de controle documental" className="spw-managerial">
    <div className="spw-section-heading"><div>
      <span className="spw-kicker">CONTROLE GERENCIAL</span>
      <h3>Painel de Controle Documental</h3>
      <p>Indicadores por documento único. Cadastro, emissão e postagem são evidências distintas.</p>
    </div></div>
    {!report.ready ? <div className="spw-empty" role="status">
      <strong>Conciliação gerencial incompleta</strong><span>{report.reason} Valores desconhecidos são exibidos como “—”, nunca como zero.</span>
    </div> : null}
    <div className="spw-managerial-grid">
      {cards.map((card, index) => <div className="spw-managerial-card" key={card.label}
        title={card.tip} aria-label={`${card.label}: ${fmt(card.value)}. ${card.tip}`}>
        <span>{card.label}</span>
        <strong>{fmt(card.value)}</strong>
        <small>{card.tip}</small>
        {report.ready && index > 0 && index < 4 && report.summary.active > 0
          ? <small>{Math.round((Number(card.value) / report.summary.active) * 100)}% dos documentos ativos</small> : null}
      </div>)}
    </div>
    <details className="spw-managerial-details">
      <summary>Providências e situações documentais</summary>
      <div className="spw-managerial-filter">
        <label htmlFor="spw-managerial-status">Situação</label>
        <select id="spw-managerial-status" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
          {["Com pendência","Em andamento","Em preparação","Em conformidade","Dados insuficientes","Cancelado"].map(value =>
            <option key={value} value={value}>{value}</option>)}
        </select>
        <label htmlFor="spw-managerial-search">Documento</label>
        <input id="spw-managerial-search" type="search" placeholder="Buscar código" value={query} onChange={event => {setQuery(event.target.value);setPage(1);}} />
      </div>
      <div className="spw-managerial-table-wrap"><table>
        <thead><tr><th>Documento</th><th>Rev. ref.</th><th>Rev. PW</th><th>SIGEM</th><th>Ação recomendada</th></tr></thead>
        <tbody>{visible.map((row: ManagerialDocument) => <tr key={row.code}>
          <td><button type="button" className="text-button" onClick={() => setSelectedCode(row.code)}>{row.code}</button></td>
          <td>{row.referenceRevision || "—"}</td><td>{row.pwRevision || "—"}</td>
          <td>{row.sigemStatus || "—"}</td><td>{row.action}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="spw-managerial-filter"><span>{fmt(filtered.length)} documentos nessa situação</span>
        <button type="button" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Anterior</button>
        <span>Página {Math.min(page, pageCount)} de {pageCount}</span>
        <button type="button" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Próxima</button>
      </div>
      {selected ? <aside aria-live="polite"><strong>{selected.code}</strong>
        <p>{selected.title || "Título não informado"} · Referência: {selected.referenceRevision || "—"} · PW: {selected.pwRevision || "—"} · SIGEM: {selected.sigemRevision || "—"}</p>
        <p>Fontes: {selected.sources.join(", ") || "Não identificadas"} · Ação: {selected.action}</p>
        {selected.conflict ? <p role="alert">Conflito entre referências: não declarar conformidade sem conciliação de origem.</p> : null}
        <button type="button" onClick={() => setSelectedCode("")}>Fechar detalhes</button>
      </aside> : null}
    </details>
    {report.summary.conflicts > 0 ? <p role="alert">{fmt(report.summary.conflicts)} documento(s) com conflitos entre referências exigem verificação.</p> : null}
  </section>;
}
