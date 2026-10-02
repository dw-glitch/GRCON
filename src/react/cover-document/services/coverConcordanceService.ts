import type { CoverDocumentCandidate } from '../types/domain';
import type { ConcordanceOptions } from '../../pdf-document/types';

export function coverReferences(selected: CoverDocumentCandidate): ConcordanceOptions['references'] {
  const runtime = window as unknown as {
    GrconSharedSigemQuery?: { current(): { records?: Array<{ document: string; revision?: string; title?: string }> } | null };
    GrconHistory?: { read(): Array<{ egrdtNumber: string; files?: Array<{ document: string; revision?: string; title?: string }> }> };
  };
  const same = (document: string) => document.trim().toUpperCase() === selected.documentNumber.trim().toUpperCase();
  return [
    { source: `LD ${selected.ldName} · linha ${selected.row}`, document: selected.documentNumber, title: selected.title, revision: selected.revision },
    ...(runtime.GrconSharedSigemQuery?.current()?.records || []).filter(item => same(item.document)).map(item => ({ ...item, source: 'Consulta Geral atual' })),
    ...(runtime.GrconHistory?.read() || []).flatMap(record => (record.files || []).filter(item => same(item.document)).map(item => ({ ...item, source: `Histórico / GRDT ${record.egrdtNumber}` }))),
  ];
}
