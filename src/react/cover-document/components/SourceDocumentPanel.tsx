import type { ChangeEvent } from "react";
import type { CoverPlacementMode, SourceDocumentInfo } from "../types/domain";

export function SourceDocumentPanel({
  source,
  originalPages,
  manualOriginalPages,
  busy,
  coverMode,
  onFile,
  onManualPages,
  onCoverMode,
}: {
  source: SourceDocumentInfo | null;
  originalPages: number | null;
  manualOriginalPages: number | null;
  busy: boolean;
  coverMode: CoverPlacementMode;
  onFile: (file: File | null) => void;
  onManualPages: (pages: number | null) => void;
  onCoverMode: (mode: CoverPlacementMode) => void;
}) {
  return (
    <section className="cover-card" aria-labelledby="cover-source-heading">
      <div className="cover-card-heading"><div><span>2 — DOCUMENTO</span><h3 id="cover-source-heading">Arquivo que receberá a capa</h3></div><small>PDF e DOCX nesta entrega.</small></div>
      <label className="cover-dropzone">
        <input type="file" accept=".pdf,.docx" disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => onFile(event.currentTarget.files?.[0] || null)} />
        <strong>{source ? source.file.name : "Selecionar PDF ou DOCX"}</strong>
        <span>{source ? `${source.kind.toUpperCase()} · ${source.file.size.toLocaleString("pt-BR")} bytes` : "O arquivo permanece no navegador."}</span>
      </label>
      {source?.kind === "pdf" ? (
        <fieldset className="cover-placement">
          <legend>Como tratar a primeira página do PDF?</legend>
          <label><input type="radio" name="cover-placement" value="replace-first-page" checked={coverMode === "replace-first-page"} onChange={() => onCoverMode("replace-first-page")} /> <span><b>Substituir a capa existente</b><small>A página 2 (contracapa específica deste documento) é mantida exatamente como está; o GRCON não cria contracapa genérica.</small></span></label>
          <label><input type="radio" name="cover-placement" value="prepend" checked={coverMode === "prepend"} onChange={() => onCoverMode("prepend")} /> <span><b>Adicionar antes do documento</b><small>Use apenas quando o arquivo anexado ainda não possui capa.</small></span></label>
        </fieldset>
      ) : source?.kind === "docx" ? (
        <div className="cover-source-note">No Word, a capa é adicionada antes do conteúdo. A substituição automática da primeira página não é aplicada porque a paginação do DOCX depende do Word e não é determinística no navegador.</div>
      ) : null}
      {source?.kind === "pdf" && originalPages ? (
        <div className="cover-source-note" data-cover-backcover-state={originalPages >= 2 ? "preserved" : "missing"}>{originalPages >= 2 ? "Contracapa detectada: a página 2 deste PDF será preservada exatamente como está." : "Este PDF possui apenas uma página; não há página 2/contracapa para preservar."}</div>
      ) : null}
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
