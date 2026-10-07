(function (root) {
  "use strict";

  const DIALOG_ID = "grcon-master-register-dialog";
  const BUTTON_ID = "grcon-master-register-button";
  const PW_DB = "grcon-posting-conference";
  const PW_STORE = "kv";
  const PW_KEY = "sigem-pw-current-pw-v3";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function normalize(value) {
    return text(value).toUpperCase().replace(/\s+/g, "").replace(/^NT-/, "");
  }
  function formatBytes(value) {
    const size = Math.max(0, Number(value) || 0);
    if (!size) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    return (size / Math.pow(1024, index)).toLocaleString("pt-BR", { maximumFractionDigits: index ? 1 : 0 }) + " " + units[index];
  }
  function formatDate(value) {
    const raw = text(value);
    if (!raw) return "—";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("pt-BR");
  }
  function currentCloud() { return root.GrconCloud && root.GrconCloud.state ? root.GrconCloud.state : null; }
  function authContext() {
    const state = currentCloud();
    const token = text(state?.session?.access_token);
    const workspaceId = text(state?.membership?.workspace_id || state?.contract?.workspace_id);
    if (!token || !workspaceId) throw new Error("Conecte-se ao GRCON para usar o Registro Mestre.");
    return { token, workspaceId };
  }

  async function readPwBase() {
    const live = root.GrconSigemPwDashboardUi?.state?.pw;
    if (live?.meta && Array.isArray(live.records)) return live;
    if (!root.indexedDB) return null;
    if (typeof root.indexedDB.databases === "function") {
      try {
        const databases = await root.indexedDB.databases();
        if (!databases.some(item => item && item.name === PW_DB)) return null;
      } catch (_) {}
    }
    return new Promise(resolve => {
      let request;
      try { request = root.indexedDB.open(PW_DB); } catch (_) { resolve(null); return; }
      request.onupgradeneeded = () => {
        try { request.transaction.abort(); } catch (_) {}
        resolve(null);
      };
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PW_STORE)) { db.close(); resolve(null); return; }
        try {
          const tx = db.transaction(PW_STORE, "readonly");
          const get = tx.objectStore(PW_STORE).get(PW_KEY);
          get.onsuccess = () => { db.close(); resolve(get.result || null); };
          get.onerror = () => { db.close(); resolve(null); };
        } catch (_) { db.close(); resolve(null); }
      };
    });
  }

  function documentKeys(value) {
    const keys = new Set([normalize(value)]);
    try {
      const core = root.TriagemCore;
      if (core && typeof core.documentSearchKeys === "function") {
        core.documentSearchKeys(value).forEach(key => keys.add(normalize(key)));
      }
    } catch (_) {}
    return keys;
  }

  async function lookupPw(documentCode) {
    const base = await readPwBase();
    if (!base?.meta || !Array.isArray(base.records)) return { sourceAvailable: false, source: null, rows: [] };
    const keys = documentKeys(documentCode);
    const rows = base.records.filter(record => {
      const candidates = [record?.documentKey, record?.canonicalDocument, record?.document];
      return candidates.some(value => keys.has(normalize(value)));
    }).slice(0, 100).map(record => ({
      document: text(record.document),
      revision: text(record.revisionComplete || record.revision),
      state: text(record.state),
      lastEmission: text(record.lastEmission),
      emitted: Boolean(record.emittedEvidence),
      fileName: text(record.fileName),
      sentGrd: text(record.sentGrd),
      sentDate: text(record.sentDate),
      discipline: text(record.discipline || record.disciplineDesc),
    }));
    return {
      sourceAvailable: true,
      source: {
        fileName: text(base.meta.fileName),
        importedAt: text(base.meta.importedAt),
        recordCount: Number(base.meta.recordCount) || base.records.length,
      },
      rows,
    };
  }

  async function lookupRemote(documentCode) {
    const { token, workspaceId } = authContext();
    const response = await fetch("/api/master-register/lookup", {
      method: "POST",
      headers: {
        "authorization": "Bearer " + token,
        "content-type": "application/json",
        "x-grcon-workspace": workspaceId,
      },
      body: JSON.stringify({ workspaceId, documentCode }),
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || "Não foi possível consultar o Registro Mestre.");
    return payload.record || null;
  }

  function sourceCaption(source) {
    if (!source || typeof source !== "object") return "";
    const parts = [source.fileName, source.version ? "v" + source.version : "", source.referenceDate, source.importedAt || source.publishedAt]
      .map(text).filter(Boolean);
    return parts.join(" · ");
  }

  function rowsTable(columns, rows) {
    if (!Array.isArray(rows) || !rows.length) return '<div class="grcon-master-empty">Nenhuma ocorrência nesta fonte.</div>';
    const head = columns.map(item => "<th>" + escapeHtml(item.label) + "</th>").join("");
    const body = rows.map(row => "<tr>" + columns.map(item => {
      const raw = typeof item.value === "function" ? item.value(row) : row[item.value];
      return "<td>" + escapeHtml(raw == null || raw === "" ? "—" : raw) + "</td>";
    }).join("") + "</tr>").join("");
    return '<div class="grcon-master-table-wrap"><table><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function section(title, badge, source, content) {
    return '<section class="grcon-master-section"><header><div><h4>' + escapeHtml(title) + '</h4>' +
      (source ? '<p>' + escapeHtml(sourceCaption(source)) + '</p>' : '') +
      '</div><span class="grcon-master-count">' + escapeHtml(badge) + '</span></header>' + content + '</section>';
  }

  function renderRecord(record, pw) {
    const planned = record?.plannedDocuments || {};
    const requests = record?.requestsControl || {};
    const sigem = record?.sigem || {};
    const vaultRows = record?.vault?.rows || [];
    const historyRows = record?.grdtHistory?.rows || [];
    const monitoringRows = record?.monitoring?.rows || [];
    const pwRows = pw?.rows || [];

    const allocatedLabel = !planned.sourceAvailable ? "Sem base ativa" : planned.allocated ? "Alocado" : "Não alocado";
    const plannedContent = '<div class="grcon-master-fact ' + (planned.allocated ? "is-positive" : "") + '"><strong>' +
      escapeHtml(allocatedLabel) + '</strong><span>Fonte oficial de alocação: Documentos Previstos.</span></div>';

    const requestsContent = rowsTable([
      { label: "Documento", value: "document" }, { label: "Alocação", value: "allocation" },
      { label: "Status", value: "status" }, { label: "Workflow", value: "workflow" },
    ], requests.rows || []);

    const sigemContent = rowsTable([
      { label: "Documento", value: "document" }, { label: "Rev.", value: "revision" },
      { label: "Status", value: "status" }, { label: "Disciplina", value: "discipline" },
      { label: "Título", value: "title" },
    ], sigem.rows || []);

    const pwContent = rowsTable([
      { label: "Documento", value: "document" }, { label: "Rev.", value: "revision" },
      { label: "Estado", value: "state" }, { label: "Última emissão", value: "lastEmission" },
      { label: "Arquivo", value: "fileName" },
    ], pwRows);

    const vaultContent = rowsTable([
      { label: "Arquivo", value: "file_name" }, { label: "Rev.", value: "revision" },
      { label: "Formato", value: "format" }, { label: "Tamanho", value: row => formatBytes(row.size_bytes) },
      { label: "SHA-256", value: row => text(row.sha256).slice(0, 16) + (text(row.sha256) ? "…" : "") },
      { label: "Verificado", value: row => formatDate(row.verified_at) },
    ], vaultRows);

    const historyContent = rowsTable([
      { label: "eGRDT", value: "egrdt_number" }, { label: "Rev.", value: "revision" },
      { label: "GRDT", value: "grdt" }, { label: "Propósito", value: "purpose" },
      { label: "Gerado em", value: row => formatDate(row.generated_at) },
      { label: "Origem", value: row => row.file_provenance?.source || (row.file_provenance ? "registrada" : "histórico legado") },
    ], historyRows);

    const monitoringContent = rowsTable([
      { label: "Documento", value: "document_code" }, { label: "Prioridade", value: "priority" },
      { label: "Ativo", value: row => row.active ? "Sim" : "Não" }, { label: "Nota", value: "note" },
      { label: "Atualizado", value: row => formatDate(row.updated_at) },
    ], monitoringRows);

    const total = (requests.rows || []).length + (sigem.rows || []).length + pwRows.length + vaultRows.length + historyRows.length + monitoringRows.length + (planned.allocated ? 1 : 0);
    return '<div class="grcon-master-result-heading"><div><span>REGISTRO MESTRE</span><h3>' +
      escapeHtml(record?.documentCode || record?.normalizedCode || "") + '</h3></div><strong>' +
      escapeHtml(String(total)) + ' evidência(s)</strong></div>' +
      section("Documentos Previstos", allocatedLabel, planned.source, plannedContent) +
      section("Controle de Solicitações", String((requests.rows || []).length), requests.source, requestsContent) +
      section("Consulta Geral / SIGEM", String((sigem.rows || []).length), sigem.source, sigemContent) +
      section("ProjectWise", String(pwRows.length), pw?.source, pwContent) +
      section("Cofre / R2", String(vaultRows.length), null, vaultContent) +
      section("Histórico de GRDT/eGRDT", String(historyRows.length), null, historyContent) +
      section("Meu monitoramento", String(monitoringRows.length), null, monitoringContent);
  }

  function ensureDialog() {
    let dialog = document.getElementById(DIALOG_ID);
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = DIALOG_ID;
    dialog.className = "grcon-master-dialog";
    dialog.setAttribute("aria-labelledby", "grcon-master-title");
    dialog.innerHTML =
      '<form method="dialog" class="grcon-master-shell">' +
      '<header><div><span>CONSULTA TRANSVERSAL</span><h2 id="grcon-master-title">Registro Mestre</h2><p>Pesquise um código e veja as evidências disponíveis nas bases oficiais do contrato atual.</p></div>' +
      '<button class="grcon-master-close" value="cancel" aria-label="Fechar Registro Mestre" type="submit">×</button></header>' +
      '<div class="grcon-master-search"><label for="grcon-master-code">Código do documento</label><div><input id="grcon-master-code" autocomplete="off" spellcheck="false" placeholder="Ex.: RL-5290.00-22313-856-C1O-017"/>' +
      '<button id="grcon-master-search-button" class="primary-button" type="button">Pesquisar</button></div><small>A consulta não altera nenhuma base e respeita o contrato ativo.</small></div>' +
      '<div id="grcon-master-status" class="grcon-master-status" role="status" aria-live="polite"></div>' +
      '<div id="grcon-master-results" class="grcon-master-results"></div>' +
      '</form>';
    document.body.appendChild(dialog);
    const input = dialog.querySelector("#grcon-master-code");
    const search = dialog.querySelector("#grcon-master-search-button");
    search.addEventListener("click", () => { void runLookup(input.value); });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); void runLookup(input.value); }
    });
    dialog.addEventListener("close", () => document.getElementById(BUTTON_ID)?.focus());
    return dialog;
  }

  function ensureButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const host = document.querySelector(".runtime-status");
    if (!host) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = "app-shortcut-link grcon-master-button";
    button.type = "button";
    button.title = "Pesquisar em todas as fontes documentais do contrato";
    button.setAttribute("aria-haspopup", "dialog");
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5"></path></svg><span>Pesquisar</span>';
    const status = host.querySelector("quality-status");
    host.insertBefore(button, status || null);
    button.addEventListener("click", open);
  }

  async function runLookup(rawCode) {
    const dialog = ensureDialog();
    const status = dialog.querySelector("#grcon-master-status");
    const results = dialog.querySelector("#grcon-master-results");
    const search = dialog.querySelector("#grcon-master-search-button");
    const code = text(rawCode);
    if (!code) {
      status.textContent = "Informe um código documental.";
      dialog.querySelector("#grcon-master-code").focus();
      return;
    }
    search.disabled = true;
    status.textContent = "Consultando SIGEM, Documentos Previstos, Solicitações, Cofre, Histórico e ProjectWise…";
    results.innerHTML = "";
    try {
      const [record, pw] = await Promise.all([lookupRemote(code), lookupPw(code)]);
      if (!record) throw new Error("O Registro Mestre não retornou dados para esta consulta.");
      results.innerHTML = renderRecord(record, pw);
      status.textContent = "Consulta concluída. Nenhuma base foi alterada.";
    } catch (error) {
      status.textContent = text(error?.message) || "Falha ao consultar o Registro Mestre.";
      results.innerHTML = '<div class="grcon-master-error"><strong>Não foi possível concluir a pesquisa.</strong><span>Verifique a sessão e tente novamente.</span></div>';
      console.error("[Registro Mestre]", error);
    } finally {
      search.disabled = false;
    }
  }

  function open(initialCode) {
    const dialog = ensureDialog();
    const input = dialog.querySelector("#grcon-master-code");
    if (text(initialCode)) input.value = text(initialCode);
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => { input.focus(); if (text(input.value)) input.select(); });
  }

  function init() { ensureButton(); ensureDialog(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
  root.addEventListener("grcon:cloud-ready", ensureButton);
  root.GrconMasterRegister = Object.freeze({ open, lookup: runLookup, lookupRemote, lookupPw });
})(window);
