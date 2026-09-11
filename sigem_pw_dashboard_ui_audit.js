(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwUiAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STYLE_ID = "spw-dashboard-ui-audit-style";
  const MODULE_ID = "sigem-pw-dashboard-module";
  const state = { installed: false, observer: null, resizeTimer: 0, lastIssues: [] };

  function ensureStyle() {
    if (!root.document || root.document.getElementById(STYLE_ID)) return;
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Correções locais do Dashboard SIGEM × PW. Não altera o design system global. */
      #${MODULE_ID}{container-type:inline-size;min-width:0;overflow-x:clip}
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
    if (!root.setTimeout) return;
    if (state.resizeTimer) root.clearTimeout(state.resizeTimer);
    state.resizeTimer = root.setTimeout(() => {
      state.resizeTimer = 0;
      syncRevisionCardAccessibility();
      auditLayout();
    }, 120);
  }

  function installObserver() {
    if (!root.document || state.observer || typeof root.MutationObserver !== "function") return;
    const host = root.document.getElementById(MODULE_ID);
    if (!host) return;
    state.observer = new root.MutationObserver(() => scheduleAudit());
    state.observer.observe(host, { childList: true, subtree: true });
  }

  function activate() {
    ensureStyle();
    syncRevisionCardAccessibility();
    installObserver();
    scheduleAudit();
    if (!state.installed && root.addEventListener) {
      state.installed = true;
      root.addEventListener("resize", scheduleAudit, { passive: true });
    }
    return auditLayout();
  }

  // O CSS entra assim que o módulo é carregado, antes de a seção de revisões
  // renderizar. Evita um frame intermediário com os cinco cards comprimidos.
  ensureStyle();

  return Object.freeze({ state, activate, auditLayout, syncRevisionCardAccessibility });
});
