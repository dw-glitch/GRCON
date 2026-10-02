import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PdfInspection } from './types';

// Both the parser and worker are built locally; documents stay in this browser.
GlobalWorkerOptions.workerSrc = new URL('react-dist/pdf.worker.min.mjs', document.baseURI).href;
const MAX_PAGES = 200;
const MAX_BYTES = 40 * 1024 * 1024;

export async function inspect(file: File): Promise<PdfInspection> {
  if (file.size > MAX_BYTES) return { status: 'unavailable', pages: [], totalPages: 0, reason: 'PDF acima de 40 MB; confira manualmente.' };
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true, stopAtErrors: true });
  // Avoid an unresolved password prompt or an unbounded operation in the UI.
  task.onPassword = () => { void task.destroy(); };
  const timer = window.setTimeout(() => { void task.destroy(); }, 45000);
  const result: PdfInspection = { status: 'unavailable', pages: [], totalPages: 0 };
  try {
    const pdf = await task.promise;
    result.totalPages = pdf.numPages;
    for (let number = 1; number <= Math.min(MAX_PAGES, pdf.numPages); number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const textItems = content.items.filter(item => 'str' in item);
      const rows = new Map<number, Array<{ x: number; text: string }>>();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        const row = rows.get(y) || [];
        row.push({ x: item.transform[4], text: item.str });
        rows.set(y, row);
      }
      const lines = [...rows].sort((a, b) => b[0] - a[0]).map(([, row]) => row.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').trim());
      // Number labels are often on a line above the value in title blocks.
      // Restrict to the labelled cell, require a single code-like candidate,
      // and never apply this heuristic to revision-history table headings.
      for (const label of textItems) {
        if (!('str' in label) || !/^N[º°O.]\s*:\s*$/i.test(label.str.trim())) continue;
        const candidates = textItems.filter(item => 'str' in item && /^[A-Z0-9][A-Z0-9._/-]{5,}$/i.test(item.str.trim()) && /\d/.test(item.str) && /[-/]/.test(item.str) && item.transform[4] >= label.transform[4] - 5 && item.transform[4] <= label.transform[4] + 300 && item.transform[5] < label.transform[5] && item.transform[5] >= label.transform[5] - 30);
        if (candidates.length === 1 && 'str' in candidates[0]) lines.push(`DOCUMENTO: ${candidates[0].str}`);
      }
      const viewport = page.getViewport({ scale: 1 });
      result.pages.push(window.GrconN381Concordance.extractPage(lines, number, { widthMm: viewport.width * 25.4 / 72, heightMm: viewport.height * 25.4 / 72 }));
      page.cleanup();
    }
    result.status = result.pages.length === result.totalPages ? 'complete' : 'partial';
  } catch (error) {
    result.status = result.pages.length ? 'partial' : 'unavailable';
    result.reason = error instanceof Error ? error.message : 'Extração de texto indisponível.';
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
  return result;
}
