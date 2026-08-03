(function () {
  "use strict";

  const SHORTCUTS = {
    ANALYZE: { key: "Enter", ctrl: true, description: "Analisar documentos" },
    GENERATE: { key: "g", ctrl: true, description: "Gerar eGRDT e PDFs" },
    SAVE_REPORT: { key: "s", ctrl: true, description: "Salvar relatório Excel" },
    HISTORY: { key: "h", ctrl: true, description: "Abrir histórico de eGRDTs" },
    CLOSE_MODAL: { key: "Escape", ctrl: false, description: "Fechar modal/drawer" },
    FOCUS_SEARCH: { key: "/", ctrl: false, description: "Focar campo de busca" },
  };

  let enabled = true;
  const listeners = new Set();

  function isInputElement(element) {
    if (!element) return false;
    const tagName = element.tagName?.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
  }

  function shouldIgnoreEvent(event) {
    // Ignora se está digitando em campo de entrada (exceto para Escape e Ctrl+shortcuts)
    if (isInputElement(event.target)) {
      if (event.key === "Escape") return false;
      if (event.ctrlKey || event.metaKey) return false;
      return true;
    }
    return false;
  }

  function matchesShortcut(event, shortcut) {
    const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
    const modifierMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
    return keyMatch && modifierMatch;
  }

  function handleKeyDown(event) {
    if (!enabled) return;
    if (shouldIgnoreEvent(event)) return;

    // Ctrl+Enter → Analisar
    if (matchesShortcut(event, SHORTCUTS.ANALYZE)) {
      event.preventDefault();
      const analyzeButton = document.getElementById("analyze-button");
      if (analyzeButton && !analyzeButton.disabled) {
        analyzeButton.click();
        showShortcutFeedback("Analisando documentos...");
      }
      return;
    }

    // Ctrl+G → Gerar eGRDT
    if (matchesShortcut(event, SHORTCUTS.GENERATE)) {
      event.preventDefault();
      const generateButton = document.getElementById("export-egrdt");
      if (generateButton && !generateButton.disabled && !generateButton.hidden) {
        generateButton.click();
        showShortcutFeedback("Gerando eGRDT...");
      }
      return;
    }

    // Ctrl+S → Salvar relatório
    if (matchesShortcut(event, SHORTCUTS.SAVE_REPORT)) {
      event.preventDefault();
      const reportButton = document.getElementById("export-report");
      if (reportButton && !reportButton.disabled && !reportButton.hidden) {
        reportButton.click();
        showShortcutFeedback("Gerando relatório...");
      }
      return;
    }

    // Ctrl+H → Histórico
    if (matchesShortcut(event, SHORTCUTS.HISTORY)) {
      event.preventDefault();
      const historyButton = document.querySelector('[data-grcon-view="history"]');
      if (historyButton) {
        historyButton.click();
        showShortcutFeedback("Histórico de eGRDTs");
      }
      return;
    }

    // Escape → Fechar modal/drawer
    if (matchesShortcut(event, SHORTCUTS.CLOSE_MODAL)) {
      const openDrawer = document.querySelector('.drawer[inert="false"], .drawer:not([inert])');
      if (openDrawer) {
        const closeButton = openDrawer.querySelector('[aria-label="Fechar"], .drawer-close, button[data-action="close"]');
        if (closeButton) {
          closeButton.click();
          event.preventDefault();
          return;
        }
      }

      const openModal = document.querySelector('.p1-confirm-dialog:not([hidden])');
      if (openModal) {
        const cancelButton = openModal.querySelector('#p1-confirm-cancel, .secondary-button');
        if (cancelButton) {
          cancelButton.click();
          event.preventDefault();
          return;
        }
      }
      return;
    }

    // / → Focar busca (só se não estiver em campo de entrada)
    if (matchesShortcut(event, SHORTCUTS.FOCUS_SEARCH) && !isInputElement(event.target)) {
      event.preventDefault();
      const searchInput = document.getElementById("search-input") || document.querySelector('input[type="search"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
        showShortcutFeedback("Buscar documentos");
      }
      return;
    }

    // Notifica listeners customizados
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("Erro em listener de atalho:", error);
      }
    });
  }

  function showShortcutFeedback(message) {
    if (!message) return;
    
    const existing = document.getElementById("shortcut-feedback");
    if (existing) existing.remove();

    const feedback = document.createElement("div");
    feedback.id = "shortcut-feedback";
    feedback.className = "shortcut-feedback";
    feedback.textContent = `⌨️ ${message}`;
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    
    document.body.appendChild(feedback);
    
    requestAnimationFrame(() => feedback.classList.add("visible"));
    
    setTimeout(() => {
      feedback.classList.remove("visible");
      setTimeout(() => feedback.remove(), 300);
    }, 2000);
  }

  function enable() {
    enabled = true;
  }

  function disable() {
    enabled = false;
  }

  function addListener(callback) {
    if (typeof callback === "function") {
      listeners.add(callback);
    }
  }

  function removeListener(callback) {
    listeners.delete(callback);
  }

  function getShortcuts() {
    return Object.keys(SHORTCUTS).map((key) => ({
      name: key,
      ...SHORTCUTS[key],
      formatted: SHORTCUTS[key].ctrl 
        ? `Ctrl+${SHORTCUTS[key].key.toUpperCase()}` 
        : SHORTCUTS[key].key === "Escape" 
          ? "Esc" 
          : SHORTCUTS[key].key,
    }));
  }

  // Instala o listener global
  document.addEventListener("keydown", handleKeyDown);

  // Injeta CSS para feedback visual
  const style = document.createElement("style");
  style.textContent = `
    .shortcut-feedback {
      position: fixed;
      bottom: 5rem;
      right: 2rem;
      z-index: 9999;
      padding: .75rem 1.25rem;
      background: var(--surface-1);
      border: 1px solid var(--border-1);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-2);
      font-size: .875rem;
      font-weight: 600;
      color: var(--text-1);
      opacity: 0;
      transform: translateY(1rem);
      transition: opacity 200ms ease, transform 200ms ease;
      pointer-events: none;
    }
    .shortcut-feedback.visible {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);

  window.GrconKeyboardShortcuts = Object.freeze({
    SHORTCUTS,
    enable,
    disable,
    addListener,
    removeListener,
    getShortcuts,
    showFeedback: showShortcutFeedback,
  });

  console.info("⌨️ Atalhos de teclado habilitados:", getShortcuts().map(s => `${s.formatted} → ${s.description}`).join(", "));
})();
