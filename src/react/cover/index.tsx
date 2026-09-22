import { CoverToolApp } from "./CoverToolApp";
import { coverBridge } from "./services/coverBridge";
import { mountReactIsland } from "../core/mount/mountReactIsland";
import type { CoverDebugState } from "./types/domain";

function installCompatibilityApi() {
  const debug = {} as { readonly state: CoverDebugState | null };
  Object.defineProperty(debug, "state", { enumerable: true, get: () => coverBridge.getDebugState() });
  window.GrconCoverUi = Object.freeze({
    activate: () => coverBridge.activate(),
    deactivate: () => coverBridge.deactivate(),
    _debug: Object.freeze(debug),
  });
}
function mount() {
  installCompatibilityApi();
  const mounted = mountReactIsland({
    containerId: "grcon-cover-root", islandName: "CoverTool", element: <CoverToolApp/>,
    notifyMessage: "A ferramenta Adicionar Capa encontrou um erro inesperado.",
    fallback: <div className="cover-card" role="alert"><h3>Não foi possível abrir Adicionar Capa</h3><p>Recarregue a página. Os demais módulos continuam disponíveis.</p></div>,
  });
  if (mounted) window.GrconCoverReact = Object.freeze({ mounted: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();