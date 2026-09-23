import { UiMetaPill, UiPageHeader } from "../core/ui/UiPrimitives";
import { CoverDataPanel } from "./components/CoverDataPanel";
import { CoverPreview } from "./components/CoverPreview";
import { LdDocumentSearch } from "./components/LdDocumentSearch";
import { SourceDocumentPanel } from "./components/SourceDocumentPanel";
import { useCoverDocument } from "./hooks/useCoverDocument";

export function CoverDocumentApp() {
  const cover = useCoverDocument();
  const canGenerate = Boolean(cover.selected && cover.source && cover.totalPages && !cover.hasErrors);

  return (
    <div className={`cover-tool-shell${cover.busy ? " is-busy" : ""}`}>
      <UiPageHeader
        eyebrow="Padronização documental"
        title="Adicionar Capa"
        description="Localize o título na LD, confira os dados e anexe a capa oficial como primeira página do documento."
        meta={<UiMetaPill>Processamento local</UiMetaPill>}
      />
      <div className="cover-flow" aria-label="Fluxo da ferramenta"><span className={cover.ldNames.length ? "is-done" : "is-current"}>1 <b>LD</b></span><span className={cover.selected ? "is-done" : cover.ldNames.length ? "is-current" : ""}>2 <b>Título</b></span><span className={cover.source ? "is-done" : cover.selected ? "is-current" : ""}>3 <b>Documento</b></span><span className={canGenerate ? "is-current" : ""}>4 <b>Gerar</b></span></div>
      <div className="cover-status" role="status" aria-live="polite">{cover.status}</div>
      <div className="cover-layout">
        <div className="cover-main-column">
          <LdDocumentSearch ldNames={cover.ldNames} ldSource={cover.ldSource} query={cover.query} candidates={cover.candidates} selectedId={cover.selected?.id || ""} busy={cover.busy} onLdFiles={cover.loadLds} onQuery={cover.setQuery} onSelect={cover.chooseCandidate} />
          <CoverDataPanel selected={cover.selected} data={cover.data} overrides={cover.overrides} open={cover.advancedOpen} onToggle={() => cover.setAdvancedOpen(!cover.advancedOpen)} onUpdate={cover.updateField} onRestore={cover.restoreField} />
          <SourceDocumentPanel source={cover.source} originalPages={cover.originalPages} manualOriginalPages={cover.manualOriginalPages} busy={cover.busy} onFile={cover.attachSource} onManualPages={cover.setManualOriginalPages} />
        </div>
        <CoverPreview previewUrl={cover.previewUrl} validations={cover.validations} totalPages={cover.totalPages} canPdf={canGenerate && cover.source?.kind === "pdf"} canDocx={canGenerate && cover.source?.kind === "docx"} busy={cover.busy} onGeneratePdf={() => cover.generate("pdf")} onGenerateDocx={() => cover.generate("docx")} />
      </div>
    </div>
  );
}
