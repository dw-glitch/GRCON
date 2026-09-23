import { useRef } from "react";
import { UiMetaPill, UiPageHeader } from "../core/ui/UiPrimitives";
import { PdfDropZone } from "./components/PdfDropZone";
import { PdfFileList } from "./components/PdfFileList";
import { PdfOutputPanel } from "./components/PdfOutputPanel";
import { usePdfMerge } from "./hooks/usePdfMerge";

export function PdfMergeApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const merge = usePdfMerge();
  const itemCount = merge.state.items.length;
  const hasFiles = itemCount > 0;
  const canCombine = itemCount >= 2;
  const hasResult = Boolean(merge.state.result);

  const shellClasses = [
    "pdf-merge-shell",
    hasFiles ? "has-files" : "is-empty",
    merge.state.busy ? "is-processing" : "",
    hasResult ? "has-result" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClasses}>
      <UiPageHeader
        eyebrow="Ferramentas de PDF"
        title="Combinar PDFs"
        description="Junte vários PDFs em um único arquivo, preservando exatamente a ordem definida abaixo."
        meta={(
          <UiMetaPill className={`pdf-merge-local-badge${merge.state.busy ? " is-busy" : ""}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z" />
            </svg>
            {merge.state.busy ? "Processando localmente" : "Processamento local"}
          </UiMetaPill>
        )}
      />

      <p className={`pdf-merge-privacy${merge.state.busy ? " is-busy" : ""}`} id="pdf-merge-privacy" aria-live="polite">
        {merge.state.busy
          ? "Não feche esta aba até a conclusão. Os arquivos continuam somente neste navegador."
          : "Os arquivos permanecem neste navegador: nenhum arquivo é enviado, armazenado ou registrado no banco."}
      </p>

      <div className="pdf-merge-flow" aria-label="Fluxo para combinar PDFs">
        <span className={`pdf-merge-step${hasFiles ? " is-complete" : " is-active"}`}>
          <i>{hasFiles ? "✓" : "1"}</i><b>Adicionar</b>
        </span>
        <span className={`pdf-merge-step${canCombine ? " is-complete" : hasFiles ? " is-active" : ""}`}>
          <i>{canCombine ? "✓" : "2"}</i><b>Organizar</b>
        </span>
        <span className={`pdf-merge-step${hasResult ? " is-complete" : merge.state.busy || canCombine ? " is-active" : ""}`}>
          <i>{hasResult ? "✓" : "3"}</i><b>Gerar</b>
        </span>
      </div>

      <div className="pdf-merge-workspace">
        <section className="pdf-merge-panel pdf-merge-input-panel" aria-labelledby="pdf-merge-files-title">
          <header className="pdf-merge-panel-head">
            <div>
              <span>1 — ADICIONAR · 2 — ORGANIZAR</span>
              <h3 id="pdf-merge-files-title">Arquivos que formarão o PDF final</h3>
            </div>
            <small>A ordem desta lista será a ordem das páginas no arquivo combinado.</small>
          </header>

          <PdfDropZone
            busy={merge.state.busy}
            active={merge.state.isDropActive}
            hasFiles={hasFiles}
            inputRef={inputRef}
            onFiles={merge.addFiles}
            onEnter={merge.enterDropZone}
            onLeave={merge.leaveDropZone}
            onReset={merge.resetDropZone}
          />

          <PdfFileList
            items={merge.state.items}
            busy={merge.state.busy}
            count={merge.summary.count}
            totalSize={merge.formatBytes(merge.summary.bytes)}
            draggedId={merge.state.draggedId}
            dropTargetId={merge.state.dropTargetId}
            focusRequest={merge.focusRequest}
            formatBytes={merge.formatBytes}
            onAdd={() => inputRef.current?.click()}
            onClear={merge.clear}
            onMove={merge.moveItem}
            onRemove={merge.removeItem}
            onDragStart={merge.startDrag}
            onDragOver={merge.overDragTarget}
            onDrop={merge.dropOnItem}
            onDragEnd={merge.endDrag}
          />
        </section>

        <PdfOutputPanel
          busy={merge.state.busy}
          itemCount={itemCount}
          outputName={merge.state.outputName}
          progress={merge.state.progress}
          result={merge.state.result}
          resultSize={merge.formatBytes(merge.state.result?.outputBytes || 0)}
          onOutputName={merge.setOutputName}
          onCombine={merge.combine}
          onCancel={() => merge.cancel(true)}
          onDownload={merge.downloadAgain}
        />
      </div>
    </div>
  );
}
