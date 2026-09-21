import type { SigemPwReadiness as Readiness } from "../types/domain";

function fmt(value: number): string { return Number(value || 0).toLocaleString("pt-BR"); }

export function SigemPwReadiness({ readiness }: { readiness: Readiness | null }) {
  const assessment = readiness || {
    status: "empty" as const,
    title: "Pronto para receber as novas bases",
    message: "Carregue a Consulta Geral, a relação ProjectWise e a LD da Qualidade para iniciar uma comparação nova.",
    checks: [], failedChecks: [], ready: false, loaded: {}, missing: [],
  };
  const iconLabel = assessment.status === "ready" ? "✓" : assessment.status === "attention" ? "!" : "i";
  const applicable = assessment.checks.filter((item) => item.applicable);
  return (
    <section className="spw-readiness" id="spw-readiness" data-status={assessment.status} aria-live="polite">
      <span className="spw-readiness-icon" aria-hidden="true">{iconLabel}</span>
      <div><strong>{assessment.title}</strong><small>{assessment.message}</small></div>
      {applicable.length > 0 && (
        <details>
          <summary>{assessment.failedChecks.length ? `${fmt(assessment.failedChecks.length)} atenção(ões)` : `${fmt(applicable.length)} verificações OK`}</summary>
          <div className="spw-readiness-checks">
            {applicable.map((item) => <span key={item.key} className={item.passed ? "" : "fail"}>{item.passed ? "✓" : "!"} {item.label}</span>)}
          </div>
        </details>
      )}
    </section>
  );
}
