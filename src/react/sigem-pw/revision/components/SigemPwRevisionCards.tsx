import type { RevisionCounts, RevisionSituationFilter } from "../types/domain";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

export function SigemPwRevisionCards({ counts, active, onSelect }: {
  counts: RevisionCounts | null;
  active: RevisionSituationFilter;
  onSelect(value: RevisionSituationFilter): void;
}) {
  const c = counts || {
    updated: 0, previous: 0, notFound: 0, awaitingEmission: 0,
    pwAhead: 0, review: 0, comparable: 0, nonComparable: 0,
  };
  const cards: Array<{ value: RevisionSituationFilter; count: number; title: string; note: string; css: string }> = [
    { value: "updated", count: c.updated, title: "Atualizados", note: "Mesma revisão aplicável e emitida no PW", css: "updated" },
    { value: "pw-previous", count: c.previous, title: "PW em revisão anterior", note: "PW ainda não alcançou a revisão SIGEM", css: "previous" },
    { value: "pw-not-found", count: c.notFound, title: "Não localizados no PW", note: "Sem correspondência documental válida", css: "missing" },
    { value: "pw-awaiting-emission", count: c.awaitingEmission, title: "Aguardando emissão no PW", note: "Revisão correta já está cadastrada", css: "pending" },
    { value: "other", count: c.pwAhead + c.review, title: "Outras divergências", note: "PW posterior ou caso que requer análise", css: "other" },
  ];

  return (
    <div className="spw-rev-cards" id="spw-rev-cards">
      {cards.map((card) => {
        const selected = active === card.value;
        return (
          <button
            key={card.value}
            type="button"
            className={`spw-rev-card ${card.css}${selected ? " active" : ""}`}
            data-spw-rev-situation={card.value}
            title={card.note}
            aria-pressed={selected}
            onClick={() => onSelect(card.value)}
          >
            <strong>{fmt(card.count)}</strong>
            <b>{card.title}</b>
            <small>{card.note}</small>
          </button>
        );
      })}
    </div>
  );
}
