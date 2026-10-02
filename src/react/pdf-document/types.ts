export interface PdfPageEvidence {
  pageNumber: number;
  values: Record<string, string>;
  ambiguous: string[];
  textReadable: boolean;
  widthMm?: number;
  heightMm?: number;
}
export interface PdfInspection {
  status: 'complete' | 'partial' | 'unavailable';
  pages: PdfPageEvidence[];
  totalPages: number;
  reason?: string;
}
export interface ConcordanceResult {
  ruleId: string; norm: string; revision: string; section: string; outcome: string;
  message: string; valueFound: string; valueExpected: string; correctionHint: string;
  source: { label: string };
}
export interface ConcordanceSnapshot {
  concordanceVersion: string;
  normativeValidationVersion: string;
  results: ConcordanceResult[];
  blocks: ConcordanceResult[];
  warnings: ConcordanceResult[];
  [key: string]: unknown;
}
export interface ConcordanceOptions {
  expected: { documentNumber: string; revision: string; title?: string; category?: string };
  inspection?: PdfInspection;
  cover?: object;
  applicability?: string;
  revisionBySheet?: boolean;
  replaceFirstPage?: boolean;
  references?: Array<{ source: string; document?: string; documentNumber?: string; revision?: string; title?: string }>;
}
declare global {
  interface Window {
    GrconPdfDocument?: { inspect(file: File): Promise<PdfInspection> };
    GrconN381Concordance: { extractPage(lines: string[], page: number, dimensions?: object): PdfPageEvidence; audit(options: ConcordanceOptions): ConcordanceSnapshot };
    GrconPdfConcordanceUi?: { mount(node: HTMLElement, references: ConcordanceOptions['references']): void };
  }
}
