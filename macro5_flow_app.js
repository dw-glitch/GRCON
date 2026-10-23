(function () {
  "use strict";

  const Flow = window.GrconMacro5Flow;
  if (!Flow) return;
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const escapeHtml = (value) => Flow.text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  const els = {
    results: $("#results-section"),
    tableCard: $("#results-section .table-card"),
    table: $("#results-table"),
    density: $("#triage-density"),
    group: $("#triage-group-toggle"),
    columns: $("#triage-column-options"),
    columnManager: $("#triage-column-manager"),
    essential: $("#p1-columns-toggle"),
    filters: $("#triage-active-filters"),
    search: $("#search"),
    sheet: $("#sheet-filter"),
    columnFilters: $("#results-column-filters"),
  };

  let preferences = Flow.readTriagePreferences();
  let applying = false;
  let observedHeader = null, headerObserver = null;

  function syncStickyOffset() {
    const first = els.table?.querySelector("thead th:first-child");
    if (!first) return;
    const offset = first.getBoundingClientRect().width / (Number(getComputedStyle(document.documentElement).zoom) || 1);
    if (!Number.isFinite(offset) || offset <= 0) return;
    els.table.style.setProperty("--triage-situation-width", `${offset}px`);
    $$("thead th:nth-child(3),tbody tr.result-row td:nth-child(3)", els.table).forEach(cell => {
      if (Math.abs((parseFloat(cell.style.left) || 0) - offset) > .5) cell.style.left = `${offset}px`;
    });
  }
  function visibleSet() { return new Set(preferences.visibleColumns); }

  function columnWidthRem(column) {
    return ({ situation: 10, originalFile: 15, document: 24, ldCode: 12, apendiceSearch: 12, tagged: 8, sheet: 6, ldRevision: 7, targetRevision: 10, title: 18, effectiveDate: 11, grdt: 12, technicalStatus: 9, sigemStatus: 10, targetStatus: 13, postingStatus: 17, fiscalComment: 11, allocation: 12, allocationStage: 16, allocationStatus: 14, databook: 16, finalFile: 15 })[column.key] || 11;
  }

  function savePreferences() { preferences = Flow.saveTriagePreferences(preferences); }

  function renderColumnOptions() {
    if (!els.columns) return;
    const visible = visibleSet();
    els.columns.innerHTML = Flow.COLUMNS.map((column) => `<label><input type="checkbox" data-triage-column="${escapeHtml(column.key)}" ${visible.has(column.key) ? "checked" : ""} ${column.locked ? "disabled" : ""}/><span>${escapeHtml(column.label)}${column.locked ? " · fixa" : ""}</span></label>`).join("");
  }

  function applyColumnVisibility() {
    if (!els.table || applying) return;
    applying = true;
    const visible = visibleSet();
    Flow.COLUMNS.forEach((column) => {
      const show = visible.has(column.key);
      $$(`thead tr > *:nth-child(${column.index}), tbody tr.result-row > *:nth-child(${column.index})`, els.table).forEach((cell) => {
        cell.style.display = show ? "" : "none";
        cell.dataset.macro5Column = column.key;
      });
    });
    const width = Flow.COLUMNS.filter((column) => visible.has(column.key)).reduce((sum, column) => sum + columnWidthRem(column), 0);
    els.table.style.inlineSize = `${Math.max(64, width)}rem`;
    els.table.style.minInlineSize = `${Math.max(64, width)}rem`;
    els.tableCard?.classList.remove("p1-essential-columns");
    if (els.essential) {
      const all = visible.size === Flow.COLUMNS.length;
      els.essential.setAttribute("aria-pressed", String(!all));
      els.essential.textContent = all ? "Usar colunas essenciais" : "Mostrar todas as colunas";
    }
    const first = els.table.querySelector("thead th:first-child");
    if (first && first !== observedHeader && typeof ResizeObserver === "function") {
      headerObserver?.disconnect(); observedHeader = first;
      headerObserver = new ResizeObserver(syncStickyOffset); headerObserver.observe(first);
    }
    if (first) {
      const offset = first.getBoundingClientRect().width / (Number(getComputedStyle(document.documentElement).zoom) || 1);
      els.table.style.setProperty("--triage-situation-width", `${offset}px`);
      $$("thead th:nth-child(3),tbody tr.result-row td:nth-child(3)", els.table).forEach(cell => { cell.style.left = `${offset}px`; });
    }
    const visibleCount = Flow.COLUMNS.filter(column => visible.has(column.key)).length;
    $$("tr.detail-row > td, tr.virtual-spacer-row > td", els.table).forEach(cell => { cell.colSpan = visibleCount; });
    applying = false;
  }

  function setPreset(preset) {
    preferences.visibleColumns = Flow.COLUMNS.filter((column) => preset === "all" || column.essential || column.locked).map((column) => column.key);
    savePreferences();
    renderColumnOptions();
    applyColumnVisibility();
  }

  function applyDensity() {
    const compact = preferences.density === "compact";
    els.tableCard?.classList.toggle("macro5-density-compact", compact);
    if (els.density) els.density.value = compact ? "compact" : "comfortable";
    window.GrconTriageUiApi?.setDensity?.(preferences.density);
  }

  function applyGrouping() {
    els.tableCard?.classList.toggle("macro5-grouped", preferences.groupByStatus);
    if (els.group) {
      els.group.setAttribute("aria-pressed", String(preferences.groupByStatus));
      els.group.classList.toggle("active", preferences.groupByStatus);
      els.group.textContent = preferences.groupByStatus ? "Desagrupar situações" : "Agrupar por situação";
    }
    window.GrconTriageUiApi?.setGroupByStatus?.(preferences.groupByStatus);
  }

  function chip(label, kind, key) {
    return `<span class="triage-filter-chip">${escapeHtml(label)}<button type="button" data-clear-filter="${escapeHtml(kind)}" ${key ? `data-filter-key="${escapeHtml(key)}"` : ""} aria-label="Remover filtro ${escapeHtml(label)}">×</button></span>`;
  }

  function renderActiveFilters() {
    if (!els.filters) return;
    const snapshot = window.GrconTriageUiApi?.snapshot?.();
    if (!snapshot) { els.filters.hidden = true; return; }
    const chips = [];
    if (snapshot.filter && snapshot.filter !== "todos") {
      const label = ({ pronto: "Prontos", nao_localizado: "Não localizado / sem status", bloqueado: "Não incluir", descartar: "Em análise", revisar: "Revisar" })[snapshot.filter] || snapshot.filter;
      chips.push(chip(`Situação: ${label}`, "summary"));
    }
    if (snapshot.sheetFilter && snapshot.sheetFilter !== "todos") chips.push(chip(`Aba: ${els.sheet?.selectedOptions?.[0]?.textContent || snapshot.sheetFilter}`, "sheet"));
    if (Flow.text(snapshot.search)) chips.push(chip(`Busca: ${snapshot.search}`, "search"));
    Object.entries(snapshot.columnFilters || {}).forEach(([key, values]) => {
      const column = Flow.COLUMNS.find((item) => item.key === key);
      const list = Array.isArray(values) ? values : [values];
      const label = list.length === 1 ? (Flow.text(list[0]) || "(Vazias)") : list.length ? `${list.length} selecionados` : "Nenhum valor";
      chips.push(chip(`${column?.label || key}: ${label}`, "column", key));
    });
    if (snapshot.groupByStatus) chips.push(chip("Agrupado por situação", "group"));
    els.filters.innerHTML = chips.join("");
    els.filters.hidden = chips.length === 0;
  }

  let geometryFrame = 0;
  function scheduleGeometry() {
    if (!geometryFrame) geometryFrame = requestAnimationFrame(() => { geometryFrame = 0; syncStickyOffset(); });
  }
  function synchronize() {
    applyColumnVisibility();
    renderActiveFilters();
    scheduleGeometry();
  }

  function install() {
    if (!els.results || !els.table) return;
    renderColumnOptions();
    applyColumnVisibility();
    applyDensity();
    applyGrouping();

    els.columns?.addEventListener("change", (event) => {
      const input = event.target.closest("[data-triage-column]");
      if (!input) return;
      const visible = visibleSet();
      if (input.checked) visible.add(input.dataset.triageColumn);
      else visible.delete(input.dataset.triageColumn);
      preferences.visibleColumns = [...visible];
      savePreferences();
      applyColumnVisibility();
    });
    els.columnManager?.addEventListener("click", (event) => {
      const preset = event.target.closest("[data-column-preset]")?.dataset.columnPreset;
      if (preset) { event.preventDefault(); setPreset(preset); }
    });
    els.essential?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const visible = visibleSet();
      setPreset(visible.size === Flow.COLUMNS.length ? "essential" : "all");
    }, true);
    els.density?.addEventListener("change", () => {
      preferences.density = els.density.value === "compact" ? "compact" : "comfortable";
      savePreferences();
      applyDensity();
    });
    els.group?.addEventListener("click", () => {
      preferences.groupByStatus = !preferences.groupByStatus;
      savePreferences();
      applyGrouping();
    });
    els.filters?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-clear-filter]");
      if (!button) return;
      if (button.dataset.clearFilter === "group") {
        preferences.groupByStatus = false;
        savePreferences();
        applyGrouping();
        return;
      }
      window.GrconTriageUiApi?.clearFilter?.(button.dataset.clearFilter, button.dataset.filterKey || "");
    });

    window.addEventListener("grcon:triage-rendered", synchronize);
    [els.search, els.sheet, els.columnFilters].filter(Boolean).forEach((element) => {
      element.addEventListener(element.tagName === "SELECT" ? "change" : "input", () => window.setTimeout(renderActiveFilters, 140));
    });
    $$("[data-filter]").forEach((button) => button.addEventListener("click", () => window.setTimeout(renderActiveFilters, 0)));
    window.addEventListener("storage", (event) => {
      if (event.key !== Flow.TRIAGE_PREFERENCES_KEY) return;
      preferences = Flow.readTriagePreferences();
      renderColumnOptions(); applyColumnVisibility(); applyDensity(); applyGrouping();
    });
    // Virtual rows can be rebuilt after the rendered event (for example on density change).
    // Observe node replacement, not attributes: adjusting offsets must not create a feedback loop.
    if (typeof MutationObserver === "function") new MutationObserver(scheduleGeometry).observe(els.table, { childList: true, subtree: true });
    synchronize();
    window.addEventListener("resize", syncStickyOffset, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.GrconMacro5Ui = Object.freeze({
    getPreferences: () => ({ ...preferences, visibleColumns: [...preferences.visibleColumns] }),
    setPreset,
    synchronize,
  });
})();
