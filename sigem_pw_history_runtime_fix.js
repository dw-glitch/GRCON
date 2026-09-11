(function (root, factory) {
  const api = factory(
    root,
    root.GrconSigemPwHistory,
    root.GrconSigemPwDashboard,
    root.GrconSigemPwDashboardUi,
    root.GrconSigemPwHistoryUi,
    root.GrconSigemPwHistoryManagement
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwHistoryRuntimeFix = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, History, Dashboard, App, BaseHistoryUi, BaseManagement) {
  "use strict";

  const MANAGER_OVERLAY_ID = "spw-silent-history-manager";
  const CONFIRM_OVERLAY_ID = "spw-silent-history-confirm";
  const STYLE_ID = "spw-silent-history-style";
  const VALID_SYSTEMS = new Set(["sigem", "pw"]);
  const state = {
    installed: false,
    listenersInstalled: false,
    managerBound: false,
    managerOpen: false,
    pendingDeleteId: "",
    sourceIds: { sigem: new Set(), pw: new Set() },
    queue: Promise.resolve(),
    diagnostics: {
      importsSeen: 0,
      fingerprintChecks: 0,
      duplicateShortCircuits: 0,
      historyWrites: 0,
      historyRefreshes: 0,
      longTasks: 0,
      longTaskMs: 0,
      lastOperationMs: 0,
      maxOperationMs: 0,
    },
    longTaskObserver: null,
  };

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function nowMs() { return root.performance && typeof root.performance.now === "function" ? root.performance.now() : Date.now(); }
  function fmtDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
      : "—";
  }
  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error" && root.console) root.console.error(message);
  }

  function sourceArray(system) {
    const uiState = BaseHistoryUi && BaseHistoryUi.state;
    return system === "sigem" ? (uiState && uiState.sourceSigem || []) : (uiState && uiState.sourcePw || []);
  }

  function rebuildSourceIndex() {
    state.sourceIds.sigem = new Set(sourceArray("sigem").map((snapshot) => text(snapshot && snapshot.id)).filter(Boolean));
    state.sourceIds.pw = new Set(sourceArray("pw").map((snapshot) => text(snapshot && snapshot.id)).filter(Boolean));
  }

  function snapshotIdForImport(system, base) {
    if (!History || !VALID_SYSTEMS.has(system) || !base || !base.meta || !Array.isArray(base.records)) return "";
    state.diagnostics.fingerprintChecks += 1;
    return `${system}:${History.contentFingerprint(system, base.records)}`;
  }

  function duplicateResult(system, snapshotId) {
    const snapshot = sourceArray(system).find((item) => item && item.id === snapshotId) || null;
    return {
      [system]: { created: false, duplicate: true, snapshot },
      comparison: null,
      valid: true,
      alreadyRegistered: true,
      snapshotCreated: false,
      activeBasePreserved: true,
      silent: true,
    };
  }

  async function passiveRefresh() {
    if (!BaseHistoryUi || typeof BaseHistoryUi.refresh !== "function") return null;
    const result = await BaseHistoryUi.refresh();
    if (BaseHistoryUi.state) BaseHistoryUi.state.ready = true;
    rebuildSourceIndex();
    state.diagnostics.historyRefreshes += 1;
    return result;
  }

  async function recordImportedBase(system, reason) {
    if (!VALID_SYSTEMS.has(system)) return null;
    const operation = async () => {
      const started = nowMs();
      state.diagnostics.importsSeen += 1;
      const base = App && App.state && App.state[system];
      if (!base || !base.meta || !Array.isArray(base.records)) return null;
      rebuildSourceIndex();
      const snapshotId = snapshotIdForImport(system, base);
      if (!snapshotId) return null;

      if (state.sourceIds[system].has(snapshotId)) {
        state.diagnostics.duplicateShortCircuits += 1;
        const elapsed = nowMs() - started;
        state.diagnostics.lastOperationMs = elapsed;
        state.diagnostics.maxOperationMs = Math.max(state.diagnostics.maxOperationMs, elapsed);
        return duplicateResult(system, snapshotId);
      }

      // Fallback O(1) no IndexedDB para cobrir índice em memória desatualizado.
      const existing = History && typeof History.getSnapshot === "function"
        ? await History.getSnapshot(History.STORES.sourceSnapshots, snapshotId)
        : null;
      if (existing) {
        state.sourceIds[system].add(snapshotId);
        state.diagnostics.duplicateShortCircuits += 1;
        const elapsed = nowMs() - started;
        state.diagnostics.lastOperationMs = elapsed;
        state.diagnostics.maxOperationMs = Math.max(state.diagnostics.maxOperationMs, elapsed);
        return duplicateResult(system, snapshotId);
      }

      // Só bases realmente novas chegam ao motor histórico completo.
      const result = await History.recordActiveBases(App.state.sigem, App.state.pw, {
        recordedAt: new Date().toISOString(),
        reason: reason || "real-import",
        changedSystem: system,
      });
      state.diagnostics.historyWrites += 1;
      await passiveRefresh();

      // O payload completo só é capturado depois de uma importação real nova.
      // Nunca é capturado ao abrir Dashboard, renderizar, filtrar ou navegar.
      try {
        if (result && result[system] && result[system].created && BaseManagement && typeof BaseManagement.ensureCurrentPayloads === "function") {
          await BaseManagement.ensureCurrentPayloads();
        }
      } catch (error) {
        if (root.console && typeof root.console.warn === "function") console.warn("[SIGEM×PW][history] payload pós-importação:", error);
      }

      const elapsed = nowMs() - started;
      state.diagnostics.lastOperationMs = elapsed;
      state.diagnostics.maxOperationMs = Math.max(state.diagnostics.maxOperationMs, elapsed);
      return result;
    };

    const next = state.queue.then(operation, operation);
    state.queue = next.catch(() => null);
    return next;
  }

  function activeMeta(system) {
    const base = App && App.state && App.state[system];
    return base && base.meta || null;
  }

  function metaToken(meta) {
    if (!meta) return "";
    return [meta.importedAt, meta.fileName, meta.fileSize, meta.lastModified, meta.recordCount, meta.sourceRowCount, meta.version]
      .map(text).join("|");
  }

  function snapshotMetaToken(snapshot) {
    if (!snapshot) return "";
    return [snapshot.importedAt, snapshot.fileName, snapshot.fileSize, snapshot.lastModified, snapshot.metrics && snapshot.metrics.validRecords, snapshot.metrics && snapshot.metrics.rawRecords, snapshot.sourceVersion]
      .map(text).join("|");
  }

  function currentSnapshotIdFromMetadata(system, snapshots) {
    const meta = activeMeta(system);
    if (!meta) return "";
    const exactToken = metaToken(meta);
    const exact = (snapshots || []).find((snapshot) => snapshotMetaToken(snapshot) === exactToken);
    if (exact) return exact.id;
    const importedAt = text(meta.importedAt);
    const fileName = text(meta.fileName);
    const candidates = (snapshots || []).filter((snapshot) => text(snapshot.importedAt) === importedAt && text(snapshot.fileName) === fileName);
    return candidates.length ? candidates[candidates.length - 1].id : "";
  }

  function ensureStyle() {
    if (!root.document || root.document.getElementById(STYLE_ID)) return;
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${MANAGER_OVERLAY_ID}{position:fixed;inset:0;z-index:10040;display:flex;justify-content:flex-end;background:rgba(18,37,52,.42)}#${MANAGER_OVERLAY_ID}[hidden]{display:none}
      .spw-silent-manager{width:min(980px,96vw);height:100%;overflow:auto;background:var(--surface,#fff);box-shadow:-16px 0 44px rgba(20,40,60,.2);padding:18px}.spw-silent-manager-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid var(--border,#dce4eb)}.spw-silent-manager-head h3{margin:3px 0;color:var(--text-strong,#183247)}.spw-silent-manager-head p{margin:0;color:var(--text-muted,#66798a);font-size:.75rem;line-height:1.45}.spw-silent-close{width:36px;height:36px;border:0;border-radius:50%;background:var(--surface-soft,#eef3f6);font-size:1.2rem;cursor:pointer}.spw-silent-group{margin-top:14px}.spw-silent-group h4{margin:0 0 7px;color:var(--text-strong,#294258)}.spw-silent-table-wrap{overflow:auto;border:1px solid var(--border,#e1e7ec);border-radius:10px}.spw-silent-table{width:100%;border-collapse:collapse;font-size:.71rem}.spw-silent-table th,.spw-silent-table td{padding:9px 10px;border-bottom:1px solid var(--border,#edf1f4);text-align:left;vertical-align:middle}.spw-silent-table th{background:var(--surface-soft,#f6f9fb);font-size:.6rem;text-transform:uppercase;color:var(--text-muted,#66798a);white-space:nowrap}.spw-silent-table td.file{min-width:220px;max-width:340px;white-space:normal;overflow-wrap:anywhere}.spw-silent-state{display:inline-flex;padding:4px 7px;border-radius:999px;background:var(--surface-soft,#eef3f6);font-size:.63rem;font-weight:900}.spw-silent-state.current{background:rgba(63,143,104,.12);color:var(--success-700,#2f7253)}.spw-silent-remove{border:1px solid rgba(199,75,67,.35);border-radius:8px;background:var(--surface,#fff);color:var(--danger-700,#9d342f);padding:6px 9px;font-weight:900;cursor:pointer;white-space:nowrap}.spw-silent-remove:focus-visible{outline:2px solid rgba(199,75,67,.32);outline-offset:2px}.spw-silent-empty{padding:18px;text-align:center;color:var(--text-muted,#66798a)}
      #${CONFIRM_OVERLAY_ID}{position:fixed;inset:0;z-index:10060;display:grid;place-items:center;background:rgba(18,37,52,.5);padding:18px}#${CONFIRM_OVERLAY_ID}[hidden]{display:none}.spw-silent-confirm{width:min(560px,100%);padding:18px;border:1px solid var(--border,#dce4eb);border-radius:14px;background:var(--surface,#fff);box-shadow:0 20px 60px rgba(18,37,52,.24)}.spw-silent-confirm h4{margin:0;color:var(--text-strong,#183247)}.spw-silent-confirm p{color:var(--text-muted,#617486);font-size:.76rem;line-height:1.5}.spw-silent-confirm-file{font-weight:900;color:var(--text-strong,#294258);overflow-wrap:anywhere}.spw-silent-confirm-current{padding:9px 10px;border-left:4px solid var(--warning-500,#c68a28);border-radius:7px;background:var(--warning-50,#fff9ea);font-size:.72rem}.spw-silent-confirm-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.spw-silent-danger{border:0;border-radius:9px;background:var(--danger-600,#b5413a);color:#fff;min-height:38px;padding:8px 12px;font-weight:900;cursor:pointer}.spw-silent-danger:disabled{opacity:.55;cursor:wait}
      @media(max-width:680px){.spw-silent-manager{width:100vw;padding:14px}.spw-silent-manager-head{display:grid}.spw-silent-confirm-actions{display:grid;grid-template-columns:1fr}.spw-silent-confirm-actions button{width:100%}}
    `;
    root.document.head.appendChild(style);
  }

  function ensureManagerDom() {
    if (!root.document) return null;
    ensureStyle();
    let overlay = root.document.getElementById(MANAGER_OVERLAY_ID);
    if (!overlay) {
      overlay = root.document.createElement("div");
      overlay.id = MANAGER_OVERLAY_ID;
      overlay.hidden = true;
      overlay.innerHTML = `<aside class="spw-silent-manager" role="dialog" aria-modal="true" aria-labelledby="spw-silent-manager-title"><header class="spw-silent-manager-head"><div><span class="spw-kicker">HISTÓRICO DE BASES</span><h3 id="spw-silent-manager-title">Gerenciar histórico</h3><p>Remova somente a atualização escolhida. A base atual é identificada por metadados persistidos, sem recalcular fingerprint durante a abertura deste painel.</p></div><button type="button" class="spw-silent-close" id="spw-silent-manager-close" aria-label="Fechar">×</button></header><div id="spw-silent-manager-body"></div></aside>`;
      root.document.body.appendChild(overlay);
    }
    if (!root.document.getElementById(CONFIRM_OVERLAY_ID)) {
      const confirm = root.document.createElement("div");
      confirm.id = CONFIRM_OVERLAY_ID;
      confirm.hidden = true;
      confirm.innerHTML = `<div class="spw-silent-confirm" role="dialog" aria-modal="true" aria-labelledby="spw-silent-confirm-title"><h4 id="spw-silent-confirm-title">Remover esta atualização?</h4><div id="spw-silent-confirm-body"></div><div class="spw-silent-confirm-actions"><button type="button" class="secondary-button" id="spw-silent-confirm-cancel">Cancelar</button><button type="button" class="spw-silent-danger" id="spw-silent-confirm-remove">Remover</button></div></div>`;
      root.document.body.appendChild(confirm);
    }
    return overlay;
  }

  function sourceTable(snapshots, system, currentId) {
    if (!(snapshots || []).length) return `<div class="spw-silent-empty">Nenhuma atualização ${system === "sigem" ? "SIGEM" : "ProjectWise"} registrada.</div>`;
    const rows = snapshots.slice().reverse().map((snapshot) => {
      const current = snapshot.id === currentId;
      const metrics = snapshot.metrics || {};
      return `<tr><td>${esc(fmtDate(snapshot.importedAt))}</td><td class="file"><strong>${esc(snapshot.fileName || "—")}</strong></td><td>${fmt(metrics.comparableDocuments)}</td><td>${fmt(metrics.rawRecords)}</td><td title="${esc(snapshot.id)}">${esc(snapshot.fingerprint || snapshot.id)}</td><td><span class="spw-silent-state ${current ? "current" : ""}">${current ? "Base atual" : "Base histórica"}</span></td><td><button type="button" class="spw-silent-remove" data-spw-silent-remove="${esc(snapshot.id)}">Remover do histórico</button></td></tr>`;
    }).join("");
    return `<div class="spw-silent-table-wrap"><table class="spw-silent-table"><thead><tr><th>Importação</th><th>Arquivo</th><th>Documentos</th><th>Registros brutos</th><th>Fingerprint / ID</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function renderManager() {
    const body = root.document && root.document.getElementById("spw-silent-manager-body");
    if (!body || !History) return;
    body.innerHTML = `<div class="spw-silent-empty">Carregando metadados do histórico…</div>`;
    const [sigem, pw, comparisons] = await Promise.all([
      History.listSourceSnapshots("sigem"),
      History.listSourceSnapshots("pw"),
      History.listComparisonSnapshots(),
    ]);
    const currentSigem = currentSnapshotIdFromMetadata("sigem", sigem);
    const currentPw = currentSnapshotIdFromMetadata("pw", pw);
    body.innerHTML = `<section class="spw-silent-group"><h4>Bases SIGEM</h4>${sourceTable(sigem, "sigem", currentSigem)}</section><section class="spw-silent-group"><h4>Bases ProjectWise</h4>${sourceTable(pw, "pw", currentPw)}</section><section class="spw-silent-group"><div class="spw-history-manage-note">${fmt(comparisons.length)} comparativo(s) derivado(s). Ao excluir uma origem, o motor remove somente comparativos dependentes e repara referências históricas necessárias.</div></section>`;
  }

  async function openManager() {
    const overlay = ensureManagerDom();
    if (!overlay) return;
    state.managerOpen = true;
    overlay.hidden = false;
    await renderManager();
    root.document.getElementById("spw-silent-manager-close")?.focus();
  }

  function closeManager() {
    const overlay = root.document && root.document.getElementById(MANAGER_OVERLAY_ID);
    if (overlay) overlay.hidden = true;
    state.managerOpen = false;
  }

  async function askRemove(snapshotId) {
    if (!History || !root.document) return;
    const sources = [
      ...(await History.listSourceSnapshots("sigem")),
      ...(await History.listSourceSnapshots("pw")),
    ];
    const snapshot = sources.find((item) => item && item.id === snapshotId);
    if (!snapshot) return notify("A atualização selecionada não existe mais no histórico.", "info");
    const sameSystem = snapshot.system === "sigem" ? sources.filter((item) => item.system === "sigem") : sources.filter((item) => item.system === "pw");
    const currentId = currentSnapshotIdFromMetadata(snapshot.system, sameSystem);
    const current = snapshot.id === currentId;
    state.pendingDeleteId = snapshot.id;
    const body = root.document.getElementById("spw-silent-confirm-body");
    if (body) body.innerHTML = `<p class="spw-silent-confirm-file">${esc(snapshot.fileName || snapshot.id)}</p><p>Importada em ${esc(fmtDate(snapshot.importedAt))}. Esta atualização será removida do histórico do Dashboard SIGEM × PW.</p>${current ? `<div class="spw-silent-confirm-current"><strong>Esta é a base atualmente utilizada pelo Dashboard.</strong><br>Se houver uma versão anterior recuperável do mesmo sistema, ela será promovida automaticamente. Caso contrário, a fonte ficará como não carregada.</div>` : ""}`;
    const confirm = root.document.getElementById(CONFIRM_OVERLAY_ID);
    if (confirm) confirm.hidden = false;
    root.document.getElementById("spw-silent-confirm-cancel")?.focus();
  }

  function cancelRemove() {
    state.pendingDeleteId = "";
    const confirm = root.document && root.document.getElementById(CONFIRM_OVERLAY_ID);
    if (confirm) confirm.hidden = true;
  }

  async function confirmRemove() {
    const id = state.pendingDeleteId;
    if (!id || !BaseManagement || typeof BaseManagement.removeSourceSnapshot !== "function") return;
    const button = root.document && root.document.getElementById("spw-silent-confirm-remove");
    if (button) button.disabled = true;
    try {
      await BaseManagement.removeSourceSnapshot(id);
      cancelRemove();
      await passiveRefresh();
      await renderManager();
      notify("Base removida do histórico.", "success");
    } catch (error) {
      notify(error && error.message || "Não foi possível remover a base do histórico.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function bindManagerButton() {
    if (!root.document) return;
    const legacy = root.document.getElementById("spw-history-clear");
    const existing = root.document.getElementById("spw-history-manage");
    const button = existing || legacy;
    if (!button) return;
    if (legacy) legacy.id = "spw-history-manage";
    button.textContent = "Gerenciar histórico";
    button.setAttribute("aria-haspopup", "dialog");
    if (button.dataset.spwSilentHistoryBound === "1") return;
    button.dataset.spwSilentHistoryBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openManager();
    });
  }

  function installManagerEvents() {
    if (!root.document || state.managerBound) return;
    state.managerBound = true;
    root.document.addEventListener("click", (event) => {
      const remove = event.target && event.target.closest ? event.target.closest("[data-spw-silent-remove]") : null;
      if (remove) { void askRemove(remove.getAttribute("data-spw-silent-remove")); return; }
      if (event.target && event.target.closest && event.target.closest("#spw-silent-manager-close")) { closeManager(); return; }
      if (event.target && event.target.closest && event.target.closest("#spw-silent-confirm-cancel")) { cancelRemove(); return; }
      if (event.target && event.target.closest && event.target.closest("#spw-silent-confirm-remove")) { void confirmRemove(); }
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const confirm = root.document.getElementById(CONFIRM_OVERLAY_ID);
      if (confirm && !confirm.hidden) cancelRemove();
      else if (state.managerOpen) closeManager();
    });
  }

  function installLongTaskObserver() {
    if (state.longTaskObserver || typeof root.PerformanceObserver !== "function") return;
    try {
      const observer = new root.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.diagnostics.longTasks += 1;
          state.diagnostics.longTaskMs += Number(entry.duration || 0);
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      state.longTaskObserver = observer;
    } catch (_) { /* longtask não suportado */ }
  }

  function installImportListeners() {
    if (state.listenersInstalled || !root.addEventListener) return;
    state.listenersInstalled = true;
    root.addEventListener("grcon:conference-updated", () => { void recordImportedBase("sigem", "conference-import"); });
    root.addEventListener("grcon:pw-base-updated", () => { void recordImportedBase("pw", "pw-import"); });
  }

  async function activateHistory() {
    installImportListeners();
    installLongTaskObserver();
    await passiveRefresh();
    return true;
  }

  async function activateManager() {
    ensureManagerDom();
    bindManagerButton();
    installManagerEvents();
    return true;
  }

  function install() {
    if (state.installed || !History || !App || !BaseHistoryUi || !BaseManagement) return false;
    state.installed = true;

    root.GrconSigemPwHistoryUi = Object.freeze({
      activate: activateHistory,
      refresh: passiveRefresh,
      recordCurrent: (reason, changedSystem) => VALID_SYSTEMS.has(changedSystem) ? recordImportedBase(changedSystem, reason) : Promise.resolve(null),
      state: BaseHistoryUi.state,
    });

    root.GrconSigemPwHistoryManagement = Object.freeze({
      ...BaseManagement,
      activate: activateManager,
      openManager,
      closeManager,
    });
    return true;
  }

  install();

  return Object.freeze({
    state,
    install,
    passiveRefresh,
    recordImportedBase,
    snapshotIdForImport,
    currentSnapshotIdFromMetadata,
    openManager,
    closeManager,
    renderManager,
  });
});
