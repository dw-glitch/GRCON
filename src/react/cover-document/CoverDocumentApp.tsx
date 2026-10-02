import { UiMetaPill, UiPageHeader } from "../core/ui/UiPrimitives";
import { CoverDataPanel } from "./components/CoverDataPanel";
import { CoverPreview } from "./components/CoverPreview";
import { LdDocumentSearch } from "./components/LdDocumentSearch";
import { SourceDocumentPanel } from "./components/SourceDocumentPanel";
import { useCoverDocument } from "./hooks/useCoverDocument";
import { ConcordancePanel } from '../pdf-document/ConcordancePanel';

export function CoverDocumentApp() {
  const cover = useCoverDocument();
  const canGenerate = Boolean(cover.selected && cover.source && cover.totalPages && !cover.hasErrors);

  return (
    <div className={`cover-tool-shell${cover.busy ? " is-busy" : ""}`}>
      <UiPageHeader
        eyebrow="Padronização documental"
        title="Adicionar Capa"
        description="Localize o título na LD, informe a revisão e substitua ou adicione a capa oficial preservando a contracapa específica do documento."
        meta={<UiMetaPill>Processamento local</UiMetaPill>}
      />
      <div className="cover-flow" aria-label="Fluxo da ferramenta"><span className={cover.ldNames.length ? "is-done" : "is-current"}>1 <b>LD</b></span><span className={cover.selected ? "is-done" : cover.ldNames.length ? "is-current" : ""}>2 <b>Título</b></span><span className={cover.source ? "is-done" : cover.selected ? "is-current" : ""}>3 <b>Documento</b></span><span className={canGenerate ? "is-current" : ""}>4 <b>Gerar</b></span></div>
      <div className="cover-status" role="status" aria-live="polite">{cover.status}</div>
      <div className="cover-layout">
        <div className="cover-main-column">
          <LdDocumentSearch ldNames={cover.ldNames} query={cover.query} candidates={cover.candidates} selectedId={cover.selected?.id || ""} busy={cover.busy} onLdFiles={cover.loadLds} onQuery={cover.setQuery} onSelect={cover.chooseCandidate} />
          <CoverDataPanel selected={cover.selected} data={cover.data} overrides={cover.overrides} open={cover.advancedOpen} onToggle={() => cover.setAdvancedOpen(!cover.advancedOpen)} onUpdate={cover.updateField} onRestore={cover.restoreField} />
          <SourceDocumentPanel source={cover.source} originalPages={cover.originalPages} manualOriginalPages={cover.manualOriginalPages} busy={cover.busy} coverMode={cover.coverMode} onFile={cover.attachSource} onManualPages={cover.setManualOriginalPages} onCoverMode={cover.setCoverMode} />
          {cover.source ? <section className="cover-card cover-n381-scope" aria-label="Aplicabilidade da N-381">
            <label>Aplicabilidade da N-381 no projeto/contrato<select value={cover.n381Applicability} onChange={event => cover.setN381Applicability(event.target.value)}>
              <option value="unknown">Não confirmada</option><option value="confirmed">Confirmada no projeto/contrato</option><option value="not-applicable">Fora do escopo</option>
            </select></label>
            <label><input type="checkbox" checked={cover.revisionBySheet} onChange={event => cover.setRevisionBySheet(event.target.checked)} /> Documento com controle de revisão por folha</label>
            <p>A primeira página será avaliada como capa de origem quando for substituída. Divergências nas páginas preservadas continuam sendo verificadas.</p>
          </section> : null}
          <ConcordancePanel snapshot={cover.normativeValidation} />
        </div>
        <CoverPreview previewUrl={cover.previewUrl} validations={cover.validations} totalPages={cover.totalPages} canPdf={canGenerate && cover.source?.kind === "pdf"} canDocx={canGenerate && cover.source?.kind === "docx"} busy={cover.busy} onGeneratePdf={() => cover.generate("pdf")} onGenerateDocx={() => cover.generate("docx")} />
      </div>
    </div>
  );
}
