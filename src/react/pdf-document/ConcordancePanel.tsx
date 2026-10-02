import type { ConcordanceSnapshot } from './types';
import { useEffect, useState } from 'react';

export function ConcordancePanel({ snapshot }: { snapshot: ConcordanceSnapshot | null }) {
  const [limit, setLimit] = useState(50);
  useEffect(() => setLimit(50), [snapshot]);
  if (!snapshot) return null;
  const priority = (outcome: string) => outcome === 'BLOQUEIO' ? 0 : outcome === 'ALERTA' ? 1 : 2;
  const results = [...snapshot.results].sort((a, b) => priority(a.outcome) - priority(b.outcome));
  return <section className="cover-card pdf-concordance" aria-label="Conformidade da capa e PDF">
    <h3>Conformidade da capa e PDF</h3>
    <p role="status">{snapshot.blocks.length} bloqueio(s) · {snapshot.warnings.length} alerta(s) · {snapshot.concordanceVersion}</p>
    <button type="button" className="secondary-button" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'conferencia-capa-pdf.json'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    }}>Baixar relatório da conferência</button>
    <details><summary>Ver regras e evidências ({snapshot.results.length})</summary>
      {results.slice(0, limit).map(result => <div className={`cover-validation is-${result.outcome === 'BLOQUEIO' ? 'error' : result.outcome === 'ALERTA' ? 'warning' : 'info'}`} key={result.ruleId}>
        <strong>{result.outcome}</strong><div>{result.message}<small>{result.norm} Rev. {result.revision} §{result.section} · {result.ruleId} · {result.source.label}</small>
          <small>Encontrado: {result.valueFound || 'Não identificado'} · Esperado: {result.valueExpected || '—'}</small>
          {result.outcome === 'BLOQUEIO' ? <small>{result.correctionHint}</small> : null}</div>
      </div>)}
      {snapshot.results.length > limit ? <button type="button" className="secondary-button" onClick={() => setLimit(value => value + 50)}>Mostrar mais 50 verificações</button> : null}
    </details>
  </section>;
}
