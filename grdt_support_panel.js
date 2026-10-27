/* GRCON — Central de Apoio contextual. Apenas leitura; nunca altera a elegibilidade de uma GRDT. */
(function (root) {
  "use strict";
  const doc = root.document;
  if (!doc) return;
  const Core = root.GrconGrdtSupportCore;
  if (!Core) return;
  const byId = function (id) { return doc.getElementById(id); };
  let epoch = 0, debounce = 0, saveTimer = 0, latestSummary = null, lastSearch = "";
  let activeScope = "", lastRows = [], issueLimit = 5;
  const el = {};

  function scope() {
    const cloud = root.GrconCloud && root.GrconCloud.state || {};
    return String(cloud.session && cloud.session.user && cloud.session.user.id || "local") + "|" +
      String(cloud.membership && cloud.membership.workspace_id || root.GrconWorkspace && root.GrconWorkspace.activeContract && root.GrconWorkspace.activeContract() || "local");
  }
  function text(node, value) { if (node) node.textContent = String(value == null ? "" : value); }
  function element(tag, className, label) {
    const result = doc.createElement(tag);
    if (className) result.className = className;
    if (label !== undefined) text(result, label);
    return result;
  }
  function readBase() {
    const query = root.GrconSharedSigemQuery;
    // Consulta de outro contrato nunca pode ser reaproveitada antes da troca de contexto.
    const cloud = root.GrconCloud && root.GrconCloud.state;
    const membership = cloud && cloud.membership;
    // Uma projeção em memória do contrato anterior não pode ser consultada após sair.
    if (root.GrconCloud && (!cloud || !cloud.session || !cloud.session.user ||
        !cloud.session.user.id || !membership || !membership.workspace_id)) return null;
    if (membership && query && query.state && query.state.workspace !== membership.workspace_id) return null;
    const base = query && typeof query.current === "function" ? query.current() : null;
    return base && Array.isArray(base.records) ? base : null;
  }
  function sourceLabel(base) {
    if (!base) return "Consulta Geral indisponível. A GRDT continua acessível.";
    const meta = base.meta || {};
    const stamp = meta.referenceDate || meta.importedAt || meta.publishedAt || "data não informada";
    return "Consulta Geral · " + stamp + (root.GrconSharedSigemQuery && root.GrconSharedSigemQuery.state && root.GrconSharedSigemQuery.state.stale ? " · base em cache" : "");
  }
  function normalizeStatus(value) {
    const status = String(value || "").trim();
    return root.TriagemCore && root.TriagemCore.isWorkflowStatus && root.TriagemCore.isWorkflowStatus(status) ? "Em análise" : (status || "Não informado");
  }
  function clearSearch(message) {
    lastRows = [];
    el.results.replaceChildren();
    el.results.hidden = true;
    text(el.searchInfo, message || "");
  }
  function openDetail(code) {
    const base = readBase();
    if (!base || !el.detail) return;
    const rows = base.records.filter(function (row) { return Core.key(row && row.document) === Core.key(code); });
    if (!rows.length) return;
    rows.sort(function (a, b) {
      return new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" }).compare(String(a.revision || ""), String(b.revision || ""));
    });
    el.detailBody.replaceChildren();
    const heading = element("h3", "", code);
    const caption = element("p", "grdt-support-muted", "Todas as revisões encontradas nesta fonte. A situação de uma revisão não comprova a postagem de outra.");
    el.detailBody.append(heading, caption);
    const copy = element("button", "grdt-support-filter", "Copiar código");
    copy.type = "button";
    copy.addEventListener("click", async function () {
      try {
        await root.navigator.clipboard.writeText(code);
        text(copy, "Código copiado");
      } catch (_) { text(copy, "Selecione e copie o código acima"); }
    });
    el.detailBody.append(copy);
    const list = element("div", "grdt-support-revisions");
    let revisionShown = 100;
    function renderRevisions() {
      list.replaceChildren();
      rows.slice(0, revisionShown).forEach(function (row) {
      const item = element("div", "grdt-support-revision");
      const name = element("strong", "", "Rev. " + (row.revision || "não informada") + " · " + normalizeStatus(row.status));
      const title = element("span", "", row.title || "Sem título registrado");
      const meta = element("small", "", "Fonte: Consulta Geral" + (row.sourceRow != null ? " · Linha " + row.sourceRow : ""));
      item.append(name, title, meta);
      try {
        const history = root.GrconPostingFlow && root.GrconPostingFlow.lookup(row.document, row.revision);
        const emission = history && history.latestEmission;
        if (emission && emission.grdt) {
          item.append(element("small", "", "eGRDT registrada: " + emission.grdt + " · não comprova postagem"));
        }
      } catch (_) { /* histórico indisponível não altera a pesquisa SIGEM */ }
      list.append(item);
      });
      if (rows.length > revisionShown) {
        const moreRevisions = element("button","grdt-support-toggle",
          "Mostrar mais " + Math.min(100,rows.length - revisionShown) + " revisões/registros");
        moreRevisions.type = "button";
        moreRevisions.addEventListener("click",function () { revisionShown += 100; renderRevisions(); });
        list.append(moreRevisions);
      }
    }
    el.detailBody.append(list); renderRevisions();
    el.detailBody.append(element("p", "grdt-support-muted", sourceLabel(base)));
    el.detail.showModal();
  }

  function renderResults(result, base) {
    el.results.replaceChildren(); el.results.hidden = false;
    const summary = result.total + " registro(s) encontrado(s)" +
      (result.missing.length ? " · " + result.missing.length + " código(s) ausente(s)" : "") +
      (result.total > result.rows.length ? " · resultado parcial" : "") +
      (result.truncatedInput ? " · até 250 códigos por consulta" : "");
    text(el.searchInfo, summary + " · " + sourceLabel(base));
    if (!result.total) {
      el.results.append(element("p","grdt-support-muted",
        "Nenhum registro encontrado nesta fonte. Confira código completo e referência da base."));
      return;
    }
    let visible = 30;
    const list = element("div","grdt-support-result-list");
    function showMore() {
      list.replaceChildren();
      result.rows.slice(0,visible).forEach(function (row) {
        const button = element("button","grdt-support-result","");
        button.type = "button"; button.setAttribute("aria-label","Ver revisões de " + row.document);
        const identity = element("span","grdt-support-identity");
        identity.append(element("strong","",row.document),element("small","","Rev. " + (row.revision || "—")));
        button.append(identity,element("span","grdt-support-result-status",normalizeStatus(row.status)),
          element("span","grdt-support-result-title",row.title || "Sem título"));
        button.addEventListener("click",function () { openDetail(row.document); });
        list.append(button);
      });
      more.hidden = visible >= result.rows.length;
      more.textContent = "Mostrar mais resultados (" + Math.min(50,result.rows.length - visible) + ")";
    }
    const more = element("button","grdt-support-toggle","");
    more.type = "button"; more.addEventListener("click",function () { visible += 50; showMore(); });
    el.results.append(list,more); showMore();
    if (result.total > result.rows.length) el.results.append(element("small","grdt-support-muted",
      "Prévia limitada a 2.000 registros. Consulte a Consulta Geral para o restante."));
    if (result.missing.length) el.results.append(element("small","grdt-support-muted",
      "Ausentes nesta fonte: " + result.missing.slice(0,8).join(", ") +
      (result.missing.length > 8 ? "…" : "")));
  }
  async function search() {
    const query = String(el.search.value || "").trim();
    lastSearch = query;
    const current = scope(), ticket = ++epoch;
    if (!query) { clearSearch("Informe um código para consultar."); return; }
    text(el.searchInfo, "Consultando base disponível…");
    let base = readBase();
    if (!base) {
      try {
        const service = root.GrconSharedSigemQuery;
        if (service && typeof service.refresh === "function") await service.refresh();
      } catch (_) { /* erro é representado pelo estado de fonte indisponível */ }
      if (ticket !== epoch || scope() !== current) return;
      base = readBase();
    }
    if (!base) { clearSearch("Consulta Geral indisponível. Tente novamente quando a base estiver carregada."); return; }
    // Reutiliza a base indexada/cached pelo módulo oficial; nenhuma cópia persistente.
    const result = Core.search(base.records, query, 2000);
    if (ticket !== epoch || scope() !== current || String(el.search.value || "").trim() !== query) return;
    lastRows = result.rows;
    renderResults(result, base);
  }
  const PREPARATION_PREFIX = "grcon.support.preparation.v1.";
  const PREPARATION_TTL = 7 * 86400000;
  function preparationKey() {
    const cloud = root.GrconCloud && root.GrconCloud.state;
    if (!cloud || !cloud.session || !cloud.session.user || !cloud.session.user.id ||
        !cloud.membership || !cloud.membership.workspace_id) return "";
    return PREPARATION_PREFIX + encodeURIComponent(scope());
  }
  function readPreparation() {
    const key = preparationKey();
    if (!key) return null;
    try {
      const item = JSON.parse(root.localStorage.getItem(key) || "null");
      if (!item || item.schema !== 1 || !Number.isFinite(item.savedAt) ||
          item.savedAt > Date.now() + 60000 || Date.now() - item.savedAt > PREPARATION_TTL) return null;
      if (!Array.isArray(item.ldNames) || !Array.isArray(item.chosen)) return null;
      return item;
    } catch (_) { return null; }
  }
  function savePreparation() {
    const key = preparationKey(), api = root.GrconTriageUiApi;
    if (!key || !api || typeof api.preparationSnapshot !== "function") return;
    try {
      const item = api.preparationSnapshot();
      if (!item || (!item.ldNames.length && !item.relationName && !item.folderName &&
          !item.relationText.trim() && !item.chosen.length)) return;
      root.localStorage.setItem(key, JSON.stringify(item));
    } catch (_) { /* a falha de armazenamento nunca bloqueia a GRDT */ }
    updateResume();
  }
  function schedulePreparation() {
    root.clearTimeout(saveTimer);
    saveTimer = root.setTimeout(savePreparation, 650);
  }
  function updateResume() {
    const previous = readPreparation();
    el.resume.hidden = !previous;
    if (!previous) return;
    {
      const parts = [];
      if (previous.ldNames.length) parts.push(previous.ldNames.slice(0, 2).join(", "));
      if (previous.relationName) parts.push(previous.relationName);
      if (previous.chosen.length) parts.push(previous.chosen.length + " documento(s) selecionado(s) anteriormente");
      text(el.resumeInfo, (parts.join(" · ") || "Preparação anterior salva") +
        ". Reanálise e revalidação dos arquivos serão necessárias. Nenhuma escolha antiga será aplicada automaticamente.");
    }
    el.resumeAction.disabled = false;
  }
  function prepared() {
    const fields = [byId("ld-meta"), byId("pdf-meta"), byId("list-meta")];
    return fields.some(function (item) {
      if (!item) return false;
      const textValue = String(item.textContent || "").toLocaleLowerCase("pt-BR");
      return textValue && !/^(selecionar|excel ou texto|nenhum)/.test(textValue);
    });
  }
  function renderStage() {
    const hasResults = Boolean(byId("results-section") && !byId("results-section").hidden);
    const running = byId("progress") && !byId("progress").hidden;
    const emitting = byId("grdt-download-progress") && !byId("grdt-download-progress").hidden;
    el.panel.dataset.mode = hasResults ? "review" : running || emitting ? "processing" : prepared() ? "prepared" : "initial";
    // Consulta útil justamente durante a conferência: nunca ocultá-la após analisar.
    el.searchArea.hidden = false;
    el.resume.hidden = Boolean(hasResults || running || emitting);
    if (!hasResults && !running && !emitting) updateResume();
    const existingResume = byId("grcon-retomar");
    if (existingResume && !existingResume.hidden) el.resume.hidden = true;
    el.attention.hidden = !hasResults || !latestSummary;
    if (hasResults && latestSummary) renderAttention(latestSummary);
    if (!hasResults) el.attention.hidden = true;
    if (running || emitting) {
      text(el.stageInfo, "Processamento em andamento. Acompanhe o progresso acima.");
    } else if (prepared() && !hasResults) {
      text(el.stageInfo, "Fontes selecionadas. Use Analisar e conferir para obter a classificação documental.");
    } else {
      text(el.stageInfo, "");
    }
    el.stageInfo.hidden = !(el.stageInfo.textContent || "").trim();
  }

  function renderAttention(payload) {
    el.attention.replaceChildren();
    const diagnostics = payload && payload.diagnostics;
    if (!diagnostics) { el.attention.hidden = true; return; }
    const total = diagnostics.total;
    const title = element("div", "grdt-support-toolbar");
    title.append(element("strong", "", total
      ? total + " documento(s) merecem atenção"
      : "Nenhuma pendência adicional identificada nesta triagem"));
    if (total) title.append(element("span", "grdt-support-preview", "Orientação · sem alterar a classificação"));
    el.attention.append(title);
    if (diagnostics.selected && diagnostics.selectedRisks) {
      const preflight = element("div", "grdt-support-preflight",
        "Conferência preventiva: " + diagnostics.selectedRisks +
        " dos " + diagnostics.selected + " documento(s) selecionado(s) exigem atenção" +
        (diagnostics.manualSelected ? " · " + diagnostics.manualSelected + " por inclusão manual" : "") +
        ". A seleção foi preservada; confira as evidências antes de gerar.");
      el.attention.append(preflight);
    }
    if (!total) {
      el.attention.append(element("small", "grdt-support-muted",
        "A ausência de alertas adicionais não comprova conformidade nem postagem."));
      el.attention.hidden = false; return;
    }
    const issues = element("div", "grdt-support-issues");
    diagnostics.issues.slice(0,issueLimit).forEach(function (issue) {
      const row = element("div","grdt-support-issue");
      const info = element("div");
      info.append(element("strong", "", issue.document + " · rev. " +
        (issue.revision || "não informada") + " — " + issue.title));
      info.append(element("p", "", issue.reason));
      const button = element("button", "", issue.action || "Ver na tabela");
      button.type = "button"; button.title = "Ver a linha exata e suas evidências na tabela principal";
      button.addEventListener("click", function () {
        const api = root.GrconTriageUiApi;
        const located = api && typeof api.revealSupportRow === "function" &&
          api.revealSupportRow(issue.document, issue.revision);
        if (!located) {
          text(el.stageInfo, "Não foi possível revelar a linha. Verifique os filtros da tabela principal.");
          el.stageInfo.hidden = false;
        }
      });
      row.append(info,button); issues.append(row);
    });
    el.attention.append(issues);
    if (diagnostics.issues.length > issueLimit) {
      const more = element("button","grdt-support-toggle",
        "Mostrar mais " + Math.min(12,diagnostics.issues.length - issueLimit) + " pendências");
      more.type = "button";
      more.addEventListener("click", function () { issueLimit += 12; renderAttention(latestSummary); });
      el.attention.append(more);
    }
    if (diagnostics.limited) el.attention.append(element("small","grdt-support-muted",
      "Há mais pendências que as exibidas aqui. Consulte a tabela completa para todas as linhas."));
    el.attention.hidden = false;
  }
  function resetContext() {
    epoch += 1; activeScope = scope(); latestSummary = null; lastRows = []; issueLimit = 5;
    el.search.value = ""; clearSearch("");
    if (el.detail.open) el.detail.close();
    renderStage();
  }
  function init() {
    const panel = byId("grdt-support-panel");
    if (!panel) return;
    el.panel = panel; el.search = byId("grdt-support-search"); el.searchInfo = byId("grdt-support-search-info");
    el.searchArea = byId("grdt-support-search-form"); el.results = byId("grdt-support-results");
    el.resume = byId("grdt-support-resume"); el.resumeInfo = byId("grdt-support-resume-info");
    el.resumeAction = byId("grdt-support-resume-button"); el.attention = byId("grdt-support-attention");
    el.stageInfo = byId("grdt-support-stage"); el.detail = byId("grdt-support-detail");
    el.detailBody = byId("grdt-support-detail-body");

    activeScope = scope();
    const heading = panel.querySelector(".grdt-support-head");
    const toggle = element("button","grdt-support-toggle","Recolher");
    toggle.type = "button"; toggle.setAttribute("aria-expanded","true");
    toggle.setAttribute("aria-controls","grdt-support-search-form grdt-support-attention");
    toggle.addEventListener("click", function () {
      const minimized = el.panel.dataset.minimized !== "true";
      el.panel.dataset.minimized = String(minimized);
      toggle.textContent = minimized ? "Expandir" : "Recolher";
      toggle.setAttribute("aria-expanded",String(!minimized));
    });
    if (heading) heading.append(toggle);
    byId("grdt-support-search-form").addEventListener("submit", function (event) {
      event.preventDefault(); root.clearTimeout(debounce); void search();
    });
    el.search.addEventListener("input", function () {
      root.clearTimeout(debounce);
      if (!el.search.value.trim()) { epoch++; clearSearch(""); return; }
      // Busca só quando o usuário interromper a digitação; listas também podem usar Pesquisar.
      debounce = root.setTimeout(function () { void search(); }, 350);
    });
    el.resumeAction.addEventListener("click", function () {
      const previous = readPreparation();
      const candidate = previous ? (previous.relationText.trim() ? Core.parseCodes(previous.relationText) :
        previous.chosen.map(function (row) { return row.document; })) : [];
      const api = root.GrconTriageUiApi;
      if (candidate.length && api && typeof api.prepareRelationDraft === "function") {
        api.prepareRelationDraft(candidate);
        return;
      }
      const selector = byId("ld-input");
      if (selector) { selector.focus(); selector.click(); }
    });
    byId("grdt-support-detail-close").addEventListener("click", function () { el.detail.close(); });
    el.detail.addEventListener("click", function (event) { if (event.target === el.detail) el.detail.close(); });
    root.addEventListener("grcon:grdt-support-summary", function (event) {
      if (activeScope !== scope()) { resetContext(); return; }
      latestSummary = event.detail ? { ...event.detail, diagnostics: Core.diagnose(event.detail.rows || []) } : null;
      renderStage();
    });
    ["grcon:contract-context-changed", "grcon:cloud-signed-out"].forEach(function (name) { root.addEventListener(name, resetContext); });
    ["grcon:ui-update", "grcon:shared-sigem-updated", "grcon:cloud-ready"].forEach(function (name) {
      root.addEventListener(name, function () {
        if (activeScope !== scope()) resetContext();
        else renderStage();
      });
    });
    doc.addEventListener("grcon:triage-rendered", renderStage);
    ["ld-input", "pdf-input", "list-input", "relation-apply", "clear-ld-btn", "clear-pdf-btn", "clear-relation-btn"].forEach(function (id) {
      const field = byId(id);
      if (field) field.addEventListener(field.tagName === "INPUT" ? "change" : "click", function () { root.setTimeout(renderStage, 50); });
    });
    root.addEventListener("grcon:processing-state", renderStage);
    root.addEventListener("grcon:grdt-support-summary", schedulePreparation);
    root.addEventListener("grcon:ui-update", schedulePreparation);
    root.addEventListener("pagehide", function () { root.clearTimeout(saveTimer); savePreparation(); });
    root.addEventListener("pageshow", renderStage);
    root.addEventListener("grcon:grdt-support-reset", function () {
      root.clearTimeout(saveTimer);
      const key = preparationKey();
      try { if (key) root.localStorage.removeItem(key); } catch (_) { /* sem armazenamento */ }
      latestSummary = null;
      renderStage();
    });
    renderStage();
  }
  root.GrconGrdtSupportUi = Object.freeze({ refresh: function () { if (el.panel) renderStage(); }, search: function (query) {
    if (!el.panel) return;
    el.search.value = String(query || ""); void search();
  } });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);