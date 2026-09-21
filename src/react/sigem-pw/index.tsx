import { SigemPwDashboardApp } from "./SigemPwDashboardApp";
import { sigemPwDashboardAdapter } from "./services/sigemPwDashboardAdapter";
import { mountReactIsland } from "../core/mount/mountReactIsland";

function ensureStyles(): void {
  if (document.head.querySelector('link[data-grcon-sigem-pw="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "sigem-pw-dashboard.css";
  link.dataset.grconSigemPw = "true";
  document.head.appendChild(link);
}

function installCompatibilityApi(): void {
  window.GrconSigemPwDashboardUi = Object.freeze({
    activate: () => sigemPwDashboardAdapter.activate(),
    refresh: (reason?: string) => sigemPwDashboardAdapter.refresh(reason),
    clearPreStage7BasesOnce: () => sigemPwDashboardAdapter.clearPreStage7BasesOnce(),
    state: sigemPwDashboardAdapter.state,
  });
}

function mount(): void {
  ensureStyles();
  installCompatibilityApi();
  const mounted = mountReactIsland({
    containerId: "grcon-sigem-pw-root",
    islandName: "SigemPwDashboard",
    element: <SigemPwDashboardApp />,
    notifyMessage: "A tela do Dashboard SIGEM × PW encontrou um erro inesperado. Recarregue a página.",
    fallback: (
      <section className="spw-list-card" role="alert">
        <div className="spw-empty"><div><strong>Não foi possível exibir o Dashboard SIGEM × PW</strong><span>Os demais módulos do GRCON continuam disponíveis.</span></div></div>
      </section>
    ),
  });
  if (mounted) window.GrconSigemPwDashboardReact = Object.freeze({ mounted: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
