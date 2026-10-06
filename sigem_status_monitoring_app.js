(function (root) {
  "use strict";

  if (typeof document === "undefined") return;

  const state = {
    versions: [],
    comparisons: [],
    changes: [],
    monitored: [],
    notifications: [],
    activeComparison: "",
    filters: { query: "", type: "all", monitored: false, previous: "", current: "", revision: "", discipline: "", from: "", to: "" },
    loading: false,
    page: 0,
    unreadCount: 0,
    epoch: 0,
  };

  const $ = (selector, context) => (context || document).querySelector(selector);
  const escapeHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function cloud() { return root.GrconCloud; }
  function workspaceId() { return cloud()?.state?.membership?.workspace_id || ""; }
  function role() { return cloud()?.state?.membership?.role || "viewer"; }
  function canManage() { return ["owner", "admin"].includes(role()); }
  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
  }
  function formatDate(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }
  function count(value, key) {
    const raw = value && typeof value === "object" ? value[key] : 0;
    return Number(raw || 0);
  }
  function changeLabel(type) {
    return {
      ENTROU_EM_ANALISE: "Entrou em análise",
      SAIU_DE_ANALISE: "Saiu de análise",
      MUDANCA_DE_STATUS: "Mudança de status",
      NOVO_NA_CONSULTA: "Novo na Consulta Geral",
      REMOVIDO_DA_CONSULTA: "Não localizado na versão atual",
    }[type] || type || "Alteração";
  }
  function normalizedSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  }
  function filteredChanges() {
    const q = normalizedSearch(state.filters.query);
    return state.changes.filter((row) => {
      if (state.filters.type === "status" && !["ENTROU_EM_ANALISE","SAIU_DE_ANALISE","MUDANCA_DE_STATUS"].includes(row.change_type)) return false;
      if (!["all","status"].includes(state.filters.type) && row.change_type !== state.filters.type) return false;
      if (state.filters.monitored && !row.monitored) return false;
      for (const [filter,key] of [["previous","previous_status"],["current","current_status"],["revision","revision"],["discipline","discipline"]]) {
        if (state.filters[filter] && !normalizedSearch(row[key]).includes(normalizedSearch(state.filters[filter]))) return false;
      }
      const date = String(row.created_at || "").slice(0,10);
      if (state.filters.from && date < state.filters.from || state.filters.to && date > state.filters.to) return false;
      if (!q) return true;
      return normalizedSearch([
        row.document_code, row.revision, row.title, row.discipline,
        row.previous_status, row.current_status, changeLabel(row.change_type),
      ].join(" ")).includes(q);
    });
  }

  function ensureUi() {
    const rootEl = $("#grcon-sigem-monitoring-root");
    if (!rootEl || rootEl.dataset.ready === "true") return rootEl;
    rootEl.dataset.ready = "true";
    rootEl.innerHTML = [
      '<section class="sigem-monitor-card sigem-monitor-overview">',
      '<header><div><span>CONSULTA GERAL · SIGEM</span><h3>Evolução entre versões</h3><p>Cada publicação vira uma versão. O GRCON compara automaticamente a nova Consulta Geral com a anterior dentro do contrato ativo.</p></div><button class="secondary-button compact" id="sigem-monitor-refresh" type="button">Atualizar</button></header>',
      '<div class="sigem-monitor-kpis" id="sigem-monitor-kpis"></div>',
      '<div class="sigem-monitor-compare">',
      '<label><span>Versão anterior</span><select id="sigem-monitor-previous"></select></label>',
      '<label><span>Versão atual</span><select id="sigem-monitor-current"></select></label>',
      '<button class="secondary-button compact" id="sigem-monitor-compare" type="button">Comparar versões</button>',
      '<small>Comparações manuais não geram alertas. A publicação de uma nova Consulta Geral já cria a comparação automática.</small>',
      '</div></section>',
      '<section class="sigem-monitor-card">',
      '<header><div><span>DOCUMENTOS PRIORITÁRIOS</span><h3>Monitoramento por código</h3><p>Cadastre somente os documentos que precisam de aviso de mudança de status.</p></div></header>',
      '<form class="sigem-monitor-add" id="sigem-monitor-add">',
      '<input id="sigem-monitor-code" placeholder="Código do documento" maxlength="255" required>',
      '<select id="sigem-monitor-priority"><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select>',
      '<input id="sigem-monitor-note" placeholder="Observação (opcional)" maxlength="500">',
      '<button class="primary-button compact" type="submit">Adicionar</button>',
      '</form>',
      '<div class="sigem-monitor-list" id="sigem-monitor-list"></div>',
      '</section>',
      '<section class="sigem-monitor-card">',
      '<header><div><span>HISTÓRICO COMPARÁVEL</span><h3>Comparações salvas</h3><p>Abra qualquer comparação para auditar documento, revisão e mudança de status.</p></div></header>',
      '<div class="sigem-monitor-comparisons" id="sigem-monitor-comparisons"></div>',
      '</section>',
      '<section class="sigem-monitor-card">',
      '<header><div><span>ALTERAÇÕES</span><h3 id="sigem-monitor-change-title">Selecione uma comparação</h3><p id="sigem-monitor-change-meta">O resultado mantém o status original e usa a normalização somente para reconhecer o fluxo Em análise/Em workflow.</p></div><button class="secondary-button compact" id="sigem-monitor-export" type="button" disabled>Exportar Excel filtrado</button></header>',
      '<div class="sigem-monitor-filters">',
      '<input id="sigem-monitor-search" type="search" placeholder="Buscar documento, título, revisão ou status">',
      '<select id="sigem-monitor-type"><option value="all">Todas as alterações</option><option value="status">Alterações de status</option><option value="ENTROU_EM_ANALISE">Entrou em análise</option><option value="SAIU_DE_ANALISE">Saiu de análise</option><option value="MUDANCA_DE_STATUS">Mudança de status</option><option value="NOVO_NA_CONSULTA">Novos</option><option value="REMOVIDO_DA_CONSULTA">Não localizados</option></select>',
      '<label class="sigem-monitor-check"><input id="sigem-monitor-only-monitored" type="checkbox"> Somente monitorados</label>',
      '</div>',
      '<div class="sigem-monitor-filters extra">' + [
        ["previous","Status anterior","text"],["current","Status atual","text"],["revision","Revisão","text"],["discipline","Disciplina","text"],["from","Desde","date"],["to","Até","date"]
      ].map(([key,label,type]) => '<label>' + label + '<input data-monitor-filter="' + key + '" type="' + type + '"></label>').join("") + '</div>',
      '<div class="sigem-monitor-table-wrap"><table class="sigem-monitor-table"><thead><tr><th>Documento</th><th>Rev.</th><th>Alteração</th><th>Status anterior</th><th>Status atual</th><th>Disciplina</th><th>Monitorado</th></tr></thead><tbody id="sigem-monitor-change-body"></tbody></table></div>',
      '<div class="sigem-monitor-pagination"><button id="sigem-monitor-prev-page" type="button">Anterior</button><span id="sigem-monitor-page"></span><button id="sigem-monitor-next-page" type="button">Próxima</button></div>',
      '<p class="sigem-monitor-empty" id="sigem-monitor-change-empty">Nenhuma comparação selecionada.</p>',
      '</section>',
      '<section class="sigem-monitor-card">',
      '<header><div><span>CENTRAL DE ALERTAS</span><h3>Notificações do contrato</h3><p>Alertas são gerados somente para documentos monitorados e não duplicam a mesma transição.</p></div><button class="text-button" id="sigem-monitor-read-all" type="button">Marcar todas como lidas</button></header>',
      '<div class="sigem-monitor-notifications" id="sigem-monitor-notifications"></div>',
      '</section>',
    ].join("");

    $("#sigem-monitor-refresh").addEventListener("click", () => void loadAll());
    $("#sigem-monitor-compare").addEventListener("click", () => void compareSelected());
    $("#sigem-monitor-add").addEventListener("submit", saveMonitored);
    $("#sigem-monitor-search").addEventListener("input", (event) => { state.filters.query = event.target.value; renderChanges(); });
    $("#sigem-monitor-type").addEventListener("change", (event) => { state.filters.type = event.target.value; renderChanges(); });
    $("#sigem-monitor-only-monitored").addEventListener("change", (event) => { state.filters.monitored = event.target.checked; renderChanges(); });
    $("#sigem-monitor-export").addEventListener("click", () => void exportFiltered());
    $("#sigem-monitor-prev-page").addEventListener("click", () => { state.page = Math.max(0,state.page-1); renderChanges(); });
    $("#sigem-monitor-next-page").addEventListener("click", () => { state.page++; renderChanges(); });
    rootEl.querySelectorAll('[data-monitor-filter]').forEach(el => el.addEventListener("input", () => { state.filters[el.dataset.monitorFilter] = el.value; state.page = 0; renderChanges(); }));
    $("#sigem-monitor-kpis").addEventListener("click", event => {
      const filter = event.target.closest('[data-kpi-filter]')?.dataset.kpiFilter;
      if (!filter) return;
      state.filters.type = filter === "monitored" ? "all" : filter;
      state.filters.monitored = filter === "monitored";
      $("#sigem-monitor-type").value = state.filters.type;
      $("#sigem-monitor-only-monitored").checked = state.filters.monitored;
      state.page = 0; renderChanges(); $("#sigem-monitor-change-body").scrollIntoView({block:"center"});
    });
    $("#sigem-monitor-read-all").addEventListener("click", () => void markAllRead());
    rootEl.addEventListener("click", (event) => {
      const comparison = event.target.closest("[data-sigem-comparison]")?.dataset.sigemComparison;
      if (comparison) void openComparison(comparison);
      const remove = event.target.closest("[data-sigem-monitor-remove]")?.dataset.sigemMonitorRemove;
      if (remove) void removeMonitored(remove);
      const historyCode = event.target.closest('[data-monitor-history]')?.dataset.monitorHistory;
      if (historyCode) void documentHistory(historyCode);
      const editId = event.target.closest('[data-monitor-edit]')?.dataset.monitorEdit;
      if (editId) editMonitored(editId);
      const toggleId = event.target.closest('[data-monitor-toggle]')?.dataset.monitorToggle;
      if (toggleId) void toggleMonitored(toggleId);
      const notificationId = event.target.closest("[data-sigem-notification]")?.dataset.sigemNotification;
      if (notificationId) void markRead([notificationId]);
    });
    return rootEl;
  }

  function renderVersions() {
    const prev = $("#sigem-monitor-previous");
    const current = $("#sigem-monitor-current");
    if (!prev || !current) return;
    const options = state.versions.map((version) => '<option value="' + escapeHtml(version.snapshot_id) + '">v' + escapeHtml(version.version || "—") + ' · ' + escapeHtml(version.file_name || "Consulta Geral") + ' · ' + escapeHtml(formatDate(version.published_at || version.created_at)) + '</option>').join("");
    prev.innerHTML = options;
    current.innerHTML = options;
    if (state.versions.length > 1) {
      current.value = state.versions[0].snapshot_id;
      prev.value = state.versions[1].snapshot_id;
    }
    $("#sigem-monitor-compare").disabled = state.versions.length < 2;
  }

  function renderKpis() {
    const latest = state.comparisons.find(c => c.comparison_id === state.activeComparison) || state.comparisons.find(c => c.automatic);
    const counts = latest?.counts || {};
    const unread = state.unreadCount;

    $("#sigem-monitor-kpis").innerHTML = [
      ["Ocorrências comparadas (doc. + revisão)", count(counts,"documentsCompared"), "all"],
      ["Alterações de status", count(counts,"statusChanges"), "status"],
      ["Entraram em análise", count(counts,"enteredAnalysis"), "ENTROU_EM_ANALISE"],
      ["Saíram de análise", count(counts,"leftAnalysis"), "SAIU_DE_ANALISE"],
      ["Novos", count(counts,"newDocuments"), "NOVO_NA_CONSULTA"],
      ["Não localizados", count(counts,"removedDocuments"), "REMOVIDO_DA_CONSULTA"],
      ["Prioritários alterados", count(counts,"monitoredChanged"), "monitored"],
    ].map(([label,number,filter]) => '<button type="button" data-kpi-filter="' + filter + '"><span>' + escapeHtml(label) + '</span><strong>' + Number(number).toLocaleString("pt-BR") + '</strong></button>').join("");
    const badge = $("#grcon-notification-count");
    if (badge) { badge.textContent = String(unread); badge.hidden = !unread; }

  }

  function renderMonitored() {
    const target = $("#sigem-monitor-list");
    const form = $("#sigem-monitor-add");
    if (!target) return;
    if (form) form.hidden = !canManage();
    target.innerHTML = state.monitored.map((item) => {
      const status = item.current_status || "Não localizado na versão atual";
      const priority = String(item.priority || "normal");
      return '<article data-priority="' + escapeHtml(priority) + '"><div><strong>' + escapeHtml(item.document_code) + '</strong><small>' + escapeHtml(item.title || item.description || item.note || "Documento monitorado") + '</small></div><span>' + escapeHtml(status) + '</span><b>' + escapeHtml(priority) + (item.active ? '' : ' · inativo') + '</b><small>Anterior: ' + escapeHtml(item.last_status || '—') + ' · Alteração: ' + escapeHtml(formatDate(item.last_change)) + ' · Consulta: ' + escapeHtml(formatDate(item.last_snapshot)) + ' · ' + escapeHtml(item.note || '') + '</small>' + (canManage() ? '<button class="text-button" type="button" data-monitor-edit="' + escapeHtml(item.id) + '">Editar</button><button class="text-button" type="button" data-monitor-toggle="' + escapeHtml(item.id) + '">' + (item.active ? 'Desativar' : 'Ativar') + '</button>' : '') + (canManage() ? '<button class="text-button danger" data-sigem-monitor-remove="' + escapeHtml(item.id) + '" type="button">Remover</button>' : '') + '</article>';
    }).join("") || '<p class="sigem-monitor-empty">Nenhum documento monitorado neste contrato.</p>';
  }

  function renderComparisons() {
    const target = $("#sigem-monitor-comparisons");
    if (!target) return;
    target.innerHTML = state.comparisons.map((item) => {
      const counts = item.counts || {};
      const selected = item.comparison_id === state.activeComparison ? " is-active" : "";
      return '<button class="sigem-monitor-comparison' + selected + '" data-sigem-comparison="' + escapeHtml(item.comparison_id) + '" type="button"><span><strong>' + escapeHtml(item.previous_file || "Versão anterior") + ' → ' + escapeHtml(item.current_file || "Versão atual") + '</strong><small>' + escapeHtml(formatDate(item.compared_at)) + ' · ' + (item.automatic ? "automática" : "manual") + '</small></span><b>' + count(counts, "changes").toLocaleString("pt-BR") + ' mudança(s)</b></button>';
    }).join("") || '<p class="sigem-monitor-empty">Ainda não há duas versões publicadas para formar histórico de comparação.</p>';
  }

  function renderChanges() {
    const body = $("#sigem-monitor-change-body");
    const empty = $("#sigem-monitor-change-empty");
    const rows = filteredChanges();
    if (!body) return;
    state.page = Math.max(0, Math.min(state.page, Math.ceil(rows.length / 100)-1));
    $("#sigem-monitor-page").textContent = rows.length ? "Página " + (state.page+1) + " de " + Math.ceil(rows.length/100) + " · " + rows.length + " alterações" : "0 alterações";
    $("#sigem-monitor-prev-page").disabled = state.page === 0;
    $("#sigem-monitor-next-page").disabled = (state.page+1)*100 >= rows.length;
    body.innerHTML = rows.slice(state.page*100,(state.page+1)*100).map((row) => '<tr><td><button class="text-button" type="button" data-monitor-history="' + escapeHtml(row.document_code) + '">' + escapeHtml(row.document_code) + '</button><small>' + escapeHtml(row.title || "") + '</small></td><td>' + escapeHtml(row.revision || "—") + '</td><td><span class="sigem-monitor-change-type" data-type="' + escapeHtml(row.change_type) + '">' + escapeHtml(changeLabel(row.change_type)) + '</span></td><td>' + escapeHtml(row.previous_status || "—") + '</td><td>' + escapeHtml(row.current_status || "—") + '</td><td>' + escapeHtml(row.discipline || "—") + '</td><td>' + (row.monitored ? "Sim" : "Não") + '</td></tr>').join("");
    if (empty) {
      empty.hidden = rows.length > 0;
      empty.textContent = state.activeComparison ? "Nenhuma alteração corresponde aos filtros." : "Nenhuma comparação selecionada.";
    }
    const exportButton = $("#sigem-monitor-export");
    if (exportButton) exportButton.disabled = !rows.length;
    const meta = $("#sigem-monitor-change-meta");
    if (meta && state.activeComparison) meta.textContent = rows.length.toLocaleString("pt-BR") + " alteração(ões) exibida(s). A exportação usa exatamente este filtro.";
  }

  function renderNotifications() {
    const target = $("#sigem-monitor-notifications");
    if (!target) return;
    target.innerHTML = state.notifications.map((item) => '<button class="sigem-monitor-notification ' + (item.is_read ? "is-read" : "is-unread") + '" data-sigem-notification="' + escapeHtml(item.id) + '" type="button"><span><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.document_code || "") + (item.previous_status || item.current_status ? " · " + escapeHtml(item.previous_status || "—") + " → " + escapeHtml(item.current_status || "—") : "") + '</small><em>' + escapeHtml(item.message) + '</em></span><time>' + escapeHtml(formatDate(item.created_at)) + '</time></button>').join("") || '<p class="sigem-monitor-empty">Nenhuma notificação deste contrato.</p>';
    const mark = $("#sigem-monitor-read-all");
    if (mark) mark.disabled = !state.notifications.some((item) => !item.is_read);
  }

  async function rpc(name, args) {
    const client = cloud()?.state?.client;
    if (!client) throw new Error("Conexão compartilhada indisponível.");
    const response = await client.rpc(name, args || {});
    if (response.error) throw response.error;
    return response.data;
  }

  async function loadAll() {
    ensureUi();
    const workspace = workspaceId();
    if (!workspace || state.loading) return;
    const epoch = state.epoch;
    state.loading = true;
    try {
      const [versions, comparisons, monitored, notifications, unread] = await Promise.all([
        rpc("grcon_sigem_versions", { target_workspace: workspace }),
        rpc("grcon_sigem_comparison_history", { target_workspace: workspace }),
        rpc("grcon_monitored_documents_list", { target_workspace: workspace }),
        rpc("grcon_notifications_list", { target_workspace: workspace, only_unread: false, limit_count: 100 }),
        rpc("grcon_notifications_unread_count", { target_workspace: workspace }),
      ]);
      if (epoch !== state.epoch || workspace !== workspaceId()) return;
      state.versions = Array.isArray(versions) ? versions : [];
      state.comparisons = Array.isArray(comparisons) ? comparisons : [];
      state.monitored = Array.isArray(monitored) ? monitored : [];
      state.notifications = Array.isArray(notifications) ? notifications : [];
      state.unreadCount = Number(unread || 0);
      if (state.activeComparison && !state.comparisons.some((item) => item.comparison_id === state.activeComparison)) {
        state.activeComparison = "";
        state.changes = [];
      }
      renderVersions();
      renderKpis();
      renderMonitored();
      renderComparisons();
      renderChanges();
      renderNotifications();
      if (!state.activeComparison && state.comparisons.length) await openComparison(state.comparisons.find(c => c.automatic)?.comparison_id || state.comparisons[0].comparison_id);
    } catch (error) {
      notify(error?.message || "Não foi possível carregar a evolução da Consulta Geral.", "error");
    } finally {
      state.loading = false;
      if (epoch !== state.epoch) void loadAll();
    }
  }

  async function openComparison(id) {
    if (!id || !workspaceId()) return;
    try {
      const workspace = workspaceId(); const epoch = state.epoch;
      const data = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await cloud().state.client.rpc("grcon_sigem_comparison_changes", { target_workspace: workspace, target_comparison: id }).range(offset, offset+999);
        if (response.error) throw response.error;
        if (epoch !== state.epoch || workspace !== workspaceId()) return;
        data.push(...(response.data || []));
        if ((response.data || []).length < 1000) break;
        await new Promise(resolve => root.setTimeout(resolve,0));
      }
      state.page = 0;
      state.activeComparison = id;
      state.changes = Array.isArray(data) ? data : [];
      const item = state.comparisons.find((row) => row.comparison_id === id);
      $("#sigem-monitor-change-title").textContent = item ? (item.previous_file + " → " + item.current_file) : "Alterações da comparação";
      renderComparisons();
      renderKpis();
      renderChanges();
    } catch (error) {
      notify(error?.message || "Não foi possível abrir esta comparação.", "error");
    }
  }

  async function compareSelected() {
    const previous = $("#sigem-monitor-previous")?.value || "";
    const current = $("#sigem-monitor-current")?.value || "";
    if (!previous || !current || previous === current) {
      notify("Selecione duas versões diferentes.", "warning");
      return;
    }
    try {
      const id = await rpc("grcon_sigem_compare_versions", { target_workspace: workspaceId(), previous_snapshot: previous, current_snapshot: current });
      notify("Comparação manual concluída. Nenhum alerta foi disparado.", "success");
      await loadAll();
      if (id) await openComparison(id);
    } catch (error) {
      notify(error?.message || "Não foi possível comparar as versões.", "error");
    }
  }

  async function saveMonitored(event) {
    event.preventDefault();
    if (!canManage()) return;
    const code = String($("#sigem-monitor-code")?.value || "").trim();
    if (!code) return;
    const input = {
      documentCode: code,
      priority: $("#sigem-monitor-priority")?.value || "normal",
      note: $("#sigem-monitor-note")?.value || "",
      active: true,
      id: $("#sigem-monitor-code").dataset.editId || undefined,
    };
    try {
      await rpc("grcon_monitored_document_save", { target_workspace: workspaceId(), input });
      $("#sigem-monitor-code").value = "";
      delete $("#sigem-monitor-code").dataset.editId;
      $("#sigem-monitor-note").value = "";
      notify("Documento incluído no monitoramento deste contrato.", "success");
      await loadAll();
    } catch (error) {
      notify(error?.message || "Não foi possível monitorar o documento.", "error");
    }
  }

  async function removeMonitored(id) {
    if (!canManage() || !id) return;
    try {
      await rpc("grcon_monitored_document_delete", { target_workspace: workspaceId(), target_id: id });
      notify("Documento removido do monitoramento.", "success");
      await loadAll();
    } catch (error) {
      notify(error?.message || "Não foi possível remover o documento.", "error");
    }
  }

  async function markRead(ids) {
    try {
      await rpc("grcon_notifications_mark_read", { target_workspace: workspaceId(), target_ids: ids || null });
      await loadAll();
    } catch (error) {
      notify(error?.message || "Não foi possível atualizar as notificações.", "error");
    }
  }
  async function markAllRead() { await markRead(null); }

  async function exportFiltered() {
    const rows = filteredChanges();
    if (!rows.length) return;
    try {
      await root.GRCONModuleLoader?.ensure?.("excel");
      if (!root.ExcelJS) throw new Error("Biblioteca Excel indisponível.");
      const workbook = new root.ExcelJS.Workbook();
      workbook.creator = "GRCON";
      const sheet = workbook.addWorksheet("Alterações SIGEM");
      sheet.columns = [
        { header: "CONTRATO", key:"contrato", width:20 },
        { header: "DATA DA COMPARAÇÃO", key:"data", width:24 },
        { header: "CONSULTA ANTERIOR", key:"consultaAnterior", width:36 },
        { header: "CONSULTA ATUAL", key:"consultaAtual", width:36 },
        { header: "DOCUMENTO", key: "documento", width: 36 },
        { header: "REVISÃO", key: "revisao", width: 12 },
        { header: "ALTERAÇÃO", key: "alteracao", width: 28 },
        { header: "STATUS ANTERIOR", key: "anterior", width: 28 },
        { header: "STATUS ATUAL", key: "atual", width: 28 },
        { header: "TÍTULO", key: "titulo", width: 48 },
        { header: "DISCIPLINA", key: "disciplina", width: 24 },
        { header: "MONITORADO", key: "monitorado", width: 14 },
      ];
      const comparison = state.comparisons.find(c => c.comparison_id === state.activeComparison);
      rows.forEach((row) => sheet.addRow({
        contrato: cloud()?.state?.contract?.code || "", data: formatDate(comparison?.compared_at), consultaAnterior: comparison?.previous_file || "", consultaAtual: comparison?.current_file || "",
        documento: row.document_code || "",
        revisao: row.revision || "",
        alteracao: changeLabel(row.change_type),
        anterior: row.previous_status || "",
        atual: row.current_status || "",
        titulo: row.title || "",
        disciplina: row.discipline || "",
        monitorado: row.monitored ? "SIM" : "NÃO",
      }));
      sheet.getRow(1).font = { bold: true };
      sheet.autoFilter = { from: "A1", to: "L1" };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      const buffer = await workbook.xlsx.writeBuffer();
      const contract = cloud()?.state?.contract?.code || "CONTRATO";
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "GRCON_" + contract.replace(/[^A-Z0-9]+/gi, "_") + "_Consulta_Geral_Alteracoes_" + stamp + ".xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      root.setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify(rows.length.toLocaleString("pt-BR") + " alteração(ões) exportada(s) conforme os filtros.", "success");
    } catch (error) {
      notify(error?.message || "Não foi possível gerar o Excel.", "error");
    }
  }

  function installBadge() {
    if ($( "#grcon-notification-button")) return;
    const button = document.createElement("button"); button.id = "grcon-notification-button"; button.type = "button"; button.className = "secondary-button compact";
    button.innerHTML = 'Notificações <b id="grcon-notification-count" hidden>0</b>';
    button.addEventListener("click", async () => {
      try {
        await root.GRCONModuleLoader?.ensureModule?.("requests");
        document.querySelector('[data-grcon-view="requests"]')?.click();
        document.querySelector('[data-requests-area="sigem-monitoring"]')?.click();
        $("#sigem-monitor-notifications")?.scrollIntoView({block:"center"});
      } catch (error) { root.GrconNotify?.(error.message || "Não foi possível abrir as notificações.", "error"); }
    });
    ($(".runtime-status") || $(".topbar"))?.appendChild(button);
  }
  function editMonitored(id) {
    const item = state.monitored.find(m => m.id === id); if (!item || !canManage()) return;
    $("#sigem-monitor-code").value = item.document_code; $("#sigem-monitor-code").dataset.editId = item.id;
    $("#sigem-monitor-priority").value = item.priority; $("#sigem-monitor-note").value = item.note;
    $("#sigem-monitor-code").focus();
  }
  async function toggleMonitored(id) {
    const item = state.monitored.find(m => m.id === id); if (!item || !canManage()) return;
    try { await rpc("grcon_monitored_document_save", { target_workspace: workspaceId(), input: { id:item.id, documentCode:item.document_code, description:item.description, note:item.note, priority:item.priority, active:!item.active } }); await loadAll(); } catch (error) { notify(error.message,"error"); }
  }
  async function documentHistory(code) {
    const workspace = workspaceId(); const epoch = state.epoch;
    try {
      const history = await rpc("grcon_sigem_document_status_history", { target_workspace:workspace, target_document:code });
      if (epoch !== state.epoch) return;
      let dialog = $("#sigem-monitor-document-history");
      if (!dialog) { dialog = document.createElement("dialog"); dialog.id = "sigem-monitor-document-history"; document.body.appendChild(dialog); }
      dialog.innerHTML = '<h3>' + escapeHtml(code) + '</h3><p>Histórico de mudanças da Consulta Geral</p>' + (history || []).map(h => '<p><strong>' + escapeHtml(formatDate(h.compared_at)) + '</strong> · Rev. ' + escapeHtml(h.revision) + ' · ' + escapeHtml(h.previous_status || "—") + ' → ' + escapeHtml(h.current_status || "—") + '</p>').join("") + '<form method="dialog"><button>Fechar</button></form>';
      dialog.querySelector("button").addEventListener("click", event => { event.preventDefault(); dialog.close(); });
      dialog.showModal();
    } catch (error) { notify(error.message,"error"); }
  }

  root.addEventListener("grcon:cloud-ready", loadAll);
  root.addEventListener("grcon:contract-context-changed", () => {
    state.epoch++;
    state.unreadCount = 0;
    state.versions = [];
    state.comparisons = [];
    state.changes = [];
    state.monitored = [];
    state.notifications = [];
    state.activeComparison = "";
    renderVersions(); renderKpis(); renderMonitored(); renderComparisons(); renderChanges(); renderNotifications();
    void loadAll();
  });
  root.addEventListener("grcon:shared-sigem-updated", loadAll);
  document.addEventListener("DOMContentLoaded", () => {
    ensureUi();
    installBadge();
    if (workspaceId()) void loadAll();
  });

  root.GrconSigemStatusMonitoring = { load: loadAll, openComparison, filteredChanges };
})(typeof globalThis !== "undefined" ? globalThis : this);
