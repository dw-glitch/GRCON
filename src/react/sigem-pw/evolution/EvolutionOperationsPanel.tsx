import type { EvolutionOperationsPoint, EvolutionOperationsView, EvolutionSnapshot } from "./types/domain";

type Tone = "ok" | "warn" | "bad" | "info" | "muted";
type CountKey = "sigem" | "registerSigem" | "registerAbsent" | "registered" | "issue" | "issued";

const nf = (value: number) => value.toLocaleString("pt-BR");
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${nf(Math.abs(value))}`;
const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";

/** Mesma ordem, nomes e cores do gráfico do painel gerencial. */
const BAR: Array<{ key: CountKey; label: string; tone: Tone }> = [
  { key: "issued", label: "Emitidas no PW", tone: "ok" },
  { key: "issue", label: "A emitir no PW", tone: "warn" },
  { key: "registerSigem", label: "A cadastrar — já constam no SIGEM", tone: "bad" },
  { key: "registerAbsent", label: "A cadastrar — não constam no SIGEM", tone: "info" },
];

const CARDS: Array<{ key: CountKey; label: string; tone: Tone; hint: string }> = [
  { key: "sigem", label: "Constam no SIGEM", tone: "muted", hint: "Revisões que aparecem na Consulta Geral" },
  { key: "registerSigem", label: "A cadastrar no PW — já constam no SIGEM", tone: "bad", hint: "Já no SIGEM, ainda sem cadastro no PW" },
  { key: "registerAbsent", label: "A cadastrar no PW — não constam no SIGEM", tone: "info", hint: "Exigidas pelas LDs, fora da Consulta Geral, sem cadastro no PW" },
  { key: "registered", label: "Cadastradas no PW", tone: "info", hint: "A emitir + emitidas" },
  { key: "issue", label: "A emitir no PW", tone: "warn", hint: "Cadastradas no PW, falta emitir" },
  { key: "issued", label: "Emitidas no PW", tone: "ok", hint: "Emissão comprovada no PW" },
];

function fileLabel(snapshot: EvolutionSnapshot | null): string {
  if (!snapshot) return "—";
  const date = new Date(snapshot.importedAt || "");
  const when = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  return [snapshot.fileName || "base", when].filter(Boolean).join(" · ");
}

function Bar({ title, point }: { title: string; point: EvolutionOperationsPoint | null }) {
  if (!point) {
    return (
      <div className="spw-evo-ops-bar-row">
        <span className="spw-evo-ops-bar-title">{title}</span>
        <div className="spw-evo-ops-bar spw-evo-ops-bar--empty" role="img" aria-label={`${title}: sem base para comparar`}>sem base para comparar</div>
      </div>
    );
  }
  const total = point.revisions;
  const description = BAR.map((item) => `${item.label} ${nf(point[item.key])}`).join(", ");
  return (
    <div className="spw-evo-ops-bar-row">
      <span className="spw-evo-ops-bar-title">{title}</span>
      <div className="spw-evo-ops-bar" role="img" aria-label={`${title}: ${nf(total)} revisões de documentos. ${description}`}>
        {BAR.filter((item) => point[item.key] > 0).map((item) => (
          <span key={item.key} data-tone={item.tone} title={`${item.label}: ${nf(point[item.key])} (${pct(point[item.key], total)})`}
            style={{ flexGrow: Math.max(point[item.key], total * 0.012), flexBasis: 0 }}>
            {point[item.key] / total >= 0.09 ? pct(point[item.key], total) : ""}
          </span>
        ))}
      </div>
      <strong className="spw-evo-ops-bar-total">{nf(total)}</strong>
    </div>
  );
}

function Delta({ value, previous }: { value: number | null; previous: number | null }) {
  if (value === null || previous === null) return <span className="spw-evo-ops-delta" data-direction="none">sem base anterior</span>;
  const direction = value > 0 ? "up" : value < 0 ? "down" : "same";
  return (
    <span className="spw-evo-ops-delta" data-direction={direction}>
      <i aria-hidden="true">{direction === "up" ? "▲" : direction === "down" ? "▼" : "="}</i>
      {direction === "same" ? "sem variação" : `${signed(value)} desde a base anterior`}
      <small> (antes {nf(previous)})</small>
    </span>
  );
}

export function EvolutionOperationsPanel({
  view,
  hasLd,
  sigemCurrent,
  pwCurrent,
  sigemPrevious,
  pwPrevious,
}: {
  view: EvolutionOperationsView | null;
  hasLd: boolean;
  sigemCurrent: EvolutionSnapshot | null;
  pwCurrent: EvolutionSnapshot | null;
  sigemPrevious: EvolutionSnapshot | null;
  pwPrevious: EvolutionSnapshot | null;
}) {
  const scope = view?.scope === "revision0" ? "somente a revisão 0" : "todas as revisões";
  const movement = view?.movement || null;
  const missing = view && view.previousUsed ? [!view.previousUsed.sigem ? "SIGEM" : "", !view.previousUsed.pw ? "PW" : ""].filter(Boolean) : [];
  return (
    <section className="spw-evo-ops" id="spw-evo-ops" aria-labelledby="spw-evo-ops-title">
      <header>
        <div>
          <strong id="spw-evo-ops-title">Cadastro e emissão no PW: base atual × base anterior</strong>
          <small>
            Mesmos seis indicadores e as mesmas regras da Visão gerencial, calculados para cada base salva ({scope}).
            Cada revisão de cada documento conta uma vez. As referências (LD) usadas são as ativas hoje, nas duas pontas.
          </small>
        </div>
      </header>

      {!hasLd || !view ? (
        <div className="spw-evo-ops-empty" role="status">Aguardando a preparação da comparação.</div>
      ) : !view.ready || !view.current ? (
        <div className="spw-evo-ops-empty" role="status"><strong>Indicadores indisponíveis.</strong> {view.reason}</div>
      ) : (
        <>
          <div className="spw-evo-ops-bars">
            <Bar title="Base anterior" point={view.previous} />
            <Bar title="Base atual" point={view.current} />
            <ul className="spw-evo-ops-legend" aria-label="Legenda das barras">
              {BAR.map((item) => <li key={item.key} data-tone={item.tone}><i aria-hidden="true" />{item.label}</li>)}
            </ul>
          </div>

          <div className="spw-evo-ops-cards" role="list">
            {CARDS.map((card) => {
              const now = view.current![card.key];
              const before = view.previous ? view.previous[card.key] : null;
              return (
                <article key={card.key} role="listitem" className="spw-evo-ops-card" data-tone={card.tone} data-ops={card.key}>
                  <span>{card.label}</span>
                  <strong>{nf(now)}</strong>
                  <Delta value={before === null ? null : now - before} previous={before} />
                  <small>{card.hint}</small>
                </article>
              );
            })}
          </div>

          {movement ? (
            <ul className="spw-evo-ops-moves" aria-label="O que mudou entre as duas bases">
              <li><strong>{nf(movement.newInSigem)}</strong> revisões passaram a constar no SIGEM{movement.leftSigem ? <> · <strong>{nf(movement.leftSigem)}</strong> deixaram de constar</> : null}</li>
              <li><strong>{nf(movement.newlyRegistered)}</strong> revisões foram cadastradas no PW</li>
              <li><strong>{nf(movement.newlyIssued)}</strong> revisões foram emitidas no PW</li>
            </ul>
          ) : null}

          <p className="spw-evo-ops-note">
            SIGEM: {fileLabel(sigemPrevious)} → {fileLabel(sigemCurrent)} · PW: {fileLabel(pwPrevious)} → {fileLabel(pwCurrent)}
            {missing.length ? ` · Sem base anterior de ${missing.join(" e ")}: a base atual foi usada nos dois lados, então só varia o que a outra base mudou.` : ""}
          </p>
        </>
      )}
    </section>
  );
}
