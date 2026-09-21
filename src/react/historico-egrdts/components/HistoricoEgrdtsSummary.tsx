import type { HistorySummary } from "../types/domain";

export function HistoricoEgrdtsSummary({ summary }: { summary: HistorySummary }) {
  return (
    <section aria-label="Resumo do histórico" className="history-summary" id="history-summary">
      <div><span>eGRDTs localizadas</span><strong>{summary.egrdts.toLocaleString("pt-BR")}</strong></div>
      <div><span>Documentos registrados</span><strong>{summary.documents.toLocaleString("pt-BR")}</strong></div>
      <div><span>Alocações relacionadas</span><strong>{summary.allocations.toLocaleString("pt-BR")}</strong></div>
      <div><span>Aguardando SIGEM</span><strong>{summary.awaiting.toLocaleString("pt-BR")}</strong></div>
      <div><span>Postadas</span><strong>{summary.posted.toLocaleString("pt-BR")}</strong></div>
      <div><span>Pendências/Falhas</span><strong>{summary.attention.toLocaleString("pt-BR")}</strong></div>
    </section>
  );
}
