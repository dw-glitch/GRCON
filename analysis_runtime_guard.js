(function (root) {
  "use strict";

  // Proteção de fronteira do fluxo crítico de análise. Este módulo NÃO conhece
  // nem altera as regras documentais; ele somente garante que um gesto do
  // operador não dispare duas execuções concorrentes e registra diagnósticos
  // de erros externos sem transformá-los em falha do GRCON.
  const ANALYZE_IDS = new Set(["analyze", "sgpar-analyze"]);
  const EXTENSION_SCHEMES = /^(?:chrome|moz|edge|safari-web)-extension:\/\//i;
  let locked = false;
  let busyObserved = false;
  let startedAt = 0;
  let sourceButton = "";
  let fallbackRelease = 0;
  let observer = null;
  let installed = false;

  function debug(stage, detail) {
    const payload = { stage, at: Date.now(), ...(detail || {}) };
    try {
      root.dispatchEvent(new CustomEvent("grcon:analysis-diagnostic", { detail: payload }));
    } catch (_) {
      // Diagnóstico nunca participa do fluxo documental.
    }
    if (root.GRCON_DEBUG_ANALYZE === true && root.console && typeof root.console.debug === "function") {
      root.console.debug(`[GRCON Analyze][${stage}]`, payload);
    }
  }

  function targetButton(event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return null;
    const button = target.closest("button");
    return button && ANALYZE_IDS.has(button.id) ? button : null;
  }

  function clearFallback() {
    if (fallbackRelease) root.clearTimeout(fallbackRelease);
    fallbackRelease = 0;
  }

  function release(reason) {
    if (!locked) return;
    clearFallback();
    const durationMs = startedAt && root.performance && typeof root.performance.now === "function"
      ? Math.max(0, root.performance.now() - startedAt)
      : 0;
    debug("run-release", { reason: reason || "finished", sourceButton, durationMs, busyObserved });
    locked = false;
    busyObserved = false;
    startedAt = 0;
    sourceButton = "";
  }

  function armFallback() {
    clearFallback();
    // Contingência exclusiva para o caminho de cache, que pode concluir sem
    // transitar o botão para disabled. Não encerra análise nem mascara race
    // condition: enquanto o GRCON sinalizar busy, o lock só sai pelo ciclo real.
    fallbackRelease = root.setTimeout(() => {
      const main = document.getElementById("analyze");
      if (main && main.disabled) return;
      release("no-busy-transition");
    }, 30000);
  }

  function onAnalyzeCapture(event) {
    const button = targetButton(event);
    if (!button) return;

    if (locked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      debug("duplicate-click-blocked", { button: button.id, trusted: Boolean(event.isTrusted) });
      return;
    }

    locked = true;
    sourceButton = button.id;
    startedAt = root.performance && typeof root.performance.now === "function" ? root.performance.now() : Date.now();
    debug("run-requested", { button: button.id, trusted: Boolean(event.isTrusted) });
    armFallback();
  }

  function observeBusyState() {
    const main = document.getElementById("analyze");
    if (!main || typeof MutationObserver !== "function") return;
    observer = new MutationObserver(() => {
      if (!locked) return;
      if (main.disabled) {
        busyObserved = true;
        clearFallback();
        debug("busy", { button: main.id });
        return;
      }
      if (busyObserved) release("busy-finished");
    });
    observer.observe(main, { attributes: true, attributeFilter: ["disabled"] });
  }

  function observeCacheCompletion() {
    const toast = document.getElementById("toast");
    if (!toast || typeof MutationObserver !== "function") return;
    const toastObserver = new MutationObserver(() => {
      if (!locked || busyObserved) return;
      const text = String(toast.textContent || "");
      if (/reaproveitada do cache local|cache inteligente aplicado/i.test(text)) release("smart-cache");
    });
    toastObserver.observe(toast, { childList: true, subtree: true, characterData: true });
  }

  function extensionLocation(value) {
    const text = String(value || "");
    return EXTENSION_SCHEMES.test(text) ? text : "";
  }

  function installExternalDiagnostics() {
    // Não chama preventDefault e não altera estado da análise. A finalidade é
    // apenas distinguir objetivamente erro do documento/página de erro injetado
    // por extensão do navegador.
    root.addEventListener("error", (event) => {
      const external = extensionLocation(event && event.filename);
      if (!external) return;
      debug("external-error", {
        source: external,
        message: String(event && event.message || "Erro de extensão do navegador"),
      });
    }, true);

    root.addEventListener("unhandledrejection", (event) => {
      const reason = event && event.reason;
      const stack = String(reason && (reason.stack || reason.message) || reason || "");
      const match = stack.match(/(?:chrome|moz|edge|safari-web)-extension:\/\/[^\s)]+/i);
      if (!match) return;
      debug("external-rejection", { source: match[0], message: String(reason && reason.message || reason || "") });
    });
  }

  function install() {
    if (installed) return;
    installed = true;
    // Captura no document roda antes dos listeners do botão, inclusive dos que
    // app.js já registrou. Assim o segundo clique é interrompido antes de chegar
    // a analyze(), sem remover ou duplicar listeners existentes.
    document.addEventListener("click", onAnalyzeCapture, true);
    observeBusyState();
    observeCacheCompletion();
    installExternalDiagnostics();
    debug("guard-ready", {});
  }

  root.GrconAnalyzeRuntimeGuard = Object.freeze({
    install,
    status() {
      return Object.freeze({ locked, busyObserved, sourceButton, installed });
    },
    releaseForTest: () => release("test"),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})(typeof globalThis !== "undefined" ? globalThis : window);
