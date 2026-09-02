(function (root) {
  "use strict";

  let protectedState = { version: 1, updatedAt: "", items: {} };
  let merging = false;
  let ready = false;

  function itemCount(state) {
    return Object.keys(state && state.items || {}).length;
  }

  function mergedState(previous, current) {
    const oldState = previous && typeof previous === "object" ? previous : {};
    const newState = current && typeof current === "object" ? current : {};
    return {
      version: Math.max(Number(oldState.version) || 1, Number(newState.version) || 1),
      updatedAt: newState.updatedAt || oldState.updatedAt || new Date().toISOString(),
      // Registros que saíram do Histórico deixam de aparecer na conferência,
      // porque as linhas da tela continuam sendo derivadas exclusivamente do
      // History.read(). A evidência histórica, porém, permanece preservada.
      items: { ...(oldState.items || {}), ...(newState.items || {}) },
    };
  }

  async function conference() {
    if (!root.GRCONModuleLoader) return null;
    await root.GRCONModuleLoader.ensure("posting_conference_core.js");
    return root.GrconPostingConference || null;
  }

  async function protectCurrentState() {
    try {
      const Conference = await conference();
      if (!Conference?.loadState) return;
      const current = await Conference.loadState();
      protectedState = mergedState(protectedState, current);
      ready = true;
    } catch (error) {
      console.debug("[PostingConferenceStateGuard] leitura:", error);
    }
  }

  async function restoreHistoricalState() {
    if (merging) return;
    merging = true;
    try {
      const Conference = await conference();
      if (!Conference?.loadState || !Conference?.saveState) return;
      const current = await Conference.loadState();
      const merged = mergedState(protectedState, current);
      if (itemCount(merged) !== itemCount(current)) await Conference.saveState(merged);
      protectedState = merged;
      ready = true;
    } catch (error) {
      console.debug("[PostingConferenceStateGuard] preservação:", error);
    } finally {
      merging = false;
    }
  }

  // Captura a memória antes da reconciliação disparada pela alteração do
  // Histórico. O bootstrap agenda essa reconciliação alguns milissegundos
  // depois, então o snapshot histórico já está protegido quando ela começa.
  root.addEventListener("grcon:history-updated", () => { void protectCurrentState(); });

  // Toda importação/reconciliação publica este evento. Se a nova fila ativa não
  // contiver uma eGRDT removida, reanexamos somente sua memória de confirmação;
  // nenhuma linha órfã volta à interface porque a UI continua usando o Histórico.
  root.addEventListener("grcon:conference-updated", () => { void restoreHistoricalState(); });

  async function init() {
    if (ready) return;
    await protectCurrentState();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { void init(); }, { once: true });
  else void init();

  root.GrconPostingConferenceStateGuard = Object.freeze({ protectCurrentState, restoreHistoricalState });
})(window);
