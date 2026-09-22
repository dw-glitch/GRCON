import { mountReactIsland } from "../core/mount/mountReactIsland";
import { CoverDocumentApp } from "./CoverDocumentApp";
import { coverDocumentBridge } from "./services/coverDocumentBridge";
import type { CoverDebugState } from "./types/domain";

function installCompatibilityApi(): void {
  const debug = {} as { readonly state: CoverDebugState | null };
  Object.defineProperty(debug, "state", { enumerable: true, get: () => coverDocumentBridge.getDebugState() });
  window.GrconCoverDocumentUi = Object.freeze({
    activate: () => coverDocumentBridge.activate(),
    deactivate: () => coverDocumentBridge.deactivate(),
    clear: () => coverDocumentBridge.clear(),
    _debug: Object.freeze(debug),
  });
}

function mount(): void {
  installCompatibilityApi();
  const mounted = mountReactIsland({
    containerId: "grcon-cover-document-root",
    islandName: "CoverDocument",
    element: <CoverDocumentApp />,
    notifyMessage: "A ferramenta Adicionar Capa encontrou um erro inesperado. Recarregue a página.",
    fallback: <div className="cover-card" role="alert"><strong>Não foi possível abrir Adicionar Capa.</strong><p>Os demais módulos do GRCON continuam disponíveis.</p></div>,
  });
  if (mounted) window.GrconCoverDocumentReact = Object.freeze({ mounted: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
