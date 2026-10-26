/* GRCON — Central de Apoio contextual. Apenas leitura; nunca altera a elegibilidade de uma GRDT. */
(function (root) {
  "use strict";
  const doc = root.document;
  if (!doc) return;
  const Core = root.GrconGrdtSupportCore;
  if (!Core) return;
  const byId = function (id) { return doc.getElementById(id); };
  let epoch = 0, debounce = 0, latestSummary = null, lastSearch = "";
  let activeScope = "", lastRows = [];
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
    const list = element("div", "grdt-support-revisions");
    rows.slice(0, 100).forEach(function (row) {
      const item = element("div", "grdt-support-revision");
      const name = element("strong", "", "Rev. " + (row.revision || "não informada") + " · " + normalizeStatus(row.status));
      const title = element("span", "", row.title || "Sem título registrado");
      const meta = element("small", "", "Fonte: Consulta Geral" + (row.sourceRow != null ? " · Linha " + row.sourceRow : ""));
      item.append(name, title, meta);
      list.append(item);
    });
    el.detailBody.append(list);
    if (rows.length > 100) el.detailBody.append(element("small", "", "Mostrando as primeiras 100 linhas. Abra a Consulta Geral para consultar o restante."));
    el.detailBody.append(element("p", "grdt-support-muted", sourceLabel(base)));
    el.detail.showModal();
  }
  function renderResults(result, base) {
    el.results.replaceChildren();
    el.results.hidden = false;
    const summary = result.total + " registro(s) encontrado(s)" +
      (result.missing.length ? " · " + result.missing.length + " código(s) não localizado(s)" : "") +
      (result.total > result.rows.length ? " · prévia limitada" : "") +
      (result.truncatedInput ? " · até 100 códigos por pesquisa" : "");
    text(el.searchInfo, summary + " · " + sourceLabel(base));
    if (!result.total) {
      el.results.append(element("p", "grdt-support-muted", "Nenhum registro encontrado para os códigos informados. Verifique a base e a grafia."));
      return;
    }
    const list = element("div", "grdt-support-result-list");
    result.rows.forEach(function (row) {
      const button = element("button", "grdt-support-result", "");
      button.type = "button"; button.setAttribute("aria-label", "Ver revisões de " + row.document);
      const identity = element("span", "grdt-support-identity");
      identity.append(element("strong", "", row.document), element("small", "", "Rev. " + (row.revision || "—")));
      button.append(identity, element("span", "grdt-support-result-status", normalizeStatus(row.status)),
        element("span", "grdt-support-result-title", row.title || "Sem título"));
      button.addEventListener("click", function () { openDetail(row.document); });
      list.append(button);
    });
    el.results.append(list);
    if (result.total > result.rows.length) {
      el.results.append(element("small", "grdt-support-muted", "Para listagens extensas, consulte a Consulta Geral completa."));
    }
    if (result.missing.length) {
      el.results.append(element("small", "grdt-support-muted", "Não localizados nesta fonte: " + result.missing.slice(0, 4).join(", ") + (result.missing.length > 4 ? "…" : "")));
    }
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
    const result = Core.search(base.records, query, 12);
    if (ticket !== epoch || scope() !== current || String(el.search.value || "").trim() !== query) return;
    lastRows = result.rows;
    renderResults(result, base);
  }
  function updateResume() {
    const Workspace = root.GrconWorkspace;
    const draft = Workspace && typeof Workspace.draft === "function" ? String(Workspace.draft("grdtRelation", "") || "") : "";
    const hasDraft = Boolean(draft.trim());
    el.resume.hidden = !hasDraft;
    if (!hasDraft) return;
    const count = Core.parseCodes(draft).length;
    text(el.resumeInfo, count + " referência(s) de uma entrada por texto salva. LD e arquivos físicos precisarão ser revalidados.");
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
    el.searchArea.hidden = Boolean(hasResults || running || emitting);
    el.resume.hidden = Boolean(hasResults || running || emitting);
    if (!hasResults && !running && !emitting) updateResume();
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
    const groups = payload && payload.counts || {};
    const keys = ["revisar", "bloqueado", "nao_localizado", "descartar"];
    const total = keys.reduce(function (sum, key) { return sum + Math.max(0, Number(groups[key]) || 0); }, 0);
    const header = element("div", "grdt-support-attention-head");
    header.append(element("strong", "", total ? total + " documento(s) com situação a conferir ou fora da inclusão automática" : "Nenhuma inconsistência identificada pelas verificações executadas."));
    el.attention.append(header);
    if (total) {
      const buttons = element("div", "grdt-support-attention-actions");
      keys.filter(function (key) { return Number(groups[key]) > 0; }).forEach(function (key) {
        const button = element("button", "grdt-support-filter", Core.GROUPS[key] + " · " + groups[key]);
        button.type = "button";
        button.addEventListener("click", function () {
          const target = doc.querySelector('#results-section [data-filter="' + key + '"]');
          if (target) {
            target.click();
            byId("results-section").scrollIntoView({ block: "start", behavior: "auto" });
          } else {
            text(el.stageInfo, "Abra os filtros da tabela para conferir esses documentos.");
            el.stageInfo.hidden = false;
          }
        });
        buttons.append(button);
      });
      el.attention.append(buttons);
      el.attention.append(element("small", "grdt-support-muted", "Classificações provenientes da triagem atual. Clique para filtrar a tabela, sem alterar seleções."));
    }
    el.attention.hidden = false;
  }
  function resetContext() {
    epoch += 1; activeScope = scope(); latestSummary = null; lastRows = [];
    el.search.value = ""; clearSearch("");
    if (el.detail.open) el.detail.close();
    renderStage();
  }
  function init() {
    const panel = byId("grdt-support-panel");
    if (!panel) return;
    el.panel = panel; el.search = byId("grdt-support-search"); el.searchInfo = byId("grdt-support-search-info");
    el.searchArea = byId("grdt-support-search-area"); el.results = byId("grdt-support-results");
    el.resume = byId("grdt-support-resume"); el.resumeInfo = byId("grdt-support-resume-info");
    el.resumeAction = byId("grdt-support-resume-button"); el.attention = byId("grdt-support-attention");
    el.stageInfo = byId("grdt-support-stage"); el.detail = byId("grdt-support-detail");
    el.detailBody = byId("grdt-support-detail-body");
    activeScope = scope();
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
      const action = byId("relation-start");
      if (action && !action.disabled) action.click();
    });
    byId("grdt-support-detail-close").addEventListener("click", function () { el.detail.close(); });
    el.detail.addEventListener("click", function (event) { if (event.target === el.detail) el.detail.close(); });
    root.addEventListener("grcon:grdt-support-summary", function (event) {
      if (activeScope !== scope()) { resetContext(); return; }
      latestSummary = event.detail || null; renderStage();
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
    root.addEventListener("pageshow", renderStage);
    renderStage();
  }
  root.GrconGrdtSupportUi = Object.freeze({ refresh: function () { if (el.panel) renderStage(); }, search: function (query) {
    if (!el.panel) return;
    el.search.value = String(query || ""); void search();
  } });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);