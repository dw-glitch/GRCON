(function (root) {
  "use strict";

  const Conference = root.GrconPostingConference;
  const Report = root.GrconPostingConferenceReport;
  const History = root.GrconHistory;
  const PAGE_SIZE = 80;
  let shell = null;
  const state = {
    ready: false,
    busy: false,
    base: { meta: null, records: [] },
    result: { rows: [], eventRows: [], documentRows: [], groups: [], summary: {}, eventSummary: {}, changes: {}, consolidation: {} },
    audit: [],
    view: "documents",
    page: 1,
    filters: { search: "", document: "", documentList: "", grdt: "", family: "", discipline: "", revision: "", status: "", startDate: "", endDate: "" },
  };

  const icon = (path) => `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${path}"></path></svg>`;
  const escapeHtml = (value) => Conference.text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const fmt = (value) => Number(value || 0).toLocaleString("pt-BR");
  const plural = (count, singular, pluralValue) => Number(count) === 1 ? singular : (pluralValue || `${singular}s`);
  const fmtDate = (value, withTime) => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  };

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }

  function ensureAggregateStyles() {
    if (document.getElementById("pc-document-aggregate-style")) return;
    const style = document.createElement("style");
    style.id = "pc-document-aggregate-style";
    style.textContent = `
      .pc-kpis > div small{display:block;margin-top:.28rem;color:var(--muted,#64748b);font-size:.72rem;line-height:1.25}
      .pc-table .pc-document-code{display:flex;flex-direction:column;gap:.3rem;min-width:15rem}
      .pc-table .pc-document-code small{color:var(--muted,#64748b);font-weight:500}
      .pc-send-history{min-width:13.5rem}
      .pc-send-history summary{cursor:pointer;display:flex;flex-direction:column;gap:.2rem;list-style:none}
      .pc-send-history summary::-webkit-details-marker{display:none}
      .pc-send-history summary strong{color:var(--primary,#155c8a)}
      .pc-send-history summary span{font-size:.74rem;color:var(--muted,#64748b)}
      .pc-send-history[open] summary{margin-bottom:.55rem}
      .pc-send-history-list{display:grid;gap:.4rem;max-height:18rem;overflow:auto;padding-right:.2rem}
      .pc-send-event{display:grid;gap:.12rem;padding:.48rem .55rem;border:1px solid var(--border,#d5dee5);border-radius:.55rem;background:var(--surface-subtle,#f8fafc)}
      .pc-send-event .pc-link{text-align:left;white-space:normal}
      .pc-send-event small{font-size:.72rem;color:var(--muted,#64748b)}
      .pc-send-event .pc-event-status{font-weight:700}
      .pc-latest-send{display:flex;flex-direction:column;gap:.2rem;min-width:8rem}
      .pc-latest-send small{color:var(--muted,#64748b)}
      .pc-consolidation-note{display:inline-flex;align-items:center;gap:.35rem;margin-top:.3rem;padding:.2rem .45rem;border-radius:999px;background:var(--surface-subtle,#eef4f8);font-size:.7rem;color:var(--muted,#64748b)}
      .pc-table-wrap{overscroll-behavior:contain}
      @media (max-width:900px){.pc-send-history{min-width:11rem}.pc-table .pc-document-code{min-width:12rem}}
    `;
    document.head.appendChild(style);
  }

  function createShell() {
    if (shell) return shell;
    ensureAggregateStyles();
    shell = document.getElementById("posting-conference-module");
    if (!shell) {
      shell = document.createElement("section");
      shell.id = "posting-conference-module";
      shell.className = "posting-conference-module";
      shell.hidden = true;
      shell.setAttribute("role", "tabpanel");
      shell.setAttribute("aria-label", "Conferência de Postagem");
      document.querySelector("main.workspace")?.appendChild(shell);
    }
    shell.innerHTML = `
      <header class="pc-heading">
        <div><span>HISTÓRICO DE eGRDTs × CONSULTA GERAL SIGEM</span><h2>Conferência de Postagem</h2><p>Cada documento aparece uma única vez; reenvios ficam agrupados no histórico do documento.</p></div>
        <div class="pc-heading-actions"><button class="secondary-button" id="pc-export" type="button">${icon("M5 3h10l4 4v14H5zM15 3v5h5M8 13h8M8 17h8")}<span>Relatório Excel</span></button><button class="primary-button" id="pc-update" type="button">${icon("M12 3v12M8 7l4-4 4 4M5 14v5h14v-5")}<span>Atualizar Consulta Geral</span></button><input accept=".xlsx,.xls,.xlsm" hidden id="pc-file" type="file"/></div>
      </header>
      <section class="pc-hero" aria-live="polite"><div><span>CONFERÊNCIA GERAL</span><strong id="pc-hero-main">Carregue a Consulta Geral</strong><small id="pc-hero-note">O histórico permanece preservado como origem dos eventos de envio.</small></div><div class="pc-base-card" id="pc-base-card"></div></section>
      <section class="pc-kpis" id="pc-kpis" aria-label="Resumo da conferência"></section>
      <section class="pc-toolbar-card">
        <div class="pc-view-switch" role="tablist" aria-label="Visualização da conferência"><button class="active" data-pc-view="documents" type="button">Documentos</button><button data-pc-view="grdts" type="button">Por eGRDT</button><button data-pc-view="pending" type="button">Pendências de Postagem</button></div>
        <div class="pc-filters" id="pc-filters">
          <label class="pc-search"><span>Busca</span><input id="pc-search" type="search" placeholder="Código, eGRDT, disciplina, status ou observação"/></label>
          <label class="pc-document-list"><span>Lista de documentos</span><textarea id="pc-document-list" rows="3" placeholder="Cole vários códigos — um por linha"></textarea><small id="pc-document-list-count">Todos os documentos</small></label>
          <label><span>eGRDT</span><input id="pc-grdt" type="search" placeholder="Número"/></label>
          <label><span>Tipo</span><select id="pc-family"><option value="">Todos</option></select></label>
          <label><span>Disciplina</span><select id="pc-discipline"><option value="">Todas</option></select></label>
          <label><span>Revisão</span><input id="pc-revision" maxlength="8" type="text" placeholder="Ex.: B"/></label>
          <label><span>Situação</span><select id="pc-status"><option value="">Todas</option></select></label>
          <label><span>Data inicial</span><input id="pc-start" type="date"/></label>
          <label><span>Data final</span><input id="pc-end" type="date"/></label>
          <label class="pc-wait"><span>Janela de confirmação</span><select id="pc-wait"><option value="24">24 h</option><option value="48">48 h</option><option value="72">72 h</option><option value="120">5 dias</option><option value="168">7 dias</option></select></label>
          <button class="text-button" id="pc-clear-filters" type="button">Limpar filtros</button>
        </div>
      </section>
      <section class="pc-table-card">
        <header><div><span id="pc-table-kicker">DOCUMENTOS CONFERIDOS</span><strong id="pc-result-count">0 documento(s)</strong></div><small id="pc-table-help">Cada documento aparece apenas uma vez. Reenvios em diferentes eGRDTs não aumentam os totais.</small></header>
        <div class="pc-progress" id="pc-progress" hidden><i></i><span>Processando…</span></div>
        <div class="pc-table-wrap" id="pc-table-wrap"></div>
        <empty-state id="pc-empty"><strong>Nenhuma conferência disponível</strong><span>Atualize a Consulta Geral para iniciar a comparação com o Histórico.</span></empty-state>
        <footer class="pc-pagination" id="pc-pagination"><button class="secondary-button compact" id="pc-prev" type="button">Anterior</button><span id="pc-page">Página 1</span><button class="secondary-button compact" id="pc-next" type="button">Próxima</button></footer>
      </section>
      <section class="pc-audit-card"><header><div><span>RASTREABILIDADE</span><strong>Últimas atualizações da Consulta Geral</strong></div><small>A base é substituída sem apagar a memória de confirmação; eventos históricos permanecem auditáveis.</small></header><div id="pc-audit"></div></section>`;
    bind();
    return shell;
  }

  function el(id) { return shell?.querySelector(`#${id}`); }

  function bind() {
    el("pc-update").addEventListener("click", () => el("pc-file").click());
    el("pc-file").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) void importFile(file);
    });
    el("pc-export").addEventListener("click", () => void exportReport());
    shell.querySelectorAll("[data-pc-view]").forEach((button) => button.addEventListener("click", () => {
      state.view = button.dataset.pcView;
      state.page = 1;
      render();
    }));
    const controls = {
      "pc-search": "search", "pc-document-list": "documentList", "pc-grdt": "grdt", "pc-family": "family", "pc-discipline": "discipline",
      "pc-revision": "revision", "pc-status": "status", "pc-start": "startDate", "pc-end": "endDate",
    };
    Object.entries(controls).forEach(([id, field]) => {
      const control = el(id);
      control.addEventListener(control.tagName === "SELECT" ? "change" : "input", () => {
        state.filters[field] = control.value;
        if (field === "documentList") {
          const count = control.value.split(/[\r\n,;|\t]+/).map((item) => item.trim()).filter(Boolean).length;
          el("pc-document-list-count").textContent = count ? `${fmt(count)} código(s) no filtro` : "Todos os documentos";
        }
        state.page = 1;
        renderTableOnly();
      });
    });
    el("pc-wait").addEventListener("change", async () => {
      Conference.savePreferences({ waitHours: Number(el("pc-wait").value) });
      await reconcileCurrent({ reason: "preference" });
    });
    el("pc-clear-filters").addEventListener("click", () => {
      Object.keys(state.filters).forEach((key) => { state.filters[key] = ""; });
      ["pc-search", "pc-document-list", "pc-grdt", "pc-family", "pc-discipline", "pc-revision", "pc-status", "pc-start", "pc-end"].forEach((id) => { el(id).value = ""; });
      el("pc-document-list-count").textContent = "Todos os documentos";
      state.page = 1;
      renderTableOnly();
    });
    el("pc-prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; renderTableOnly(); } });
    el("pc-next").addEventListener("click", () => { state.page += 1; renderTableOnly(); });
    el("pc-table-wrap").addEventListener("click", (event) => {
      const button = event.target.closest("[data-pc-grdt]");
      if (!button) return;
      state.filters.grdt = button.dataset.pcGrdt;
      el("pc-grdt").value = state.filters.grdt;
      state.view = "documents";
      state.page = 1;
      render();
    });
  }

  function setBusy(busy, label) {
    state.busy = busy;
    const progress = el("pc-progress");
    progress.hidden = !busy;
    progress.querySelector("span").textContent = label || "Processando…";
    [el("pc-update"), el("pc-export")].forEach((button) => { button.disabled = busy; });
  }

  async function importFile(file) {
    if (!root.XLSX) {
      notify("O leitor de planilhas não foi carregado.", "error");
      return;
    }
    setBusy(true, "Validando e indexando a Consulta Geral…");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const buffer = await file.arrayBuffer();
      const workbook = root.XLSX.read(buffer, { type: "array", cellDates: false, dense: false });
      const importedAt = new Date().toISOString();
      const result = await Conference.importWorkbook(workbook, {
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        importedAt,
      }, History?.read?.() || [], { now: importedAt });
      state.base = { meta: result.parsed.meta, records: result.parsed.records };
      state.result = result;
      state.audit = await Conference.loadAudit();
      state.page = 1;
      root.dispatchEvent(new CustomEvent("grcon:conference-updated", { detail: { summary: result.summary, eventSummary: result.eventSummary, consolidation: result.consolidation, changes: result.changes, baseMeta: result.parsed.meta } }));
      notify(`Consulta Geral atualizada: ${fmt(result.summary.total)} documento(s) único(s) · ${fmt(result.summary.sendCount)} envio(s) conferido(s).`, "success");
      render();
    } catch (error) {
      console.error(error);
      notify(error.message || "Não foi possível processar a Consulta Geral.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reconcileCurrent(options) {
    setBusy(true, "Recalculando a conferência…");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      state.result = await Conference.reconcilePersisted(History?.read?.() || [], options || {});
      state.base = await Conference.loadBase();
      state.audit = await Conference.loadAudit();
      root.dispatchEvent(new CustomEvent("grcon:conference-updated", { detail: { summary: state.result.summary, eventSummary: state.result.eventSummary, consolidation: state.result.consolidation, changes: state.result.changes, baseMeta: state.base.meta } }));
      render();
    } catch (error) {
      console.error(error);
      notify(error.message || "Não foi possível recalcular a conferência.", "error");
    } finally {
      setBusy(false);
    }
  }

  function statusChip(row) {
    const css = ({
      CONFIRMADO: "confirmed", AGUARDANDO: "awaiting", REVISAO_DIVERGENTE: "divergent",
      NAO_ENCONTRADO: "missing", REQUER_ANALISE: "review", NAO_VERIFICADO: "neutral",
    })[row.status] || "neutral";
    return `<span class="pc-status ${css}">${escapeHtml(row.conferenceLabel || row.statusLabel || Conference.statusLabel(row.status))}</span>`;
  }

  function renderHero() {
    const summary = state.result.summary || {};
    const meta = state.base.meta;
    el("pc-hero-main").textContent = !meta
      ? "Consulta Geral ainda não carregada"
      : summary.total && summary.confirmed === summary.total
        ? "100% dos documentos com postagem confirmada"
        : `${Number(summary.percentConfirmed || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% dos documentos com postagem confirmada`;
    el("pc-hero-note").textContent = !meta
      ? "Carregue a planilha recebida do SIGEM. O arquivo fica somente neste navegador."
      : `${fmt(summary.total)} documento(s) único(s) · ${fmt(summary.sendCount)} envio(s) · ${fmt(summary.repostCount)} repostagem(ns) · ${fmt(summary.pending)} pendência(s).`;
    el("pc-base-card").innerHTML = meta
      ? `<span>CONSULTA GERAL ATUAL</span><strong title="${escapeHtml(meta.fileName)}">${escapeHtml(meta.fileName)}</strong><small>${fmt(meta.recordCount)} registros · atualizada ${fmtDate(meta.importedAt, true)}</small><em>${meta.duplicateCount ? `${fmt(meta.duplicateCount)} duplicata(s) exata(s) da base consolidadas` : "Sem duplicação exata na importação"}</em>`
      : `<span>BASE SIGEM</span><strong>Nenhum arquivo</strong><small>Use “Atualizar Consulta Geral”.</small>`;
  }

  function renderKpis() {
    const s = state.result.summary || {};
    const cards = [
      ["Documentos únicos enviados", s.total, "", `${fmt(s.sendCount)} envios · ${fmt(s.egrdtCount)} eGRDTs`],
      ["Postagens confirmadas", s.confirmed, "confirmed", "documentos no estado atual"],
      ["Pendências de postagem", s.pending, "awaiting", "uma contagem por documento"],
      ["Não postado ainda", s.awaiting, "awaiting", "dentro da janela de confirmação"],
      ["Aguardando retorno do SIGEM", s.divergent, "divergent", "revisão enviada ainda não confirmada"],
      ["Não encontrado", s.notFound, "missing", "documentos únicos"],
      ["Requer análise", s.review, "review", `${fmt(s.documentsWithMultipleSends)} com múltiplos envios`],
    ];
    el("pc-kpis").innerHTML = cards.map(([label, value, css, sub]) => `<div class="${css}"><span>${escapeHtml(label)}</span><strong>${fmt(value)}</strong>${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</div>`).join("");
  }

  function documentRows() {
    return state.result.documentRows || [];
  }

  function eventRows() {
    return state.result.eventRows || state.result.rows || [];
  }

  function refreshFilterOptions() {
    const rows = documentRows();
    const families = [...new Set(rows.flatMap((row) => (row.sends || []).map((send) => send.documentFamily || send.sheet)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const disciplines = [...new Set(rows.flatMap((row) => (row.sends || []).map((send) => send.discipline)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const family = el("pc-family");
    const discipline = el("pc-discipline");
    family.innerHTML = '<option value="">Todos</option>' + families.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
    discipline.innerHTML = '<option value="">Todas</option>' + disciplines.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
    family.value = state.filters.family;
    discipline.value = state.filters.discipline;
    const statuses = [
      [Conference.STATUSES.CONFIRMED, "Postado"], [Conference.STATUSES.AWAITING, "Não postado ainda"],
      [Conference.STATUSES.REVISION_DIVERGENT, "Aguardando retorno do SIGEM"], [Conference.STATUSES.NOT_FOUND, "Não encontrado"],
      [Conference.STATUSES.REVIEW, "Requer análise"], [Conference.STATUSES.NOT_VERIFIED, "Não verificado"],
    ];
    el("pc-status").innerHTML = '<option value="">Todas</option>' + statuses.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    el("pc-status").value = state.filters.status;
    el("pc-wait").value = String(Conference.readPreferences().waitHours);
    if (![...el("pc-wait").options].some((option) => option.value === el("pc-wait").value)) el("pc-wait").value = "48";
  }

  function filteredDocumentRows() {
    let rows = Conference.filterRows(documentRows(), state.filters);
    if (state.view === "pending") rows = Conference.pendingRows(rows);
    return rows;
  }

  function filteredEventRows() {
    return Conference.filterRows(eventRows(), state.filters);
  }

  function sendHistory(row) {
    const sends = row.sends || [];
    const countLabel = `${fmt(row.sendCount)} ${plural(row.sendCount, "envio")}`;
    const meta = `${fmt(row.egrdtCount)} ${plural(row.egrdtCount, "eGRDT")} · ${fmt(row.repostCount)} ${plural(row.repostCount, "repostagem", "repostagens")}`;
    return `<details class="pc-send-history"><summary><strong>${escapeHtml(countLabel)}</strong><span>${escapeHtml(meta)} · ver histórico</span></summary><div class="pc-send-history-list">${sends.map((send, index) => `<article class="pc-send-event"><button class="pc-link" data-pc-grdt="${escapeHtml(send.egrdtNumber)}" type="button">${escapeHtml(send.egrdtNumber || "eGRDT não informada")}</button><small>${escapeHtml(fmtDate(send.generatedAt, false))} · Rev. ${escapeHtml(send.revisionSent || "—")}${index === 0 ? " · envio mais recente" : ""}</small><small class="pc-event-status">${escapeHtml(send.conferenceLabel || send.statusLabel || Conference.statusLabel(send.status))}</small></article>`).join("")}</div></details>`;
  }

  function documentsTable(rows) {
    return `<table class="pc-table"><thead><tr><th>Documento</th><th>Tipo</th><th>Disciplina</th><th>Envios / eGRDTs</th><th>Último envio</th><th>Rev. atual</th><th>Rev. SIGEM</th><th>Conferência</th><th>Status SIGEM</th><th>Confirmado em</th><th>Observação</th></tr></thead><tbody>${rows.map((row) => `<tr><td><div class="pc-document-code"><strong>${escapeHtml(row.document)}</strong>${row.sendCount > 1 ? `<span class="pc-consolidation-note">1 documento · ${fmt(row.sendCount)} envios</span>` : ""}${row.historicalPreserved ? '<small>Confirmação histórica preservada</small>' : ""}</div></td><td>${escapeHtml(row.documentFamily || row.sheet || "—")}</td><td>${escapeHtml(row.discipline || "—")}</td><td>${sendHistory(row)}</td><td><div class="pc-latest-send"><strong>${fmtDate(row.latestSendAt || row.generatedAt, false)}</strong><small>${escapeHtml(row.latestEgrdtNumber || row.egrdtNumber || "—")}</small></div></td><td><strong>${escapeHtml(row.currentRevision || row.revisionSent || "—")}</strong>${row.revisionCount > 1 ? `<small>${fmt(row.revisionCount)} revisões no histórico</small>` : ""}</td><td>${escapeHtml(row.revisionFound || "—")}</td><td>${statusChip(row)}</td><td><span class="pc-sigem-status">${escapeHtml(row.sigemStatus || "—")}</span></td><td>${fmtDate(row.firstConfirmedAt, true)}</td><td class="pc-note" title="${escapeHtml(row.note)}">${escapeHtml(row.note)}</td></tr>`).join("")}</tbody></table>`;
  }

  function filteredGroups() {
    return Conference.aggregateByGrdt(filteredEventRows());
  }

  function grdtTable(groups) {
    const label = (status) => ({ CONFIRMADO: "Concluída", PENDENTE: "Pendente", REVISAR: "Revisar", NAO_VERIFICADO: "Não verificada" })[status] || status;
    return `<table class="pc-table pc-grdt-table"><thead><tr><th>eGRDT</th><th>Data</th><th>Documentos/eventos</th><th>Confirmados</th><th>Não postado ainda</th><th>Divergências</th><th>Não encontrados</th><th>Requer análise</th><th>Situação</th></tr></thead><tbody>${groups.map((group) => `<tr><td><button class="pc-link" data-pc-grdt="${escapeHtml(group.egrdtNumber)}" type="button">${escapeHtml(group.egrdtNumber)}</button></td><td>${fmtDate(group.generatedAt, false)}</td><td>${fmt(group.total)}</td><td>${fmt(group.confirmed)}</td><td>${fmt(group.awaiting)}</td><td>${fmt(group.divergent)}</td><td>${fmt(group.notFound)}</td><td>${fmt(group.review)}</td><td><span class="pc-aggregate ${String(group.status).toLowerCase()}">${escapeHtml(label(group.status))}</span></td></tr>`).join("")}</tbody></table>`;
  }

  function renderTableOnly() {
    if (!shell) return;
    shell.querySelectorAll("[data-pc-view]").forEach((button) => button.classList.toggle("active", button.dataset.pcView === state.view));
    const wrap = el("pc-table-wrap");
    const empty = el("pc-empty");
    const pageFooter = el("pc-pagination");
    let total = 0;
    let pages = 1;
    let content = "";

    if (state.view === "grdts") {
      const groups = filteredGroups();
      total = groups.length;
      pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      const slice = groups.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      content = grdtTable(slice);
      el("pc-table-kicker").textContent = "CONFERÊNCIA POR eGRDT";
      el("pc-table-help").textContent = "Visão de auditoria: cada eGRDT preserva suas ocorrências. Clique no número para localizar os documentos associados.";
      el("pc-result-count").textContent = `${fmt(total)} eGRDT(s)`;
    } else {
      const rows = filteredDocumentRows();
      total = rows.length;
      pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      const slice = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      content = documentsTable(slice);
      el("pc-table-kicker").textContent = state.view === "pending" ? "PENDÊNCIAS DE POSTAGEM" : "DOCUMENTOS CONFERIDOS";
      el("pc-table-help").textContent = state.view === "pending"
        ? "Uma pendência por documento. Tentativas antigas não geram pendências fantasmas quando a revisão atual já foi confirmada."
        : "Cada documento aparece apenas uma vez nesta visão. Reenvios em diferentes eGRDTs ficam agrupados e não aumentam os totais.";
      el("pc-result-count").textContent = `${fmt(total)} documento(s)`;
    }

    const hasData = total > 0;
    wrap.hidden = !hasData;
    empty.hidden = hasData;
    if (hasData) wrap.innerHTML = content;
    else empty.innerHTML = state.base.meta ? '<strong>Nenhum item neste filtro</strong><span>Ajuste os filtros ou altere a visualização.</span>' : '<strong>Nenhuma conferência disponível</strong><span>Atualize a Consulta Geral para iniciar a comparação com o Histórico.</span>';
    pageFooter.hidden = !hasData;
    el("pc-page").textContent = hasData ? `Página ${state.page} de ${pages} · ${fmt(total)} item(ns)` : "Nenhum item";
    el("pc-prev").disabled = state.page <= 1;
    el("pc-next").disabled = state.page >= pages;
  }

  function renderAudit() {
    const host = el("pc-audit");
    if (!state.audit.length) {
      host.innerHTML = '<empty-state><strong>Nenhuma atualização registrada</strong><span>A primeira importação aparecerá aqui.</span></empty-state>';
      return;
    }
    host.innerHTML = state.audit.slice(0, 6).map((item) => `<article><div><strong>${escapeHtml(item.fileName || "Consulta Geral")}</strong><span>${fmtDate(item.at, true)} · ${fmt(item.recordCount)} registros da base</span></div><div><span>${fmt(item.newConfirmed)} nova(s) confirmação(ões) de evento</span><span>${fmt(item.divergencesResolved)} divergência(s) resolvida(s)</span><span>${fmt(item.pending)} evento(s) sem confirmação na execução</span></div></article>`).join("");
  }

  function render() {
    createShell();
    renderHero();
    renderKpis();
    refreshFilterOptions();
    renderTableOnly();
    renderAudit();
    el("pc-export").disabled = state.busy || !documentRows().length;
  }

  async function exportReport() {
    if (!Report || !documentRows().length) return;
    setBusy(true, "Gerando Relatório de Conferência de Postagem…");
    try {
      let rows;
      let mode;
      if (state.view === "grdts") {
        rows = filteredEventRows();
        mode = "events";
      } else {
        rows = filteredDocumentRows();
        mode = "documents";
      }
      const scopeLabel = state.view === "pending" ? "Pendencias" : state.view === "grdts" ? "Por_eGRDT" : state.filters.grdt ? state.filters.grdt.replace(/[^A-Z0-9-]+/gi, "_") : "";
      const buffer = await Report.buildWorkbook(rows, { mode, scopeLabel, baseFileName: state.base.meta?.fileName, baseImportedAt: state.base.meta?.importedAt });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = Report.downloadName({ scopeLabel });
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify(mode === "events" ? `${fmt(rows.length)} ocorrência(s) incluída(s) no relatório por eGRDT.` : `${fmt(rows.length)} documento(s) único(s) incluído(s) no relatório.`, "success");
    } catch (error) {
      console.error(error);
      notify(error.message || "Não foi possível gerar o relatório.", "error");
    } finally {
      setBusy(false);
      render();
    }
  }

  async function activate() {
    createShell();
    shell.hidden = false;
    if (!state.ready) {
      state.ready = true;
      setBusy(true, "Carregando a conferência salva…");
      try {
        [state.base, state.audit] = await Promise.all([Conference.loadBase(), Conference.loadAudit()]);
        state.result = await Conference.reconcilePersisted(History?.read?.() || [], { reason: "activate" });
      } catch (error) {
        console.error(error);
        notify(error.message || "Não foi possível carregar a conferência salva.", "error");
      } finally {
        setBusy(false);
      }
    }
    render();
    setTimeout(() => el("pc-search")?.focus(), 0);
  }

  root.addEventListener("grcon:history-updated", () => {
    if (!state.ready) return;
    void reconcileCurrent({ reason: "history" });
  });

  root.GrconPostingConferenceUi = Object.freeze({ activate, render, state, reconcile: reconcileCurrent });
})(window);
