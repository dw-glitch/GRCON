(function (root) {
  "use strict";

  const History = root.GrconHistory;
  const Revision = root.GrconRevisionControl;
  const Core = root.GrconRepostingCore;
  const Storage = root.GrconRepostingStorage;
  if (!History || !Revision || !Core || !Storage || !root.document) return;

  const PAGE_SIZE = 80;
  const state = {
    selected: new Set(),
    sessionEntries: [],
    targets: [],
    results: [],
    controller: null,
    busy: false,
    conferenceShell: null,
    revisionRecordId: "",
    revisionOptions: [],
    pendingRevision: null,
    resolverTargetId: "",
  };

  const doc = root.document;
  const $ = (selector, scope) => (scope || doc).querySelector(selector);
  const $$ = (selector, scope) => [...(scope || doc).querySelectorAll(selector)];
  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function esc(value) { return text(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function bytes(value) {
    const size = Number(value) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
    return `${(size / 1024 ** 3).toFixed(2)} GB`;
  }
  function dateTime(value) { const date = new Date(value); return !value || Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR"); }
  function notify(message, kind) { if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info"); else if (kind === "error") root.alert(message); }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob); const anchor = doc.createElement("a"); anchor.href = url; anchor.download = name; doc.body.appendChild(anchor); anchor.click(); anchor.remove(); root.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function pause(milliseconds) { return new Promise((resolve) => root.setTimeout(resolve, milliseconds)); }
  function folderSegment(value) {
    return text(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[.\s]+$/, "").trim();
  }
  // Dois documentos diferentes podem ter arquivos de mesmo nome em pastas
  // distintas da rede. Sem nome livre, o segundo substituía o primeiro dentro
  // do ZIP em silêncio e o lote saía com menos arquivos do que a tela mostrava.
  function uniqueZipPath(used, path) {
    if (!used.has(path)) { used.add(path); return path; }
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash + 1) : "";
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    for (let attempt = 1; attempt < 1000; attempt += 1) {
      const candidate = `${folder}${stem} (${attempt})${extension}`;
      if (!used.has(candidate)) { used.add(candidate); return candidate; }
    }
    const fallback = `${folder}${stem} (${Date.now().toString(36)})${extension}`;
    used.add(fallback); return fallback;
  }
  function activeHistoryRecord() {
    const selectedId = root.GrconHistoryUi?.state?.selectedId;
    return History.read().find((record) => record.id === selectedId || record.clientRecordId === selectedId) || null;
  }

  function ensureShells() {
    if (!$("#grcon-revision-overlay")) {
      const overlay = doc.createElement("div");
      overlay.id = "grcon-revision-overlay";
      overlay.className = "grcon-op-overlay";
      overlay.hidden = true;
      overlay.innerHTML = `<section class="grcon-op-dialog grcon-revision-dialog" role="dialog" aria-modal="true" aria-labelledby="grcon-revision-title">
        <header><div><span>HISTÓRICO OPERACIONAL</span><h2 id="grcon-revision-title">Alterar revisão</h2><p>Corrija a revisão considerada pelo GRCON sem modificar o arquivo eGRDT original já emitido.</p></div><button class="grcon-op-close" data-revision-close type="button" aria-label="Fechar">×</button></header>
        <div class="grcon-revision-body"><label><span>Documento e revisão atual</span><select id="grcon-revision-document"></select></label><div class="grcon-revision-current"><span>Revisão atual</span><strong id="grcon-revision-current">—</strong></div><label><span>Nova revisão</span><input id="grcon-revision-new" maxlength="8" autocomplete="off" placeholder="Ex.: A"/></label><div class="grcon-revision-confirm" id="grcon-revision-confirm" hidden></div><section class="grcon-revision-audit"><header><strong>Rastreabilidade</strong><small>As correções anteriores permanecem registradas.</small></header><div id="grcon-revision-audit"></div></section></div>
        <footer><button class="secondary-button" data-revision-close type="button">Cancelar</button><button class="primary-button" id="grcon-revision-review" type="button">Revisar alteração</button><button class="primary-button" id="grcon-revision-save" type="button" hidden>Confirmar e salvar</button></footer>
      </section>`;
      doc.body.appendChild(overlay);
      overlay.addEventListener("click", revisionClick);
      $("#grcon-revision-document", overlay).addEventListener("change", () => { state.pendingRevision = null; renderRevisionSelection(); });
      $("#grcon-revision-new", overlay).addEventListener("input", () => { state.pendingRevision = null; $("#grcon-revision-confirm", overlay).hidden = true; $("#grcon-revision-save", overlay).hidden = true; $("#grcon-revision-review", overlay).hidden = false; });
    }

    if (!$("#grcon-repost-overlay")) {
      const overlay = doc.createElement("div");
      overlay.id = "grcon-repost-overlay";
      overlay.className = "grcon-op-overlay";
      overlay.hidden = true;
      overlay.innerHTML = `<section class="grcon-op-dialog grcon-repost-dialog" role="dialog" aria-modal="true" aria-labelledby="grcon-repost-title">
        <header><div><span>CONFERÊNCIA → AÇÃO</span><h2 id="grcon-repost-title">Preparar repostagem</h2><p>Localize e reúna cópias dos arquivos. Esta etapa não altera a confirmação de postagem no SIGEM.</p></div><button class="grcon-op-close" data-repost-close type="button" aria-label="Fechar">×</button></header>
        <div class="grcon-repost-scroll">
          <section class="grcon-repost-summary" id="grcon-repost-summary"></section>
          <section class="grcon-repost-roots"><header><div><strong>Locais autorizados</strong><small>O GRCON acessa somente as pastas escolhidas por você.</small></div><div class="grcon-root-add"><input id="grcon-root-label" placeholder="Nome da raiz, ex.: Arquivos RIR"/><input id="grcon-root-area" placeholder="Área/categoria opcional"/><button class="secondary-button compact" id="grcon-root-add" type="button">Configurar local dos arquivos</button><button class="text-button" id="grcon-root-session" type="button">Selecionar pasta nesta sessão</button><input hidden id="grcon-root-session-input" type="file" multiple webkitdirectory/></div></header><div class="grcon-browser-note" id="grcon-browser-note"></div><div id="grcon-roots-list"></div></section>
          <section class="grcon-repost-actions"><div><button class="primary-button" id="grcon-repost-search" type="button">Localizar arquivos</button><button class="secondary-button" id="grcon-repost-cancel" type="button" hidden>Cancelar operação</button><span id="grcon-repost-progress"></span></div><small>O índice usa apenas nomes, caminhos relativos, tamanho e data. Os arquivos não são copiados para o navegador.</small></section>
          <section class="grcon-repost-results"><header><div><strong>Resultado da localização</strong><small>Documento + revisão válida são obrigatórios para seleção automática.</small></div></header><div class="grcon-repost-table-wrap" id="grcon-repost-results"></div></section>
          <section class="grcon-repost-delivery"><header><div><strong>Preparar lote</strong><small>Arquivos preparados ≠ documento postado. A próxima Consulta Geral continua sendo a evidência final.</small></div></header><div class="grcon-delivery-options"><label><input id="grcon-organize-egrdt" type="checkbox" checked/> Organizar em pastas por eGRDT</label><button class="primary-button" id="grcon-copy-folder" type="button">Copiar para pasta…</button><button class="secondary-button" id="grcon-download-zip" type="button">Gerar ZIP</button><button class="secondary-button" id="grcon-download-files" type="button">Baixar arquivos</button><button class="secondary-button" id="grcon-repost-report" type="button">Relatório Excel</button></div></section>
        </div>
        <footer><button class="secondary-button" data-repost-close type="button">Fechar</button></footer>
      </section>`;
      doc.body.appendChild(overlay);
      overlay.addEventListener("click", repostClick);
      $("#grcon-root-session-input", overlay).addEventListener("change", sessionFolderChanged);
    }

    if (!$("#grcon-repost-resolver")) {
      const overlay = doc.createElement("div");
      overlay.id = "grcon-repost-resolver";
      overlay.className = "grcon-op-overlay grcon-op-overlay-nested";
      overlay.hidden = true;
      overlay.innerHTML = `<section class="grcon-op-dialog grcon-resolver-dialog" role="dialog" aria-modal="true"><header><div><span>AMBIGUIDADE</span><h2>Escolher arquivos</h2><p id="grcon-resolver-context"></p></div><button class="grcon-op-close" data-resolver-close type="button">×</button></header><div id="grcon-resolver-options"></div><footer><button class="secondary-button" data-resolver-close type="button">Cancelar</button><button class="primary-button" id="grcon-resolver-confirm" type="button">Usar seleção</button></footer></section>`;
      doc.body.appendChild(overlay);
      overlay.addEventListener("click", resolverClick);
    }
  }

  function historyDocumentOptions(record) {
    const map = new Map();
    (record?.files || []).forEach((file) => {
      const revision = Revision.revisionOf(file);
      const key = `${Core.norm?.(file.document) || text(file.document).toUpperCase()}|${revision}`;
      if (!map.has(key)) map.set(key, { document: text(file.document), currentRevision: revision, count: 0 });
      map.get(key).count += 1;
    });
    return [...map.values()].sort((a,b) => a.document.localeCompare(b.document,"pt-BR") || a.currentRevision.localeCompare(b.currentRevision));
  }
  async function openRevision() {
    ensureShells();
    const record = activeHistoryRecord();
    if (!record) return notify("Selecione uma eGRDT no Histórico antes de alterar a revisão.", "warning");
    state.revisionRecordId = record.id;
    state.revisionOptions = historyDocumentOptions(record);
    state.pendingRevision = null;
    const select = $("#grcon-revision-document");
    select.innerHTML = state.revisionOptions.map((item,index) => `<option value="${index}">${esc(item.document)} · Rev. ${esc(item.currentRevision || "—")} · ${item.count} arquivo(s)</option>`).join("");
    $("#grcon-revision-new").value = "";
    $("#grcon-revision-confirm").hidden = true;
    $("#grcon-revision-save").hidden = true;
    $("#grcon-revision-review").hidden = false;
    $("#grcon-revision-overlay").hidden = false;
    renderRevisionSelection();
    $("#grcon-revision-new").focus();
  }
  async function renderRevisionSelection() {
    const option = state.revisionOptions[Number($("#grcon-revision-document")?.value) || 0] || null;
    $("#grcon-revision-current").textContent = option?.currentRevision || "—";
    const target = $("#grcon-revision-audit");
    if (!target) return;
    target.innerHTML = "<small>Carregando alterações…</small>";
    try {
      const events = await Revision.listAudit({ recordId: recordKeyFromId(state.revisionRecordId), document: option?.document });
      target.innerHTML = events.length ? events.slice(0,20).map((event) => `<div><strong>${esc(event.previousRevision || "—")} → ${esc(event.newRevision || "—")}</strong><span>${esc(dateTime(event.changedAt))}${event.userName || event.userEmail ? ` · ${esc(event.userName || event.userEmail)}` : ""}</span></div>`).join("") : "<small>Nenhuma alteração manual pós-eGRDT registrada para este documento.</small>";
    } catch (_) { target.innerHTML = "<small>Rastreabilidade temporariamente indisponível.</small>"; }
  }
  function recordKeyFromId(id) {
    const record = History.read().find((item) => item.id === id || item.clientRecordId === id);
    return text(record?.clientRecordId || record?.id || id);
  }
  async function revisionClick(event) {
    if (event.target.closest("[data-revision-close]")) { $("#grcon-revision-overlay").hidden = true; return; }
    if (event.target.closest("#grcon-revision-review")) {
      const option = state.revisionOptions[Number($("#grcon-revision-document").value) || 0];
      const next = Revision.normalizeRevision($("#grcon-revision-new").value);
      if (!option || !Revision.validRevision(next)) return notify("Informe uma nova revisão válida.", "warning");
      if (next === option.currentRevision) return notify("A nova revisão é igual à revisão atual.", "warning");
      state.pendingRevision = { ...option, newRevision: next };
      const confirm = $("#grcon-revision-confirm");
      confirm.innerHTML = `<span>Confirme antes de salvar</span><dl><div><dt>Documento</dt><dd>${esc(option.document)}</dd></div><div><dt>Revisão atual</dt><dd>${esc(option.currentRevision)}</dd></div><div><dt>Nova revisão</dt><dd>${esc(next)}</dd></div></dl><small>O arquivo Excel original da eGRDT não será alterado. Somente o estado operacional do Histórico será corrigido.</small>`;
      confirm.hidden = false; $("#grcon-revision-review").hidden = true; $("#grcon-revision-save").hidden = false;
      return;
    }
    if (event.target.closest("#grcon-revision-save")) {
      if (!state.pendingRevision) return;
      const button = $("#grcon-revision-save"); button.disabled = true;
      try {
        const result = await Revision.updateDocumentRevision(state.revisionRecordId, { document: state.pendingRevision.document, currentRevision: state.pendingRevision.currentRevision }, state.pendingRevision.newRevision);
        if (!result.updated) return notify(result.error || "A revisão não foi alterada.", "warning");
        if (root.GrconPostingConferenceUi?.state?.ready) await root.GrconPostingConferenceUi.reconcile({ reason: "manual-revision-history" });
        else if (root.GrconPostingConference?.reconcilePersisted) {
          const conference = await root.GrconPostingConference.reconcilePersisted(History.read(), { reason: "manual-revision-history" });
          root.dispatchEvent(new CustomEvent("grcon:conference-updated", { detail: { summary: conference.summary, changes: conference.changes, baseMeta: conference.baseMeta, manualRevision: true } }));
        }
        state.selected.clear();
        notify(`Revisão de ${result.document} alterada de ${result.previousRevision} para ${result.newRevision}. A Conferência foi recalculada.`, "success");
        $("#grcon-revision-overlay").hidden = true;
      } catch (error) { console.error(error); notify(error.message || "Não foi possível alterar a revisão.", "error"); }
      finally { button.disabled = false; }
    }
  }

  function installHistoryAction() {
    const detail = $("#history-detail");
    if (!detail) return;
    const decorate = () => {
      const actions = $(".history-detail-actions", detail);
      if (!actions || $("[data-history-revision-edit]", actions) || !activeHistoryRecord()) return;
      const button = doc.createElement("button");
      button.className = "secondary-button compact";
      button.type = "button";
      button.dataset.historyRevisionEdit = "";
      button.textContent = "Alterar revisão";
      const editNumber = $("[data-history-action=edit]", actions);
      if (editNumber) actions.insertBefore(button, editNumber); else actions.appendChild(button);
    };
    detail.addEventListener("click", (event) => { if (event.target.closest("[data-history-revision-edit]")) void openRevision(); });
    const observer = new MutationObserver(() => queueMicrotask(decorate));
    observer.observe(detail, { childList: true, subtree: true });
    decorate();
  }

  function conferenceFilteredRows() {
    const ui = root.GrconPostingConferenceUi;
    const conference = root.GrconPostingConference;
    if (!ui || !conference) return [];
    let rows = conference.filterRows(ui.state.result.rows || [], ui.state.filters || {});
    if (ui.state.view === "pending") rows = conference.pendingRows(rows);
    return rows;
  }
  function conferenceGroups() {
    const ui = root.GrconPostingConferenceUi;
    const allowed = new Set(conferenceFilteredRows().map((row) => row.key));
    return (ui?.state?.result?.groups || []).map((group) => ({ ...group, rows: group.rows.filter((row) => allowed.has(row.key)) })).filter((group) => group.rows.length);
  }
  function pageRows() {
    const ui = root.GrconPostingConferenceUi;
    const rows = conferenceFilteredRows();
    const start = Math.max(0, ((Number(ui?.state?.page) || 1) - 1) * PAGE_SIZE);
    return rows.slice(start, start + PAGE_SIZE);
  }
  function pageGroups() {
    const ui = root.GrconPostingConferenceUi;
    const groups = conferenceGroups();
    const start = Math.max(0, ((Number(ui?.state?.page) || 1) - 1) * PAGE_SIZE);
    return groups.slice(start, start + PAGE_SIZE);
  }
  function updateSelectionToolbar() {
    const shell = state.conferenceShell;
    if (!shell) return;
    const count = $("#grcon-repost-selected-count", shell);
    if (count) count.textContent = `${fmt(state.selected.size)} selecionado(s)`;
    const prepare = $("#grcon-repost-prepare", shell); if (prepare) prepare.disabled = state.selected.size === 0;
  }
  function selectionCell(key, checked) { return `<td class="grcon-repost-select"><input aria-label="Selecionar para repostagem" data-repost-key="${esc(key)}" type="checkbox" ${checked ? "checked" : ""}/></td>`; }
  function decorateConference() {
    const shell = state.conferenceShell;
    const ui = root.GrconPostingConferenceUi;
    if (!shell || !ui?.state?.ready) return;
    const header = $(".pc-table-card > header", shell);
    if (header && !$("#grcon-repost-toolbar", header)) {
      const tools = doc.createElement("div");
      tools.id = "grcon-repost-toolbar";
      tools.className = "grcon-repost-toolbar";
      tools.innerHTML = `<span id="grcon-repost-selected-count">0 selecionado(s)</span><button class="text-button" id="grcon-repost-select-filtered" type="button">Selecionar filtrados</button><button class="text-button" id="grcon-repost-clear-selection" type="button">Limpar seleção</button><button class="secondary-button compact" id="grcon-repost-prepare" type="button" disabled>Preparar repostagem</button>`;
      header.appendChild(tools);
    }
    const table = $("#pc-table-wrap table", shell);
    if (!table) { updateSelectionToolbar(); return; }
    const headRow = $("thead tr", table);
    if (headRow && !$("th.grcon-repost-select", headRow)) headRow.insertAdjacentHTML("afterbegin", '<th class="grcon-repost-select" aria-label="Selecionar"></th>');
    const bodyRows = $$("tbody tr", table);
    if (ui.state.view === "grdts") {
      const groups = pageGroups();
      bodyRows.forEach((tr,index) => {
        const group = groups[index]; if (!group || $("td.grcon-repost-select", tr)) return;
        const keys = group.rows.map((row) => row.key);
        const checked = keys.length > 0 && keys.every((key) => state.selected.has(key));
        tr.dataset.repostGrdt = group.egrdtNumber;
        tr.insertAdjacentHTML("afterbegin", `<td class="grcon-repost-select"><input aria-label="Selecionar eGRDT inteira para repostagem" data-repost-grdt="${esc(group.egrdtNumber)}" type="checkbox" ${checked ? "checked" : ""}/></td>`);
      });
    } else {
      const rows = pageRows();
      bodyRows.forEach((tr,index) => {
        const row = rows[index]; if (!row || $("td.grcon-repost-select", tr)) return;
        tr.dataset.repostRowKey = row.key;
        tr.insertAdjacentHTML("afterbegin", selectionCell(row.key, state.selected.has(row.key)));
      });
    }
    updateSelectionToolbar();
  }
  function installConferenceIntegration(shell) {
    if (!shell || shell.dataset.grconRepostingBound) return;
    shell.dataset.grconRepostingBound = "1";
    state.conferenceShell = shell;
    shell.addEventListener("change", (event) => {
      const keyInput = event.target.closest("[data-repost-key]");
      if (keyInput) { if (keyInput.checked) state.selected.add(keyInput.dataset.repostKey); else state.selected.delete(keyInput.dataset.repostKey); updateSelectionToolbar(); return; }
      const grdtInput = event.target.closest("[data-repost-grdt]");
      if (grdtInput) {
        const group = conferenceGroups().find((item) => item.egrdtNumber === grdtInput.dataset.repostGrdt);
        (group?.rows || []).forEach((row) => grdtInput.checked ? state.selected.add(row.key) : state.selected.delete(row.key));
        updateSelectionToolbar();
      }
    });
    shell.addEventListener("click", (event) => {
      if (event.target.closest("#grcon-repost-select-filtered")) {
        const rows = conferenceFilteredRows();
        if (!rows.length) return;
        if (rows.length > 1 && !root.confirm(`Selecionar os ${rows.length.toLocaleString("pt-BR")} documentos atualmente filtrados para preparação de repostagem?`)) return;
        rows.forEach((row) => state.selected.add(row.key)); decorateConference(); return;
      }
      if (event.target.closest("#grcon-repost-clear-selection")) { state.selected.clear(); decorateConference(); return; }
      if (event.target.closest("#grcon-repost-prepare")) void openReposting();
    });
    const observer = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => [...mutation.addedNodes].every((node) => node.nodeType !== 1 || node.matches?.(".grcon-repost-toolbar,.grcon-repost-select") || node.closest?.(".grcon-repost-toolbar,.grcon-repost-select")))) return;
      queueMicrotask(decorateConference);
    });
    const tableWrap = $("#pc-table-wrap", shell); if (tableWrap) observer.observe(tableWrap, { childList: true, subtree: true });
    queueMicrotask(decorateConference);
  }
  function watchConference() {
    const existing = $("#posting-conference-module"); if (existing) installConferenceIntegration(existing);
    const workspace = $("main.workspace"); if (!workspace) return;
    const observer = new MutationObserver(() => { const shell = $("#posting-conference-module"); if (shell) installConferenceIntegration(shell); });
    observer.observe(workspace, { childList: true });
  }

  function selectedTargets() {
    const ui = root.GrconPostingConferenceUi;
    const rows = ui?.state?.result?.rows || [];
    const history = History.read();
    return rows.filter((row) => state.selected.has(row.key)).map((row) => Core.targetFromConference(row, history));
  }
  async function openReposting() {
    ensureShells();
    state.targets = selectedTargets();
    if (!state.targets.length) return notify("Selecione ao menos um documento na Conferência.", "warning");
    state.results = state.targets.map((target) => ({ state: Core.STATES.UNCHECKED, target, candidates: [], selected: [], evidence: "Aguardando localização." }));
    $("#grcon-repost-overlay").hidden = false;
    renderPrepSummary(); renderResults(); await renderRoots(); renderBrowserNote();
  }
  function renderBrowserNote() {
    const info = Storage.compatibility();
    const target = $("#grcon-browser-note");
    if (!target) return;
    target.className = `grcon-browser-note ${info.directoryPicker ? "ok" : "warn"}`;
    target.textContent = info.directoryPicker
      ? "Busca automática disponível neste navegador. As pastas precisam ser escolhidas/autorizadas explicitamente pelo usuário."
      : "A busca automática persistente em pastas requer Chromium compatível em HTTPS. Você ainda pode selecionar uma pasta manualmente para esta sessão.";
  }
  function renderPrepSummary() {
    const summary = Core.summarize(state.results);
    $("#grcon-repost-summary").innerHTML = `<div><span>Documentos</span><strong>${fmt(summary.documents)}</strong></div><div><span>Arquivos encontrados</span><strong>${fmt(summary.filesFound)}</strong></div><div><span>Não encontrados</span><strong>${fmt(summary.notFound)}</strong></div><div><span>Ambíguos</span><strong>${fmt(summary.ambiguous)}</strong></div><div><span>Revisão diferente</span><strong>${fmt(summary.differentRevision)}</strong></div>`;
  }
  async function renderRoots() {
    const target = $("#grcon-roots-list"); if (!target) return;
    let roots = [];
    try { roots = await Storage.listRoots(); } catch (error) { target.innerHTML = `<small>${esc(error.message)}</small>`; return; }
    const rows = [];
    for (const item of roots) {
      const permission = await Storage.permissionState(item, "read");
      rows.push(`<div class="grcon-root-row" data-root-id="${esc(item.id)}"><div><strong>${esc(item.label)}</strong><span>${item.area ? `${esc(item.area)} · ` : ""}${esc(item.handle?.name || "Pasta autorizada")}</span><small>${item.lastIndexedAt ? `Última indexação: ${esc(dateTime(item.lastIndexedAt))} · ${fmt(item.indexedFiles)} arquivo(s)` : "Ainda não indexada"}</small></div><span class="grcon-permission ${permission}">${permission === "granted" ? "Acesso autorizado" : permission === "prompt" ? "Autorizar novamente" : "Acesso negado"}</span><div><button class="secondary-button compact" data-root-authorize type="button">Autorizar</button><button class="secondary-button compact" data-root-index type="button">Atualizar índice</button><button class="text-button danger" data-root-remove type="button">Remover</button></div></div>`);
    }
    if (state.sessionEntries.length) rows.push(`<div class="grcon-root-row session"><div><strong>Pasta desta sessão</strong><span>Seleção manual do navegador</span><small>${fmt(state.sessionEntries.length)} arquivo(s) disponíveis até fechar/recarregar esta página</small></div><span class="grcon-permission granted">Sessão atual</span></div>`);
    target.innerHTML = rows.join("") || "<empty-state><strong>Nenhum local configurado</strong><span>Autorize uma pasta raiz ou selecione uma pasta somente para esta sessão.</span></empty-state>";
  }
  async function sessionFolderChanged(event) {
    const files = event.target.files || [];
    state.sessionEntries = Storage.snapshotEntries(files, files[0]?.webkitRelativePath?.split("/")[0] || "Pasta desta sessão");
    event.target.value = "";
    await renderRoots(); notify(`${state.sessionEntries.length.toLocaleString("pt-BR")} arquivo(s) disponíveis para busca nesta sessão.`, "success");
  }
  function setProgress(message, cancellable) {
    $("#grcon-repost-progress").textContent = text(message);
    $("#grcon-repost-cancel").hidden = !cancellable;
  }
  function beginOperation(message) { state.controller?.abort(); state.controller = new AbortController(); state.busy = true; setProgress(message, true); return state.controller; }
  function endOperation(message) { state.busy = false; state.controller = null; setProgress(message || "", false); }

  async function repostClick(event) {
    if (event.target.closest("[data-repost-close]")) { if (state.busy) return notify("Cancele a operação atual antes de fechar.", "warning"); $("#grcon-repost-overlay").hidden = true; return; }
    if (event.target.closest("#grcon-repost-cancel")) { state.controller?.abort(); return; }
    if (event.target.closest("#grcon-root-add")) {
      const label = text($("#grcon-root-label").value); const area = text($("#grcon-root-area").value);
      try { const item = await Storage.chooseRoot(label, { area }); $("#grcon-root-label").value = ""; $("#grcon-root-area").value = ""; await renderRoots(); notify(`Local “${item.label}” autorizado. Atualize o índice para iniciar a busca.`, "success"); }
      catch (error) { if (error?.name !== "AbortError") notify(error.message || "Não foi possível autorizar a pasta.", "error"); }
      return;
    }
    if (event.target.closest("#grcon-root-session")) { $("#grcon-root-session-input").click(); return; }
    const rootRow = event.target.closest("[data-root-id]");
    if (rootRow && event.target.closest("[data-root-authorize]")) {
      try { const item = await Storage.getRoot(rootRow.dataset.rootId); const permission = await Storage.requestPermission(item, "read"); await renderRoots(); if (permission !== "granted") notify("Acesso não concedido para esta pasta.", "warning"); }
      catch (error) { notify(error.message || "Não foi possível renovar a permissão.", "error"); } return;
    }
    if (rootRow && event.target.closest("[data-root-index]")) { await indexRootAction(rootRow.dataset.rootId); return; }
    if (rootRow && event.target.closest("[data-root-remove]")) { if (root.confirm("Remover esta raiz e o índice local correspondente? Os arquivos da rede não serão alterados.")) { await Storage.removeRoot(rootRow.dataset.rootId); await renderRoots(); } return; }
    if (event.target.closest("#grcon-repost-search")) { await searchFiles(); return; }
    const resolve = event.target.closest("[data-repost-resolve]"); if (resolve) { openResolver(resolve.dataset.repostResolve); return; }
    if (event.target.closest("#grcon-copy-folder")) { await prepareDelivery("copy"); return; }
    if (event.target.closest("#grcon-download-zip")) { await prepareDelivery("zip"); return; }
    if (event.target.closest("#grcon-download-files")) { await prepareDelivery("downloads"); return; }
    if (event.target.closest("#grcon-repost-report")) { await exportBatchReport(); }
  }
  async function indexRootAction(rootId) {
    const item = await Storage.getRoot(rootId);
    if (!item) return;
    try {
      const permission = await Storage.requestPermission(item, "read");
      if (permission !== "granted") return notify("Autorize a pasta antes de indexar.", "warning");
      const controller = beginOperation("Iniciando indexação…");
      const result = await Storage.indexRoot(rootId, { signal: controller.signal, onProgress: ({ count }) => setProgress(`Indexando arquivos: ${count.toLocaleString("pt-BR")} encontrados`, true) });
      endOperation(`Índice atualizado: ${result.indexedFiles.toLocaleString("pt-BR")} arquivos.`); await renderRoots(); notify("Índice de arquivos atualizado sem alterar os arquivos da rede.", "success");
    } catch (error) { endOperation(); if (error?.name === "AbortError") notify("Indexação cancelada. O índice anterior foi preservado.", "info"); else notify(error.message || "Não foi possível indexar a pasta.", "error"); }
  }
  async function accessibleIndexEntries() {
    const roots = await Storage.listRoots();
    const accessible = []; const unavailable = [];
    for (const item of roots.filter((rootItem) => rootItem.currentGeneration)) {
      const permission = await Storage.permissionState(item, "read");
      if (permission === "granted") accessible.push(item.id); else unavailable.push(item.id);
    }
    const entries = accessible.length ? await Storage.activeEntries(accessible) : [];
    return { entries: [...entries, ...state.sessionEntries], unavailableRoots: unavailable };
  }
  async function searchFiles() {
    const controller = beginOperation("Preparando índice para busca…");
    try {
      const available = await accessibleIndexEntries();
      const output = [];
      for (let index = 0; index < state.targets.length; index += 1) {
        if (controller.signal.aborted) { const error = new Error("Busca cancelada."); error.name = "AbortError"; throw error; }
        let result = Core.classifyTarget(state.targets[index], available.entries);
        if (result.state === Core.STATES.NOT_FOUND && available.unavailableRoots.length && !state.sessionEntries.length) result = { ...result, state: Core.STATES.PERMISSION_REQUIRED, evidence: "Há uma ou mais raízes indexadas sem permissão de leitura nesta sessão. Autorize novamente antes de concluir que o arquivo está ausente." };
        output.push(result);
        setProgress(`Localizando documentos: ${index + 1}/${state.targets.length}`, true);
        if ((index + 1) % 8 === 0) await new Promise((resolve) => root.setTimeout(resolve, 0));
      }
      state.results = output; endOperation("Busca concluída."); renderPrepSummary(); renderResults();
    } catch (error) { endOperation(); if (error?.name === "AbortError") notify("Busca cancelada.", "info"); else notify(error.message || "Não foi possível localizar os arquivos.", "error"); }
  }
  function candidateEvidence(result) {
    if (!result.candidates?.length) return "—";
    const first = result.candidates.slice(0,3).map((entry) => `${entry.name}${entry.identifiedRevision ? ` · Rev. ${entry.identifiedRevision}` : ""}`).join(" | ");
    return result.candidates.length > 3 ? `${first} · +${result.candidates.length - 3}` : first;
  }
  function renderResults() {
    const target = $("#grcon-repost-results"); if (!target) return;
    if (!state.results.length) { target.innerHTML = "<empty-state><strong>Nenhum documento no lote</strong></empty-state>"; return; }
    target.innerHTML = `<table><thead><tr><th>eGRDT</th><th>Documento</th><th>Rev. válida</th><th>Conferência</th><th>Status SIGEM</th><th>Situação dos arquivos</th><th>Evidência</th></tr></thead><tbody>${state.results.map((result) => `<tr data-result-id="${esc(result.target.id)}"><td>${esc(result.target.egrdtNumber)}</td><td><strong>${esc(result.target.document)}</strong></td><td><strong>${esc(result.target.revision || "—")}</strong></td><td>${esc(result.target.conferenceLabel || result.target.conferenceStatus || "—")}</td><td>${esc(result.target.sigemStatus || "—")}</td><td><span class="grcon-file-state ${esc(result.state.toLowerCase())}">${esc(Core.stateLabel(result.state))}</span>${result.state === Core.STATES.AMBIGUOUS ? `<button class="text-button" data-repost-resolve="${esc(result.target.id)}" type="button">Resolver</button>` : ""}</td><td><small title="${esc(result.evidence)}">${esc(candidateEvidence(result))}</small></td></tr>`).join("")}</tbody></table>`;
  }
  function openResolver(targetId) {
    const result = state.results.find((item) => item.target.id === targetId); if (!result) return;
    state.resolverTargetId = targetId;
    $("#grcon-resolver-context").textContent = `${result.target.document} · revisão válida ${result.target.revision}`;
    $("#grcon-resolver-options").innerHTML = (result.candidates || []).map((entry,index) => `<label class="grcon-candidate"><input type="checkbox" value="${index}"/><span><strong>${esc(entry.name)}</strong><small>${esc(entry.relativePath)} · ${esc(entry.extension.toUpperCase() || "arquivo")} · ${bytes(entry.size)}${entry.identifiedRevision ? ` · Rev. ${esc(entry.identifiedRevision)}` : ""}</small></span></label>`).join("");
    $("#grcon-repost-resolver").hidden = false;
  }
  function resolverClick(event) {
    if (event.target.closest("[data-resolver-close]")) { $("#grcon-repost-resolver").hidden = true; return; }
    if (!event.target.closest("#grcon-resolver-confirm")) return;
    const result = state.results.find((item) => item.target.id === state.resolverTargetId); if (!result) return;
    const chosen = $$("#grcon-resolver-options input:checked").map((input) => result.candidates[Number(input.value)]).filter(Boolean);
    if (!chosen.length) return notify("Selecione ao menos um arquivo candidato.", "warning");
    if (chosen.some((entry) => entry.identifiedRevision !== result.target.revision)) return notify("A seleção contém arquivo de revisão diferente da revisão válida. O GRCON não permitirá essa associação.", "warning");
    const expected = result.target.expectedByExtension || {};
    for (const [ext,count] of Object.entries(expected)) {
      if (chosen.filter((entry) => entry.extension === ext).length !== Number(count)) return notify(`Selecione exatamente ${count} arquivo(s) .${ext} para reproduzir o conjunto associado à eGRDT.`, "warning");
    }
    result.selected = chosen; result.state = Core.STATES.FOUND; result.manualResolution = true; result.evidence = "Ambiguidade resolvida manualmente pelo usuário; todos os arquivos escolhidos possuem documento e revisão válidos.";
    $("#grcon-repost-resolver").hidden = true; renderResults(); renderPrepSummary();
  }
  function deliveryEntries() {
    return state.results.flatMap((result) => (result.selected || []).map((entry) => ({ entry, egrdtNumber: result.target.egrdtNumber, document: result.target.document, revision: result.target.revision })));
  }
  function pendingResults() { return state.results.filter((result) => result.state !== Core.STATES.FOUND); }
  function allowPartialDelivery() {
    const pending = pendingResults();
    if (!pending.length) return true;
    return root.confirm(`O lote ainda possui ${pending.length} documento(s) com pendência (ausente, ambíguo, revisão diferente ou permissão). Continuar somente com os arquivos encontrados e confirmados?`);
  }
  function sanitizedBatch() {
    const summary = Core.summarize(state.results);
    return { id: `repost-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, createdAt: new Date().toISOString(), summary, results: state.results.map((result) => ({ state: result.state, evidence: result.evidence, manualResolution: Boolean(result.manualResolution), target: result.target, selected: (result.selected || []).map(({ __fileRef, ...entry }) => entry), candidates: [] })) };
  }
  async function prepareDelivery(mode) {
    const entries = deliveryEntries();
    if (!entries.length) return notify("Nenhum arquivo confirmado está disponível para preparar.", "warning");
    if (!allowPartialDelivery()) return;
    const batch = sanitizedBatch(); await Storage.saveBatch(batch).catch(() => null);
    if (mode === "copy") {
      if (!Storage.supportsDirectoryPicker()) return notify("A cópia direta requer navegador Chromium compatível. Use ZIP ou downloads.", "warning");
      try {
        const controller = beginOperation("Preparando cópia…");
        const organize = $("#grcon-organize-egrdt").checked;
        const result = await Storage.copyEntries(entries, { signal: controller.signal, organizeByEgrdt: organize, duplicateAcrossEgrdts: organize, onProgress: ({ copied,total,file }) => setProgress(`Copiando ${copied}/${total}: ${file}`, true) });
        endOperation(`Cópia concluída: ${result.copied} arquivo(s).`); notify(`${result.copied} arquivo(s) copiado(s). Os originais permaneceram intactos.`, "success");
      } catch (error) { endOperation(); if (error?.name === "AbortError") notify("Cópia cancelada. Arquivos já copiados permaneceram no destino; os originais não foram alterados.", "info"); else notify(error.message || "Não foi possível copiar os arquivos.", "error"); }
      return;
    }
    if (mode === "zip") {
      if (!Storage.zipSafe(entries)) return notify(`O lote soma ${bytes(Storage.totalSize(entries))}, acima do limite seguro de ${bytes(Storage.ZIP_SAFE_BYTES)} para ZIP no navegador. Prefira copiar para uma pasta.`, "warning");
      let controller = null;
      try {
        await root.GRCONModuleLoader?.ensure?.("zip"); if (!root.JSZip) throw new Error("Módulo ZIP indisponível.");
        controller = beginOperation("Lendo arquivos para o ZIP…"); const zip = new root.JSZip();
        const organize = $("#grcon-organize-egrdt").checked;
        const used = new Set(); const paths = new Set(); let added = 0;
        for (let index=0; index<entries.length; index+=1) {
          if (controller.signal.aborted) { const error = new Error("ZIP cancelado."); error.name="AbortError"; throw error; }
          const item = entries[index];
          // Com a organização por eGRDT ligada, o mesmo arquivo físico usado por
          // duas eGRDTs precisa aparecer nas duas pastas: a chave de repetição
          // passa a incluir a eGRDT de destino.
          const signature = `${organize ? item.egrdtNumber : ""}|${item.entry.rootId}|${item.entry.relativePath}`;
          if (used.has(signature)) continue; used.add(signature);
          const file = await Storage.resolveEntry(item.entry, { requestPermission: false });
          const buffer = root.GrconFileAccess?.read ? await root.GrconFileAccess.read(file,{ context:"o arquivo da repostagem", retries:1 }) : await file.arrayBuffer();
          const folder = organize ? `${folderSegment(item.egrdtNumber) || "SEM-eGRDT"}/` : "";
          zip.file(uniqueZipPath(paths, `${folder}${file.name}`), buffer); added += 1;
          setProgress(`Lendo ${index+1}/${entries.length}: ${file.name}`, true);
        }
        if (!added) throw new Error("Nenhum arquivo pôde ser lido para o ZIP.");
        const blob = await zip.generateAsync({ type:"blob", compression:"DEFLATE", compressionOptions:{ level:3 } }, (meta) => setProgress(`Gerando ZIP: ${Math.round(meta.percent)}%`, true));
        downloadBlob(blob, `GRCON_Repostagem_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.zip`); endOperation(`ZIP preparado: ${fmt(added)} arquivo(s).`); notify(`Pacote ZIP preparado com ${fmt(added)} arquivo(s). Isso não marca nenhum documento como postado no SIGEM.`, "success");
      } catch (error) { endOperation(); if (error?.name === "AbortError" || controller?.signal?.aborted) notify("Geração do ZIP cancelada.", "info"); else notify(error.message || "Não foi possível gerar o ZIP.", "error"); }
      return;
    }
    if (mode === "downloads") {
      let controller = null;
      try {
        controller = beginOperation("Preparando downloads…"); let downloaded = 0; const used = new Set();
        for (const item of entries) {
          if (controller.signal.aborted) { const error = new Error("Downloads cancelados."); error.name="AbortError"; throw error; }
          const signature = `${item.entry.rootId}|${item.entry.relativePath}`; if (used.has(signature)) continue; used.add(signature);
          const file = await Storage.resolveEntry(item.entry,{ requestPermission:false });
          downloadBlob(file,file.name); downloaded += 1; setProgress(`Preparando downloads: ${downloaded}`,true);
          // Um clique sintético atrás do outro, no mesmo quadro, faz o navegador
          // descartar parte dos downloads sem avisar: o lote saía incompleto e
          // sem nenhuma mensagem de erro. O intervalo devolve o controle ao
          // navegador entre um arquivo e o seguinte.
          if (downloaded < entries.length) await pause(220);
        }
        endOperation(`${fmt(downloaded)} download(s) solicitado(s).`); notify(`${fmt(downloaded)} download(s) preparado(s). O navegador pode solicitar permissão para baixar vários arquivos.`, "success");
      } catch (error) { endOperation(); if (error?.name === "AbortError" || controller?.signal?.aborted) notify("Downloads cancelados.", "info"); else notify(error.message || "Não foi possível preparar os downloads.", "error"); }
    }
  }
  async function exportBatchReport() {
    if (!state.results.length) return;
    try {
      await root.GRCONModuleLoader?.ensure?.("excel"); await root.GRCONModuleLoader?.ensure?.("brand");
      const Report = root.GrconRepostingReport; if (!Report) throw new Error("Relatório de repostagem indisponível.");
      const batch = { ...sanitizedBatch(), results: state.results };
      const buffer = await Report.buildWorkbook(batch);
      downloadBlob(new Blob([buffer], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), Report.downloadName(batch));
    } catch (error) { notify(error.message || "Não foi possível gerar o relatório do lote.", "error"); }
  }

  function installGlobalListeners() {
    root.addEventListener("grcon:history-updated", (event) => {
      if (event.detail?.manualRevision) { state.selected.clear(); state.targets=[]; state.results=[]; queueMicrotask(decorateConference); }
    });
    root.addEventListener("grcon:conference-updated", () => queueMicrotask(decorateConference));
  }
  function init() { ensureShells(); installHistoryAction(); watchConference(); installGlobalListeners(); }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once:true }); else init();

  root.GrconRepostingUi = Object.freeze({ state, open: openReposting, openRevision, decorateConference, searchFiles });
})(window);
