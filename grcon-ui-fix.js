/* GRCON — correções de interface da triagem (apresentação apenas).
   Carregar DEPOIS de p1_ux.js e macro5_flow_app.js.
   Não altera regras de negócio, fluxo, IDs ou classes existentes.

   Corrige:
   1. popover do filtro de coluna que ficava "solto" ao rolar a tabela;
   2. filtros ativos e "Limpar filtros das colunas" em lugares diferentes da tela;
   3. rótulo do chip mostrando o valor normalizado em vez do valor real;
   4. filtro ativo em coluna oculta (invisível para o operador);
   5. rótulo do botão de colunas em desacordo com as colunas realmente visíveis;
   6. foco perdido ao fechar o popover.
*/
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const labelByNorm = new Map();

  /* ---------- 1. Toolbar em três faixas ---------- */
  function installToolbarBreaks() {
    const toolbar = $("#results-section .results-toolbar");
    if (!toolbar || toolbar.dataset.grconFixToolbar === "true") return;
    toolbar.dataset.grconFixToolbar = "true";
    ["1", "2"].forEach((n) => {
      const br = document.createElement("span");
      br.className = `grcon-fix-break grcon-fix-break-${n}`;
      br.setAttribute("aria-hidden", "true");
      toolbar.appendChild(br);
    });
  }

  /* ---------- 2. Barra única de filtros ativos ---------- */
  function installFilterBar() {
    const toolbar = $("#results-section .results-toolbar");
    const chips = $("#triage-active-filters");
    const clear = $("#results-clear-column-filters");
    if (!toolbar || !chips || chips.dataset.grconFixMoved === "true") return;
    chips.dataset.grconFixMoved = "true";

    const bar = document.createElement("div");
    bar.className = "grcon-fix-filterbar";
    bar.id = "grcon-fix-filterbar";
    const label = document.createElement("span");
    label.className = "grcon-fix-filterbar-label";
    label.textContent = "Filtros ativos";
    bar.appendChild(label);
    toolbar.insertAdjacentElement("afterend", bar);
    bar.appendChild(chips);
    if (clear) bar.appendChild(clear);

    const sync = () => {
      const hasChips = !chips.hidden && chips.children.length > 0;
      const hasClear = Boolean(clear && !clear.hidden);
      bar.hidden = !hasChips && !hasClear;
    };
    const observer = new MutationObserver(sync);
    observer.observe(chips, { attributes: true, attributeFilter: ["hidden"], childList: true });
    if (clear) observer.observe(clear, { attributes: true, attributeFilter: ["hidden"] });
    sync();
  }

  /* ---------- 3. Rótulos reais nos chips ---------- */
  function captureLabels() {
    const popover = $(".column-filter-popover");
    if (!popover) return;
    popover.querySelectorAll("[data-column-filter-value]").forEach((input) => {
      const text = input.parentElement && input.parentElement.querySelector("span");
      if (text) labelByNorm.set(input.dataset.columnFilterValue, text.textContent.trim());
    });
  }

  function wrapSnapshotApi() {
    const api = window.GrconTriageUiApi;
    if (!api || api.__grconFixWrapped) return;
    const wrapped = Object.freeze({
      ...api,
      __grconFixWrapped: true,
      snapshot: () => {
        const snap = api.snapshot();
        const pretty = {};
        Object.entries(snap.columnFilters || {}).forEach(([key, values]) => {
          pretty[key] = (Array.isArray(values) ? values : [values])
            .map((value) => labelByNorm.get(value) || value);
        });
        return { ...snap, columnFilters: pretty };
      },
    });
    try { window.GrconTriageUiApi = wrapped; } catch (_) { /* objeto protegido */ }
  }

  /* ---------- 4. Popover acompanha a rolagem ---------- */
  function activeTrigger() {
    return $('[data-column-filter-trigger][aria-expanded="true"]');
  }

  function reposition() {
    const popover = $(".column-filter-popover");
    const trigger = activeTrigger();
    if (!popover || popover.hidden || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const scroller = trigger.closest(".table-scroll");
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      const outside = rect.bottom < bounds.top + 2 || rect.top > bounds.bottom - 2
        || rect.right < bounds.left + 2 || rect.left > bounds.right - 2;
      if (outside) { closePopover(); return; }
    }
    const width = popover.offsetWidth || 260;
    const height = popover.offsetHeight || 280;
    let left = rect.left;
    if (left + width > window.innerWidth - 16) left = Math.max(16, window.innerWidth - 16 - width);
    const below = window.innerHeight - rect.bottom - 16;
    const flip = below < Math.min(height, 220) && rect.top > below;
    popover.style.left = `${left}px`;
    popover.style.top = flip ? `${Math.max(8, rect.top - height - 6)}px` : `${rect.bottom + 6}px`;
    popover.style.maxHeight = `${Math.max(180, Math.min(360, flip ? rect.top - 24 : below))}px`;
  }

  function closePopover() {
    const popover = $(".column-filter-popover");
    const trigger = activeTrigger();
    if (!popover || popover.hidden) return;
    const cancel = popover.querySelector(".column-filter-cancel");
    if (cancel) cancel.click();
    else popover.hidden = true;
    if (trigger) { trigger.setAttribute("aria-expanded", "false"); trigger.focus(); }
  }

  function installPopoverBehaviour() {
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-column-filter-trigger]")) {
        window.setTimeout(() => { captureLabels(); updatePopoverHint(); reposition(); }, 0);
      }
      if (event.target.closest(".column-filter-option, .column-filter-select-all, .column-filter-apply")) {
        window.setTimeout(() => { captureLabels(); updatePopoverHint(); }, 0);
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const trigger = activeTrigger();
      window.setTimeout(() => { if (trigger) trigger.focus(); }, 0);
    });
    const popoverWatcher = new MutationObserver(() => {
      const popover = $(".column-filter-popover");
      if (!popover) return;
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-label", "Filtrar coluna");
      if (!popover.hidden) { captureLabels(); updatePopoverHint(); }
    });
    popoverWatcher.observe(document.body, { childList: true, subtree: false });
  }

  /* ---------- 5. Coluna oculta com filtro ativo volta a aparecer ---------- */
  function revealFilteredColumns() {
    const api = window.GrconTriageUiApi;
    const macro = window.GrconMacro5Ui;
    if (!api || !macro) return;
    const active = Object.keys(api.snapshot().columnFilters || {});
    if (!active.length) return;
    const visible = new Set(macro.getPreferences().visibleColumns);
    active.forEach((key) => {
      if (visible.has(key)) return;
      const box = $(`[data-triage-column="${key}"]`);
      if (!box || box.disabled) return;
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  /* ---------- 6. Rótulo do botão de colunas coerente ---------- */
  function syncColumnsToggle() {
    const button = $("#p1-columns-toggle");
    const macro = window.GrconMacro5Ui;
    const flow = window.GrconMacro5Flow;
    if (!button || !macro || !flow) return;
    const visible = macro.getPreferences().visibleColumns.length;
    const all = visible >= flow.COLUMNS.length;
    button.setAttribute("aria-pressed", String(!all));
    button.textContent = all ? "Usar colunas essenciais" : "Mostrar todas as colunas";
    button.title = `${visible} de ${flow.COLUMNS.length} colunas visíveis`;
    document.querySelector("#results-section .table-card")?.classList.remove("p1-essential-columns");
  }

  /* ---------- 7. Nomes de navegação e configuração sem duplicidade ---------- */
  const RELABEL = [
    ['.ops-sidebar [data-grcon-view="control"] strong', "Controle de GRDT"],
    ['.ops-sidebar [data-ops-open-settings] strong', "Configurações gerais"],
    ["#advanced-toggle .settings-button-label", "Regras desta análise"],
  ];

  function relabelNavigation() {
    RELABEL.forEach(([selector, text]) => {
      const node = $(selector);
      if (node && node.textContent.trim() !== text) node.textContent = text;
    });
    const advanced = $("#advanced-toggle");
    if (advanced) advanced.title = "Regras aplicadas somente a esta análise";
  }

  /* ---------- 8. Situações da triagem explicadas ---------- */
  const SITUATION_HINT = {
    todos: "Todos os documentos analisados",
    pronto: "Será incluído na eGRDT",
    bloqueado: "Não será incluído",
    descartar: "Não será enviado novamente",
    revisar: "Precisa de conferência",
  };

  function explainSituations() {
    document.querySelectorAll(".summary-bar [data-filter]").forEach((button) => {
      const hint = SITUATION_HINT[button.dataset.filter];
      if (!hint || button.dataset.grconFixHint === "true") return;
      button.dataset.grconFixHint = "true";
      const label = button.querySelector("span");
      button.title = hint;
      button.setAttribute("aria-label", `${label ? label.textContent.trim() : button.dataset.filter} — ${hint}`);
    });
  }

  /* ---------- 9. Grupos visuais nas 19 colunas ---------- */
  const COLUMN_GROUPS = [
    [1, 1, "situacao"], [2, 8, "identificacao"], [9, 13, "emissao"],
    [14, 17, "alocacao"], [18, 19, "arquivos"],
  ];

  function groupColumns() {
    const head = $("#results-table thead tr:first-child");
    if (!head || head.dataset.grconFixGroups === "true") return;
    head.dataset.grconFixGroups = "true";
    const cells = [...head.children];
    COLUMN_GROUPS.forEach(([from, to, name]) => {
      for (let index = from; index <= to; index += 1) {
        const cell = cells[index - 1];
        if (!cell) continue;
        cell.dataset.grconFixGroup = name;
        if (index === from) cell.dataset.grconFixGroupStart = "true";
      }
    });
  }

  /* ---------- 10. Motivo do OK desabilitado ---------- */
  function updatePopoverHint() {
    const popover = $(".column-filter-popover");
    if (!popover) return;
    const apply = popover.querySelector(".column-filter-apply");
    let hint = popover.querySelector(".grcon-fix-popover-hint");
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "grcon-fix-popover-hint";
      hint.textContent = "Marque ao menos um valor para aplicar o filtro.";
      popover.querySelector("footer")?.insertAdjacentElement("beforebegin", hint);
    }
    hint.hidden = !(apply && apply.disabled);
  }

  /* ---------- 11. Atalhos de teclado que apontavam para IDs inexistentes ---------- */
  const MODULE_SEARCH = [
    ["#grdt-module", "#search"],
    ["#analysis-history-module", "#analysis-history-search"],
    ["#history-module", "#history-search"],
    ["#sigem-module", "#sigem-search"],
  ];

  function visibleModuleSearch() {
    for (const [moduleSelector, searchSelector] of MODULE_SEARCH) {
      const module = $(moduleSelector);
      if (module && !module.hidden && module.offsetParent !== null) return $(searchSelector);
    }
    return $("#search");
  }

  function openDrawer() {
    return document.querySelector('aside[id$="-drawer"]:not([inert])');
  }

  function isTyping(target) {
    if (!target) return false;
    const tag = String(target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }

  function installShortcutFixes() {
    document.addEventListener("keydown", (event) => {
      // Ctrl/Cmd+Enter: o script original procura #analyze-button, que não existe.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        const analyze = $("#analyze");
        if (analyze && !analyze.disabled) {
          event.preventDefault();
          event.stopImmediatePropagation();
          analyze.click();
        }
        return;
      }
      // "/": levava sempre à busca da triagem, mesmo em outro módulo.
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !isTyping(event.target)) {
        const field = visibleModuleSearch();
        if (field) {
          event.preventDefault();
          event.stopImmediatePropagation();
          field.focus();
          field.select?.();
        }
        return;
      }
      // Esc: o seletor original procurava ".drawer", classe que não existe no GRCON.
      if (event.key === "Escape" && !$(".column-filter-popover:not([hidden])")) {
        const drawer = openDrawer();
        const close = drawer && drawer.querySelector('[aria-label="Fechar"], [id$="-close"], [id$="-cancel"]');
        if (close) {
          event.preventDefault();
          event.stopImmediatePropagation();
          close.click();
        }
      }
    }, true);
  }

  /* ---------- 12. Atalhos visíveis nos próprios botões ---------- */
  const SHORTCUT_HINT = [["#analyze", "Ctrl+Enter"], ["#export-egrdt", "Ctrl+G"], ["#export-report", "Ctrl+S"]];

  function annotateShortcuts() {
    SHORTCUT_HINT.forEach(([selector, combo]) => {
      const node = $(selector);
      if (!node || node.dataset.grconFixShortcut === "true") return;
      node.dataset.grconFixShortcut = "true";
      const base = node.title || node.textContent.trim();
      node.title = `${base} · ${combo}`;
    });
  }

  function afterRender() {
    revealFilteredColumns();
    syncColumnsToggle();
    relabelNavigation();
    explainSituations();
    groupColumns();
    annotateShortcuts();
  }

  function init() {
    installToolbarBreaks();
    installFilterBar();
    installPopoverBehaviour();
    installShortcutFixes();
    wrapSnapshotApi();
    window.addEventListener("grcon:triage-rendered", () => window.setTimeout(afterRender, 0));
    window.setTimeout(() => { wrapSnapshotApi(); afterRender(); }, 300);
    document.documentElement.dataset.grconUiFix = "enabled";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
