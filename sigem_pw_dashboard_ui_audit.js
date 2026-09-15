(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwUiAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STYLE_ID = "spw-dashboard-ui-audit-style";
  const MODULE_ID = "sigem-pw-dashboard-module";
  const INPUT_DEBOUNCE_MS = 180;
  const DEBOUNCED_INPUT_IDS = new Set([
    "spw-query",
    "spw-evo-filter-query",
    "spw-evo-filter-tag",
    "spw-evo-filter-eap",
  ]);
  const GUARDED_APIS = Object.freeze([
    "GrconSigemPwAuditUi",
    "GrconSigemPwRevisionUi",
    "GrconSigemPwHistoryUi",
    "GrconSigemPwHistoryManagement",
    "GrconSigemPwEvolutionUi",
  ]);
  const state = {
    installed: false,
    observer: null,
    resizeTimer: 0,
    lastIssues: [],
    inputTimers: new Map(),
    replayedInputs: typeof WeakSet === "function" ? new WeakSet() : null,
    activationGuards: new Map(),
    interactionToken: 0,
    debugResizeInstalled: false,
    inputGuardInstalled: false,
    scrollGuardInstalled: false,
    longTaskObserver: null,
    performance: {
      activationRuns: {},
      activationSkips: {},
      activationMs: {},
      debouncedInputs: 0,
      suppressedAutoScrolls: 0,
      restoredScrollPositions: 0,
      longTasks: [],
    },
  };

  function nowMs() {
    return root.performance && typeof root.performance.now === "function" ? root.performance.now() : Date.now();
  }

  function dashboard() {
    return root.document && root.document.getElementById(MODULE_ID);
  }

  function dashboardModel() {
    return root.GrconSigemPwDashboardUi && root.GrconSigemPwDashboardUi.state
      ? root.GrconSigemPwDashboardUi.state.model
      : null;
  }

  function increment(bucket, key, value) {
    const target = state.performance[bucket];
    if (!target) return;
    target[key] = (Number(target[key]) || 0) + (value === undefined ? 1 : value);
  }

  function ensureStyle() {
    if (!root.document || root.document.getElementById(STYLE_ID)) return;
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Correções locais do Dashboard SIGEM × PW. Não altera o design system global. */
      #${MODULE_ID}{container-type:inline-size;min-width:0;overflow-x:clip;overflow-anchor:none}
      #${MODULE_ID} #spw-progress{box-sizing:border-box;min-height:33px}
      #${MODULE_ID} #spw-progress[hidden]{display:flex!important;visibility:hidden!important;pointer-events:none!important}
      #${MODULE_ID} .spw-readiness{min-height:54px;box-sizing:border-box}
      #${MODULE_ID} .spw-table-wrap,#${MODULE_ID} .spw-rev-table-wrap,#${MODULE_ID} .spw-history-table-wrap,#${MODULE_ID} .spw-evo-table-wrap{overflow-anchor:none;overscroll-behavior:contain}
      #${MODULE_ID} #spw-revision-section,#${MODULE_ID} #spw-history-section,#${MODULE_ID} #spw-evolution-section{content-visibility:auto;contain-intrinsic-size:auto 720px}
      #${MODULE_ID} .spw-rev-cards{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))!important;gap:10px!important;align-items:stretch!important}
      #${MODULE_ID} .spw-rev-card{position:relative;display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:flex-start!important;gap:0!important;min-width:0!important;min-height:132px!important;height:100%;padding:14px 15px 13px!important;white-space:normal!important;overflow:visible!important;text-align:left!important;line-height:1.25!important}
      #${MODULE_ID} .spw-rev-card strong{display:block!important;flex:0 0 auto!important;width:100%;margin:0!important;font-size:clamp(1.35rem,1.1rem + .55vw,1.75rem)!important;line-height:1!important;font-variant-numeric:tabular-nums;color:var(--text-strong,#17324a);white-space:nowrap!important;overflow:hidden;text-overflow:ellipsis}
      #${MODULE_ID} .spw-rev-card b{display:block!important;flex:0 0 auto!important;width:100%;margin:9px 0 0!important;font-size:.78rem!important;line-height:1.28!important;color:var(--text-strong,#294258);white-space:normal!important;word-break:normal!important;overflow-wrap:break-word!important}
      #${MODULE_ID} .spw-rev-card small{display:block!important;flex:0 0 auto!important;width:100%;margin:auto 0 0!important;padding-top:10px!important;font-size:.69rem!important;line-height:1.38!important;color:var(--text-muted,#66798a);white-space:normal!important;word-break:normal!important;overflow-wrap:break-word!important}
      #${MODULE_ID} .spw-rev-card:hover{transform:none!important}
      #${MODULE_ID} .spw-rev-card:focus-visible{outline:3px solid color-mix(in srgb,var(--brand-500,#2789b6) 42%,transparent)!important;outline-offset:2px!important}
      #${MODULE_ID} .spw-rev-card.active{background:color-mix(in srgb,var(--brand-50,#eaf5fb) 64%,var(--surface,#fff))!important;box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--brand-500,#2789b6) 34%,transparent),0 6px 20px rgba(32,56,85,.08)!important}
      #${MODULE_ID} .spw-kpis{grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))!important;align-items:stretch}
      #${MODULE_ID} .spw-kpi{min-width:0;height:100%}#${MODULE_ID} .spw-kpi strong{font-variant-numeric:tabular-nums}
      #${MODULE_ID} .spw-relations{grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))!important;align-items:stretch}
      #${MODULE_ID} .spw-relation{min-width:0;height:100%;white-space:normal}#${MODULE_ID} .spw-relation b,#${MODULE_ID} .spw-relation small{white-space:normal;word-break:normal;overflow-wrap:break-word}
      #${MODULE_ID} .spw-action-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))!important;align-items:stretch}
      #${MODULE_ID} .spw-action-card{display:flex;flex-direction:column;min-width:0;min-height:112px;height:100%}#${MODULE_ID} .spw-action-card strong{font-variant-numeric:tabular-nums}#${MODULE_ID} .spw-action-card small{margin-top:auto!important;padding-top:7px;white-space:normal;overflow-wrap:break-word}
      #${MODULE_ID} .spw-delta-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,185px),1fr))!important;align-items:stretch}
      #${MODULE_ID} .spw-delta-card{display:flex;flex-direction:column;min-width:0;height:100%}#${MODULE_ID} .spw-delta-card strong{font-variant-numeric:tabular-nums}#${MODULE_ID} .spw-delta-card small{margin-top:auto!important;padding-top:6px;white-space:normal;overflow-wrap:break-word}
      #${MODULE_ID} .spw-quality-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr))!important}
      #${MODULE_ID} .spw-filter-card{grid-template-columns:repeat(auto-fit,minmax(min(100%,165px),1fr))!important;min-width:0}
      #${MODULE_ID} .spw-filter-card label,#${MODULE_ID} .spw-filter-card select{min-width:0;max-width:100%}
      #${MODULE_ID} .spw-rev-toolbar{grid-template-columns:repeat(auto-fit,minmax(min(100%,155px),1fr))!important;min-width:0}
      #${MODULE_ID} .spw-rev-toolbar label,#${MODULE_ID} .spw-rev-toolbar input,#${MODULE_ID} .spw-rev-toolbar select{min-width:0;max-width:100%}
      #${MODULE_ID} .spw-base-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))!important}
      #${MODULE_ID} .spw-base-card{min-width:0}#${MODULE_ID} .spw-base-card>div:first-child{min-width:0}#${MODULE_ID} .spw-base-card strong{max-width:100%}
      #${MODULE_ID} .spw-history-charts{grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))!important}
      #${MODULE_ID} .spw-history-card,#${MODULE_ID} .spw-chart-card,#${MODULE_ID} .spw-table-card,#${MODULE_ID} .spw-rev-panel,#${MODULE_ID} .spw-history-table-card{min-width:0;max-width:100%}
      #${MODULE_ID} .spw-chart-wrap,#${MODULE_ID} .spw-table-wrap,#${MODULE_ID} .spw-rev-table-wrap,#${MODULE_ID} .spw-history-table-wrap,#${MODULE_ID} .spw-drawer-table{max-width:100%;overscroll-behavior-inline:contain}
      #${MODULE_ID} .spw-page-heading,#${MODULE_ID} .spw-section-title,#${MODULE_ID} .spw-card-head,#${MODULE_ID} .spw-rev-head,#${MODULE_ID} .spw-history-head,#${MODULE_ID} .spw-history-table-head,#${MODULE_ID} .spw-history-question{flex-wrap:wrap;min-width:0}
      #${MODULE_ID} .spw-page-heading>div,#${MODULE_ID} .spw-section-title>div,#${MODULE_ID} .spw-card-head>div,#${MODULE_ID} .spw-rev-head>div,#${MODULE_ID} .spw-history-head>div,#${MODULE_ID} .spw-history-table-head>div,#${MODULE_ID} .spw-history-question>div{min-width:0}
      #${MODULE_ID} .spw-page-heading p,#${MODULE_ID} .spw-section-title p,#${MODULE_ID} .spw-card-head small,#${MODULE_ID} .spw-rev-head p,#${MODULE_ID} .spw-history-head p,#${MODULE_ID} .spw-history-question span,#${MODULE_ID} .spw-history-source{overflow-wrap:break-word;word-break:normal}
      #${MODULE_ID} .spw-inner-nav{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin}#${MODULE_ID} .spw-inner-nav button{flex:0 0 auto;white-space:nowrap}
      #${MODULE_ID} .spw-rev-summary{flex-wrap:wrap}#${MODULE_ID} .spw-rev-summary span{min-width:0;white-space:normal}
      #${MODULE_ID} .spw-rev-detail-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))!important}
      #${MODULE_ID} .spw-history-source{max-width:min(100%,540px);white-space:normal}
      #${MODULE_ID} .spw-history-question b{white-space:normal;text-align:right}
      #${MODULE_ID} .spw-history-actions,#${MODULE_ID} .spw-heading-actions,#${MODULE_ID} .spw-base-actions,#${MODULE_ID} .spw-legend,#${MODULE_ID} .spw-h-legend{max-width:100%;flex-wrap:wrap}
      #${MODULE_ID} button,#${MODULE_ID} select,#${MODULE_ID} input,#${MODULE_ID} textarea{font-size:max(.75rem,12px)}
      @media(max-width:1450px){#${MODULE_ID} .spw-rev-cards{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
      @media(max-width:900px){#${MODULE_ID} .spw-rev-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}#${MODULE_ID} .spw-history-question b{text-align:left}}
      @media(max-width:620px){#${MODULE_ID} .spw-rev-cards,#${MODULE_ID} .spw-kpis,#${MODULE_ID} .spw-relations,#${MODULE_ID} .spw-action-grid,#${MODULE_ID} .spw-delta-grid,#${MODULE_ID} .spw-quality-grid,#${MODULE_ID} .spw-filter-card,#${MODULE_ID} .spw-rev-toolbar,#${MODULE_ID} .spw-base-grid,#${MODULE_ID} .spw-history-charts{grid-template-columns:1fr!important}#${MODULE_ID} .spw-rev-card{min-height:118px!important}#${MODULE_ID} .spw-page-heading,#${MODULE_ID} .spw-section-title,#${MODULE_ID} .spw-rev-head,#${MODULE_ID} .spw-history-head,#${MODULE_ID} .spw-history-question{display:grid!important}#${MODULE_ID} .spw-history-source{text-align:left;margin-left:0}}
    `;
    root.document.head.appendChild(style);
  }

  function syncRevisionCardAccessibility() {
    if (!root.document) return;
    root.document.querySelectorAll(`#${MODULE_ID} .spw-rev-card`).forEach((card) => {
      const selected = card.classList.contains("active");
      card.setAttribute("aria-pressed", String(selected));
      const value = card.querySelector("strong")?.textContent?.trim() || "";
      const title = card.querySelector("b")?.textContent?.trim() || "";
      const note = card.querySelector("small")?.textContent?.trim() || "";
      if (title) card.setAttribute("aria-label", [value, title, note].filter(Boolean).join(" — "));
    });
  }

  function intersects(a, b) {
    return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  }

  function auditLayout() {
    if (!root.document) return [];
    const module = root.document.getElementById(MODULE_ID);
    if (!module || module.hidden) return [];
    const issues = [];
    module.querySelectorAll(".spw-rev-card").forEach((card, index) => {
      const parts = [card.querySelector("strong"), card.querySelector("b"), card.querySelector("small")].filter(Boolean);
      for (let i = 0; i < parts.length; i += 1) {
        const first = parts[i].getBoundingClientRect();
        if (parts[i].scrollWidth > parts[i].clientWidth + 2 && i !== 2) issues.push({ type: "text-overflow", target: `revision-card-${index}`, part: i });
        for (let j = i + 1; j < parts.length; j += 1) {
          if (intersects(first, parts[j].getBoundingClientRect())) issues.push({ type: "overlap", target: `revision-card-${index}`, parts: [i, j] });
        }
      }
      if (card.scrollWidth > card.clientWidth + 2) issues.push({ type: "card-overflow", target: `revision-card-${index}` });
    });
    module.querySelectorAll(".spw-kpi,.spw-relation,.spw-action-card,.spw-delta-card,.spw-quality-card,.spw-filter-card,.spw-card-head,.spw-history-question").forEach((node, index) => {
      if (node.scrollWidth > node.clientWidth + 3) issues.push({ type: "container-overflow", target: `${node.className}-${index}` });
    });
    state.lastIssues = issues;
    if (issues.length && root.GRCON_DEBUG_UI === true && root.console?.warn) root.console.warn("[SIGEM×PW][UX audit]", issues);
    return issues;
  }

  function scheduleAudit() {
    if (root.GRCON_DEBUG_UI !== true || !root.setTimeout) return;
    if (state.resizeTimer) root.clearTimeout(state.resizeTimer);
    state.resizeTimer = root.setTimeout(() => {
      state.resizeTimer = 0;
      syncRevisionCardAccessibility();
      auditLayout();
    }, 160);
  }

  function installObserver() {
    if (root.GRCON_DEBUG_UI !== true || !root.document || state.observer || typeof root.MutationObserver !== "function") return;
    const host = dashboard();
    if (!host) return;
    state.observer = new root.MutationObserver(() => scheduleAudit());
    state.observer.observe(host, { childList: true, subtree: true });
  }

  function disableProductionObserver() {
    if (root.GRCON_DEBUG_UI === true) return;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.resizeTimer && root.clearTimeout) {
      root.clearTimeout(state.resizeTimer);
      state.resizeTimer = 0;
    }
    if (state.debugResizeInstalled && root.removeEventListener) {
      root.removeEventListener("resize", scheduleAudit);
      state.debugResizeInstalled = false;
    }
  }

  function installDebugPerformanceObserver() {
    if (root.GRCON_DEBUG_PERF !== true || state.longTaskObserver || typeof root.PerformanceObserver !== "function") return;
    try {
      state.longTaskObserver = new root.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.performance.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
        if (state.performance.longTasks.length > 50) state.performance.longTasks.splice(0, state.performance.longTasks.length - 50);
      });
      state.longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch (_) {
      state.longTaskObserver = null;
    }
  }

  function installActivationGuard(name) {
    const api = root[name];
    if (!api || typeof api.activate !== "function") return;
    const existing = state.activationGuards.get(name);
    if (existing && existing.wrapped === api) return;

    const originalApi = api;
    const originalActivate = api.activate.bind(api);
    let activated = false;
    let lastModel = null;

    const guardedActivate = async (...args) => {
      const model = dashboardModel();
      const managerOpen = name === "GrconSigemPwHistoryManagement" && Boolean(originalApi.state?.open);
      if (activated && model && model === lastModel && !managerOpen) {
        increment("activationSkips", name);
        return undefined;
      }
      const started = nowMs();
      try {
        const result = await originalActivate(...args);
        activated = true;
        lastModel = dashboardModel();
        increment("activationRuns", name);
        increment("activationMs", name, nowMs() - started);
        return result;
      } catch (error) {
        lastModel = null;
        throw error;
      }
    };

    const wrapped = Object.freeze(Object.assign({}, originalApi, { activate: guardedActivate }));
    state.activationGuards.set(name, { source: originalApi, wrapped });
    root[name] = wrapped;
  }

  function installActivationGuards() {
    GUARDED_APIS.forEach(installActivationGuard);
  }

  function replayInput(target) {
    if (!target || !target.isConnected || typeof root.Event !== "function") return;
    const event = new root.Event("input", { bubbles: true, composed: true });
    if (state.replayedInputs) state.replayedInputs.add(event);
    target.dispatchEvent(event);
  }

  function onDebouncedInput(event) {
    const target = event.target;
    if (!target || !DEBOUNCED_INPUT_IDS.has(target.id) || event.isComposing) return;
    if (state.replayedInputs && state.replayedInputs.has(event)) return;
    const host = dashboard();
    if (!host || !host.contains(target)) return;

    event.stopImmediatePropagation();
    const previous = state.inputTimers.get(target);
    if (previous && root.clearTimeout) root.clearTimeout(previous);
    const timer = root.setTimeout(() => {
      state.inputTimers.delete(target);
      replayInput(target);
    }, INPUT_DEBOUNCE_MS);
    state.inputTimers.set(target, timer);
    state.performance.debouncedInputs += 1;
  }

  function installInputGuard() {
    if (!root.document || state.inputGuardInstalled) return;
    state.inputGuardInstalled = true;
    root.document.addEventListener("input", onDebouncedInput, true);
  }

  function suppressEvolutionAutoScroll(event) {
    const trigger = event.target && event.target.closest ? event.target.closest("[data-evo-list]") : null;
    if (!trigger || !dashboard()?.contains(trigger)) return;
    const target = root.document.getElementById("spw-evo-table");
    if (!target || typeof target.scrollIntoView !== "function") return;

    const hadOwnMethod = Object.prototype.hasOwnProperty.call(target, "scrollIntoView");
    const original = target.scrollIntoView;
    try {
      Object.defineProperty(target, "scrollIntoView", {
        configurable: true,
        writable: true,
        value: () => { state.performance.suppressedAutoScrolls += 1; },
      });
    } catch (_) {
      return;
    }
    const restore = () => {
      try {
        if (hadOwnMethod) target.scrollIntoView = original;
        else delete target.scrollIntoView;
      } catch (_) { /* elemento será descartado naturalmente */ }
    };
    if (typeof root.queueMicrotask === "function") root.queueMicrotask(restore);
    else root.setTimeout(restore, 0);
  }

  function shouldPreservePagePosition(target) {
    if (!target || !target.closest) return false;
    if (target.closest("[data-spw-jump]")) return false;
    return Boolean(target.closest([
      "#spw-query", "#spw-class", "#spw-clear", "#spw-prev", "#spw-next", "[data-list]",
      "[data-evo-list]", "[data-evo-page]", "[data-spw-rev-situation]", "[data-spw-rev-page]",
      "#spw-evo-filter-query", "#spw-evo-filter-tag", "#spw-evo-filter-eap", "[data-evo-select]",
      "#spw-rev-filter-situation", "#spw-rev-filter-class", "#spw-rev-filter-sigem-rev", "#spw-rev-filter-pw-rev",
      "#spw-rev-filter-sigem-status", "#spw-rev-filter-pw-status", "#spw-rev-search", "#spw-rev-document-list",
    ].join(",")));
  }

  function preservePagePosition(event) {
    const target = event.target;
    const host = dashboard();
    if (!host || !host.contains(target) || !shouldPreservePagePosition(target)) return;
    const x = Number(root.scrollX || root.pageXOffset || 0);
    const y = Number(root.scrollY || root.pageYOffset || 0);
    const token = ++state.interactionToken;
    const restore = () => {
      if (token !== state.interactionToken) return;
      const currentY = Number(root.scrollY || root.pageYOffset || 0);
      if (Math.abs(currentY - y) <= 2 || typeof root.scrollTo !== "function") return;
      root.scrollTo({ left: x, top: y, behavior: "auto" });
      state.performance.restoredScrollPositions += 1;
    };
    if (typeof root.requestAnimationFrame === "function") root.requestAnimationFrame(restore);
    else root.setTimeout(restore, 0);
  }

  function installScrollGuard() {
    if (!root.document || state.scrollGuardInstalled) return;
    state.scrollGuardInstalled = true;
    root.document.addEventListener("click", suppressEvolutionAutoScroll, true);
    root.document.addEventListener("click", preservePagePosition, true);
    root.document.addEventListener("change", preservePagePosition, true);
  }

  function activate() {
    ensureStyle();
    installActivationGuards();
    installInputGuard();
    installScrollGuard();
    installDebugPerformanceObserver();
    syncRevisionCardAccessibility();

    if (root.GRCON_DEBUG_UI === true) {
      installObserver();
      scheduleAudit();
      if (!state.debugResizeInstalled && root.addEventListener) {
        state.debugResizeInstalled = true;
        root.addEventListener("resize", scheduleAudit, { passive: true });
      }
      state.installed = true;
      return auditLayout();
    }

    disableProductionObserver();
    state.installed = true;
    return [];
  }

  function performanceSnapshot() {
    return {
      activationRuns: { ...state.performance.activationRuns },
      activationSkips: { ...state.performance.activationSkips },
      activationMs: { ...state.performance.activationMs },
      debouncedInputs: state.performance.debouncedInputs,
      suppressedAutoScrolls: state.performance.suppressedAutoScrolls,
      restoredScrollPositions: state.performance.restoredScrollPositions,
      longTasks: state.performance.longTasks.slice(),
    };
  }

  // Instala guardas antes de o bootstrap chamar activate() dos submódulos.
  // O arquivo é carregado depois de auditoria/revisões/histórico e antes de
  // evolução; activate() repete a instalação para capturar módulos carregados
  // posteriormente sem duplicar listeners ou wrappers.
  ensureStyle();
  installActivationGuards();
  installInputGuard();
  installScrollGuard();

  return Object.freeze({
    state,
    activate,
    auditLayout,
    syncRevisionCardAccessibility,
    installActivationGuards,
    performanceSnapshot,
  });
});
