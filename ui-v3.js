(function () {
  "use strict";

  const root = document.documentElement;
  const APP = root.dataset.app || "Aplicativo";
  let lastTrigger = null;
  let enhanceTimer = 0;
  let hadModal = false;
  const pendingScopes = new Set();

  const _U = (typeof globalThis !== "undefined" ? globalThis : this).GrconUtils || {};
  function text(value) {
    if (_U.text) return _U.text(value);
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function humanize(value) {
    return text(value)
      .replace(/^ops-/, "")
      .replace(/^p1-/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  // O observer abaixo escuta atributos (inclusive "class") de toda a body. Uma
  // escrita que repõe o MESMO valor ainda gera um registro de mutação — e esse
  // registro reagenda o refinamento, que escreve de novo, indefinidamente. Por
  // isso toda escrita deste arquivo passa por estes auxiliares: sem mudança
  // real, nenhuma escrita, nenhum registro, nenhum ciclo.
  function setAttr(element, name, value) {
    if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  function dropAttr(element, name) {
    if (element && element.hasAttribute(name)) element.removeAttribute(name);
  }
  function addClass(element, name) {
    if (element && !element.classList.contains(name)) element.classList.add(name);
  }
  function setData(element, key, value) {
    if (element && element.dataset[key] !== value) element.dataset[key] = value;
  }

  function elementsWithin(scope, selector) {
    const source = scope && scope.nodeType === 1 ? scope : document;
    const items = [];
    if (source.nodeType === 1 && source.matches(selector)) items.push(source);
    if (source.querySelectorAll) items.push(...source.querySelectorAll(selector));
    return items;
  }

  function tableName(table) {
    const section = table.closest("section, article, .card, .module-view");
    const heading = section && section.querySelector("h2, h3, .section-title strong, header strong");
    return text(heading && heading.textContent) || humanize(table.id) || `Tabela do ${APP}`;
  }

  function normalizedSortDirection(th) {
    const raw = text(
      th.dataset.sortDirection ||
      th.getAttribute("data-direction") ||
      th.getAttribute("data-order") ||
      ""
    ).toLowerCase();
    if (["asc", "ascending", "crescente"].includes(raw) || th.classList.contains("sort-asc") || th.classList.contains("sorted-asc")) return "ascending";
    if (["desc", "descending", "decrescente"].includes(raw) || th.classList.contains("sort-desc") || th.classList.contains("sorted-desc")) return "descending";
    return "none";
  }

  function synchronizeSortState(table) {
    table.querySelectorAll("thead th").forEach((th) => {
      const sortable = th.matches("[data-sort], [data-sort-key], .sortable");
      if (!sortable) {
        dropAttr(th, "aria-sort");
        return;
      }
      setAttr(th, "aria-sort", normalizedSortDirection(th));
    });
  }

  function enhanceTable(table) {
    if (!table) return;
    setData(table, "uiV3Enhanced", "true");
    const name = tableName(table);
    if (!table.querySelector(":scope > caption")) {
      const caption = document.createElement("caption");
      caption.className = "ui-v3-sr-only";
      caption.textContent = name;
      table.prepend(caption);
    }
    table.querySelectorAll("thead th").forEach((th) => {
      if (!th.hasAttribute("scope")) setAttr(th, "scope", "col");
    });
    synchronizeSortState(table);
    if (table.dataset.uiV3SortEvents !== "true") {
      setData(table, "uiV3SortEvents", "true");
      const refresh = () => requestAnimationFrame(() => synchronizeSortState(table));
      table.addEventListener("click", refresh, true);
      table.addEventListener("keydown", refresh, true);
      table.addEventListener("change", refresh, true);
    }
    const region = table.closest(".table-wrap, .table-scroll, .history-table-wrap, .analysis-history-table-wrap") || table.parentElement;
    if (region) {
      addClass(region, "ui-v3-table-region");
      if (!region.hasAttribute("role")) setAttr(region, "role", "region");
      if (!region.hasAttribute("aria-label")) setAttr(region, "aria-label", name);
      if (!region.hasAttribute("tabindex")) setAttr(region, "tabindex", "0");
      marcarRolagemLateral(region);
    }
  }

  /**
   * Marca em data-scroll de que lado ainda há coluna escondida, para o CSS
   * desenhar a sombra da borda.
   *
   * O truque só de CSS, com gradientes presos ao conteúdo, não serve aqui: as
   * células da tabela têm fundo próprio e pintam por cima da sombra. Só
   * sabendo a posição da rolagem dá para dizer a verdade — e a sombra tem de
   * dizer a verdade, senão vira enfeite que aponta para o nada.
   */
  function marcarRolagemLateral(region) {
    if (region.dataset.uiV3ScrollHint === "true") return;
    setData(region, "uiV3ScrollHint", "true");
    // A sombra é desenhada por um elemento de fora, não pelo que rola: dentro
    // do quadro ela ficaria atrás das células, que têm fundo próprio e pintam
    // por cima — o que derruba tanto o gradiente preso ao conteúdo quanto o
    // box-shadow inset.
    //
    // A casca é criada aqui em vez de reaproveitar o pai porque o pai costuma
    // ser a seção inteira: a sombra escorria por cima dos filtros e dos
    // cartões de resumo, apontando rolagem onde não há.
    let casca = region.parentElement;
    // Sem pai não há onde pendurar a casca — acontece com região solta ou
    // ainda fora do documento, e derrubava o script inteiro com insertBefore
    // de null. Nesse caso a tabela segue funcionando, só sem a sombra.
    if (!casca) return;
    if (!casca.classList.contains("ui-v3-table-shell")) {
      const nova = document.createElement("div");
      nova.className = "ui-v3-table-shell";
      region.parentElement.insertBefore(nova, region);
      nova.appendChild(region);
      casca = nova;
    }
    const atualizar = () => {
      const sobra = region.scrollWidth - region.clientWidth;
      // Um pixel de folga: arredondamento de zoom não pode acender a sombra.
      const estado = sobra <= 1 ? "none"
        : region.scrollLeft <= 1 ? "start"
          : region.scrollLeft >= sobra - 1 ? "end" : "middle";
      setData(region, "scroll", estado);
      if (casca) setData(casca, "scroll", estado);
    };
    region.addEventListener("scroll", atualizar, { passive: true });
    // A tabela muda de largura ao filtrar, ordenar ou trocar de modo.
    if (typeof ResizeObserver === "function") {
      const observador = new ResizeObserver(atualizar);
      observador.observe(region);
      const tabela = region.querySelector("table");
      if (tabela) observador.observe(tabela);
    }
    atualizar();
  }

  function enhanceButtons(scope) {
    elementsWithin(scope, "button").forEach((button) => {
      const accessible = text(button.getAttribute("aria-label")) || text(button.textContent) || text(button.getAttribute("title"));
      if (!accessible) setAttr(button, "aria-label", humanize(button.id) || "Ação");
      if (!button.hasAttribute("type")) setAttr(button, "type", "button");
    });
  }

  function enhanceSearchControls(scope) {
    elementsWithin(scope, 'input[type="search"]').forEach((input) => {
      if (!input.getAttribute("aria-label")) {
        const label = input.closest("label");
        setAttr(input, "aria-label", text(label && label.textContent) || text(input.placeholder) || "Buscar resultados");
      }
      const section = input.closest("section, article, .card, .module-view");
      const table = section && section.querySelector("table[id]");
      if (table && !input.hasAttribute("aria-controls")) setAttr(input, "aria-controls", table.id);
    });
  }

  function enhanceLiveRegions(scope) {
    elementsWithin(scope, "quality-status, app-toast, .progress span, [id$='progress-text']").forEach((element) => {
      if (!element.hasAttribute("aria-live")) setAttr(element, "aria-live", "polite");
      if (!element.hasAttribute("role")) setAttr(element, "role", "status");
    });
  }

  function refreshBusyState() {
    const busy = Array.from(document.querySelectorAll(".progress, [id$='progress']")).some((element) => !element.hidden && element.offsetParent !== null);
    setAttr(document.body, "aria-busy", busy ? "true" : "false");
  }

  function configureTabs(scope) {
    elementsWithin(scope, '[role="tablist"]').forEach((tablist) => {
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      if (!tabs.length || tablist.dataset.uiV3Keys === "true") return;
      setData(tablist, "uiV3Keys", "true");
      tabs.forEach((tab) => setAttr(tab, "tabindex", tab.getAttribute("aria-selected") === "true" ? "0" : "-1"));
      tablist.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const current = Math.max(0, tabs.indexOf(document.activeElement));
        let next = current;
        if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        event.preventDefault();
        tabs[next].focus();
      });
    });
  }

  function visibleModal() {
    return Array.from(document.querySelectorAll('[role="dialog"], aside[aria-hidden="false"]')).find((element) => !element.hidden && element.offsetParent !== null);
  }

  function focusModal(element) {
    if (!element || element.dataset.uiV3Focused === "true") return;
    hadModal = true;
    setData(element, "uiV3Focused", "true");
    const target = element.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]');
    if (target) requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function restoreFocusIfNeeded() {
    if (visibleModal() || !hadModal) return;
    document.querySelectorAll('[data-ui-v3-focused="true"]').forEach((element) => delete element.dataset.uiV3Focused);
    hadModal = false;
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
    lastTrigger = null;
  }

  function enhanceDialogs(scope) {
    elementsWithin(scope, ".compatibility-drawer, .pending-panel-drawer, .databook-assistant-drawer, .settings-drawer, .p1-confirm-dialog").forEach((dialog) => {
      if (!dialog.hasAttribute("role")) setAttr(dialog, "role", "dialog");
      if (!dialog.hasAttribute("aria-modal")) setAttr(dialog, "aria-modal", "true");
      if (!dialog.hasAttribute("tabindex")) setAttr(dialog, "tabindex", "-1");
    });
  }

  function enhanceScope(scope) {
    elementsWithin(scope, "table").forEach(enhanceTable);
    enhanceDialogs(scope);
    enhanceButtons(scope);
    enhanceSearchControls(scope);
    enhanceLiveRegions(scope);
    configureTabs(scope);
  }

  function refreshModalState() {
    const modal = visibleModal();
    if (modal) focusModal(modal);
    else restoreFocusIfNeeded();
  }

  function flushEnhancements() {
    enhanceTimer = 0;
    const scopes = Array.from(pendingScopes);
    pendingScopes.clear();
    if (!scopes.length) scopes.push(document);
    scopes.forEach((scope) => enhanceScope(scope));
    refreshBusyState();
    refreshModalState();
    // Segunda linha de defesa, além das escritas condicionais: o refinamento é
    // síncrono, então tudo o que o observer acumulou durante ele veio daqui.
    // Descartar esses registros impede que o refinamento se reagende sozinho —
    // e, ao contrário de uma flag, não deixa passar nenhuma mutação de fora,
    // porque nenhum outro código roda enquanto esta função executa.
    observer.takeRecords();
  }

  function scheduleEnhancement(scope) {
    if (scope && (scope.nodeType === 1 || scope === document)) pendingScopes.add(scope);
    clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(flushEnhancements, 40);
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("button, [role='button']");
    if (trigger) lastTrigger = trigger;
  }, true);

  document.addEventListener("keydown", (event) => {
    const modal = visibleModal();
    if (!modal) return;
    if (event.key === "Escape") {
      const closer = modal.querySelector("[id$='close'], [id$='cancel'], .drawer-close, [aria-label^='Fechar']");
      if (closer) {
        event.preventDefault();
        closer.click();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(modal.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) scheduleEnhancement(node);
        });
        const table = mutation.target.nodeType === 1 && mutation.target.closest && mutation.target.closest("table");
        if (table) scheduleEnhancement(table);
      } else if (mutation.type === "attributes") {
        scheduleEnhancement(mutation.target);
        const table = mutation.target.closest && mutation.target.closest("table");
        if (table) scheduleEnhancement(table);
      }
    });
  });

  function start() {
    setData(root, "uiGeneration", "3");
    enhanceScope(document);
    refreshBusyState();
    refreshModalState();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "aria-selected", "data-sort-direction", "data-direction", "data-order", "class"],
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
