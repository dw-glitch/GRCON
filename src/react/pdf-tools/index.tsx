import { PdfMergeApp } from "./PdfMergeApp";
import { pdfMergeBridge } from "./services/pdfMergeAdapter";
import type { PdfMergeDebugState } from "./types/domain";
import { mountReactIsland } from "../core/mount/mountReactIsland";

function installCompatibilityApi(): void {
  const debug = {} as { readonly state: PdfMergeDebugState | null };
  Object.defineProperty(debug, "state", {
    enumerable: true,
    get: () => pdfMergeBridge.getDebugState(),
  });

  window.GrconPdfMergeUi = Object.freeze({
    activate: () => pdfMergeBridge.activate(),
    deactivate: () => pdfMergeBridge.deactivate(),
    addFiles: (files: FileList | File[] | null | undefined) => pdfMergeBridge.addFiles(files),
    clear: () => pdfMergeBridge.clear(),
    _debug: Object.freeze(debug),
  });
}

function mount(): void {
  installCompatibilityApi();
  const mounted = mountReactIsland({
    containerId: "grcon-pdf-tools-root",
    islandName: "PdfTools",
    element: <PdfMergeApp />,
    notifyMessage: "A tela de Combinar PDFs encontrou um erro inesperado. Recarregue a página.",
    fallback: (
      <div className="pdf-merge-panel" role="alert">
        <header className="pdf-merge-panel-head"><div><span>COMBINAR PDFs</span><h3>Não foi possível exibir esta área</h3></div></header>
        <p className="pdf-merge-output-note">Ocorreu um erro inesperado ao carregar a interface. Os demais módulos do GRCON continuam disponíveis.</p>
      </div>
    ),
  });
  if (mounted) window.GrconPdfMergeReact = Object.freeze({ mounted: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
