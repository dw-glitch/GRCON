/* GRCON — indicador visual das etapas da GRDT.
   Somente lê estados existentes da interface, sem alterar regras ou ações documentais. */
(function () {
  "use strict";

  function init() {
    const path = document.getElementById("grdt-stages");
    if (!path) return;
    const steps = Array.from(path.querySelectorAll("[data-grdt-stage]"));
    if (steps.length !== 4) return;

    const progress = document.getElementById("progress");
    const results = document.getElementById("results-section");
    const teams = document.getElementById("egrdt-teams-ready");
    const announcement = document.getElementById("grdt-stage-announcement");
    const titles = ["Preparar", "Analisar", "Revisar", "Emitir"];
    let previous = -1;

    function isShown(node) {
      return Boolean(node && !node.hidden &&
        node.getAttribute("aria-hidden") !== "true" &&
        node.style.display !== "none");
    }

    function resolveStage() {
      if (isShown(progress)) return 1;
      if (isShown(results)) return isShown(teams) ? 3 : 2;
      return 0;
    }

    function sync() {
      const active = resolveStage();
      if (active === previous) return;
      previous = active;
      steps.forEach((step, index) => {
        step.classList.toggle("is-current", index === active);
        step.classList.toggle("is-complete", index < active);
        if (index === active) {
          if (step.getAttribute("aria-current") !== "step") step.setAttribute("aria-current", "step");
        } else if (step.hasAttribute("aria-current")) {
          step.removeAttribute("aria-current");
        }
      });
      path.dataset.activeStage = String(active + 1);
      if (announcement) announcement.textContent = "Etapa atual: " + titles[active] + ".";
    }

    const observer = new MutationObserver(sync);
    [progress, results, teams].forEach((node) => {
      if (node) observer.observe(node, {
        attributes: true,
        attributeFilter: ["hidden", "style", "aria-hidden"],
      });
    });
    document.addEventListener("grcon:triage-rendered", sync);
    window.addEventListener("pageshow", sync);
    sync();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
