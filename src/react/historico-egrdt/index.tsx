import { HistoricoEgrdtApp } from "./HistoricoEgrdtApp";
import { historicoEgrdtAdapter as Adapter } from "./services/historicoEgrdtAdapter";
import { mountReactIsland } from "../core/mount/mountReactIsland";

function installCompatibilityApi(): void {
  window.GrconHistoryUi = Object.freeze({
    state: { react: true },
    render: () => Adapter.requestRefresh(),
    activate: (view: string) => Adapter.activateView(view),
    select: (id: string) => Adapter.requestSelect(id),
    performanceSnapshot: () => Adapter.getPerformanceSnapshot(),
  });
}

function mount(): void {
  installCompatibilityApi();
  const mounted = mountReactIsland({
    containerId: "grcon-history-root",
    islandName: "HistoricoEgrdt",
    element: <HistoricoEgrdtApp />,
    notifyMessage: "A tela do Histórico de eGRDTs encontrou um erro inesperado. Recarregue a página.",
    fallback: (
      <section className="history-list-card" role="alert">
        <header><div><span>HISTÓRICO DE eGRDTs</span><strong>Não foi possível exibir esta área</strong></div></header>
        <p>Ocorreu um erro inesperado ao carregar a interface. Os demais módulos do GRCON continuam disponíveis.</p>
      </section>
    ),
  });
  if (mounted) window.GrconHistoricoEgrdtReact = Object.freeze({ mounted: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
