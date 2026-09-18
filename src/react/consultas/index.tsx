/**
 * GRCON — Ponto de entrada da ilha React de Consultas.
 *
 * A ilha continua isolada em #grcon-consultas-root; apenas o mount e o
 * Error Boundary passaram para a fundação React compartilhada da FASE A.
 */
import { ConsultasApp } from "./ConsultasApp";
import { mountReactIsland } from "../core/mount/mountReactIsland";

function mount(): void {
  const mounted = mountReactIsland({
    containerId: "grcon-consultas-root",
    islandName: "Consultas",
    element: <ConsultasApp />,
    notifyMessage: "A tela de Consultas encontrou um erro inesperado. Recarregue a página.",
    fallback: (
      <div className="requests-panel" role="alert">
        <div className="requests-panel-head"><h3>Não foi possível exibir a Consulta</h3></div>
        <p>Ocorreu um erro inesperado ao carregar a tela. Recarregue a página; se persistir, avise o suporte.</p>
      </div>
    ),
  });
  if (mounted) window.GrconConsultasReact = Object.freeze({ mounted: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
