import { MANAGERIAL_SITUATIONS, type ManagerialBreakdown, type ManagerialSituation } from "../services/sigemPwManagerial";

const nf = (value: number) => value.toLocaleString("pt-BR");
const pct = (value: number | null) => value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const SITUATION_KEY: Record<ManagerialSituation, string> = {
  "Em conformidade": "ok", "Em andamento": "info", "Com pendência": "bad", "Em preparação": "muted", "Dados insuficientes": "warn",
};

/**
 * Onde estão as pendências: cada classe de documento com a divisão por situação
 * e as providências mais frequentes. Clicar em uma classe ou providência filtra
 * a relação abaixo. A cor nunca é o único sinal: toda barra tem legenda e número.
 */
export function SigemPwManagerialBreakdown({ breakdown, sheet, actionCode, onSheet, onAction }: {
  breakdown: ManagerialBreakdown;
  sheet: string;
  actionCode: string;
  onSheet(value: string): void;
  onAction(value: string): void;
}) {
  if (!breakdown.considered) return null;
  const maxAction = Math.max(1, ...breakdown.byAction.map((item) => item.count));
  return (
    <section className="spw-breakdown" aria-labelledby="spw-breakdown-title">
      <header>
        <span className="spw-kicker">ONDE ESTÃO AS PENDÊNCIAS</span>
        <h3 id="spw-breakdown-title">Por classe de documento e por providência</h3>
        <p>{nf(breakdown.considered)} documento(s) considerados{breakdown.cancelled ? `; ${nf(breakdown.cancelled)} cancelado(s) fora da conta` : ""}. Clique para filtrar a relação abaixo.</p>
      </header>
      <div className="spw-breakdown-grid">
        <div className="spw-breakdown-panel">
          <h4>Situação por classe</h4>
          <ul className="spw-breakdown-classes">
            {breakdown.byClass.map((item) => (
              <li key={item.sheet}>
                <button type="button" aria-pressed={sheet === item.sheet} onClick={() => onSheet(sheet === item.sheet ? "" : item.sheet)}
                  aria-label={`${item.sheet}: ${nf(item.total)} documentos, ${pct(item.compliantPercent)} em conformidade`}>
                  <span className="spw-breakdown-name">{item.sheet}</span>
                  <span className="spw-breakdown-stack" aria-hidden="true">
                    {MANAGERIAL_SITUATIONS.filter((key) => item.counts[key] > 0).map((key) => (
                      <i key={key} data-tone={SITUATION_KEY[key]} title={`${key}: ${nf(item.counts[key])}`} style={{ width: `${(100 * item.counts[key]) / item.total}%` }} />
                    ))}
                  </span>
                  <strong>{nf(item.total)}</strong>
                  <em>{pct(item.compliantPercent)} em conformidade</em>
                </button>
              </li>
            ))}
          </ul>
          <ul className="spw-breakdown-legend" aria-label="Legenda das situações">
            {MANAGERIAL_SITUATIONS.map((key) => <li key={key}><i data-tone={SITUATION_KEY[key]} aria-hidden="true" />{key}</li>)}
          </ul>
        </div>
        <div className="spw-breakdown-panel">
          <h4>Providências mais frequentes</h4>
          {breakdown.byAction.length ? (
            <ul className="spw-breakdown-actions">
              {breakdown.byAction.slice(0, 8).map((item) => (
                <li key={item.actionCode}>
                  <button type="button" aria-pressed={actionCode === item.actionCode} onClick={() => onAction(actionCode === item.actionCode ? "" : item.actionCode)}
                    aria-label={`${item.action}: ${nf(item.count)} documentos`}>
                    <span className="spw-breakdown-name">{item.action}</span>
                    <span className="spw-breakdown-track" aria-hidden="true"><i style={{ width: `${(100 * item.count) / maxAction}%` }} /></span>
                    <strong>{nf(item.count)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="spw-breakdown-empty">Nenhuma providência pendente: todos os documentos considerados estão em conformidade.</p>}
        </div>
      </div>
    </section>
  );
}
