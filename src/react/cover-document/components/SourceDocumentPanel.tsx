import type { ChangeEvent } from "react";
import type { SourceDocumentInfo } from "../types/domain";

export function SourceDocumentPanel({
  source,
  originalPages,
  manualOriginalPages,
  busy,
  onFile,
  onManualPages,
}: {
  source: SourceDocumentInfo | null;
  originalPages: number | null;
  manualOriginalPages: number | null;
  busy: boolean;
  onFile: (file: File | null) => void;
  onManualPages: (pages: number | null) => void;
}) {
  return (
    <section className="cover-card" aria-labelledby="cover-source-heading">
      <div className="cover-card-heading"><div><span>2 — DOCUMENTO</span><h3 id="cover-source-heading">Arquivo que receberá a capa</h3></div><small>PDF e DOCX nesta entrega.</small></div>
      <label className="cover-dropzone">
        <input type="file" accept=".pdf,.docx" disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => onFile(event.currentTarget.files?.[0] || null)} />
        <strong>{source ? source.file.name : "Selecionar PDF ou DOCX"}</strong>
        <span>{source ? `${source.kind.toUpperCase()} · ${source.file.size.toLocaleString("pt-BR")} bytes` : "O arquivo permanece no navegador."}</span>
      </label>
      {source ? (
        <div className="cover-page-count">
          <span>Páginas do documento original</span>
          <strong>{originalPages ?? "Não confirmado"}</strong>
          {source.kind === "docx" ? (
            <label><span>Corrigir total, se necessário</span><input type="number" min="1" step="1" value={manualOriginalPages ?? ""} placeholder={source.originalPages ? String(source.originalPages) : "Informe o total"} onChange={(event: ChangeEvent<HTMLInputElement>) => onManualPages(event.currentTarget.value ? Math.max(1, Number(event.currentTarget.value)) : null)} /></label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
