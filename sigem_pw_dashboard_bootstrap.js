(function (root) {
  "use strict";

  const MODULE_ID = "sigem-pw-dashboard-module";
  let opening = false;

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }

  function navSvg() {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 18V9M10 18V5M16 18v-7M3 18h18"></path><path d="M5 6l5-3 6 5 4-3"></path></svg>';
  }

  function createPlaceholder() {
    let module = document.getElementById(MODULE_ID);
    if (module) return module;
    module = document.createElement("section");
    module.id = MODULE_ID;
    module.className = "module-view";
    module.hidden = true;
    module.setAttribute("role", "tabpanel");
    module.setAttribute("aria-label", "Dashboard SIGEM × ProjectWise");
    module.innerHTML = '<div style="padding:18px;color:var(--text-muted,#66798a)">Carregando Dashboard SIGEM × ProjectWise…</div>';
    document.querySelector("main.workspace")?.appendChild(module);
    return module;
  }

  function installNavigation() {
    if (document.querySelector("[data-spw-open]")) return;
    createPlaceholder();

    const sidebar = document.querySelector(".ops-sidebar");
    const sidebarBefore = sidebar?.querySelector('[data-grcon-view="sigem"]');
    if (sidebar) {
      const button = document.createElement("button");
      button.className = "ops-nav-button";
      button.type = "button";
      button.dataset.spwOpen = "sidebar";
      button.innerHTML = `${navSvg()}<span><strong>SIGEM × PW</strong><small>Dashboard comparativo</small></span>`;
      if (sidebarBefore) sidebar.insertBefore(button, sidebarBefore);
      else sidebar.appendChild(button);
    }

    const tabs = document.querySelector(".grcon-view-tabs");
    const tabBefore = document.getElementById("tab-sigem");
    if (tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.spwOpen = "tab";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.setAttribute("aria-controls", MODULE_ID);
      button.innerHTML = `${navSvg()}<span><strong>Dashboard SIGEM × PW</strong><small>Consulta Geral × ProjectWise</small></span>`;
      if (tabBefore) tabs.insertBefore(button, tabBefore);
      else tabs.appendChild(button);
    }

    document.querySelectorAll("[data-spw-open]").forEach((button) => button.addEventListener("click", () => void openDashboard()));
  }

  function setAreaLabel() {
    const subtitle = document.getElementById("brand-subtitle");
    const footer = document.getElementById("footer-view");
    if (subtitle) subtitle.textContent = "Dashboard SIGEM × ProjectWise";
    if (footer) footer.textContent = "Dashboard SIGEM × ProjectWise";
    document.title = "GRCON — Dashboard SIGEM × ProjectWise";
  }

  function deactivate() {
    const module = document.getElementById(MODULE_ID);
    if (module) module.hidden = true;
    document.querySelectorAll("[data-spw-open]").forEach((button) => {
      button.classList.remove("active");
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", "false");
    });
  }

  function activateShell() {
    const module = createPlaceholder();
    document.querySelectorAll("main.workspace > section").forEach((section) => { section.hidden = section !== module; });
    document.querySelectorAll("[data-grcon-view], [data-pc-open]").forEach((button) => {
      button.classList.remove("active");
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", "false");
      if (button.hasAttribute("aria-current")) button.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-spw-open]").forEach((button) => {
      button.classList.add("active");
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", "true");
    });
    module.hidden = false;
    setAreaLabel();
  }

  async function ensureRuntime() {
    if (!root.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await root.GRCONModuleLoader.ensure("sigem_pw_dashboard_core.js");
    await root.GRCONModuleLoader.ensure("sigem_pw_dashboard_app.js");
    await root.GRCONModuleLoader.ensure("sigem_pw_revision_core.js");
    await root.GRCONModuleLoader.ensure("sigem_pw_revision_section.js");
    await root.GRCONModuleLoader.ensure("sigem_pw_history_core.js");
    await root.GRCONModuleLoader.ensure("sigem_pw_history_app.js");
    if (!root.GrconSigemPwDashboard || !root.GrconSigemPwDashboardUi || !root.GrconSigemPwRevision || !root.GrconSigemPwRevisionUi || !root.GrconSigemPwHistory || !root.GrconSigemPwHistoryUi) {
      throw new Error("O Dashboard SIGEM × PW não foi inicializado corretamente.");
    }
  }

  async function openDashboard() {
    if (opening) return;
    opening = true;
    try {
      activateShell();
      await ensureRuntime();
      activateShell();
      // Não recriar o shell a cada retorno ao Dashboard: evita listeners duplicados,
      // piscadas de interface e renderizações desnecessárias.
      if (!root.GrconSigemPwDashboardUi.state?.ready) await root.GrconSigemPwDashboardUi.activate();
      await root.GrconSigemPwRevisionUi.activate();
      await root.GrconSigemPwHistoryUi.activate();
    } catch (error) {
      console.error("[SIGEM×PW] abertura:", error);
      deactivate();
      notify(error.message || "Não foi possível abrir o Dashboard SIGEM × PW.", "error");
    } finally { opening = false; }
  }

  function installDeactivationBridge() {
    document.addEventListener("click", (event) => {
      const target = event.target && event.target.closest ? event.target.closest("[data-grcon-view], [data-pc-open]") : null;
      if (target) deactivate();
    }, true);
  }

  function init() {
    installNavigation();
    installDeactivationBridge();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  root.GrconSigemPwDashboardBootstrap = Object.freeze({ open: openDashboard, deactivate });
})(window);
