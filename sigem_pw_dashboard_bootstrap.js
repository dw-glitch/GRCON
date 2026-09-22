(function (root) {
  "use strict";

  const MODULE_ID = "sigem-pw-dashboard-module";
  const PRE_STAGE7_RESET_KEY = "sigem-pw-stage7-preupdate-reset-v1";
  let opening = false;
  let deferredEnhancements = null;
  let evolutionRuntime = null;

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }

  function navSvg() {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 18V9M10 18V5M16 18v-7M3 18h18"></path><path d="M5 6l5-3 6 5 4-3"></path></svg>';
  }

  function createPlaceholder() {
    let module = document.getElementById(MODULE_ID);
    if (!module) {
      module = document.createElement("section");
      module.id = MODULE_ID;
      module.className = "module-view";
      module.hidden = true;
      module.setAttribute("role", "tabpanel");
      module.setAttribute("aria-label", "Dashboard SIGEM × ProjectWise");
      document.querySelector("main.workspace")?.appendChild(module);
    }
    if (!module.querySelector("#grcon-sigem-pw-root")) {
      module.innerHTML = '<div id="grcon-sigem-pw-root"><div style="padding:18px;color:var(--text-muted,#66798a)">Carregando Dashboard SIGEM × ProjectWise…</div></div>';
    }
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
      if (sidebarBefore?.parentElement === sidebar) sidebar.insertBefore(button, sidebarBefore);
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
      if (tabBefore?.parentElement === tabs) tabs.insertBefore(button, tabBefore);
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

  async function preserveExistingStage7Data() {
    const Core = root.GrconSigemPwDashboard;
    if (!Core?.kvGet || !Core?.kvSet) throw new Error("Persistência do Dashboard SIGEM × PW indisponível.");
    const marker = await Core.kvGet(PRE_STAGE7_RESET_KEY, false);
    if (marker) return false;
    await Core.kvSet(PRE_STAGE7_RESET_KEY, {
      completed: true,
      completedAt: new Date().toISOString(),
      mode: "preserve-existing-data",
    });
    console.info("[SIGEM×PW][Migration] Bases e histórico existentes preservados; limpeza Stage 7 desativada.");
    return true;
  }

  async function ensureRuntime() {
    if (!root.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await root.GRCONModuleLoader.ensure("sigem_pw_dashboard_core.js");
    await root.GRCONModuleLoader.ensure("sigem_pw_readiness_core.js");
    await root.GRCONModuleLoader.ensure("sigem_pw_scope_fix.js");

    // O histórico captura as dependências no momento em que o módulo é avaliado.
    // O motor de revisão precisa existir antes do History Core.
    await root.GRCONModuleLoader.ensure("sigem_pw_revision_core.js");
    const Revision = root.GrconSigemPwRevision;
    if (!Revision || (typeof Revision.analyze !== "function" && typeof Revision.analyzeAsync !== "function")) {
      throw new Error("O motor de revisão do Dashboard SIGEM × PW não foi inicializado. O histórico não será carregado para preservar a base vigente.");
    }

    await root.GRCONModuleLoader.ensure("sigem_pw_history_core.js");
    await root.GRCONModuleLoader.ensure("sigem_pw_history_management.js");

    // A ilha React é montada somente depois dos contratos obrigatórios.
    await root.GRCONModuleLoader.ensure("react-dist/sigem-pw-dashboard-app.js");

    if (!root.GrconSigemPwDashboard || !root.GrconSigemPwReadiness || !root.GrconSigemPwScopeFix || !root.GrconSigemPwDashboardUi || !root.GrconSigemPwRevision || !root.GrconSigemPwHistory || !root.GrconSigemPwHistoryManagement) {
      throw new Error("O Dashboard SIGEM × PW não foi inicializado corretamente.");
    }

    await preserveExistingStage7Data();
  }

  function afterFirstPaint() {
    return new Promise((resolve) => {
      const schedule = () => {
        if (typeof root.requestIdleCallback === "function") root.requestIdleCallback(resolve, { timeout: 1200 });
        else root.setTimeout(resolve, 40);
      };
      if (typeof root.requestAnimationFrame === "function") root.requestAnimationFrame(() => root.requestAnimationFrame(schedule));
      else schedule();
    });
  }

  function loadDeferredEnhancements() {
    if (deferredEnhancements) return deferredEnhancements;
    deferredEnhancements = (async () => {
      await afterFirstPaint();
      // A UI de Revisões já pertence à árvore React do Dashboard. Somente a
      // ativação/análise continua adiada para preservar a primeira pintura.
      await root.GRCONModuleLoader.ensure("sigem_pw_dashboard_ui_audit.js");
      root.GrconSigemPwUiAudit?.activate?.();
      const module = document.getElementById(MODULE_ID);
      if (module && !module.hidden) await root.GrconSigemPwRevisionUi?.activate?.();
    })().catch((error) => {
      deferredEnhancements = null;
      console.warn("[SIGEM×PW] complementos adiados:", error);
    });
    return deferredEnhancements;
  }

  async function openDashboard() {
    if (opening) return;
    opening = true;
    try {
      activateShell();
      await ensureRuntime();
      activateShell();
      await root.GrconSigemPwDashboardUi.activate();
      void loadDeferredEnhancements();
    } catch (error) {
      console.error("[SIGEM×PW] abertura:", error);
      deactivate();
      notify(error.message || "Não foi possível abrir o Dashboard SIGEM × PW.", "error");
    } finally { opening = false; }
  }

  async function openEvolution() {
    if (!evolutionRuntime) {
      evolutionRuntime = (async () => {
        if (!root.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
        await root.GRCONModuleLoader.ensure("sigem_pw_evolution_core.js");
        await root.GRCONModuleLoader.ensure("sigem_pw_evolution_app.js");
        if (!root.GrconSigemPwEvolution || !root.GrconSigemPwEvolutionUi?.activate) throw new Error("A Evolução SIGEM × PW não foi inicializada corretamente.");
        await root.GrconSigemPwEvolutionUi.activate();
        return root.GrconSigemPwEvolutionUi;
      })().catch((error) => { evolutionRuntime = null; throw error; });
    }
    try {
      const ui = await evolutionRuntime;
      const section = document.getElementById("spw-evolution-section");
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      return ui;
    } catch (error) {
      console.error("[SIGEM×PW] evolução:", error);
      notify(error.message || "Não foi possível abrir a Evolução SIGEM × PW.", "error");
      throw error;
    }
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

  root.GrconSigemPwDashboardBootstrap = Object.freeze({ open: openDashboard, openEvolution, deactivate });
})(window);