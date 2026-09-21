import { useRef } from "react";
import { PdfDropZone } from "./components/PdfDropZone";
import { PdfFileList } from "./components/PdfFileList";
import { PdfOutputPanel } from "./components/PdfOutputPanel";
import { usePdfMerge } from "./hooks/usePdfMerge";

export function PdfMergeApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const merge = usePdfMerge();

  return (
    <>
      <header className="ops-page-heading pdf-merge-heading">
        <div><h2>Combinar PDFs</h2><p>Junte vários PDFs em um único arquivo, na ordem escolhida.</p></div>
        <span className="pdf-merge-local-badge">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z" /></svg>
          Somente neste navegador
        </span>
      </header>

      <p className="pdf-merge-privacy" id="pdf-merge-privacy">
        {merge.state.busy
          ? "Processando localmente. Não feche esta aba até o arquivo ficar pronto."
          : "Processamento 100% local: nenhum arquivo é enviado, armazenado ou registrado no banco."}
      </p>

      <div className="pdf-merge-workspace">
        <section className="pdf-merge-panel" aria-labelledby="pdf-merge-files-title">
          <header className="pdf-merge-panel-head">
            <div><span>ARQUIVOS DE ENTRADA</span><h3 id="pdf-merge-files-title">Arquivos que serão combinados</h3></div>
            <small>A ordem desta lista será a ordem das páginas no PDF final.</small>
          </header>

          <PdfDropZone
            busy={merge.state.busy}
            active={merge.state.isDropActive}
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
          itemCount={merge.state.items.length}
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
    </>
  );
}
