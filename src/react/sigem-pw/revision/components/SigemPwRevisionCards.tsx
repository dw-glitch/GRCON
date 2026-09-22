import type { RevisionAnalysis, RevisionSituationFilter } from "../types/domain";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function Card({ value, title, note, css, filter, active, onSelect }: {
  value: number;
  title: string;
  note: string;
  css: string;
  filter: RevisionSituationFilter;
  active: boolean;
  onSelect(value: RevisionSituationFilter): void;
}) {
  return (
    <button
      type="button"
      className={"spw-rev-card " + css + (active ? " active" : "")}
      data-spw-rev-situation={filter}
      aria-pressed={active}
      aria-label={fmt(value) + " — " + title + " — " + note}
      onClick={() => onSelect(filter)}
    >
      <strong>{fmt(value)}</strong>
      <b>{title}</b>
      <small>{note}</small>
    </button>
  );
}

export function SigemPwRevisionCards({ analysis, situation, onSelect }: {
  analysis: RevisionAnalysis;
  situation: RevisionSituationFilter;
  onSelect(value: RevisionSituationFilter): void;
}) {
  const c = analysis.counts;
  return (
    <section className="spw-rev-cards" aria-label="Resumo por situação de revisão">
      <Card value={c.updated} title="Atualizados" note="Mesma revisão aplicável e emitida no PW." css="updated" filter="updated" active={situation === "updated"} onSelect={onSelect} />
      <Card value={c.previous} title="PW em revisão anterior" note="PW ainda não alcançou a revisão SIGEM." css="previous" filter="pw-previous" active={situation === "pw-previous"} onSelect={onSelect} />
      <Card value={c.notFound} title="Não localizados no PW" note="Sem correspondência documental válida." css="missing" filter="pw-not-found" active={situation === "pw-not-found"} onSelect={onSelect} />
      <Card value={c.awaitingEmission} title="Aguardando emissão no PW" note="Revisão correta já está cadastrada." css="pending" filter="pw-awaiting-emission" active={situation === "pw-awaiting-emission"} onSelect={onSelect} />
      <Card value={c.pwAhead + c.review} title="Outras divergências" note="PW posterior ou caso que requer análise." css="other" filter="other" active={situation === "other"} onSelect={onSelect} />
    </section>
  );
}
