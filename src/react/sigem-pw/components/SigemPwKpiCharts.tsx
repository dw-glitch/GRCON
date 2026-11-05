import { useState } from "react";
import type { PwIndicator, PwOperationsReport, PwTotals } from "../services/sigemPwOperations";

export type ChartKey = Exclude<PwIndicator, "all"> | "all";

interface Props {
  /** Totais do escopo atual (os mesmos dos cinco indicadores, da relação e do Excel). */
  totals: PwTotals;
  /** Revisões de documentos no escopo atual (cada revisão de cada documento conta uma vez). */
  pairs: number;
  /** Conciliação da Consulta Geral integral (antes dos filtros). */
  reconciliation: PwOperationsReport["reconciliation"];
  selection: string;
  onSelect(key: ChartKey): void;
  /** "revision0" = somente revisão 0; "all" = todas as revisões. */
  revisionScope: "all" | "revision0";
  onRevisionScopeChange(value: "all" | "revision0"): void;
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
 * Painel gráfico da demanda da equipe PW. Unidade: revisão de documento.
 * Responde, em ordem: quantas revisões estão no escopo, em que ponto do PW cada um
 * está e como a Consulta Geral se relaciona com as referências. Cada trecho filtra
 * a relação logo abaixo e usa exatamente os mesmos totais dos indicadores e do Excel.
 */
export function SigemPwKpiCharts({ totals, pairs, reconciliation, selection, onSelect, revisionScope, onRevisionScopeChange }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
  const scope = revisionScope === "revision0" ? "somente a revisão 0" : "todas as revisões";
  const pwSegments: Segment[] = [
    { key: "issued", label: "Emitidas no PW", value: totals.issued, tone: "ok", hint: "Emissão comprovada no PW. Na lista aparecem como Concluído." },
    { key: "issue", label: "A emitir no PW", value: totals.issue, tone: "warn", hint: "Revisão 0 já cadastrada no PW, ou revisão A em diante, com emissão pendente." },
    { key: "registerSigem", label: "A cadastrar — já constam no SIGEM", value: totals.registerSigem, tone: "bad", hint: "Revisão 0 que já aparece no SIGEM e ainda não foi cadastrada no PW." },
    { key: "registerAbsent", label: "A cadastrar — não constam no SIGEM", value: totals.registerAbsent, tone: "info", hint: "Revisão 0 exigida pelas LDs, fora da Consulta Geral e sem cadastro no PW. Não constar na consulta não prova que falta postar." },
  ];
  // A conferência da Consulta Geral acompanha o filtro de revisões: revisão 0 mostra só as revisões 0.
  const recon = revisionScope === "revision0" ? reconciliation.revision0 : reconciliation;
  const inLd = recon.inScopePairs;
  const outside = recon.outsidePairs;
  const consulted = recon.pairs;
  const outsideHint = outside === 0
    ? "Todas as revisões da Consulta Geral constam nas LDs ativas."
    : `${nf(outside)} revisão(ões) da Consulta Geral não consta(m) nas LDs ativas.`;

  return (
    <div className="spw-charts" id="spw-kpi-charts">
      <button type="button" className="spw-universe" data-kpi="all"
        aria-label={`Revisões de documentos no escopo: ${nf(pairs)}. Cada revisão de cada documento conta uma vez. Clique para listar todas.`}
        onClick={() => onSelect("all")}>
        <span className="spw-universe-label">Revisões de documentos</span>
        <strong>{nf(pairs)}</strong>
        <small>cada revisão de cada documento conta uma vez · {scope}</small>
      </button>

      <section className="spw-chart-card" aria-labelledby="spw-chart-pw-title">
        <header>
          <h4 id="spw-chart-pw-title">1 · Trabalho da equipe PW</h4>
          <p>De <b>{nf(pairs)}</b> revisões de documentos, <b>{nf(totals.issued)}</b> já foram emitidas no PW. As demais dependem da equipe PW: cadastrar ou emitir.</p>
        </header>
        <fieldset className="spw-chart-scope">
          <legend className="spw-sr-only">Revisões consideradas</legend>
          <label><input type="radio" name="spw-chart-scope" checked={revisionScope === "all"} onChange={() => onRevisionScopeChange("all")} /><span>Todas as revisões</span></label>
          <label><input type="radio" name="spw-chart-scope" checked={revisionScope === "revision0"} onChange={() => onRevisionScopeChange("revision0")} /><span>Somente revisão 0</span></label>
        </fieldset>
        {pairs > 0
          ? <SegmentedBar title="Trabalho da equipe PW" segments={pwSegments} total={pairs} selection={selection} onSelect={onSelect} unit="revisões" onTip={setTip} />
          : <p className="spw-chart-empty">Nenhuma revisão de documento neste escopo.</p>}
        <Meter label="Revisões 0 cadastradas no PW" value={totals.registered} total={totals.registered + totals.registerSigem + totals.registerAbsent} tone="info" keyName="registered" selection={selection} onSelect={onSelect}
          hint="Só a revisão 0 é cadastro (empresas CSG/QTM). Da revisão A em diante cada revisão é uma emissão, feita em sequência: 0, A, B…" />
      </section>

      <section className="spw-chart-card" aria-labelledby="spw-chart-sigem-title">
        <header>
          <h4 id="spw-chart-sigem-title">2 · O que consta no SIGEM</h4>
          <p>Revisões de documentos que aparecem na Consulta Geral ({scope}) e quantas delas estão nas LDs ativas. A conferência usa a Consulta Geral inteira, antes dos demais filtros.</p>
        </header>
        <div className="spw-sigem-stat">
          <span>Constam no SIGEM (escopo atual)</span>
          <strong>{nf(totals.sigem)}</strong>
          <small>revisões de documentos na Consulta Geral · {scope}</small>
        </div>
        <Meter label="Constam nas LDs ativas" value={inLd} total={consulted} tone="ok" keyName="sigem" selection={selection} onSelect={onSelect} hint={outsideHint} />
      </section>
      <Tooltip tip={tip} />
    </div>
  );
}
