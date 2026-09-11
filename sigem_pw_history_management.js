(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(
    root,
    root.GrconSigemPwHistory || safeRequire("./sigem_pw_history_core.js"),
    root.GrconSigemPwDashboard || safeRequire("./sigem_pw_dashboard_core.js")
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwHistoryManagement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, History, Dashboard) {
  "use strict";

  const STYLE_ID = "spw-history-management-style";
  const OVERLAY_ID = "spw-history-manage-overlay";
  const CONFIRM_ID = "spw-history-delete-confirm";
  const PAYLOAD_PREFIX = "sourcePayload:";
  const SUPPRESS_PAIR_KEY = "historyManagement:suppressedComparisonPair";
  const state = {
    installed: false,
    open: false,
    busy: false,
    generation: 0,
    pending: null,
    lastResult: null,
  };

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function fmtDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
      : "—";
  }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) { /* JSON fallback */ }
    }
    return JSON.parse(JSON.stringify(value));
  }
  function App() { return root.GrconSigemPwDashboardUi; }
  function HistoryUi() { return root.GrconSigemPwHistoryUi; }
  function RevisionUi() { return root.GrconSigemPwRevisionUi; }
  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error" && root.console) root.console.error(message);
  }
  function timeOf(snapshot) { return Date.parse(snapshot && (snapshot.importedAt || snapshot.recordedAt) || 0) || 0; }
  function payloadKey(snapshotId) { return `${PAYLOAD_PREFIX}${snapshotId}`; }
  function sourceId(system, base) {
    if (!History || !base || !base.meta || !Array.isArray(base.records)) return "";
    return `${system}:${History.contentFingerprint(system, base.records)}`;
  }
  function activeSourceId(system) { return sourceId(system, App() && App().state && App().state[system]); }
  function pairKey(sigemId, pwId) { return sigemId && pwId ? `${sigemId}::${pwId}` : ""; }
  function activePairKey() { return pairKey(activeSourceId("sigem"), activeSourceId("pw")); }

  function previousSnapshot(snapshots, currentId) {
    const ordered = (snapshots || []).slice().sort((a, b) => timeOf(a) - timeOf(b));
    const index = ordered.findIndex((item) => item && item.id === currentId);
    if (index > 0) return ordered[index - 1];
    if (index === 0) return null;
    const remaining = ordered.filter((item) => item && item.id !== currentId);
    return remaining.length ? remaining[remaining.length - 1] : null;
  }

  function dependentComparisonIds(comparisons, sourceSnapshotId) {
    return (comparisons || [])
      .filter((snapshot) => snapshot && (snapshot.sigemSnapshotId === sourceSnapshotId || snapshot.pwSnapshotId === sourceSnapshotId))
      .map((snapshot) => snapshot.id);
  }

  function repairDeltaSnapshots(snapshots, removedIds) {
    const removed = removedIds instanceof Set ? removedIds : new Set(removedIds || []);
    const updates = [];
    for (const snapshot of snapshots || []) {
      const previousId = snapshot && snapshot.delta && snapshot.delta.previousSnapshotId;
      if (!previousId || !removed.has(previousId)) continue;
      updates.push({ ...snapshot, delta: null });
    }
    return updates;
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha em operação IndexedDB do histórico SIGEM × PW."));
    });
  }
  function transactionDone(tx, message) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error(message || "Falha na atualização atômica do histórico SIGEM × PW."));
      tx.onabort = () => reject(tx.error || new Error(message || "A atualização do histórico SIGEM × PW foi cancelada."));
    });
  }
  async function withDb(callback) {
    if (!History || typeof History.openDb !== "function") throw new Error("Histórico SIGEM × PW indisponível.");
    const db = await History.openDb();
    try { return await callback(db); } finally { try { db.close(); } catch (_) { /* noop */ } }
  }
  async function readMeta(key, fallback) {
    return withDb(async (db) => {
      const tx = db.transaction(History.STORES.meta, "readonly");
      const record = await requestValue(tx.objectStore(History.STORES.meta).get(key));
      return record && Object.prototype.hasOwnProperty.call(record, "value") ? record.value : fallback;
    });
  }
  async function writeMeta(key, value) {
    return withDb(async (db) => {
      const tx = db.transaction(History.STORES.meta, "readwrite");
      tx.objectStore(History.STORES.meta).put({ key, value, updatedAt: new Date().toISOString() });
      await transactionDone(tx, "Falha ao salvar metadado do histórico.");
      return value;
    });
  }
  async function deleteMeta(key) {
    return withDb(async (db) => {
      const tx = db.transaction(History.STORES.meta, "readwrite");
      tx.objectStore(History.STORES.meta).delete(key);
      await transactionDone(tx, "Falha ao remover metadado do histórico.");
      return true;
    });
  }
  async function listWorkingSets() {
    return withDb(async (db) => {
      const tx = db.transaction(History.STORES.workingSets, "readonly");
      return (await requestValue(tx.objectStore(History.STORES.workingSets).getAll())) || [];
    });
  }

  async function waitHistoryIdle() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!(HistoryUi() && HistoryUi().state && HistoryUi().state.syncing)) return;
      await new Promise((resolve) => root.setTimeout(resolve, 50));
    }
  }

  async function ensurePayload(system) {
    const app = App();
    const base = app && app.state && app.state[system];
    if (!base || !base.meta || !Array.isArray(base.records)) return null;
    const id = sourceId(system, base);
    if (!id) return null;
    const snapshot = await History.getSnapshot(History.STORES.sourceSnapshots, id);
    if (!snapshot) return null;
    const existing = await readMeta(payloadKey(id), null);
    if (existing && existing.snapshotId === id && Array.isArray(existing.records)) return existing;
    const model = app.state.model || Dashboard.createModel(app.state.sigem?.records || [], app.state.pw?.records || []);
    const documents = History.minimalDocuments(system, model);
    const payload = {
      snapshotId: id,
      system,
      meta: clone(base.meta),
      records: clone(base.records),
      documents: clone(documents),
      capturedAt: new Date().toISOString(),
    };
    await writeMeta(payloadKey(id), payload);
    return payload;
  }

  async function ensureCurrentPayloads() {
    await waitHistoryIdle();
    const output = {};
    for (const system of ["sigem", "pw"]) {
      try { output[system] = await ensurePayload(system); }
      catch (error) { console.warn(`[SIGEM×PW][history-management] payload ${system}:`, error); output[system] = null; }
    }
    return output;
  }

  async function clearSuppressionAfterRealImport() {
    const suppressed = await readMeta(SUPPRESS_PAIR_KEY, "");
    if (suppressed) await deleteMeta(SUPPRESS_PAIR_KEY);
  }

  async function writeActiveBase(system, base) {
    if (!Dashboard || typeof Dashboard.kvSet !== "function") throw new Error("Persistência da base ativa SIGEM × PW indisponível.");
    const key = system === "sigem" ? Dashboard.SIGEM_BASE_KEY : Dashboard.PW_BASE_KEY;
    const safeBase = base && base.meta && Array.isArray(base.records) ? base : { meta: null, records: [] };
    await Dashboard.kvSet(key, safeBase);
    return safeBase;
  }

  async function atomicDeleteSource(snapshot, options) {
    const system = snapshot.system;
    const sourceSnapshots = await History.listSourceSnapshots(system);
    const comparisons = await History.listComparisonSnapshots();
    const workingSets = await listWorkingSets();
    const dependentIds = dependentComparisonIds(comparisons, snapshot.id);
    const dependentSet = new Set(dependentIds);
    const remainingSource = sourceSnapshots.filter((item) => item.id !== snapshot.id);
    const remainingComparisons = comparisons.filter((item) => !dependentSet.has(item.id));
    const sourceRepairs = repairDeltaSnapshots(remainingSource, new Set([snapshot.id]));
    const comparisonRepairs = repairDeltaSnapshots(remainingComparisons, dependentSet);
    const promotion = options && options.promotion;
    const suppressPair = text(options && options.suppressPair);
    const updateSuppression = Boolean(options && options.updateSuppression);

    await withDb(async (db) => {
      const storeNames = [
        History.STORES.sourceSnapshots,
        History.STORES.comparisonSnapshots,
        History.STORES.workingSets,
        History.STORES.snapshotChanges,
        History.STORES.meta,
      ];
      const tx = db.transaction(storeNames, "readwrite");
      const sourceStore = tx.objectStore(History.STORES.sourceSnapshots);
      const comparisonStore = tx.objectStore(History.STORES.comparisonSnapshots);
      const workingStore = tx.objectStore(History.STORES.workingSets);
      const changesStore = tx.objectStore(History.STORES.snapshotChanges);
      const metaStore = tx.objectStore(History.STORES.meta);

      sourceStore.delete(snapshot.id);
      changesStore.delete(snapshot.id);
      metaStore.delete(payloadKey(snapshot.id));

      dependentIds.forEach((id) => {
        comparisonStore.delete(id);
        changesStore.delete(id);
      });
      sourceRepairs.forEach((item) => { sourceStore.put(item); changesStore.delete(item.id); });
      comparisonRepairs.forEach((item) => { comparisonStore.put(item); changesStore.delete(item.id); });

      const sourceWorkingKey = History.WORKING_KEYS[system];
      const sourceWorking = workingSets.find((item) => item.key === sourceWorkingKey);
      if (sourceWorking && sourceWorking.snapshotId === snapshot.id) {
        if (promotion && promotion.snapshot && promotion.payload) {
          workingStore.put({ key: sourceWorkingKey, snapshotId: promotion.snapshot.id, documents: promotion.payload.documents || [] });
        } else workingStore.delete(sourceWorkingKey);
      }
      const comparisonWorking = workingSets.find((item) => item.key === History.WORKING_KEYS.comparison);
      if (comparisonWorking && dependentSet.has(comparisonWorking.snapshotId)) workingStore.delete(History.WORKING_KEYS.comparison);

      if (updateSuppression) {
        if (suppressPair) metaStore.put({ key: SUPPRESS_PAIR_KEY, value: suppressPair, updatedAt: new Date().toISOString() });
        else metaStore.delete(SUPPRESS_PAIR_KEY);
      }

      await transactionDone(tx, "Não foi possível remover a atualização de forma consistente. Nenhum ponto histórico foi parcialmente apagado.");
    });

    return {
      removedSourceId: snapshot.id,
      removedComparisonIds: dependentIds,
      repairedSourceIds: sourceRepairs.map((item) => item.id),
      repairedComparisonIds: comparisonRepairs.map((item) => item.id),
    };
  }

  async function buildDeletionContext(snapshot) {
    const sameSystem = await History.listSourceSnapshots(snapshot.system);
    const isCurrent = activeSourceId(snapshot.system) === snapshot.id;
    const previous = isCurrent ? previousSnapshot(sameSystem, snapshot.id) : null;
    const previousPayload = previous ? await readMeta(payloadKey(previous.id), null) : null;
    const promotable = Boolean(previous && previousPayload && Array.isArray(previousPayload.records));
    return { snapshot, isCurrent, previous, previousPayload, promotable };
  }

  async function removeSourceSnapshot(snapshotId) {
    if (state.busy) throw new Error("Já existe uma exclusão em andamento.");
    const allSources = [
      ...(await History.listSourceSnapshots("sigem")),
      ...(await History.listSourceSnapshots("pw")),
    ];
    const snapshot = allSources.find((item) => item.id === snapshotId);
    if (!snapshot) throw new Error("A atualização selecionada não existe mais no histórico.");
    const context = await buildDeletionContext(snapshot);
    const oldBase = clone(App() && App().state && App().state[snapshot.system]);
    let targetBase = null;
    let promotion = null;
    if (context.isCurrent && context.promotable) {
      targetBase = { meta: clone(context.previousPayload.meta), records: clone(context.previousPayload.records) };
      promotion = { snapshot: context.previous, payload: context.previousPayload };
    }

    const comparisons = await History.listComparisonSnapshots();
    const dependentSet = new Set(dependentComparisonIds(comparisons, snapshot.id));
    const remainingComparisons = comparisons.filter((item) => !dependentSet.has(item.id));
    const nextSigemId = snapshot.system === "sigem"
      ? (context.isCurrent && promotion ? promotion.snapshot.id : context.isCurrent ? "" : activeSourceId("sigem"))
      : activeSourceId("sigem");
    const nextPwId = snapshot.system === "pw"
      ? (context.isCurrent && promotion ? promotion.snapshot.id : context.isCurrent ? "" : activeSourceId("pw"))
      : activeSourceId("pw");
    const nextPair = pairKey(nextSigemId, nextPwId);
    const pairAlreadyHistorical = nextPair && remainingComparisons.some((item) => item.sigemSnapshotId === nextSigemId && item.pwSnapshotId === nextPwId);
    const suppressPair = context.isCurrent && nextPair && !pairAlreadyHistorical ? nextPair : "";

    state.busy = true;
    const generation = ++state.generation;
    try {
      if (context.isCurrent) await writeActiveBase(snapshot.system, targetBase);
      try {
        state.lastResult = await atomicDeleteSource(snapshot, {
          promotion,
          suppressPair,
          updateSuppression: context.isCurrent,
        });
      } catch (error) {
        if (context.isCurrent) {
          try { await writeActiveBase(snapshot.system, oldBase); }
          catch (rollbackError) { console.error("[SIGEM×PW][history-management] rollback da base ativa:", rollbackError); }
        }
        throw error;
      }

      if (generation === state.generation) {
        if (App() && typeof App().refresh === "function") await App().refresh("histórico removido");
        if (RevisionUi() && typeof RevisionUi().refresh === "function") await RevisionUi().refresh();
        if (HistoryUi() && typeof HistoryUi().refresh === "function") await HistoryUi().refresh();
      }
      return { ...state.lastResult, context, promoted: Boolean(promotion), activeCleared: context.isCurrent && !promotion };
    } finally {
      state.busy = false;
    }
  }

  function ensureStyle() {
    if (!root.document || root.document.getElementById(STYLE_ID)) return;
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:10040;display:flex;justify-content:flex-end;background:rgba(18,37,52,.42)}#${OVERLAY_ID}[hidden]{display:none}
      .spw-history-manage-drawer{width:min(940px,96vw);height:100%;overflow:auto;background:var(--surface,#fff);box-shadow:-16px 0 44px rgba(20,40,60,.2);padding:18px}.spw-history-manage-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding-bottom:13px;border-bottom:1px solid var(--border,#dce4eb)}.spw-history-manage-head h3{margin:3px 0;color:var(--text-strong,#183247)}.spw-history-manage-head p{margin:0;max-width:720px;color:var(--text-muted,#66798a);font-size:.76rem;line-height:1.45}.spw-history-manage-close{width:36px;height:36px;border:0;border-radius:50%;background:var(--surface-soft,#eef3f6);font-size:1.2rem;cursor:pointer}
      .spw-history-manage-note{margin:12px 0;padding:10px 11px;border:1px solid var(--border,#dce4eb);border-radius:10px;background:var(--surface-soft,#f7fafc);color:var(--text-muted,#617486);font-size:.72rem;line-height:1.45}.spw-history-manage-group{margin-top:14px}.spw-history-manage-group h4{margin:0 0 7px;color:var(--text-strong,#294258);font-size:.86rem}.spw-history-manage-table-wrap{max-width:100%;overflow:auto;border:1px solid var(--border,#e1e7ec);border-radius:10px}.spw-history-manage-table{width:100%;border-collapse:collapse;font-size:.72rem}.spw-history-manage-table th,.spw-history-manage-table td{padding:9px 10px;border-bottom:1px solid var(--border,#edf1f4);text-align:left;vertical-align:middle}.spw-history-manage-table thead th{background:var(--surface-soft,#f6f9fb);font-size:.61rem;text-transform:uppercase;color:var(--text-muted,#66798a);white-space:nowrap}.spw-history-manage-table td.file{min-width:220px;max-width:360px;white-space:normal;overflow-wrap:anywhere}.spw-history-manage-table td.actions{text-align:right;white-space:nowrap}.spw-history-state{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:var(--surface-soft,#eef3f6);font-size:.64rem;font-weight:900}.spw-history-state.current{background:rgba(63,143,104,.12);color:var(--success-700,#2f7253)}.spw-history-remove{border:1px solid color-mix(in srgb,var(--danger-500,#c74b43) 40%,var(--border,#dce4eb));border-radius:8px;background:var(--surface,#fff);color:var(--danger-700,#9d342f);min-height:32px;padding:5px 9px;font-weight:900;cursor:pointer}.spw-history-remove:hover,.spw-history-remove:focus-visible{background:rgba(199,75,67,.08);outline:2px solid rgba(199,75,67,.28);outline-offset:2px}.spw-history-manage-empty{padding:18px;text-align:center;color:var(--text-muted,#66798a)}
      #${CONFIRM_ID}{position:fixed;inset:0;z-index:10060;display:grid;place-items:center;background:rgba(18,37,52,.5);padding:18px}#${CONFIRM_ID}[hidden]{display:none}.spw-history-confirm-card{width:min(560px,100%);padding:18px;border:1px solid var(--border,#dce4eb);border-radius:14px;background:var(--surface,#fff);box-shadow:0 20px 60px rgba(18,37,52,.24)}.spw-history-confirm-card h4{margin:0;color:var(--text-strong,#183247);font-size:1rem}.spw-history-confirm-file{margin:10px 0 0;font-weight:900;color:var(--text-strong,#294258);overflow-wrap:anywhere}.spw-history-confirm-card p{margin:8px 0 0;color:var(--text-muted,#617486);font-size:.76rem;line-height:1.5}.spw-history-confirm-current{margin-top:10px;padding:9px 10px;border-left:4px solid var(--warning-500,#c68a28);border-radius:7px;background:var(--warning-50,#fff9ea);font-size:.72rem;line-height:1.45}.spw-history-confirm-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px}.spw-history-danger{border:0;border-radius:9px;background:var(--danger-600,#b5413a);color:#fff;min-height:38px;padding:8px 12px;font-weight:900;cursor:pointer}.spw-history-danger:disabled{opacity:.55;cursor:wait}
      @media(max-width:680px){.spw-history-manage-drawer{width:100vw;padding:14px}.spw-history-manage-head{display:grid}.spw-history-confirm-actions{display:grid;grid-template-columns:1fr}.spw-history-confirm-actions button{width:100%}}
    `;
    root.document.head.appendChild(style);
  }

  function ensureUi() {
    if (!root.document) return null;
    ensureStyle();
    const host = root.document.getElementById("sigem-pw-dashboard-module");
    if (!host) return null;
    const legacyButton = root.document.getElementById("spw-history-clear");
    if (legacyButton) {
      legacyButton.id = "spw-history-manage";
      legacyButton.textContent = "Gerenciar histórico";
      legacyButton.setAttribute("aria-haspopup", "dialog");
    }
    if (!root.document.getElementById(OVERLAY_ID)) {
      const overlay = root.document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.hidden = true;
      overlay.innerHTML = `<aside class="spw-history-manage-drawer" role="dialog" aria-modal="true" aria-labelledby="spw-history-manage-title"><header class="spw-history-manage-head"><div><span class="spw-kicker">HISTÓRICO DAS BASES</span><h3 id="spw-history-manage-title">Gerenciar histórico</h3><p>Remova somente a atualização escolhida. SIGEM e ProjectWise são fontes independentes; comparativos derivados que perderem uma fonte são removidos automaticamente.</p></div><button class="spw-history-manage-close" id="spw-history-manage-close" type="button" aria-label="Fechar">×</button></header><div class="spw-history-manage-note" id="spw-history-manage-note">A lista usa apenas metadados dos snapshots. O conteúdo completo de uma base é lido somente quando for necessário promover uma versão anterior.</div><div id="spw-history-manage-body"></div></aside>`;
      host.appendChild(overlay);
    }
    if (!root.document.getElementById(CONFIRM_ID)) {
      const confirm = root.document.createElement("div");
      confirm.id = CONFIRM_ID;
      confirm.hidden = true;
      confirm.innerHTML = `<section class="spw-history-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="spw-history-confirm-title"><h4 id="spw-history-confirm-title">Remover esta atualização?</h4><div class="spw-history-confirm-file" id="spw-history-confirm-file"></div><p id="spw-history-confirm-meta"></p><div class="spw-history-confirm-current" id="spw-history-confirm-current" hidden></div><p>Essa atualização será removida do histórico do Dashboard SIGEM × PW. Arquivos originais no computador não serão alterados.</p><div class="spw-history-confirm-actions"><button class="secondary-button" id="spw-history-confirm-cancel" type="button">Cancelar</button><button class="spw-history-danger" id="spw-history-confirm-remove" type="button">Remover do histórico</button></div></section>`;
      host.appendChild(confirm);
    }
    bindUi(host);
    return host;
  }

  function sourceRows(snapshots, system) {
    const currentId = activeSourceId(system);
    if (!(snapshots || []).length) return `<div class="spw-history-manage-empty">Nenhuma atualização ${system === "sigem" ? "SIGEM" : "ProjectWise"} registrada.</div>`;
    const rows = snapshots.slice().reverse().map((snapshot) => {
      const current = snapshot.id === currentId;
      const docs = snapshot.metrics && snapshot.metrics.comparableDocuments;
      return `<tr><td>${esc(fmtDate(snapshot.importedAt))}</td><td class="file"><strong>${esc(snapshot.fileName || (system === "sigem" ? "Consulta Geral" : "Base PW"))}</strong></td><td>${fmt(docs)}</td><td><span class="spw-history-state ${current ? "current" : "historical"}">${current ? "Base atual" : "Base histórica"}</span></td><td class="actions"><button type="button" class="spw-history-remove" data-spw-remove-source="${esc(snapshot.id)}">Remover do histórico</button></td></tr>`;
    }).join("");
    return `<div class="spw-history-manage-table-wrap"><table class="spw-history-manage-table"><thead><tr><th>Importada em</th><th>Arquivo</th><th>Documentos</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function renderManager() {
    const body = root.document && root.document.getElementById("spw-history-manage-body");
    if (!body) return;
    const [sigem, pw, comparisons] = await Promise.all([
      History.listSourceSnapshots("sigem"),
      History.listSourceSnapshots("pw"),
      History.listComparisonSnapshots(),
    ]);
    body.innerHTML = `<section class="spw-history-manage-group"><h4>SIGEM</h4>${sourceRows(sigem, "sigem")}</section><section class="spw-history-manage-group"><h4>ProjectWise</h4>${sourceRows(pw, "pw")}</section><section class="spw-history-manage-group"><h4>Comparativos derivados</h4><div class="spw-history-manage-note">${fmt(comparisons.length)} comparativo(s). Eles não são bases independentes: quando uma fonte SIGEM/PW é removida, somente os comparativos que dependem diretamente dela são excluídos, evitando referências órfãs.</div></section>`;
  }

  async function openManager() {
    ensureUi();
    await waitHistoryIdle();
    await renderManager();
    const overlay = root.document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.hidden = false;
      state.open = true;
      root.setTimeout(() => root.document.getElementById("spw-history-manage-close")?.focus(), 0);
    }
  }
  function closeManager() {
    const overlay = root.document && root.document.getElementById(OVERLAY_ID);
    if (overlay) overlay.hidden = true;
    state.open = false;
    state.pending = null;
    closeConfirmation();
  }
  function closeConfirmation() {
    const confirm = root.document && root.document.getElementById(CONFIRM_ID);
    if (confirm) confirm.hidden = true;
  }

  async function promptDelete(snapshotId) {
    const all = [
      ...(await History.listSourceSnapshots("sigem")),
      ...(await History.listSourceSnapshots("pw")),
    ];
    const snapshot = all.find((item) => item.id === snapshotId);
    if (!snapshot) { notify("A atualização selecionada não existe mais no histórico.", "warning"); await renderManager(); return; }
    const context = await buildDeletionContext(snapshot);
    state.pending = context;
    root.document.getElementById("spw-history-confirm-file").textContent = snapshot.fileName || (snapshot.system === "sigem" ? "Consulta Geral" : "Base ProjectWise");
    root.document.getElementById("spw-history-confirm-meta").textContent = `Importada em: ${fmtDate(snapshot.importedAt)} · ${fmt(snapshot.metrics?.comparableDocuments)} documento(s) comparável(is).`;
    const current = root.document.getElementById("spw-history-confirm-current");
    if (context.isCurrent) {
      current.hidden = false;
      current.innerHTML = context.promotable
        ? `Esta é a base atualmente utilizada pelo Dashboard. Ao removê-la, <strong>${esc(context.previous.fileName || "a versão anterior")}</strong> (${esc(fmtDate(context.previous.importedAt))}) passará a ser a base atual.`
        : `Esta é a base atualmente utilizada pelo Dashboard. Não há uma versão anterior com conteúdo recuperável para promoção segura; após a remoção, <strong>Base ${snapshot.system === "sigem" ? "SIGEM" : "PW"} não carregada</strong> será exibido.`;
    } else {
      current.hidden = false;
      current.innerHTML = "Esta é uma base histórica. A base atual permanecerá intacta.";
    }
    const confirm = root.document.getElementById(CONFIRM_ID);
    confirm.hidden = false;
    root.setTimeout(() => root.document.getElementById("spw-history-confirm-cancel")?.focus(), 0);
  }

  async function confirmDelete() {
    const pending = state.pending;
    if (!pending || state.busy) return;
    const button = root.document.getElementById("spw-history-confirm-remove");
    if (button) { button.disabled = true; button.textContent = "Removendo…"; }
    try {
      const result = await removeSourceSnapshot(pending.snapshot.id);
      state.pending = null;
      closeConfirmation();
      await renderManager();
      const suffix = result.promoted
        ? " A versão anterior passou a ser a base atual."
        : result.activeCleared
          ? ` A base ${pending.snapshot.system === "sigem" ? "SIGEM" : "PW"} ficou não carregada.`
          : "";
      notify(`Atualização removida do histórico.${suffix}`, "success");
    } catch (error) {
      console.error("[SIGEM×PW][history-management] exclusão:", error);
      notify(error.message || "Não foi possível remover a atualização. O histórico foi preservado.", "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Remover do histórico"; }
    }
  }

  function bindUi(host) {
    if (!host || host.dataset.spwHistoryManagementBound === "1") return;
    host.dataset.spwHistoryManagementBound = "1";
    host.addEventListener("click", (event) => {
      if (event.target.closest("#spw-history-manage")) { void openManager(); return; }
      if (event.target.closest("#spw-history-manage-close")) { closeManager(); return; }
      const remove = event.target.closest("[data-spw-remove-source]");
      if (remove) { void promptDelete(remove.getAttribute("data-spw-remove-source")); return; }
      if (event.target.closest("#spw-history-confirm-cancel")) { closeConfirmation(); state.pending = null; return; }
      if (event.target.closest("#spw-history-confirm-remove")) void confirmDelete();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const confirm = root.document.getElementById(CONFIRM_ID);
      if (confirm && !confirm.hidden) { closeConfirmation(); state.pending = null; return; }
      if (state.open) closeManager();
    });
  }

  function installHistoryActivateGuard() {
    const ui = HistoryUi();
    if (!ui || ui.__spwHistoryManagementWrapped) return;
    const originalActivate = ui.activate.bind(ui);
    const originalRefresh = ui.refresh.bind(ui);
    const wrapped = {
      ...ui,
      async activate() {
        const suppressed = await readMeta(SUPPRESS_PAIR_KEY, "");
        const currentPair = activePairKey();
        if (suppressed && currentPair && suppressed === currentPair) {
          await originalRefresh();
          return;
        }
        return originalActivate();
      },
    };
    Object.defineProperty(wrapped, "__spwHistoryManagementWrapped", { value: true });
    root.GrconSigemPwHistoryUi = Object.freeze(wrapped);
  }

  async function onRealBaseUpdate() {
    try {
      await waitHistoryIdle();
      await clearSuppressionAfterRealImport();
      await ensureCurrentPayloads();
      if (state.open) await renderManager();
    } catch (error) { console.warn("[SIGEM×PW][history-management] pós-importação:", error); }
  }

  function installEventBridges() {
    if (!root.addEventListener || state.eventsInstalled) return;
    state.eventsInstalled = true;
    root.addEventListener("grcon:conference-updated", () => { void onRealBaseUpdate(); });
    root.addEventListener("grcon:pw-base-updated", () => { void onRealBaseUpdate(); });
  }

  async function activate() {
    installHistoryActivateGuard();
    ensureUi();
    installEventBridges();
    await ensureCurrentPayloads();
    if (state.open) await renderManager();
    state.installed = true;
  }

  installHistoryActivateGuard();
  installEventBridges();

  return Object.freeze({
    PAYLOAD_PREFIX,
    SUPPRESS_PAIR_KEY,
    state,
    previousSnapshot,
    dependentComparisonIds,
    repairDeltaSnapshots,
    sourceId,
    activeSourceId,
    activePairKey,
    ensureCurrentPayloads,
    buildDeletionContext,
    removeSourceSnapshot,
    openManager,
    closeManager,
    activate,
  });
});
