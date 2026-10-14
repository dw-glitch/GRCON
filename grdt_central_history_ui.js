/* GRCON | Histórico operacional da Central de GRDT.
 * Um único índice compartilhado, com consulta adicional somente ao abrir o painel.
 */
(function (root) {
  "use strict";
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const flow = () => root.GrconPostingFlow;
  const workspace = () => `${root.GrconCloud?.state?.membership?.workspace_id || ""}:${root.GrconCloud?.state?.session?.user?.id || ""}`;
  const date = value => {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString("pt-BR") : "Data não registrada";
  };
  const label = kind => ({
    FIRST_POSTING: "Nova emissão", NEW_REVISION: "Nova revisão", REPOST: "Repostagem"
  })[kind] || "Conferir histórico";
  let requestId = 0;
  let current = null;
  let layer = null;
  let panel = null;
  let returnFocus = null;

  function row(documentCode, revision) {
    if (!flow()) return "";
    const result = flow().lookup(documentCode, revision);
    const latest = result.latestEmission;
    const status = flow().status();
    const number = latest ? latest.grdt : status.complete ? "Sem emissão anterior" : "Histórico a confirmar";
    const rev = latest && latest.revision ? " · Rev. " + latest.revision : "";
    const warning = result.warnings.length > 0 ? " · Verificar" : "";
    const title = "Ver todas as eGRDTs do documento " + documentCode + (latest ? " · Gerada em " + date(latest.generatedAt) : "");
    return '<div class="grdt-history-inline">' +
      '<button type="button" class="grdt-history-open" data-grdt-history-document="' + esc(documentCode) +
        '" data-grdt-history-revision="' + esc(revision) + '" title="' + esc(title) +
        '" aria-label="' + esc(title) + '">' +
        '<span class="grdt-history-kicker">Última eGRDT</span>' +
        '<strong>' + esc(number) + '</strong>' +
        '<span class="grdt-history-revision">' + esc(rev) + '</span></button>' +
        '<span class="grdt-history-operation" data-kind="' + esc(result.emissionKind || "UNCONFIRMED") +
        '">' + esc(label(result.emissionKind) + warning) + '</span>' +
      '</div>';
  }

  function ensurePanel() {
    if (panel) return;
    layer = document.createElement("div");
    layer.className = "grdt-history-backdrop";
    layer.hidden = true;
    panel = document.createElement("aside");
    panel.className = "grdt-history-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "grdt-history-panel-heading");
    panel.innerHTML =
      '<header class="grdt-history-panel-header"><div><small>CONFERÊNCIA DE EMISSÕES</small>' +
      '<h2 id="grdt-history-panel-heading">Histórico de emissões do documento</h2>' +
      '<p class="grdt-history-document"></p></div>' +
      '<button class="grdt-history-close" type="button" aria-label="Fechar histórico">✕</button></header>' +
      '<div class="grdt-history-panel-content" aria-live="polite"></div>' +
      '<footer class="grdt-history-panel-footer">A eGRDT gerada não comprova postagem no SIGEM. Confirme na Consulta Geral.</footer>';
    document.body.append(layer, panel);
    layer.addEventListener("click", close);
    panel.querySelector(".grdt-history-close").addEventListener("click", close);
    panel.addEventListener("click", event => {
      if (event.target.closest("[data-history-retry]") && current) void open(current.documentCode, current.revision, true);
    });
  }

  function close() {
    requestId += 1;
    if (!panel) return;
    panel.hidden = true;
    layer.hidden = true;
    current = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else document.getElementById("results-scroll")?.focus({ preventScroll: true });
    returnFocus = null;
  }

  function render(documentCode, revision, prefix) {
    const currentStatus = flow().status();
    const result = flow().lookup(documentCode, revision);
    const entries = flow().entries(documentCode);
    const box = panel.querySelector(".grdt-history-panel-content");
    const source = currentStatus.complete ? "Histórico compartilhado consultado" : "Histórico compartilhado incompleto ou indisponível";
    const notes = result.warnings.length ? '<div class="grdt-history-warnings">' + result.warnings.map(x => '<p>' + esc(x) + '</p>').join("") + '</div>' : "";
    const title = '<div class="grdt-history-panel-summary"><strong>' + esc(label(result.emissionKind)) +
      '</strong><small>Revisão selecionada: ' + esc(revision || "não informada") + ' · ' + esc(source) + '</small></div>';
    const chronological = entries.map((entry, index) => {
      const record = { id: entry.historyId, clientRecordId: entry.historyId, cloudId: entry.cloudId, egrdtNumber: entry.grdt };
      const sent = root.GrconEgrdtTeamsNotification?.statusLabel?.(record) || "Sem registro de encaminhamento";
      const query = root.GrconSharedSigemQuery;
      const evidence = query?.state?.workspace === currentStatus.workspaceId ? query.resolveSigemStatus(documentCode, entry.revision, null) : null;
      const posting = evidence && ["shared-general-query", "local-general-query"].includes(evidence.source) ?
        "Localizada na Consulta Geral · " + (root.TriagemCore?.isWorkflowStatus?.(evidence.status) ? "Em análise" : evidence.status) :
        entry.postingStatus || "Não confirmada neste histórico";
      const mostRecent = index === 0 ? '<span class="grdt-history-latest">Mais recente</span>' : "";
      return '<article class="grdt-history-entry"><div class="grdt-history-entry-head"><strong>' +
        esc(entry.grdt) + '</strong>' + mostRecent + '</div><dl>' +
        '<div><dt>Revisão</dt><dd>' + esc(entry.revision || "Não registrada") + '</dd></div>' +
        '<div><dt>Gerada em</dt><dd>' + esc(date(entry.generatedAt)) + '</dd></div>' +
        '<div><dt>Propósito</dt><dd>' + esc(entry.purpose || "Não registrado") + '</dd></div>' +
        '<div><dt>Encaminhamento</dt><dd>' + esc(sent) + '</dd></div>' +
        '<div><dt>Postagem SIGEM</dt><dd>' + esc(posting) + '</dd></div>' +
        '</dl></article>';
    }).join("");
    const empty = currentStatus.complete ?
      '<p class="grdt-history-empty">Não foi encontrada emissão anterior para este documento.</p>' :
      '<p class="grdt-history-empty">Não é possível confirmar ausência de emissões enquanto o histórico compartilhado estiver indisponível.</p>';
    const error = currentStatus.error ? '<p class="grdt-history-error">Não foi possível consultar o histórico. Os registros locais, se houver, são parciais.</p><button type="button" class="secondary-button compact" data-history-retry>Tentar novamente</button>' : "";
    box.innerHTML = (prefix || "") + error + title + notes + (chronological || empty);
  }

  async function open(documentCode, revision, force = false) {
    ensurePanel();
    if (panel.hidden) returnFocus = document.activeElement;
    const serial = ++requestId;
    const expectedWorkspace = workspace();
    current = { documentCode, revision, expectedWorkspace };
    panel.querySelector(".grdt-history-document").textContent = documentCode;
    panel.querySelector(".grdt-history-panel-content").textContent = "Consultando histórico de eGRDTs…";
    layer.hidden = false;
    panel.hidden = false;
    panel.querySelector(".grdt-history-close").focus({ preventScroll: true });
    try {
      await flow()?.refresh(force);
      if (serial !== requestId || expectedWorkspace !== workspace()) return;
      render(documentCode, revision, "");
    } catch (error) {
      if (serial !== requestId || expectedWorkspace !== workspace()) return;
      const message = '<p class="grdt-history-error">Não foi possível consultar o histórico compartilhado. Os registros locais, se houver, são parciais.</p>';
      render(documentCode, revision, message);
    }
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-grdt-history-document]");
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      void open(trigger.dataset.grdtHistoryDocument, trigger.dataset.grdtHistoryRevision || "");
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (!panel || panel.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") {
      const focusable = [...panel.querySelectorAll('button:not([disabled]), a[href], input, select, [tabindex="0"]')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  root.addEventListener("grcon:cloud-state", () => {
    if (current && current.expectedWorkspace !== workspace()) close();
  });
  root.GrconGrdtHistoryUi = Object.freeze({ row, open, close });
})(window);
