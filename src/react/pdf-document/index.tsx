import { createRoot, type Root } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { inspect } from './inspection';
import { ConcordancePanel } from './ConcordancePanel';
import type { ConcordanceOptions, ConcordanceSnapshot, PdfInspection } from './types';

function ConferencePdf({ references = [] }: { references: ConcordanceOptions['references'] }) {
  const [code, setCode] = useState('');
  const [revision, setRevision] = useState('');
  const [title, setTitle] = useState('');
  const [inspection, setInspection] = useState<PdfInspection>();
  const [scope, setScope] = useState('unknown');
  const [bySheet, setBySheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Informe o documento e a revisão de destino para conferir o PDF.');
  const matches = useMemo(() => references.filter(item => (item.document || item.documentNumber || '').trim().toUpperCase() === code.trim().toUpperCase()), [references, code]);
  const snapshot: ConcordanceSnapshot | null = useMemo(() => inspection && code.trim() && revision.trim() ? window.GrconN381Concordance.audit({ expected: { documentNumber: code, revision, title }, inspection, applicability: scope, revisionBySheet: bySheet, references: matches }) : null, [inspection, code, revision, title, scope, bySheet, matches]);
  return <section className="cover-card pdf-concordance-input" aria-label="Conferência interna do PDF">
    <h3>Conferência interna do PDF</h3><p>Compare a legenda com a revisão de destino. Revisões antigas da Consulta Geral e do Histórico permanecem como referências.</p>
    <div className="cover-edit-grid">
      <label>Documento<input value={code} onChange={event => setCode(event.target.value)} /></label>
      <label>Revisão de destino<input value={revision} onChange={event => setRevision(event.target.value)} /></label>
      <label>Título de destino<input value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Aplicabilidade N-381<select value={scope} onChange={event => setScope(event.target.value)}><option value="unknown">Não confirmada no contrato</option><option value="confirmed">Confirmada no projeto/contrato</option><option value="not-applicable">Fora do escopo</option></select></label>
    </div>
    <label><input type="checkbox" checked={bySheet} onChange={event => setBySheet(event.target.checked)} /> Documento com controle de revisão por folha</label>
    <label>PDF para conferência<input type="file" accept=".pdf" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      setBusy(true); setInspection(undefined); setStatus('Extraindo texto localmente…');
      try { const value = await inspect(file); setInspection(value); setStatus(`${file.name}: ${value.pages.length} de ${value.totalPages} página(s) analisada(s). ${value.reason || ''}`); }
      catch { setStatus('Não foi possível ler o PDF; confira manualmente.'); }
      finally { setBusy(false); }
    }} /></label>
    <p role="status">{status}</p>
    {matches.length ? <details><summary>Fontes do documento ({matches.length})</summary>{matches.slice(0, 100).map((item, index) => <p key={index}>{item.source} · Rev. {item.revision || '—'} · {item.title || 'Título não informado'} <button type="button" className="text-button" onClick={() => { setRevision(item.revision || ''); setTitle(item.title || ''); }}>Usar como destino da conferência</button></p>)}</details> : <p>Nenhuma referência desse documento disponível na Conferência.</p>}
    <ConcordancePanel snapshot={snapshot} />
  </section>;
}
window.GrconPdfDocument = Object.freeze({ inspect });
const roots = new WeakMap<HTMLElement, Root>();
window.GrconPdfConcordanceUi = Object.freeze({ mount(node: HTMLElement, references: ConcordanceOptions['references']) {
  const root = roots.get(node) || createRoot(node);
  roots.set(node, root);
  root.render(<ConferencePdf references={references} />);
} });
