import { HistoricoAnalisesApp } from "./HistoricoAnalisesApp";
import { historicoAnalisesAdapter as Adapter } from "./services/historicoAnalisesAdapter";
import type { AnalysisDocument } from "./types/domain";
import { mountReactIsland } from "../core/mount/mountReactIsland";

function installCompatibilityApi(): void {
  window.GrconAnalysisHistoryUi = Object.freeze({
    state: { react: true },
    render: () => Adapter.requestRefresh(),
    openDetail: (item: AnalysisDocument) => Adapter.requestOpenDetail(item),
  });
}

function mount(): void {
  installCompatibilityApi();
  const mounted = mountReactIsland({
    containerId: "grcon-analysis-history-root",
    islandName: "HistoricoAnalises",
    element: <HistoricoAnalisesApp />,
    notifyMessage: "A tela do Histórico de análises encontrou um erro inesperado. Recarregue a página.",
    fallback: (
      <section className="analysis-history-card" role="alert">
        <header><div><span>HISTÓRICO DE ANÁLISES</span><strong>Não foi possível exibir esta área</strong></div></header>
        <p>Ocorreu um erro inesperado ao carregar a interface. Os demais módulos do GRCON continuam disponíveis.</p>
      </section>
    ),
  });
  if (mounted) window.GrconHistoricoAnalisesReact = Object.freeze({ mounted: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
