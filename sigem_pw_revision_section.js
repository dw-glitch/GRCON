(function (root) {
  "use strict";

  const SECTION_ID = "spw-revision-section";
  const STYLE_ID = "spw-revision-style";
  const PAGE_SIZE = 100;
  const state = {
    modelRef: null,
    analysis: null,
    analysisGeneration: 0,
    filters: { situation: "attention", documentClass: "", sigemRevision: "", pwRevision: "", sigemStatus: "", pwStatus: "", search: "", documentList: "" },
    page: 1,
    expandedKey: "",
    searchTimer: null,
  };

  function Core() { return root.GrconSigemPwRevision; }
  function App() { return root.GrconSigemPwDashboardUi; }
  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function escapeHtml(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function ms(value) { return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }); }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID}{margin-top:14px}.spw-rev-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:9px}.spw-rev-head h3{margin:0;color:var(--text-strong,#183247);font-size:1rem}.spw-rev-head p{margin:4px 0 0;color:var(--text-muted,#66798a);font-size:.75rem;line-height:1.4}.spw-rev-help{border:1px solid var(--border,#d7e0e8);background:var(--surface,#fff);border-radius:50%;width:28px;height:28px;cursor:help;color:var(--text-muted,#66798a);font-weight:900}
      .spw-rev-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.spw-rev-card{appearance:none;text-align:left;border:1px solid var(--border,#dce4eb);border-radius:12px;background:var(--surface,#fff);padding:11px 12px;box-shadow:0 5px 18px rgba(32,56,85,.04);cursor:pointer;color:inherit}.spw-rev-card:hover,.spw-rev-card.active{border-color:var(--brand-300,#8ac4df);box-shadow:0 6px 20px rgba(32,56,85,.08)}.spw-rev-card strong{display:block;font-size:1.35rem;color:var(--text-strong,#17324a)}.spw-rev-card b{display:block;margin-top:4px;font-size:.74rem;color:var(--text-strong,#294258)}.spw-rev-card small{display:block;margin-top:3px;color:var(--text-muted,#66798a);font-size:.66rem;line-height:1.3}.spw-rev-card.updated{border-left:4px solid var(--success-500,#3f8f68)}.spw-rev-card.previous{border-left:4px solid var(--warning-500,#c68a28)}.spw-rev-card.missing{border-left:4px solid var(--danger-500,#c74b43)}.spw-rev-card.pending{border-left:4px solid var(--brand-500,#2789b6)}.spw-rev-card.other{border-left:4px solid var(--text-muted,#7b8b98)}
      .spw-rev-panel{margin-top:9px;border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(32,56,85,.04);overflow:hidden}.spw-rev-toolbar{display:grid;grid-template-columns:1.1fr repeat(5,minmax(120px,1fr));gap:7px;padding:10px 11px;border-bottom:1px solid var(--border,#e6ebef);align-items:end}.spw-rev-toolbar label{display:grid;gap:4px}.spw-rev-toolbar span{font-size:.61rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-rev-toolbar input,.spw-rev-toolbar select{min-height:36px}.spw-rev-list-wrap{padding:0 11px 10px}.spw-rev-list-toggle{font-size:.68rem;color:var(--brand-700,#155c8a);cursor:pointer}.spw-rev-list-wrap textarea{width:100%;min-height:66px;resize:vertical;margin-top:5px}.spw-rev-summary{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 11px;background:var(--surface-soft,#f7fafc);border-bottom:1px solid var(--border,#e6ebef);font-size:.7rem;color:var(--text-muted,#66798a)}.spw-rev-summary strong{color:var(--text-strong,#294258)}
      .spw-rev-table-wrap{overflow:auto;max-height:560px}.spw-rev-table{width:100%;border-collapse:collapse;font-size:.73rem}.spw-rev-table th,.spw-rev-table td{padding:8px 9px;border-bottom:1px solid var(--border,#edf1f4);text-align:left;white-space:nowrap;vertical-align:middle}.spw-rev-table thead th{position:sticky;top:0;z-index:2;background:var(--surface-soft,#f6f9fb);font-size:.59rem;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-rev-doc{max-width:310px;overflow:hidden;text-overflow:ellipsis}.spw-rev-flow{display:inline-flex;align-items:center;gap:4px;font-weight:900;color:var(--text-strong,#294258)}.spw-rev-situation{display:inline-flex;padding:4px 7px;border-radius:999px;background:var(--surface-soft,#eef3f6);font-weight:900;font-size:.64rem}.spw-rev-situation.previous{background:rgba(198,138,40,.12)}.spw-rev-situation.missing{background:rgba(199,75,67,.10)}.spw-rev-situation.pending{background:var(--brand-50,#eaf5fb)}.spw-rev-situation.updated{background:rgba(63,143,104,.12)}.spw-rev-why{border:0;background:transparent;color:var(--brand-700,#155c8a);font-weight:900;cursor:pointer}.spw-rev-detail td{white-space:normal!important;background:var(--surface-soft,#f8fafc);padding:11px}.spw-rev-detail-grid{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:10px}.spw-rev-detail-grid section{padding:9px;border:1px solid var(--border,#e0e7ec);border-radius:9px;background:var(--surface,#fff)}.spw-rev-detail-grid strong{display:block;margin-bottom:6px;font-size:.71rem}.spw-rev-history{display:flex;flex-wrap:wrap;gap:5px}.spw-rev-history span{padding:4px 6px;border-radius:7px;background:var(--surface-soft,#eef3f6);font-size:.65rem}.spw-rev-reason{margin:0;color:var(--text-muted,#5f7385);font-size:.69rem;line-height:1.45}.spw-rev-pages{display:flex;justify-content:flex-end;align-items:center;gap:7px;padding:9px 11px;border-top:1px solid var(--border,#e6ebef)}.spw-rev-pages button{min-height:32px}.spw-rev-empty{padding:28px 14px;text-align:center;color:var(--text-muted,#66798a)}
      @media(max-width:1250px){.spw-rev-cards{grid-template-columns:repeat(3,minmax(0,1fr))}.spw-rev-toolbar{grid-template-columns:repeat(3,minmax(150px,1fr))}}
      @media(max-width:850px){.spw-rev-cards{grid-template-columns:1fr 1fr}.spw-rev-toolbar{grid-template-columns:1fr 1fr}.spw-rev-detail-grid{grid-template-columns:1fr}}
      @media(max-width:560px){.spw-rev-cards,.spw-rev-toolbar{grid-template-columns:1fr}.spw-rev-head{display:grid}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    const shell = document.getElementById("sigem-pw-dashboard-module");
    if (!shell) return null;
    let section = document.getElementById(SECTION_ID);
    if (!section) {
      section = document.createElement("section");
      section.id = SECTION_ID;
      section.innerHTML = `
        <header class="spw-rev-head"><div><span class="spw-kicker">DETALHAMENTO OPERACIONAL</span><h3>Situação das Revisões</h3><p>Identifique documentos em que a revisão disponível ou emitida no ProjectWise ainda não acompanha a revisão encontrada no SIGEM.</p></div><button type="button" class="spw-rev-help" title="Esta área compara a revisão encontrada no SIGEM com todas as revisões disponíveis no ProjectWise. Ela diferencia revisão anterior, documento não localizado e revisão correta cadastrada porém ainda sem emissão.">ⓘ</button></header>
        <div class="spw-rev-cards" id="spw-rev-cards"></div>
        <div class="spw-rev-panel">
          <div class="spw-rev-toolbar">
            <label><span>Situação</span><select id="spw-rev-filter-situation"><option value="attention">Precisam de atenção</option><option value="all">Todos</option><option value="pw-not-found">Não localizado no PW</option><option value="pw-previous">PW em revisão anterior</option><option value="pw-awaiting-emission">Aguardando emissão</option><option value="updated">Atualizado</option><option value="other">Outras divergências</option><option value="pw-ahead">PW em revisão posterior</option><option value="review">Requer análise</option></select></label>
            <label><span>Classe</span><select id="spw-rev-filter-class"><option value="">Todas</option></select></label>
            <label><span>Rev. SIGEM</span><select id="spw-rev-filter-sigem-rev"><option value="">Todas</option></select></label>
            <label><span>Rev. PW</span><select id="spw-rev-filter-pw-rev"><option value="">Todas</option></select></label>
            <label><span>Status SIGEM</span><select id="spw-rev-filter-sigem-status"><option value="">Todos</option></select></label>
            <label><span>Status PW</span><select id="spw-rev-filter-pw-status"><option value="">Todos</option></select></label>
            <label style="grid-column:1/-1"><span>Pesquisar documento</span><input id="spw-rev-search" type="search" placeholder="Pesquisar código, revisão ou status..."/></label>
          </div>
          <details class="spw-rev-list-wrap"><summary class="spw-rev-list-toggle">Pesquisar uma lista de documentos</summary><textarea id="spw-rev-document-list" placeholder="Cole um código por linha, ou separe por vírgula/ponto e vírgula."></textarea></details>
          <div class="spw-rev-summary" id="spw-rev-summary"></div>
          <div class="spw-rev-table-wrap" id="spw-rev-table-wrap"></div>
          <div class="spw-rev-pages" id="spw-rev-pages"></div>
        </div>`;
      const classTable = shell.querySelector(".spw-table-card");
      if (classTable && classTable.parentNode) classTable.insertAdjacentElement("afterend", section);
      else shell.appendChild(section);
    }
    bindShell(shell);
    return section;
  }

  function bindShell(shell) {
    if (shell.dataset.spwRevisionBound === "1") return;
    shell.dataset.spwRevisionBound = "1";
    shell.addEventListener("click", (event) => {
      const card = event.target.closest("[data-spw-rev-situation]");
      if (card) {
        const value = card.getAttribute("data-spw-rev-situation");
        state.filters.situation = state.filters.situation === value ? "attention" : value;
        state.page = 1;
        void render(false);
        return;
      }
      const why = event.target.closest("[data-spw-rev-why]");
      if (why) {
        const key = why.getAttribute("data-spw-rev-why");
        state.expandedKey = state.expandedKey === key ? "" : key;
        renderTable();
        return;
      }
      const page = event.target.closest("[data-spw-rev-page]");
      if (page) {
        state.page = Math.max(1, Number(page.getAttribute("data-spw-rev-page")) || 1);
        renderTable();
      }
    });
    shell.addEventListener("change", (event) => {
      const map = {
        "spw-rev-filter-situation": "situation",
        "spw-rev-filter-class": "documentClass",
        "spw-rev-filter-sigem-rev": "sigemRevision",
        "spw-rev-filter-pw-rev": "pwRevision",
        "spw-rev-filter-sigem-status": "sigemStatus",
        "spw-rev-filter-pw-status": "pwStatus",
      };
      const field = map[event.target.id];
      if (!field) return;
      state.filters[field] = event.target.value;
      state.page = 1;
      void render(false);
    });
    shell.addEventListener("input", (event) => {
      if (event.target.id !== "spw-rev-search" && event.target.id !== "spw-rev-document-list") return;
      if (state.searchTimer) root.clearTimeout(state.searchTimer);
      state.searchTimer = root.setTimeout(() => {
        if (event.target.id === "spw-rev-search") state.filters.search = event.target.value;
        else state.filters.documentList = event.target.value;
        state.page = 1;
        renderTable();
      }, 180);
    });
  }

  async function ensureAnalysis(force) {
    const model = App() && App().state && App().state.model;
    if (!model) return null;
    if (!force && state.modelRef === model && state.analysis) return state.analysis;
    const generation = ++state.analysisGeneration;
    state.modelRef = model;
    const section = document.getElementById(SECTION_ID);
    const table = section && section.querySelector("#spw-rev-table-wrap");
    if (table) table.innerHTML = `<div class="spw-rev-empty"><strong>Comparando revisões SIGEM × PW...</strong><br><span id="spw-rev-progress-count">Preparando índices já carregados.</span></div>`;
    const result = await Core().analyzeAsync(model, {
      chunkSize: 350,
      generation,
      isCurrent: (value) => value === state.analysisGeneration,
      onProgress: (done, total) => { const progress = document.getElementById("spw-rev-progress-count"); if (progress) progress.textContent = `${fmt(done)} de ${fmt(total)} documentos processados`; },
    });
    if (!result || result.cancelled || generation !== state.analysisGeneration) return null;
    state.analysis = result;
    if (root.console && typeof root.console.debug === "function") console.debug("[SIGEM×PW][performance] revisão", result.metrics);
    return result;
  }

  function option(value, label) { return `<option value="${escapeHtml(value)}">${escapeHtml(label || value)}</option>`; }
  function syncSelect(id, values, current, allLabel) {
    const select = document.getElementById(id);
    if (!select) return;
    const unique = [...new Set((values || []).filter((value) => text(value) !== ""))].sort((a, b) => Core().rank(a) - Core().rank(b) || text(a).localeCompare(text(b), "pt-BR", { numeric: true }));
    select.innerHTML = option("", allLabel) + unique.map((value) => option(value)).join("");
    select.value = unique.includes(current) ? current : "";
  }

  function situationClass(value) {
    const S = Core().SITUATIONS;
    if (value === S.UPDATED) return "updated";
    if (value === S.PREVIOUS) return "previous";
    if (value === S.NOT_FOUND) return "missing";
    if (value === S.AWAITING_EMISSION) return "pending";
    return "other";
  }

  function renderCards() {
    const analysis = state.analysis;
    const c = analysis ? analysis.counts : {};
    const S = Core().SITUATIONS;
    const other = Number(c.pwAhead || 0) + Number(c.review || 0);
    const cards = [
      [S.UPDATED, c.updated, "Atualizados", "Mesma revisão aplicável e emitida no PW", "updated"],
      [S.PREVIOUS, c.previous, "PW em revisão anterior", "PW ainda não alcançou a revisão SIGEM", "previous"],
      [S.NOT_FOUND, c.notFound, "Não localizados no PW", "Sem correspondência documental válida", "missing"],
      [S.AWAITING_EMISSION, c.awaitingEmission, "Aguardando emissão no PW", "Revisão correta já está cadastrada", "pending"],
      ["other", other, "Outras divergências", "PW posterior ou caso que requer análise", "other"],
    ];
    const target = document.getElementById("spw-rev-cards");
    if (!target) return;
    target.innerHTML = cards.map(([value, count, title, note, css]) => {
      const selected = state.filters.situation === value;
      return `<button type="button" class="spw-rev-card ${css}${selected ? " active" : ""}" data-spw-rev-situation="${value}" title="${escapeHtml(note)}"><strong>${fmt(count)}</strong><b>${escapeHtml(title)}</b><small>${escapeHtml(note)}</small></button>`;
    }).join("");
  }

  function renderFilters() {
    const rows = state.analysis ? state.analysis.rows : [];
    const classes = ["ET", "N-1710", "CV"].filter((value) => rows.some((row) => row.documentClass === value));
    syncSelect("spw-rev-filter-class", classes, state.filters.documentClass, "Todas");
    syncSelect("spw-rev-filter-sigem-rev", rows.map((row) => row.sigemRevision), state.filters.sigemRevision, "Todas");
    syncSelect("spw-rev-filter-pw-rev", rows.map((row) => row.pwRevision), state.filters.pwRevision, "Todas");
    const sigemStatuses = [...new Set(rows.map((row) => row.sigemStatus).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const pwStatuses = [...new Set(rows.map((row) => row.pwStatus).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const setPlain = (id, values, current, label) => { const select = document.getElementById(id); if (!select) return; select.innerHTML = option("", label) + values.map((value) => option(value)).join(""); select.value = values.includes(current) ? current : ""; };
    setPlain("spw-rev-filter-sigem-status", sigemStatuses, state.filters.sigemStatus, "Todos");
    setPlain("spw-rev-filter-pw-status", pwStatuses, state.filters.pwStatus, "Todos");
    const situation = document.getElementById("spw-rev-filter-situation"); if (situation) situation.value = state.filters.situation;
  }

  function histories(row) {
    const renderHistory = (items, kind) => (items || []).map((item) => `<span>Rev. ${escapeHtml(item.revision)} · ${escapeHtml(item.status || "sem status")}${kind === "pw" ? ` · ${item.emitted ? "emitida" : "não emitida"}` : ""}</span>`).join("") || "<span>Sem histórico disponível</span>";
    const sigemHistory = Core().historyForRows(row.sigemRows, "sigem");
    const pwHistory = Core().historyForRows(row.pwRows, "pw");
    return `<tr class="spw-rev-detail"><td colspan="9"><div class="spw-rev-detail-grid"><section><strong>SIGEM — revisões encontradas</strong><div class="spw-rev-history">${renderHistory(sigemHistory, "sigem")}</div></section><section><strong>ProjectWise — revisões encontradas</strong><div class="spw-rev-history">${renderHistory(pwHistory, "pw")}</div></section><section><strong>Por que esta situação?</strong><p class="spw-rev-reason">${escapeHtml(row.reason)}</p><p class="spw-rev-reason" style="margin-top:6px">Código SIGEM: ${escapeHtml(row.sigemCode)}${row.pwCode ? `<br>Código PW: ${escapeHtml(row.pwCode)}` : ""}${row.eap ? `<br>EAP: ${escapeHtml(row.eap)}` : ""}${row.documentType ? `<br>Tipo: ${escapeHtml(row.documentType)}` : ""}<br>Revisão SIGEM: ${escapeHtml(row.sigemRevision)}<br>Revisões PW: ${escapeHtml(pwHistory.map((item) => item.revision).join(", ") || "nenhuma")}<br>Critério: identidade documental e comparador de revisões do GRCON.</p></section></div></td></tr>`;
  }

  function renderTable() {
    const target = document.getElementById("spw-rev-table-wrap");
    if (!target || !state.analysis) return;
    const rows = Core().filterRows(state.analysis.rows, state.filters);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);
    const summary = document.getElementById("spw-rev-summary");
    if (summary) summary.innerHTML = `<span><strong>${fmt(rows.length)}</strong> documento(s) no filtro · mostrando ${rows.length ? fmt(start + 1) : 0}–${fmt(Math.min(start + PAGE_SIZE, rows.length))}</span><span>Análise: ${ms(state.analysis.metrics.durationMs)} ms · ${fmt(state.analysis.metrics.documentsCompared)} documentos comparáveis</span>`;
    if (!pageRows.length) {
      target.innerHTML = `<div class="spw-rev-empty"><strong>Nenhum documento corresponde aos filtros atuais.</strong></div>`;
    } else {
      const body = pageRows.map((row) => {
        const css = situationClass(row.situation);
        const lastEmission = row.lastEmittedPwRevision !== "" ? `Rev. ${escapeHtml(row.lastEmittedPwRevision)}` : "—";
        const main = `<tr><td class="spw-rev-doc" title="${escapeHtml(row.document)}"><strong>${escapeHtml(row.document)}</strong></td><td>${escapeHtml(row.documentClass)}</td><td>${escapeHtml(row.sigemRevision)}</td><td>${escapeHtml(row.sigemStatus || "—")}</td><td>${row.pwRevision !== "" ? escapeHtml(row.pwRevision) : "—"}</td><td>${escapeHtml(row.pwStatus || "—")}</td><td>${lastEmission}</td><td><span class="spw-rev-flow">${escapeHtml(row.sigemRevision)} → ${row.pwRevision !== "" ? escapeHtml(row.pwRevision) : "—"}</span><br><span class="spw-rev-situation ${css}">${escapeHtml(Core().LABELS[row.situation] || row.situation)}</span></td><td><button type="button" class="spw-rev-why" data-spw-rev-why="${escapeHtml(row.key)}">${state.expandedKey === row.key ? "Fechar" : "Por quê?"}</button></td></tr>`;
        return main + (state.expandedKey === row.key ? histories(row) : "");
      }).join("");
      target.innerHTML = `<table class="spw-rev-table"><thead><tr><th>Documento</th><th>Classe</th><th>Rev. SIGEM</th><th>Status SIGEM</th><th>Rev. PW</th><th>Status PW</th><th>Última emissão PW</th><th>Situação</th><th>Detalhes</th></tr></thead><tbody>${body}</tbody></table>`;
    }
    const pager = document.getElementById("spw-rev-pages");
    if (pager) pager.innerHTML = `<button class="secondary-button" type="button" data-spw-rev-page="${Math.max(1, state.page - 1)}" ${state.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${fmt(state.page)} de ${fmt(pages)}</span><button class="secondary-button" type="button" data-spw-rev-page="${Math.min(pages, state.page + 1)}" ${state.page >= pages ? "disabled" : ""}>Próxima</button>`;
  }

  async function render(force) {
    ensureStyle();
    const section = ensureSection();
    if (!section) return;
    const analysis = await ensureAnalysis(force);
    if (!analysis) {
      if (!(App() && App().state && App().state.model)) {
        section.querySelector("#spw-rev-cards").innerHTML = "";
        section.querySelector("#spw-rev-table-wrap").innerHTML = `<div class="spw-rev-empty"><strong>Carregue as bases para analisar as revisões.</strong></div>`;
      }
      return;
    }
    renderCards();
    renderFilters();
    renderTable();
  }

  async function syncAfterBaseEvent(event) {
    try {
      if (event && event.detail && event.detail.source !== "sigem-pw-dashboard" && App() && typeof App().refresh === "function") await App().refresh("sincronização das revisões");
      await render(true);
    } catch (error) { console.error("[SIGEM×PW] revisão após atualização:", error); }
  }

  function activate() { return render(true); }

  root.addEventListener("grcon:conference-updated", (event) => { void syncAfterBaseEvent(event); });
  root.addEventListener("grcon:pw-base-updated", (event) => { void syncAfterBaseEvent(event); });
  root.GrconSigemPwRevisionUi = Object.freeze({ activate, refresh: () => render(true), state });
})(window);
