import type { ValidationMessage } from "../types/domain";

export function CoverPreview({
  previewUrl,
  validations,
  totalPages,
  canPdf,
  canDocx,
  busy,
  onGeneratePdf,
  onGenerateDocx,
}: {
  previewUrl: string;
  validations: ValidationMessage[];
  totalPages: number | null;
  canPdf: boolean;
  canDocx: boolean;
  busy: boolean;
  onGeneratePdf: () => void;
  onGenerateDocx: () => void;
}) {
  return (
    <section className="cover-card cover-preview-card" aria-labelledby="cover-preview-heading">
      <div className="cover-card-heading"><div><span>3 — PREVIEW E SAÍDA</span><h3 id="cover-preview-heading">Capa real do arquivo</h3></div><small>{totalPages ? `Folha 1 de ${totalPages}` : "Aguardando total de folhas"}</small></div>
      <div className="cover-preview-frame">
        {previewUrl ? <iframe src={previewUrl} title="Prévia real da capa" /> : <div className="cover-preview-placeholder"><strong>Prévia indisponível</strong><span>Selecione a LD, o documento e resolva os campos obrigatórios.</span></div>}
      </div>
      <div className="cover-validations" aria-live="polite">
        {validations.map((item) => <div key={item.id} className={`cover-validation is-${item.level}`}><b>{item.level === "error" ? "Erro" : item.level === "warning" ? "Aviso" : "Info"}</b><span>{item.message}</span></div>)}
      </div>
      <div className="cover-actions">
        <button className="primary-button" type="button" disabled={!canPdf || busy} onClick={onGeneratePdf}>{busy ? "Processando…" : "Gerar PDF"}</button>
        <button className="secondary-button" type="button" disabled={!canDocx || busy} onClick={onGenerateDocx}>Gerar Word editável</button>
      </div>
      {!canPdf && <small className="cover-output-note">PDF final automático é disponibilizado quando o arquivo de origem é PDF, para preservar suas páginas sem rasterização.</small>}
      {!canDocx && <small className="cover-output-note">Word editável é disponibilizado quando a origem é DOCX. Um PDF não é apresentado como Word “totalmente editável”.</small>}
    </section>
  );
}
