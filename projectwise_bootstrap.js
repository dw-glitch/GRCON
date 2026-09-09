(function (root) {
  "use strict";
  let loading = null;
  function installNavigation() {
    if (document.querySelector("[data-projectwise-nav]")) return;
    const sidebar = document.querySelector(".ops-sidebar");
    const settings = sidebar?.querySelector("[data-ops-open-settings]");
    if (sidebar) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "ops-nav-button"; button.dataset.projectwiseNav = "sidebar";
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z"></path><path d="M8 8h8M8 16h8"></path></svg><span><strong>ProjectWise</strong><small>Conferência SIGEM × PW</small></span>';
      if (settings) sidebar.insertBefore(button, settings); else sidebar.appendChild(button);
    }
    const tabs = document.querySelector(".grcon-view-tabs");
    if (tabs) {
      const button = document.createElement("button");
      button.type = "button"; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", "false"); button.dataset.projectwiseNav = "tab";
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z"></path></svg><span><strong>ProjectWise</strong><small>Conferir passivo SIGEM × PW</small></span>';
      tabs.appendChild(button);
    }
  }
  function setLabels() {
    const subtitle = document.getElementById("brand-subtitle"), footer = document.getElementById("footer-view");
    if (subtitle) subtitle.textContent = "Conferência ProjectWise";
    if (footer) footer.textContent = "Conferência SIGEM × ProjectWise";
    document.title = "GRCON — Conferência SIGEM × ProjectWise";
  }
  function deactivate() {
    const module = document.getElementById("projectwise-module"); if (module) module.hidden = true;
    document.querySelectorAll("[data-projectwise-nav]").forEach((button) => { button.classList.remove("active"); button.removeAttribute("aria-current"); button.setAttribute("aria-selected", "false"); });
  }
  function showProjectWise() {
    ["grdt-module","requests-module","pdf-tools-module","analysis-history-module","history-module","dashboard-module","sigem-module"].forEach((id) => { const node=document.getElementById(id); if(node) node.hidden=true; });
    document.querySelectorAll("[data-grcon-view]").forEach((button) => { button.classList.remove("active"); button.removeAttribute("aria-current"); button.setAttribute("aria-selected", "false"); });
    document.querySelectorAll("[data-projectwise-nav]").forEach((button) => { button.classList.add("active"); button.setAttribute("aria-current", "page"); button.setAttribute("aria-selected", "true"); });
    const module=document.getElementById("projectwise-module"); if(module) module.hidden=false; setLabels();
  }
  async function ensureLoaded() {
    if (root.GrconProjectWiseUi) return root.GrconProjectWiseUi;
    if (loading) return loading;
    loading = (async () => {
      const loader = root.GRCONModuleLoader;
      if (!loader?.ensure) throw new Error("Carregador de módulos do GRCON indisponível.");
      await loader.ensure("xlsx"); await loader.ensure("excel");
      for (const script of ["projectwise_inventory_core.js","projectwise_reconciliation_core.js","projectwise_reconciliation_storage.js","projectwise_reconciliation_report.js","projectwise_reconciliation_app.js"]) await loader.ensure(script);
      if (!root.GrconProjectWiseUi) throw new Error("A área ProjectWise não foi inicializada corretamente.");
      return root.GrconProjectWiseUi;
    })().finally(() => { loading = null; });
    return loading;
  }
  async function activate() {
    try { showProjectWise(); const ui=await ensureLoaded(); await ui.activate(); showProjectWise(); root.dispatchEvent(new CustomEvent("grcon:module-ready",{detail:{module:"projectwise"}})); }
    catch(error) { deactivate(); const message=error?.message||"Não foi possível abrir a Conferência ProjectWise."; if(typeof root.GrconNotify==="function")root.GrconNotify(message,"error");else console.error(error); }
  }
  function bind() {
    installNavigation();
    document.addEventListener("click", (event) => {
      const projectwise=event.target?.closest?.("[data-projectwise-nav]");
      if(projectwise){event.preventDefault();activate();return;}
      if(event.target?.closest?.("[data-grcon-view]"))deactivate();
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
  root.GrconProjectWiseBootstrap=Object.freeze({activate,deactivate,installNavigation});
})(window);