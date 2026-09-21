import type { PdfMergeResult } from "../types/domain";

interface PdfResultProps {
  result: PdfMergeResult | null;
  formattedSize: string;
  onDownload(): void;
}

export function PdfResult({ result, formattedSize, onDownload }: PdfResultProps) {
  return (
    <section className="pdf-merge-result" hidden={!result} id="pdf-merge-result" aria-live="polite">
      <span className="pdf-merge-result-icon">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
      </span>
      <div>
        <strong id="pdf-merge-result-name">{result?.name || "PDF_Combinado.pdf"}</strong>
        <small id="pdf-merge-result-meta">
          {result
            ? `${result.pageCount.toLocaleString("pt-BR")} página(s) · ${formattedSize} · ${result.fileCount.toLocaleString("pt-BR")} PDF(s)`
            : "Arquivo pronto"}
        </small>
      </div>
      <button className="secondary-button compact" id="pdf-merge-download" type="button" onClick={onDownload}>Baixar novamente</button>
    </section>
  );
}
