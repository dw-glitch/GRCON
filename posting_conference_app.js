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
    groupClassification: "",
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
      .pc-table .pc-document-code{display:grid;gap:.32rem;min-width:0;max-width:100%}
      .pc-table .pc-document-code small{display:block;color:var(--muted,#64748b);font-weight:500;line-height:1.35}
      .pc-send-history{display:block;width:100%;min-width:0;max-width:100%}
      .pc-send-history summary{cursor:pointer;display:grid;gap:.2rem;min-width:0;list-style:none}
      .pc-send-history summary::-webkit-details-marker{display:none}
      .pc-send-history summary strong{display:block;color:var(--primary,#155c8a);line-height:1.25}
      .pc-send-history summary span{display:block;min-width:0;font-size:.74rem;line-height:1.35;color:var(--muted,#64748b);overflow-wrap:anywhere}
      .pc-send-history[open] summary{margin-bottom:.55rem}
      .pc-send-history-list{display:grid;gap:.4rem;max-height:18rem;overflow:auto;padding-right:.2rem}
      .pc-send-event{display:grid;gap:.12rem;min-width:0;padding:.48rem .55rem;border:1px solid var(--border,#d5dee5);border-radius:.55rem;background:var(--surface-subtle,#f8fafc)}
      .pc-send-event .pc-link{text-align:left;white-space:normal;overflow-wrap:anywhere}
      .pc-send-event small{display:block;min-width:0;font-size:.72rem;line-height:1.35;color:var(--muted,#64748b);overflow-wrap:anywhere}
      .pc-send-event .pc-event-status{font-weight:700}
      .pc-latest-send{display:grid;gap:.25rem;min-width:0;max-width:100%}
      .pc-latest-send strong,.pc-latest-send small{display:block;min-width:0;max-width:100%}
      .pc-latest-send small{color:var(--muted,#64748b);line-height:1.35;overflow-wrap:anywhere}
      .pc-revision-stack{display:grid;gap:.24rem;min-width:0;max-width:100%;justify-items:center}
      .pc-revision-stack>strong{display:block;line-height:1.2}
      .pc-revision-stack>small{display:block;min-width:0;max-width:100%;font-size:.72rem;line-height:1.32;color:var(--muted,#64748b);overflow-wrap:anywhere}
      .pc-consolidation-note{display:inline-flex;align-items:center;max-width:100%;gap:.35rem;margin-top:.3rem;padding:.2rem .45rem;border-radius:999px;background:var(--surface-subtle,#eef4f8);font-size:.7rem;line-height:1.3;color:var(--muted,#64748b);white-space:normal;overflow-wrap:anywhere}
      .pc-table-wrap{overscroll-behavior:contain}
      .pc-grdt-details summary{cursor:pointer;font-weight:700;color:var(--primary,#155c8a)}
      .pc-grdt-details[open] summary{margin-bottom:.7rem}
      .pc-grdt-details>div{max-width:100%;overflow:auto}
      .pc-grdt-details table{width:100%;border-collapse:collapse;font-size:.83rem}
      .pc-grdt-details td,.pc-grdt-details th{padding:.55rem;border-bottom:1px solid var(--border,#ddd);vertical-align:top;text-align:left;overflow-wrap:anywhere}
      .pc-grdt-details th{background:var(--surface-subtle,#eaf2f7)}
      .pc-grdt-details small{display:block;color:var(--muted,#64748b)}
      .pc-repost-choice{display:flex;align-items:flex-start;gap:.4rem;margin-top:.5rem;font-size:.8rem}
      .pc-repost-choice input{flex:none;margin-top:.15rem}
      .pc-repost-group-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.65rem;margin-top:.8rem}
      .pc-grdt-warning{display:block;padding:.6rem;border-left:3px solid #d97706;font-weight:700}
      .pc-grdt-table .pc-grdt-detail-row>td{background:var(--surface-subtle,#f8fafc);padding:.65rem}
      .pc-grdt-filter{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;margin:.5rem 0}
      .pc-grdt-filter select{max-width:18rem}
      .pc-grdt-details input[type="search"]{display:block;max-width:23rem;margin:.6rem 0;padding:.45rem .6rem;border:1px solid var(--border,#ddd);border-radius:.5rem;background:var(--surface,#fff);color:inherit}
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
        <div class="pc-heading-actions"><button class="secondary-button" id="pc-export" type="button">${icon("M5 3h10l4 4v14H5zM15 3v5h5M8 13h8M8 17h8")}<span>Pendências em Excel</span></button><button class="primary-button" id="pc-update" type="button">${icon("M12 3v12M8 7l4-4 4 4M5 14v5h14v-5")}<span>Atualizar Consulta Geral</span></button><button class="secondary-button" id="pc-publish" type="button" hidden>Publicar Consulta Geral compartilhada</button><input accept=".xlsx,.xls,.xlsm" hidden id="pc-file" type="file"/></div>
      </header>
      <section class="pc-hero" aria-live="polite"><div><span>CONFERÊNCIA GERAL</span><strong id="pc-hero-main">Carregue a Consulta Geral</strong><small id="pc-hero-note">O histórico permanece preservado como origem dos eventos de envio.</small></div><div class="pc-base-card" id="pc-base-card"></div></section>
      <section class="pc-kpis" id="pc-kpis" aria-label="Resumo da conferência"></section>
      <section class="pc-toolbar-card pc-date-controls"><label>Data da Consulta Geral <input id="pc-reference-date" type="date"/></label> <button id="pc-save-date" type="button" class="secondary-button">Salvar data</button><small>Data da base, independente do upload.</small></section>
      <section class="pc-toolbar-card">
        <div class="pc-view-switch" role="tablist" aria-label="Visualização da conferência"><button class="active" data-pc-view="documents" type="button">Documentos</button><button data-pc-view="grdts" type="button">Por eGRDT</button><button data-pc-view="pending" type="button">Documentos pendentes</button></div>
        <div class="pc-grdt-filter"><label>Classificação da GRDT <select id="pc-grdt-classification"><option value="">Todas</option><option value="TOTALMENTE_CONFIRMADA">Totalmente confirmada</option><option value="PARCIALMENTE_CONFIRMADA">Parcialmente confirmada</option><option value="NENHUM_DOCUMENTO_CONFIRMADO">Nenhum documento confirmado</option><option value="REQUER_INVESTIGACAO">Requer investigação</option><option value="NAO_VERIFICADA">Não verificada</option><option value="COM_TRAMITACAO">Em tramitação</option><option value="REVISAO_DIVERGENTE">Revisão divergente</option><option value="ALOCACAO_PENDENTE">Alocação pendente</option></select></label><small>A expansão mostra todos os documentos da emissão, inclusive os confirmados.</small></div>
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
        <div id="pc-pending-grdts" class="pc-toolbar-card" hidden></div>
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
    el("pc-save-date").addEventListener("click", async () => {
      el("pc-save-date").disabled = true;
      try { await root.GrconSharedSigemQuery.setReferenceDate(el("pc-reference-date").value); notify("Data da Consulta Geral atualizada.", "success"); }
      catch (error) { notify(error.message, "error"); }
      finally { render(); }
    });
    el("pc-grdt-classification").addEventListener("change", event => { state.groupClassification = event.target.value; state.page = 1; renderTableOnly(); });
    el("pc-pending-grdts").addEventListener("click", async event => {
      if (!event.target.closest("[data-copy-pending-grdts]")) return;
      try { await navigator.clipboard.writeText(filteredGroups().map(item => item.egrdtNumber).filter(Boolean).join("\n")); notify("GRDTs copiadas.", "success"); }
      catch (_) { notify("Selecione e copie a lista de GRDTs.", "warning"); }
    });
    el("pc-update").addEventListener("click", () => el("pc-file").click());
    el("pc-file").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) void importFile(file);
    });
    el("pc-publish").addEventListener("click", () => void publishShared());
    el("pc-export").addEventListener("click", () => void exportReport());
    shell.querySelectorAll("[data-pc-view]").forEach((button) => button.addEventListener("click", () => {
      state.view = button.dataset.pcView;
      state.page = 1;
      render();
    }));
    let filterRenderTimer;
    const controls = {
      "pc-search": "search", "pc-document-list": "documentList", "pc-grdt": "grdt", "pc-family": "family", "pc-discipline": "discipline",
      "pc-revision": "revision", "pc-status": "status", "pc-start": "startDate", "pc-end": "endDate",
    };
    Object.entries(controls).forEach(([id, field]) => {
      const control = el(id);
      control.addEventListener(control.tagName === "SELECT" ? "change" : "input", () => {
        clearTimeout(filterRenderTimer);
        state.filters[field] = control.value;
        if (field === "documentList") {
          const count = control.value.split(/[\r\n,;|\t]+/).map((item) => item.trim()).filter(Boolean).length;
          el("pc-document-list-count").textContent = count ? `${fmt(count)} código(s) no filtro` : "Todos os documentos";
        }
        state.page = 1;
        if (control.tagName === "SELECT" || control.type === "date") renderTableOnly();
        else filterRenderTimer = setTimeout(renderTableOnly, 180);
      });
    });
    el("pc-wait").addEventListener("change", async () => {
      Conference.savePreferences({ waitHours: Number(el("pc-wait").value) });
      await reconcileCurrent({ reason: "preference" });
    });
    el("pc-clear-filters").addEventListener("click", () => {
      clearTimeout(filterRenderTimer);
      Object.keys(state.filters).forEach((key) => { state.filters[key] = ""; });
      ["pc-search", "pc-document-list", "pc-grdt", "pc-family", "pc-discipline", "pc-revision", "pc-status", "pc-start", "pc-end"].forEach((id) => { el(id).value = ""; });
      el("pc-document-list-count").textContent = "Todos os documentos";
      state.groupClassification = "";
      el("pc-grdt-classification").value = "";
      state.page = 1;
      renderTableOnly();
    });
    el("pc-prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; renderTableOnly(); } });
    el("pc-next").addEventListener("click", () => { state.page += 1; renderTableOnly(); });
    el("pc-table-wrap").addEventListener("input", (event) => {
      if (!event.target.matches(".pc-grdt-details input[type=search]")) return;
      const term = Conference.norm(event.target.value);
      event.target.closest(".pc-grdt-details")?.querySelectorAll("tbody tr").forEach((tr) => {
        tr.hidden = Boolean(term) && !Conference.norm(tr.textContent).includes(term);
      });
    });
    el("pc-table-wrap").addEventListener("click", (event) => {
      const button = event.target.closest("[data-pc-grdt]");
      if (!button) return;
      state.filters.grdt = button.dataset.pcGrdt;
      el("pc-grdt").value = state.filters.grdt;
      state.view = button.hasAttribute("data-pc-pending-grdt") ? "grdts" : "documents";
      state.page = 1;
      render();
    });
  }

  function setBusy(busy, label) {
    state.busy = busy;
    const progress = el("pc-progress");
    progress.hidden = !busy;
    progress.querySelector("span").textContent = label || "Processando…";
    [el("pc-update"), el("pc-export"), el("pc-publish")].forEach((button) => { button.disabled = busy; });
    root.dispatchEvent(new CustomEvent("grcon:mascot-operation", {
      detail: { active: Boolean(busy), state: "checking-document", task: label || "Conferindo documentos" },
    }));
  }

  function conferenceProjection(base) {
    const workspace = root.GrconCloud?.state?.membership?.workspace_id || "";
    if (!base || !Array.isArray(base.records) || !workspace) return base;
    return { ...base, meta: { ...(base.meta || {}), grconWorkspaceId: workspace } };
  }

  async function importFile(file) {
    setBusy(true, "Validando e indexando a Consulta Geral…");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const base = await root.GrconSharedSigemQuery.parseFile(file);
      base.meta.referenceDate = el("pc-reference-date").value || new Date().toLocaleDateString("sv-SE");
      await root.GrconSharedSigemQuery.setLocal(base);
      await Conference.saveBase(conferenceProjection(root.GrconSharedSigemQuery.current()));
      const result = await Conference.reconcilePersisted(History?.read?.() || [], { reason: "local-general-query" });
      result.parsed = root.GrconSharedSigemQuery.current();
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

  async function publishShared() {
    if (state.busy || !root.GrconSharedSigemQuery.state.local) return;
    setBusy(true, "Publicando Consulta Geral para a equipe…");
    try {
      await root.GrconSharedSigemQuery.publish(root.GrconSharedSigemQuery.state.local);
      await adoptSharedBase();
      notify("Consulta Geral publicada para todos os usuários.", "success");
    } catch (error) { notify(error.message, error.published ? "warning" : "error"); }
    finally { setBusy(false); render(); }
  }

  async function adoptSharedBase() {
    const query = root.GrconSharedSigemQuery;
    const base = query?.current();
    if (!base) {
      const [storedBase, storedState, storedAudit] = await Promise.all([
        Conference.loadBase(),
        Conference.loadState(),
        Conference.loadAudit(),
      ]);
      state.base = storedBase;
      state.audit = storedAudit;
      if (state.ready) {
        const prefs = Conference.readPreferences();
        state.result = Conference.reconcile(History?.read?.() || [], storedBase.records || [], storedState, { ...prefs, reason: "shared-general-query-empty" });
        render();
      }
      return;
    }
    await Conference.saveBase(conferenceProjection(base));
    if (state.ready) await reconcileCurrent({ reason: "shared-general-query" });
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
      ? `<span>CONSULTA GERAL ATUAL</span><strong title="${escapeHtml(meta.fileName)}">${escapeHtml(meta.fileName)}</strong><small>${fmt(meta.recordCount)} registros · Data da Consulta Geral: ${meta.referenceDate ? meta.referenceDate.split("-").reverse().join("/") : "Não informada"} · Upload: ${fmtDate(meta.importedAt, true)}</small><em>${meta.duplicateCount ? `${fmt(meta.duplicateCount)} duplicata(s) exata(s) da base consolidadas` : "Sem duplicação exata na importação"}</em>`
      : `<span>BASE SIGEM</span><strong>Nenhum arquivo</strong><small>Use “Atualizar Consulta Geral”.</small>`;
  }

  function renderKpis() {
    const s = state.result.summary || {};
    const cards = [
      ["Documentos únicos enviados", s.total, "", `${fmt(s.sendCount)} envios · ${fmt(s.egrdtCount)} eGRDTs`],
      ["Postagens confirmadas", s.confirmed, "confirmed", "documentos no estado atual"],
      ["Pendências de confirmação", s.pending, "awaiting", "uma contagem por documento"],
      ["Não postado ainda", s.awaiting, "awaiting", "dentro da janela de confirmação"],
      ["Aguardando retorno do SIGEM", s.divergent, "divergent", "revisão enviada ainda não confirmada"],
      ["Não encontrado", s.notFound, "missing", "documentos únicos"],
      ["Requer análise", s.review, "review", `${fmt(s.documentsWithMultipleSends)} com múltiplos envios`],
      ["GRDTs parcialmente confirmadas", detailedGroups().filter((g) => g.classification === "PARCIALMENTE_CONFIRMADA").length, "divergent", "conferir documentos individualmente"],
      ["Risco de repostagem duplicada", detailedGroups().filter((g) => g.riskOfDuplicateResend).length, "review", "mistura de documentos localizados e pendentes"],
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

  let filteredCache = null;
  function filteredDocumentRows() {
    const key = state.view + JSON.stringify(state.filters);
    if (filteredCache?.result === state.result && filteredCache.key === key) return filteredCache.rows;
    let rows = Conference.filterRows(documentRows(), state.filters);
    filteredCache = { result: state.result, key, rows };
    return rows;
  }

  let filteredEventsCache = null;
  function filteredEventRows() {
    const key = JSON.stringify(state.filters);
    if (filteredEventsCache?.result === state.result && filteredEventsCache.key === key) return filteredEventsCache.rows;
    const rows = Conference.filterRows(eventRows(), state.filters);
    filteredEventsCache = { result: state.result, key, rows };
    return rows;
  }

  function breakableCode(value) {
    return escapeHtml(value || "—").replace(/([_.-])/g, "$1<wbr>");
  }

  function sendHistory(row) {
    const sends = row.sends || [];
    const countLabel = `${fmt(row.sendCount)} ${plural(row.sendCount, "envio")}`;
    const meta = `${fmt(row.egrdtCount)} ${plural(row.egrdtCount, "eGRDT")} · ${fmt(row.repostCount)} ${plural(row.repostCount, "repostagem", "repostagens")}`;
    const latestNumber = Conference.pertinentGrdt(row);
    const latestAt = row.latestSendAt || row.generatedAt || sends[0]?.generatedAt || "";
    const latestNumberMarkup = latestNumber
      ? `<button class="pc-link pc-latest-egrdt" data-pc-grdt="${escapeHtml(latestNumber)}" type="button" title="${escapeHtml(latestNumber)}">${breakableCode(latestNumber)}</button>`
      : '<span class="pc-empty-value">GRDT não identificada</span>';
    return `<div class="pc-send-overview">
      <div class="pc-send-count"><strong>${escapeHtml(countLabel)}</strong><small>${escapeHtml(meta)}</small></div>
      <div class="pc-latest-send"><span class="pc-block-label">Último envio</span><strong>${fmtDate(latestAt, false)}</strong>${latestNumberMarkup}</div>
      <details class="pc-send-history">
        <summary>Ver histórico</summary>
        <div class="pc-send-history-list">${sends.map((send, index) => `<article class="pc-send-event"><button class="pc-link" data-pc-grdt="${escapeHtml(send.egrdtNumber)}" type="button" title="${escapeHtml(send.egrdtNumber || "eGRDT não informada")}">${breakableCode(send.egrdtNumber || "eGRDT não informada")}</button><small>${escapeHtml(fmtDate(send.generatedAt, false))} · Rev. ${escapeHtml(send.revisionSent || "—")}${index === 0 ? " · envio mais recente" : ""}</small><small class="pc-event-status">${escapeHtml(send.conferenceLabel || send.statusLabel || Conference.statusLabel(send.status))}</small></article>`).join("")}</div>
      </details>
    </div>`;
  }

  function observationCell(row) {
    const note = Conference.text(row.note).trim();
    if (!note) return '<span class="pc-empty-value">—</span>';
    const limit = 150;
    if (note.length <= limit) return `<div class="pc-note-text">${escapeHtml(note)}</div>`;
    const preview = `${note.slice(0, limit).trimEnd()}…`;
    return `<details class="pc-note-details"><summary><span>${escapeHtml(preview)}</span><em>Ver observação completa</em></summary><div class="pc-note-full">${escapeHtml(note)}</div></details>`;
  }

  function documentsTable(rows) {
    return `<table class="pc-table pc-document-table" aria-label="Documentos conferidos"><colgroup><col class="pc-col-document"/><col class="pc-col-sends"/><col class="pc-col-revisions"/><col class="pc-col-situation"/><col class="pc-col-confirmation"/><col class="pc-col-note"/></colgroup><thead><tr><th scope="col">Documento</th><th scope="col">Envios</th><th scope="col">Revisões</th><th scope="col">Situação</th><th scope="col">Confirmação</th><th scope="col">Observação</th></tr></thead><tbody>${rows.map((row) => `<tr>
      <td class="pc-cell pc-cell-document"><div class="pc-document-code"><strong title="${escapeHtml(row.document)}">${breakableCode(row.document)}</strong><div class="pc-document-meta"><span class="document-class-badge" data-document-class="${escapeHtml((row.documentFamily || row.sheet) === "ET" || (row.documentFamily || row.sheet) === "N-1710" ? (row.documentFamily || row.sheet) : "")}">${escapeHtml(row.documentFamily || row.sheet || "—")}</span><span aria-hidden="true">·</span><span>${escapeHtml(row.discipline || "—")}</span></div>${row.sendCount > 1 ? `<span class="pc-consolidation-note">1 documento · ${fmt(row.sendCount)} envios</span>` : ""}${row.historicalPreserved ? '<small>Confirmação histórica preservada</small>' : ""}</div></td>
      <td class="pc-cell pc-cell-sends">${sendHistory(row)}</td>
      <td class="pc-cell pc-cell-revisions"><div class="pc-revision-grid"><div><span class="pc-block-label">Atual</span><strong>${escapeHtml(row.currentRevision || row.revisionSent || "—")}</strong></div><div><span class="pc-block-label">SIGEM</span><strong>${escapeHtml(row.revisionFound || "—")}</strong></div></div>${row.revisionCount > 1 ? `<small class="pc-revision-history">${fmt(row.revisionCount)} revisões no histórico</small>` : ""}</td>
      <td class="pc-cell pc-cell-situation"><div class="pc-situation-stack"><div><span class="pc-block-label">Conferência</span>${statusChip(row)}</div><div><span class="pc-block-label">Status SIGEM</span><span class="pc-sigem-status">${escapeHtml(row.sigemStatus || "—")}</span></div></div></td>
      <td class="pc-cell pc-cell-confirmation"><span class="pc-block-label">Confirmado em</span><strong>${fmtDate(row.firstConfirmedAt, true)}</strong></td>
      <td class="pc-cell pc-cell-note pc-note">${observationCell(row)}</td>
    </tr>`).join("")}</tbody></table>`;
  }


  // Grupos por evento de emissão, sem usar a GRDT mais recente do documento
  // consolidado como substituta do registro histórico original.
  let detailedGroupsCache = null;
  function detailedGroups() {
    const planned = root.GrconPlannedDocuments?.current?.();
    const central = root.GrconAllocationRegistry?.current?.();
    const signature = [planned?.id, central?.id, central?.stale, state.base.meta?.snapshotId, state.base.meta?.referenceDate].join("|");
    if (detailedGroupsCache?.result === state.result && detailedGroupsCache.signature === signature) return detailedGroupsCache.groups;
    const lookup = new Map();
    const rows = eventRows().map((row) => {
      const key = Conference.documentIdentity(row.document);
      if (!lookup.has(key)) lookup.set(key, root.GrconAllocationRegistry?.resolve?.(row.document)
        || { kind: "unconfirmed", label: "Alocação a confirmar", allocations: [], references: [], warnings: ["Fonte de alocação indisponível."] });
      const allocation = lookup.get(key);
      return { ...row, allocation, diagnosis: Conference.diagnoseRow(row, allocation, state.base.meta) };
    });
    const groups = Conference.aggregateByGrdt(rows).map((group) => ({
      ...group,
      allocationPending: group.rows.filter((row) => row.allocation.kind === "not_allocated").length,
    }));
    detailedGroupsCache = { result: state.result, signature, groups };
    return groups;
  }

  function filteredGroups() {
    const matched = new Set(filteredEventRows().map((row) => row.key));
    let groups = detailedGroups().filter((group) => group.rows.some((row) => matched.has(row.key)));
    if (state.view === "pending") groups = groups.filter((group) => group.classification !== "TOTALMENTE_CONFIRMADA");
    const kind = state.groupClassification;
    if (kind) groups = groups.filter((group) => kind === "COM_TRAMITACAO" ? group.inTransit > 0
      : kind === "REVISAO_DIVERGENTE" ? group.divergent > 0
        : kind === "ALOCACAO_PENDENTE" ? group.allocationPending > 0 : group.classification === kind);
    return groups;
  }

  function grdtDetails(group) {
    const groupKey = group.historyId || group.egrdtNumber;
    const selected = root.GrconRepostingUi?.state?.selected || new Set();
    const selectedCount = group.rows.filter(row => selected.has(row.key) && Conference.repostEligibility(row).eligible).length;
    const all = group.rows.map((row) => {
      const d = row.diagnosis;
      const choice = Conference.repostEligibility(row);
      const control = '<label class="pc-repost-choice"><input type="checkbox" data-repost-event-key="' + escapeHtml(row.key) +
        '" aria-label="Selecionar ' + escapeHtml(row.document) + ' revisão ' + escapeHtml(row.revisionSent) + ' para repostagem"' +
        (choice.eligible ? (selected.has(row.key) ? ' checked' : '') : ' disabled') + '><span>' +
        escapeHtml(choice.eligible ? "Selecionar para repostagem" : choice.reason) + '</span></label>';
      const references = (d.allocationReferences || []).map((ref) => [
        ref.allocation, ref.allocationStatus,
        ref.workflow ? "Central: " + ref.workflow : "",
        ref.ldSheet ? "Aba: " + ref.ldSheet : "",
        ref.sourceRow ? "Linha: " + ref.sourceRow : "",
      ].filter(Boolean).join(" · ")).join(" | ");
      return '<tr><td><strong>' + breakableCode(row.document) + '</strong><small>' + escapeHtml(row.discipline || row.documentFamily || "—") +
        '</small>' + (row.title ? '<small>' + escapeHtml(row.title) + '</small>' : '') + control + '</td><td>' + escapeHtml(row.revisionSent || "—") + '</td><td>' + escapeHtml(row.revisionFound || "—") +
        '</td><td>' + statusChip(row) + '<small>SIGEM: ' + escapeHtml(row.sigemStatus || "Não informado") +
        (row.sigemStatusRevision ? ' · revisão ' + escapeHtml(row.sigemStatusRevision) : '') + '</small></td><td>' +
        escapeHtml(row.allocation.label || "Alocação a confirmar") + '<small>' +
        escapeHtml(references || (d.allocations || []).join(" · ") || "Referência não identificada") +
        '</small></td><td><strong>' + escapeHtml(d.action) + '</strong><div>' + escapeHtml(d.reason) + '</div><small>' +
        escapeHtml(d.evidenceLevel) + ' · ' + escapeHtml(d.presence) + '</small><small>Consulta Geral: ' +
        escapeHtml(d.baseReferenceDate || "sem data") + ' · ' + escapeHtml(d.baseFileName || "sem arquivo") +
        (row.sigemSourceRow ? ' · linha ' + escapeHtml(row.sigemSourceRow) : '') + '</small></td></tr>';
    }).join("");
    const warning = group.riskOfDuplicateResend
      ? '<strong class="pc-grdt-warning">Esta GRDT possui documentos já localizados no SIGEM. Não reenviar o pacote integral.</strong>' : '';
    return '<details class="pc-grdt-details"><summary>Ver todos os ' + fmt(group.total) +
      ' documentos/revisões desta emissão</summary>' + warning +
      '<input type="search" placeholder="Pesquisar documento nesta GRDT" aria-label="Pesquisar documentos desta GRDT"><div><table><thead><tr><th>Documento</th><th>Rev. enviada</th><th>Rev. encontrada</th><th>SIGEM</th><th>Alocação</th><th>Diagnóstico / orientação</th></tr></thead><tbody>' +
      all + '</tbody></table></div><small>Documentos Previstos: ' +
      escapeHtml(root.GrconPlannedDocuments?.current?.()?.fileName || "não disponível") + ' · Central: ' +
      escapeHtml(root.GrconAllocationRegistry?.current?.()?.fileName || "não disponível") +
      (group.workspaceId ? ' · Workspace: ' + escapeHtml(group.workspaceId) : '') +
      '. A presença da revisão no SIGEM não comprova qual dos múltiplos envios a originou.</small>' +
      '<div class="pc-repost-group-actions"><button type="button" class="secondary-button compact" data-repost-pending-group="' + escapeHtml(groupKey) + '"' +
      (!selectedCount || state.busy ? ' disabled' : '') + '>Preparar selecionados desta GRDT (' + fmt(selectedCount) + ')</button>' +
      '<small>Selecione somente os documentos que decidiu reenviar. Os já confirmados ficam excluídos.</small></div></details>';
  }

  function filteredPendingRows() {
    const matched = new Set(Conference.pendingRows(filteredEventRows()).map(row => row.key));
    return filteredGroups().flatMap(group => {
      const scope = Conference.pendingScope(group);
      return group.rows.filter(row => matched.has(row.key)).map(row => ({ ...row, pendingScope: scope }));
    });
  }

  function pendingTable(rows) {
    const body = rows.map(row => '<tr><td><strong>' + breakableCode(row.document) +
      '</strong></td><td>' + escapeHtml(row.revisionSent || "—") +
      '</td><td><button type="button" class="text-button" data-pc-pending-grdt data-pc-grdt="' +
      escapeHtml(row.egrdtNumber || "") + '">' + escapeHtml(row.egrdtNumber || "Não identificada") +
      '</button></td><td>' + statusChip(row) + (row.historicalPreserved ? '<small>Já confirmado anteriormente; não reenviar.</small>' : '') +
      '</td><td>' + escapeHtml(row.sigemStatus || "Não informado") +
      (row.sigemStatusRevision ? '<small>Revisão ' + escapeHtml(row.sigemStatusRevision) + '</small>' : '') +
      '</td><td><strong>' + escapeHtml(row.pendingScope.label) + '</strong><small>' +
      escapeHtml(row.pendingScope.detail) + '</small></td></tr>').join("");
    return '<table class="pc-table pc-grdt-table pc-pending-table"><thead><tr><th>Documento pendente</th><th title="Revisão enviada">Revisão</th><th>eGRDT</th><th>Pendência do documento</th><th>Status SIGEM</th><th>O que está pendente na GRDT?</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function grdtTable(groups) {
    const labels = { TOTALMENTE_CONFIRMADA: "Totalmente confirmada", PARCIALMENTE_CONFIRMADA: "Parcialmente confirmada", NENHUM_DOCUMENTO_CONFIRMADO: "Nenhum documento confirmado", REQUER_INVESTIGACAO: "Requer investigação", NAO_VERIFICADA: "Não verificada" };
    const body = groups.map((g) =>
      '<tr><td><strong>' + escapeHtml(g.egrdtNumber || "Sem número") + '</strong></td><td>' + fmtDate(g.generatedAt, false) +
      '</td><td>' + fmt(g.distinctDocuments) + '</td><td>' + fmt(g.locatedDocuments) + '</td><td>' +
      fmt(g.notFound) + '</td><td>' + fmt(g.divergent) + '</td><td>' + fmt(g.inTransit) + '</td><td>' +
      fmt(g.allocationPending) + '</td><td><strong>' + escapeHtml(labels[g.classification] || g.classification) +
      '</strong></td></tr><tr class="pc-grdt-detail-row"><td colspan="9">' + grdtDetails(g) + '</td></tr>'
    ).join("");
    return '<table class="pc-table pc-grdt-table"><thead><tr><th>eGRDT</th><th>Data</th><th>Documentos</th><th>Localizados</th><th>Não encontrados</th><th>Revisões divergentes</th><th>Em tramitação</th><th>Alocação pendente</th><th>Situação</th></tr></thead><tbody>' + body + '</tbody></table>';
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
    const consolidated = el("pc-pending-grdts");
    consolidated.hidden = state.view !== "pending";

    if (state.view === "pending") {
      const rows = filteredPendingRows();
      total = rows.length;
      pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      content = pendingTable(rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE));
      el("pc-table-kicker").textContent = "DOCUMENTOS PENDENTES";
      el("pc-table-help").textContent = "Cada linha mostra uma revisão pendente e sua GRDT. Clique na GRDT para ver a emissão completa.";
      el("pc-result-count").textContent = `${fmt(total)} documento(s)/revisão(ões) pendente(s)`;
      consolidated.innerHTML = '<strong>Pendência total ou parcial?</strong><p>A última coluna informa se a GRDT inteira está pendente ou somente os documentos indicados. Pendente significa sem confirmação da revisão enviada na base consultada; não comprova falha de postagem.</p><button type="button" data-copy-pending-grdts>Copiar GRDTs exibidas</button>';
    } else if (state.view === "grdts") {
      const groups = filteredGroups();
      total = groups.length;
      pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      const slice = groups.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      content = grdtTable(slice);
      el("pc-table-kicker").textContent = "CONFERÊNCIA POR eGRDT";
      el("pc-table-help").textContent = "Expanda qualquer GRDT para visualizar também os documentos confirmados, antes de avaliar nova emissão.";
      el("pc-result-count").textContent = `${fmt(total)} eGRDT(s)`;
    } else {
      const rows = filteredDocumentRows();
      total = rows.length;
      pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      const slice = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      content = documentsTable(slice);
      el("pc-table-kicker").textContent = "DOCUMENTOS CONFERIDOS";
      el("pc-table-help").textContent = "Cada documento aparece apenas uma vez nesta visão. Reenvios em diferentes eGRDTs ficam agrupados e não aumentam os totais.";
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
    const canEditDate = ["owner", "admin"].includes(root.GrconCloud?.state?.membership?.role);
    el("pc-reference-date").disabled = !canEditDate;
    el("pc-save-date").disabled = !canEditDate || !state.base.meta || state.busy;
    if (state.base.meta?.referenceDate) el("pc-reference-date").value = state.base.meta.referenceDate;
    renderKpis();
    refreshFilterOptions();
    renderTableOnly();
    renderAudit();
    const query = root.GrconSharedSigemQuery;
    el("pc-publish").hidden = !query?.canPublish() || !query?.state.local;
    el("pc-publish").disabled = state.busy || query?.state.busy;
    if (query?.state.shared) el("pc-base-card").appendChild(Object.assign(document.createElement("small"), { textContent: query.state.stale ? "Consulta Geral compartilhada em cache; pode estar desatualizada." : "Consulta Geral compartilhada em uso." }));
    if (query?.state.error) el("pc-base-card").appendChild(Object.assign(document.createElement("small"), { textContent: query.state.error }));
    el("pc-export").disabled = state.busy || !documentRows().length;
  }

  async function exportReport() {
    if (!Report || !documentRows().length) return;
    setBusy(true, "Gerando Relatório de Conferência de Postagem…");
    try {
      let rows;
      let mode;
      let groups = [];
      groups = detailedGroups();
      rows = filteredPendingRows();
      mode = "events";
      const scopeLabel = "Pendencias";
      const buffer = await Report.buildWorkbook(rows, { mode, groups, scopeLabel, pending: true, baseFileName: state.base.meta?.fileName, baseImportedAt: state.base.meta?.importedAt });
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
    await root.GrconSharedSigemQuery?.refresh();
    await adoptSharedBase();
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

  root.addEventListener("grcon:shared-sigem-updated", () => { if (state.ready && !state.busy) void adoptSharedBase(); });
  root.addEventListener("grcon:shared-sigem-date-updated", async event => {
    const base = root.GrconSharedSigemQuery.current();
    if (!base || !state.ready || event.detail?.meta?.snapshotId !== base.meta.snapshotId) return;
    state.base.meta = { ...state.base.meta, ...base.meta };
    await Conference.saveBase(state.base);
    render();
  });

  root.addEventListener("grcon:history-updated", () => {
    if (!state.ready) return;
    void reconcileCurrent({ reason: "history" });
  });

  root.GrconPostingConferenceUi = Object.freeze({ activate, render, state, reconcile: reconcileCurrent });
})(window);
