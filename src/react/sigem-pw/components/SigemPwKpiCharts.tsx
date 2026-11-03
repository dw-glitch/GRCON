import type { ManagerialSummary } from "../services/sigemPwManagerial";

export type ChartKey = "active" | "registered" | "emitted" | "awaiting" | "notEmitted" | "posted" | "compliant" | "pending" | "other";

interface Props {
  summary: ManagerialSummary;
  selection: string;
  onSelect(key: ChartKey): void;
}

interface Segment { key: ChartKey; label: string; hint: string; value: number; tone: "ok" | "warn" | "bad" | "muted" | "info" }

const nf = (value: number) => value.toLocaleString("pt-BR");
const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";

/** Barra 100 % empilhada: cada trecho é um botão que filtra a relação de documentos. */
function StackedBar({ title, segments, total, selection, onSelect, unit }: {
  title: string; segments: Segment[]; total: number; selection: string; onSelect(key: ChartKey): void; unit: string;
}) {
  return (
    <div className="spw-chart">
      <div className="spw-chart-bar" role="group" aria-label={`${title}: ${segments.map(item => `${item.label} ${nf(item.value)}`).join(", ")}`}>
        {segments.filter(item => item.value > 0).map(item => (
          <button
            type="button" key={item.key} data-kpi={item.key} data-tone={item.tone}
            className="spw-chart-seg" style={{ flexGrow: Math.max(item.value, total * 0.012), flexBasis: 0 }}
            aria-pressed={selection === item.key} disabled={item.value === 0}
            title={`${item.label}: ${nf(item.value)} ${unit} (${pct(item.value, total)}) — ${item.hint}`}
            aria-label={`${item.label}: ${nf(item.value)} ${unit}, ${pct(item.value, total)}. ${item.hint}`}
            onClick={() => onSelect(item.key)}
          >
            <span aria-hidden="true">{item.value / total >= 0.07 ? pct(item.value, total) : ""}</span>
          </button>
        ))}
      </div>
      <ul className="spw-chart-legend">
        {segments.map(item => (
          <li key={item.key} data-tone={item.tone}>
            <button type="button" onClick={() => onSelect(item.key)} disabled={item.value === 0} aria-pressed={selection === item.key}>
              <i aria-hidden="true" />
              <span className="spw-chart-legend-label">{item.label}</span>
              <strong>{nf(item.value)}</strong>
              <em>{pct(item.value, total)}</em>
              <small>{item.hint}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meter({ label, value, total, tone, hint, keyName, selection, onSelect }: {
  label: string; value: number; total: number; tone: Segment["tone"]; hint: string; keyName: ChartKey; selection: string; onSelect(key: ChartKey): void;
}) {
  const width = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <button type="button" className="spw-meter" data-kpi={keyName} data-tone={tone} aria-pressed={selection === keyName}
      aria-label={`${label}: ${nf(value)} de ${nf(total)} (${pct(value, total)}). ${hint}`} title={hint} onClick={() => onSelect(keyName)}>
      <span className="spw-meter-head"><span>{label}</span><strong>{nf(value)}<small> de {nf(total)} · {pct(value, total)}</small></strong></span>
      <span className="spw-meter-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
    </button>
  );
}

/**
 * Painel gráfico da visão gerencial. Responde, em ordem, às perguntas do controle:
 * quantos documentos estão no escopo, em que ponto do PW cada um está e como estão no SIGEM.
 * Cada trecho/legenda filtra a relação de documentos logo abaixo.
 */
export function SigemPwKpiCharts({ summary, selection, onSelect }: Props) {
  const universe = summary.active;
  if (universe === null) return null;
  const pwBase = summary.pwApplicable;
  const emitted = pwBase !== null && summary.awaitingRegistration !== null && summary.registeredNotEmitted !== null
    ? pwBase - summary.awaitingRegistration - summary.registeredNotEmitted : null;
  const pwSegments: Segment[] | null = pwBase !== null && emitted !== null ? [
    { key: "emitted", label: "Emitidos", value: emitted, tone: "ok", hint: "Cadastrados no PW e com evidência de emissão." },
    { key: "notEmitted", label: "Cadastrados, não emitidos", value: summary.registeredNotEmitted || 0, tone: "warn", hint: "Já constam no PW, mas ainda sem emissão." },
    { key: "awaiting", label: "Aguardando cadastro", value: summary.awaitingRegistration || 0, tone: "bad", hint: "Ainda não constam na consulta PW (CSG/QTM)." },
  ] : null;
  const compliant = summary.compliant;
  const pending = summary.pending;
  const sigemSegments: Segment[] | null = compliant !== null && pending !== null ? [
    { key: "compliant", label: "Em conformidade", value: compliant, tone: "ok", hint: "Revisão alinhada, avaliação favorável e sem ressalvas." },
    { key: "pending", label: "Com pendências", value: pending, tone: "warn", hint: "Exigem ação ou aguardam conclusão do processo." },
    { key: "other", label: "Em preparação ou sem dados", value: Math.max(0, universe - compliant - pending), tone: "muted", hint: "Documentos ainda em preparação ou com dados insuficientes." },
  ] : null;

  return (
    <div className="spw-charts" id="spw-kpi-charts">
      <button type="button" className="spw-universe" data-kpi="active" aria-pressed={selection === "active"}
        aria-label={`Universo analisado: ${nf(universe)} documentos únicos vigentes nas LDs ativas, exceto cancelados. Clique para listar todos.`}
        onClick={() => onSelect("active")}>
        <span className="spw-universe-label">Universo analisado</span>
        <strong>{nf(universe)}</strong>
        <small>documentos únicos vigentes nas LDs ativas (cancelados não entram)</small>
      </button>

      <section className="spw-chart-card" aria-labelledby="spw-chart-pw-title">
        <header>
          <h4 id="spw-chart-pw-title">1 · Cadastro e emissão no ProjectWise</h4>
          <p>{pwBase !== null ? <><b>{nf(pwBase)}</b> documentos dependem do PW (CV não entra). Cadastrados no PW: <b>{nf(summary.registered || 0)}</b>.</> : "Importe a base PW para ver o andamento."}</p>
        </header>
        {pwSegments && pwBase ? <StackedBar title="Cadastro e emissão no PW" segments={pwSegments} total={pwBase} selection={selection} onSelect={onSelect} unit="documentos" /> : null}
      </section>

      <section className="spw-chart-card" aria-labelledby="spw-chart-sigem-title">
        <header>
          <h4 id="spw-chart-sigem-title">2 · Situação no SIGEM</h4>
          <p>Postagem e conformidade sobre o universo de <b>{nf(universe)}</b> documentos.</p>
        </header>
        {summary.posted !== null ? <Meter label="Postados no SIGEM" value={summary.posted} total={universe} tone="info" keyName="posted" selection={selection} onSelect={onSelect}
          hint="Localizados na Consulta Geral; postagem não significa aprovação." /> : null}
        {sigemSegments ? <StackedBar title="Conformidade no SIGEM" segments={sigemSegments} total={universe} selection={selection} onSelect={onSelect} unit="documentos" /> : null}
      </section>
    </div>
  );
}
