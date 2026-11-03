import { useState } from "react";
import type { ManagerialSummary } from "../services/sigemPwManagerial";

export type ChartKey = "active" | "registered" | "emitted" | "awaiting" | "notEmitted" | "posted" | "compliant" | "pending" | "other";

interface Props {
  summary: ManagerialSummary;
  selection: string;
  onSelect(key: ChartKey): void;
}

type Tone = "ok" | "warn" | "bad" | "muted" | "info";
interface Segment { key: ChartKey; label: string; hint: string; value: number; tone: Tone }
interface Tip { x: number; y: number; item: Segment; total: number; unit: string }

const nf = (value: number) => value.toLocaleString("pt-BR");
const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";

/** Ícone por estado: a cor nunca carrega o significado sozinha. */
function ToneIcon({ tone }: { tone: Tone }) {
  const path = tone === "ok" ? "M5 12.5l4.5 4.5L19 7.5"
    : tone === "warn" ? "M12 7v5l3 2"
    : tone === "bad" ? "M12 7v6M12 17h.01"
    : tone === "info" ? "M5 12h14"
    : "M7 12h10";
  return <svg className="spw-tone-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  const { item, total, unit } = tip;
  return (
    <div className="spw-chart-tip" role="tooltip" data-tone={item.tone} style={{ left: tip.x, top: tip.y }}>
      <strong>{nf(item.value)} <small>{unit} · {pct(item.value, total)}</small></strong>
      <span><i aria-hidden="true" />{item.label}</span>
      <em>{item.hint}</em>
    </div>
  );
}

/** Barra segmentada (um todo dividido em partes): cada parte é um botão que filtra a relação. */
function SegmentedBar({ title, segments, total, selection, onSelect, unit, onTip }: {
  title: string; segments: Segment[]; total: number; selection: string; onSelect(key: ChartKey): void; unit: string; onTip(tip: Tip | null): void;
}) {
  const show = (item: Segment, x: number, y: number) => onTip({ x, y, item, total, unit });
  return (
    <div className="spw-chart">
      <div className="spw-chart-bar" role="group" aria-label={`${title}: ${segments.map(item => `${item.label} ${nf(item.value)}`).join(", ")}`}>
        {segments.filter(item => item.value > 0).map(item => (
          <button
            type="button" key={item.key} data-kpi={item.key} data-tone={item.tone}
            className="spw-chart-seg" style={{ flexGrow: Math.max(item.value, total * 0.012), flexBasis: 0 }}
            aria-pressed={selection === item.key}
            aria-label={`${item.label}: ${nf(item.value)} ${unit}, ${pct(item.value, total)}. ${item.hint}`}
            onClick={() => onSelect(item.key)}
            onPointerMove={(event) => show(item, event.clientX, event.clientY)}
            onPointerLeave={() => onTip(null)}
            onFocus={(event) => { const box = event.currentTarget.getBoundingClientRect(); show(item, box.left + box.width / 2, box.top); }}
            onBlur={() => onTip(null)}
          >
            <span aria-hidden="true">{item.value / total >= 0.09 ? pct(item.value, total) : ""}</span>
          </button>
        ))}
      </div>
      <ul className="spw-chart-legend">
        {segments.map(item => (
          <li key={item.key} data-tone={item.tone}>
            <button type="button" onClick={() => onSelect(item.key)} disabled={item.value === 0} aria-pressed={selection === item.key}>
              <ToneIcon tone={item.tone} />
              <span className="spw-chart-legend-label">{item.label}</span>
              <strong>{nf(item.value)}</strong>
              <em>{pct(item.value, total)}</em>
              <small>{item.hint}</small>
            </button>
          </li>
        ))}
      </ul>
      <details className="spw-chart-table">
        <summary>Ver como tabela</summary>
        <table>
          <caption>{title}</caption>
          <thead><tr><th scope="col">Situação</th><th scope="col">Documentos</th><th scope="col">Percentual</th></tr></thead>
          <tbody>
            {segments.map(item => <tr key={item.key}><th scope="row">{item.label}</th><td>{nf(item.value)}</td><td>{pct(item.value, total)}</td></tr>)}
            <tr><th scope="row">Total</th><td>{nf(total)}</td><td>100%</td></tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Meter({ label, value, total, tone, hint, keyName, selection, onSelect }: {
  label: string; value: number; total: number; tone: Tone; hint: string; keyName: ChartKey; selection: string; onSelect(key: ChartKey): void;
}) {
  const width = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <button type="button" className="spw-meter" data-kpi={keyName} data-tone={tone} aria-pressed={selection === keyName}
      aria-label={`${label}: ${nf(value)} de ${nf(total)} (${pct(value, total)}). ${hint}`} onClick={() => onSelect(keyName)}>
      <span className="spw-meter-head"><span>{label}</span><strong>{nf(value)}<small> de {nf(total)} · {pct(value, total)}</small></strong></span>
      <span className="spw-meter-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
      <small className="spw-meter-hint">{hint}</small>
    </button>
  );
}

/**
 * Painel gráfico da visão gerencial. Responde, em ordem, às perguntas do controle:
 * quantos documentos são controlados, em que ponto do PW cada um está e como estão no SIGEM.
 * Cada trecho/legenda filtra a relação de documentos logo abaixo.
 */
export function SigemPwKpiCharts({ summary, selection, onSelect }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
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
    { key: "other", label: "Em preparação ou incompletos", value: Math.max(0, universe - compliant - pending), tone: "muted", hint: "Ainda em preparação ou com dados insuficientes para avaliar." },
  ] : null;

  return (
    <div className="spw-charts" id="spw-kpi-charts">
      <button type="button" className="spw-universe" data-kpi="active" aria-pressed={selection === "active"}
        aria-label={`Documentos controlados: ${nf(universe)} documentos únicos nas LDs ativas, sem os cancelados. Clique para listar todos.`}
        onClick={() => onSelect("active")}>
        <span className="spw-universe-label">Documentos controlados</span>
        <strong>{nf(universe)}</strong>
        <small>documentos únicos nas LDs ativas · cancelados não entram</small>
      </button>

      <section className="spw-chart-card" aria-labelledby="spw-chart-pw-title">
        <header>
          <h4 id="spw-chart-pw-title">1 · Andamento no ProjectWise</h4>
          <p>{pwBase !== null ? <><b>{nf(pwBase)}</b> documentos precisam estar no PW (CV não precisa). Já cadastrados: <b>{nf(summary.registered || 0)}</b>.</> : "Importe a base PW para ver o andamento."}</p>
        </header>
        {pwSegments && pwBase ? <SegmentedBar title="Andamento no ProjectWise" segments={pwSegments} total={pwBase} selection={selection} onSelect={onSelect} unit="documentos" onTip={setTip} /> : null}
      </section>

      <section className="spw-chart-card" aria-labelledby="spw-chart-sigem-title">
        <header>
          <h4 id="spw-chart-sigem-title">2 · Situação no SIGEM</h4>
          <p>Postagem e conformidade dos <b>{nf(universe)}</b> documentos controlados.</p>
        </header>
        {summary.posted !== null ? <Meter label="Postados no SIGEM" value={summary.posted} total={universe} tone="info" keyName="posted" selection={selection} onSelect={onSelect}
          hint="Localizados na Consulta Geral; postagem não significa aprovação." /> : null}
        {sigemSegments ? <SegmentedBar title="Conformidade no SIGEM" segments={sigemSegments} total={universe} selection={selection} onSelect={onSelect} unit="documentos" onTip={setTip} /> : null}
      </section>
      <Tooltip tip={tip} />
    </div>
  );
}
