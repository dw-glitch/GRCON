import { HistoricoEgrdtsApp } from "./HistoricoEgrdtsApp";
import { historicoEgrdtsAdapter as Adapter } from "./services/historicoEgrdtsAdapter";
import type { HistoricoEgrdtsLegacyWindow, HistoricoEgrdtsUiApi } from "./types/legacy-globals";
import { mountReactIsland } from "../core/mount/mountReactIsland";

function rootWindow(): HistoricoEgrdtsLegacyWindow {
  return window as unknown as HistoricoEgrdtsLegacyWindow;
}

function installCompatibilityApi(): void {
  const compatibilityState = {} as HistoricoEgrdtsUiApi["state"];
  Object.defineProperties(compatibilityState, {
    selectedId: {
      enumerable: true,
      get: () => Adapter.getSnapshot().selectedId,
    },
    filtered: {
      enumerable: true,
      get: () => Adapter.getSnapshot().filtered,
    },
  });

  rootWindow().GrconHistoryUi = Object.freeze({
    state: Object.freeze(compatibilityState),
    render: () => Adapter.requestRefresh(),
    activate: (view = "history") => Adapter.requestActivate(view),
    select: (id: string) => Adapter.requestSelect(id),
    performanceSnapshot: () => ({ ...Adapter.getSnapshot().performance }),
  });
}

function mount(): void {
  installCompatibilityApi();
  const mounted = mountReactIsland({
    containerId: "grcon-egrdt-history-root",
    islandName: "HistoricoEgrdts",
    element: <HistoricoEgrdtsApp />,
    notifyMessage: "A tela do Histórico de eGRDTs encontrou um erro inesperado. Recarregue a página.",
    fallback: (
      <section className="history-detail" role="alert">
        <div className="history-detail-empty">
          <strong>Não foi possível exibir o Histórico de eGRDTs</strong>
          <span>Os demais módulos do GRCON continuam disponíveis.</span>
        </div>
      </section>
    ),
  });
  if (mounted) rootWindow().GrconHistoricoEgrdtsReact = Object.freeze({ mounted: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
