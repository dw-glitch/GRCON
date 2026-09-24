import { mountReactIsland } from "../../core/mount/mountReactIsland";
import { SigemPwEvolutionApp } from "./SigemPwEvolutionApp";
import { sigemPwEvolutionAdapter } from "./services/sigemPwEvolutionAdapter";

function ensureStyles(): void {
  if (document.head.querySelector('link[data-grcon-sigem-pw-evolution="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "sigem-pw-evolution.css";
  link.dataset.grconSigemPwEvolution = "true";
  document.head.appendChild(link);
}

function installCompatibilityApi(): void {
  window.GrconSigemPwEvolutionUi = Object.freeze({
    activate: () => sigemPwEvolutionAdapter.activate(),
    refresh: (forceLd?: boolean) => sigemPwEvolutionAdapter.refresh(Boolean(forceLd)),
    state: sigemPwEvolutionAdapter.state,
    filteredRows: () => sigemPwEvolutionAdapter.state.filteredRows,
    exportFilteredRows: () => sigemPwEvolutionAdapter.exportFilteredRows(),
  });
}

function mount(): void {
  ensureStyles();
  installCompatibilityApi();
  mountReactIsland({
    containerId: "grcon-sigem-pw-evolution-root",
    islandName: "SigemPwEvolution",
    element: <SigemPwEvolutionApp />,
    notifyMessage: "A tela de Evolução SIGEM × PW encontrou um erro inesperado. Recarregue o módulo.",
    fallback: (
      <section id="spw-evolution-section" className="spw-evo-v2" role="alert">
        <div className="spw-evo-empty">
          <strong>Não foi possível exibir a Evolução SIGEM × PW</strong>
          <span>O Dashboard principal continua disponível.</span>
        </div>
      </section>
    ),
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
