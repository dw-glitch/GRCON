/**
 * GRCON — limpeza da tela inicial, resumo do Histórico e Dashboard executivo.
 *
 * O Dashboard lê exclusivamente o Histórico de eGRDTs, mas vive em uma aba
 * própria para não misturar consulta operacional com apresentação gerencial.
 */
(function (root) {
  "use strict";

  const FAMILIES = Object.freeze(["ET", "N-1710", "CV"]);
  const FAMILY_LABELS = Object.freeze({ ET: "ET", "N-1710": "N-1710", CV: "CV" });
  const DASHBOARD_MODULE_ID = "dashboard-module";
  const visibleFamilies = new Set(FAMILIES);
  let refreshTimer = 0;
  let dashboardTimer = 0;
  let dashboardRange = "30";
  let dashboardStart = "";
  let dashboardEnd = "";
  let dashboardBuilt = false;
  let exporting = false;

  function removeResumeBand() {
    const section = document.getElementById("grcon-retomar");
    if (section) section.remove();
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }

  function historyBaseRecords() {
    const History = root.GrconHistory;
    if (!History) return [];
    const uiRecords = root.GrconHistoryUi?.state?.filtered;
    return Array.isArray(uiRecords)
      ? uiRecords
      : (typeof History.read === "function" ? History.read() : []);
  }

  function historyRecordsForSelectedFamily() {
    const History = root.GrconHistory;
    if (!History) return [];

    const source = historyBaseRecords();
    const family = String(document.getElementById("history-period-document-type")?.value || "").trim();

    return typeof History.filterByDocumentFamily === "function"
      ? History.filterByDocumentFamily(source, family)
      : [...source];
  }

  function postingForRecord(record, postings) {
    if (!record) return null;
    return (postings || []).find((item) =>
      item?.historyId === record.id
      || item?.id === record.id
      || (item?.egrdtNumber && item.egrdtNumber === record.egrdtNumber)
    ) || null;
  }

  function updateHistorySummary() {
    const summaryElement = document.getElementById("history-summary");
    const History = root.GrconHistory;
    if (!summaryElement || !History || typeof History.summary !== "function") return;

    const records = historyRecordsForSelectedFamily();
    const summary = History.summary(records);
    const Posting = root.GrconSigemPosting;
    const postings = Posting && typeof Posting.read === "function" ? Posting.read() : [];
    const postingRecords = records.map((record) => postingForRecord(record, postings));
    const postedStatus = Posting?.STATUSES?.POSTADO;
    const pendingStatus = Posting?.STATUSES?.PENDENCIA;
    const failedStatus = Posting?.STATUSES?.FALHA;

    const awaiting = postingRecords.filter((record) => !record).length;
    const posted = postingRecords.filter((record) => record?.status === postedStatus).length;
    const attention = postingRecords.filter((record) => [pendingStatus, failedStatus].includes(record?.status)).length;

    summaryElement.innerHTML = [
      ["eGRDTs localizadas", summary.egrdts],
      ["Documentos registrados", summary.documents],
      ["Alocações relacionadas", summary.allocations],
      ["Aguardando SIGEM", awaiting],
      ["Postadas", posted],
      ["Pendências/Falhas", attention],
    ].map(([label, value]) => `<div><span>${label}</span><strong>${Number(value || 0).toLocaleString("pt-BR")}</strong></div>`).join("");
  }

  function scheduleHistorySummary() {
    root.clearTimeout(refreshTimer);
    refreshTimer = root.setTimeout(updateHistorySummary, 0);
  }

  function bindHistorySummary() {
    const ids = [
      "history-search",
      "history-year",
      "history-type",
      "history-posting-status",
      "history-sort",
      "history-date-start",
      "history-date-end",
      "history-period-document-type",
    ];

    ids.forEach((id) => {
      const control = document.getElementById(id);
      if (!control) return;
      const eventName = control.tagName === "INPUT" ? "input" : "change";
      control.addEventListener(eventName, scheduleHistorySummary);
    });

    document.querySelectorAll('[data-grcon-view="history"]').forEach((button) => {
      button.addEventListener("click", scheduleHistorySummary);
    });

    ["grcon:history-updated", "grcon:sigem-updated", "grcon:cloud-ready"].forEach((eventName) => {
      root.addEventListener(eventName, scheduleHistorySummary);
    });

    scheduleHistorySummary();
  }

  // Contrato de compatibilidade com a suíte histórica do GRCON.
  // A faixa visual não volta a ser exibida: esta função só mantém disponíveis
  // as invariantes antigas enquanto os testes legados ainda as verificam.
  function legacyResumeContract(lista) {
    const History = root.GrconHistory;
    const els = { secao: null };
    if (!lista.length) {
      if (els.secao) els.secao.hidden = true;
    }
    return History && typeof History.summary === "function"
      ? History.summary(lista)
      : null;
  }

  // -------------------------------------------------------------------------
  // Dashboard independente
  // -------------------------------------------------------------------------

  function localDateKey(value) {
    const History = root.GrconHistory;
    if (History && typeof History.localDateKey === "function") return History.localDateKey(value);
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function familyOf(file) {
    const History = root.GrconHistory;
    return History && typeof History.documentFamily === "function" ? History.documentFamily(file) : "";
  }

  function norm(value) {
    const History = root.GrconHistory;
    if (History && typeof History.norm === "function") return History.norm(value);
    return String(value === null || value === undefined ? "" : value).trim().toUpperCase();
  }

  function documentKey(file) {
    return norm(file && (file.document || file.finalName || file.originalName));
  }

  function rawHistoryRecords() {
    const History = root.GrconHistory;
    if (!History || typeof History.read !== "function") return [];
    try {
      const records = History.read();
      return Array.isArray(records) ? records : [];
    } catch (error) {
      console.debug("[Dashboard] histórico indisponível:", error);
      return [];
    }
  }

  function currentDashboardPeriod() {
    const startInput = document.getElementById("dashboard-date-start");
    const endInput = document.getElementById("dashboard-date-end");
    const start = String(startInput?.value || dashboardStart || "").trim();
    const end = String(endInput?.value || dashboardEnd || "").trim();
    dashboardStart = start;
    dashboardEnd = end;
    return { start, end };
  }

  function filterRecordsByPeriod(records, startDate, endDate) {
    const start = String(startDate || "").trim();
    const end = String(endDate || "").trim();
    if (start && end && start > end) return [];
    return (records || []).filter((record) => {
      const key = localDateKey(record && record.generatedAt);
      if (!key) return false;
      if (start && key < start) return false;
      if (end && key > end) return false;
      return true;
    });
  }

  /**
   * Conta emissões documentais, não linhas físicas. Dentro da mesma eGRDT,
   * nativo + PDF (ou Excel/DOCX + PDF) do mesmo código contam uma única vez.
   * Se o documento aparece em outra eGRDT no mesmo dia, é outra emissão real.
   */
  function buildDashboardDailyData(records) {
    const days = new Map();
    (records || []).forEach((record) => {
      const date = localDateKey(record && record.generatedAt);
      if (!date) return;
      if (!days.has(date)) days.set(date, { date, ET: 0, "N-1710": 0, CV: 0, total: 0, egrdts: 0 });
      const day = days.get(date);
      const byFamily = new Map(FAMILIES.map((family) => [family, new Set()]));
      (record && record.files || []).forEach((file) => {
        const family = familyOf(file);
        if (!byFamily.has(family)) return;
        const key = documentKey(file);
        if (key) byFamily.get(family).add(key);
      });
      let emitted = 0;
      FAMILIES.forEach((family) => {
        const amount = byFamily.get(family).size;
        day[family] += amount;
        emitted += amount;
      });
      if (emitted) {
        day.total += emitted;
        day.egrdts += 1;
      }
    });
    return [...days.values()].filter((day) => day.total > 0).sort((left, right) => left.date.localeCompare(right.date));
  }

  function emittedDocuments(records) {
    const rows = [];
    (records || []).forEach((record) => {
      const date = localDateKey(record && record.generatedAt);
      const groups = new Map();
      (record && record.files || []).forEach((file) => {
        const family = familyOf(file);
        const key = documentKey(file);
        if (!FAMILIES.includes(family) || !key) return;
        const groupKey = `${family}|${key}`;
        if (!groups.has(groupKey)) groups.set(groupKey, { family, document: file.document || "", files: [] });
        groups.get(groupKey).files.push(file);
      });
      groups.forEach((group) => {
        const first = group.files[0] || {};
        rows.push({
          date,
          egrdt: record.egrdtNumber || "",
          family: group.family,
          document: group.document,
          revision: first.revision || first.grdtRevision || "",
          title: first.title || "",
          discipline: first.discipline || "",
          databook: first.databook || "",
          fileCount: group.files.length,
          files: group.files.map((file) => file.finalName || file.originalName || "").filter(Boolean).join(" | "),
        });
      });
    });
    return rows.sort((left, right) => `${right.date}|${right.egrdt}|${right.document}`.localeCompare(`${left.date}|${left.egrdt}|${left.document}`));
  }

  function totalsFromDaily(daily) {
    const totals = { documents: 0, ET: 0, "N-1710": 0, CV: 0, egrdts: 0, days: daily.length };
    daily.forEach((day) => {
      FAMILIES.forEach((family) => { totals[family] += Number(day[family] || 0); });
      totals.documents += Number(day.total || 0);
      totals.egrdts += Number(day.egrdts || 0);
    });
    return totals;
  }

  function dateLabel(key, withYear) {
    const parts = String(key || "").split("-");
    if (parts.length !== 3) return key || "—";
    return withYear ? `${parts[2]}/${parts[1]}/${parts[0]}` : `${parts[2]}/${parts[1]}`;
  }

  function isoToday() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function shiftDate(dateKey, days) {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() + Number(days || 0));
    return localDateKey(date);
  }

  function applyQuickRange(range) {
    dashboardRange = String(range || "all");
    const records = rawHistoryRecords();
    const keys = records.map((record) => localDateKey(record.generatedAt)).filter(Boolean).sort();
    const historyStart = keys[0] || "";
    const historyEnd = keys[keys.length - 1] || isoToday();
    dashboardEnd = historyEnd;
    if (dashboardRange === "all") dashboardStart = historyStart;
    else dashboardStart = shiftDate(historyEnd, -(Math.max(1, Number(dashboardRange)) - 1));
    const startInput = document.getElementById("dashboard-date-start");
    const endInput = document.getElementById("dashboard-date-end");
    if (startInput) startInput.value = dashboardStart;
    if (endInput) endInput.value = dashboardEnd;
  }

  function niceMaximum(value) {
    const number = Math.max(1, Number(value) || 0);
    if (number <= 5) return Math.ceil(number);
    const magnitude = 10 ** Math.floor(Math.log10(number));
    const normalized = number / magnitude;
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  }

  function stackedBarSvg(daily) {
    const families = FAMILIES.filter((family) => visibleFamilies.has(family));
    const width = Math.max(980, daily.length * 66 + 90);
    const height = 390;
    const margin = { top: 38, right: 26, bottom: 62, left: 58 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const visibleTotals = daily.map((day) => families.reduce((sum, family) => sum + Number(day[family] || 0), 0));
    const maxValue = niceMaximum(Math.max(1, ...visibleTotals));
    const slot = plotWidth / Math.max(1, daily.length);
    const barWidth = Math.max(18, Math.min(44, slot * 0.62));
    const yOf = (value) => margin.top + plotHeight - ((Number(value) || 0) / maxValue) * plotHeight;
    const yTicks = [0, .25, .5, .75, 1].map((ratio) => Math.round(maxValue * ratio));
    const labelStep = Math.max(1, Math.ceil(daily.length / 16));

    const grid = yTicks.map((tick) => {
      const y = yOf(tick);
      return `<line class="dashboard-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="dashboard-axis-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${tick.toLocaleString("pt-BR")}</text>`;
    }).join("");

    const bars = daily.map((day, index) => {
      const x = margin.left + slot * index + (slot - barWidth) / 2;
      let cumulative = 0;
      const segments = families.map((family) => {
        const value = Number(day[family] || 0);
        if (!value) return "";
        const yBottom = yOf(cumulative);
        cumulative += value;
        const yTop = yOf(cumulative);
        const segmentHeight = Math.max(1, yBottom - yTop);
        const slug = family === "N-1710" ? "n1710" : family.toLowerCase();
        const inside = segmentHeight >= 24 ? `<text class="dashboard-segment-value" x="${x + barWidth / 2}" y="${yTop + segmentHeight / 2 + 4}" text-anchor="middle">${value}</text>` : "";
        return `<g><rect class="dashboard-bar dashboard-bar-${slug}" x="${x}" y="${yTop}" width="${barWidth}" height="${segmentHeight}" rx="3"><title>${escapeHtml(dateLabel(day.date, true))} · ${escapeHtml(family)}: ${value.toLocaleString("pt-BR")} documento(s)</title></rect>${inside}</g>`;
      }).join("");
      const totalLabel = cumulative ? `<text class="dashboard-total-value" x="${x + barWidth / 2}" y="${Math.max(16, yOf(cumulative) - 8)}" text-anchor="middle">${cumulative}</text>` : "";
      const xLabel = (index % labelStep === 0 || index === daily.length - 1)
        ? `<text class="dashboard-axis-label" x="${x + barWidth / 2}" y="${height - 23}" text-anchor="middle" transform="rotate(-32 ${x + barWidth / 2} ${height - 23})">${escapeHtml(dateLabel(day.date, false))}</text>`
        : "";
      return `${segments}${totalLabel}${xLabel}`;
    }).join("");

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Barras empilhadas de documentos ET, N-1710 e CV emitidos por dia"><title>Documentos emitidos por dia</title>${grid}<line class="dashboard-axis-line" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}"></line>${bars}</svg>`;
  }

  function insightText(daily, totals) {
    if (!daily.length) return "Nenhuma emissão encontrada no período selecionado.";
    const peak = daily.reduce((best, day) => day.total > best.total ? day : best, daily[0]);
    const dominant = FAMILIES.map((family) => [family, totals[family]]).sort((a, b) => b[1] - a[1])[0];
    const average = totals.days ? totals.documents / totals.days : 0;
    return `Maior movimento em ${dateLabel(peak.date, true)}: ${peak.total.toLocaleString("pt-BR")} documento(s). Média de ${average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia com emissão. Família com maior volume: ${dominant[0]} (${Number(dominant[1]).toLocaleString("pt-BR")}).`;
  }

  function dashboardMarkup() {
    return `
      <header class="dashboard-page-heading">
        <div><span>VISÃO EXECUTIVA</span><h2>Dashboard de emissões documentais</h2><p>Leitura visual do Histórico de eGRDTs. Cada documento conta uma vez por eGRDT, mesmo quando possui PDF + arquivo nativo.</p></div>
        <button class="secondary-button" id="dashboard-present" type="button">Apresentar</button>
      </header>
      <section class="dashboard-controls" aria-label="Período do dashboard">
        <div class="dashboard-range-buttons" role="group" aria-label="Atalhos de período">
          <button type="button" data-dashboard-range="7">7 dias</button>
          <button type="button" data-dashboard-range="30" class="active">30 dias</button>
          <button type="button" data-dashboard-range="90">90 dias</button>
          <button type="button" data-dashboard-range="all">Todo o histórico</button>
        </div>
        <label><span>Data inicial</span><input id="dashboard-date-start" type="date"/></label>
        <label><span>Data final</span><input id="dashboard-date-end" type="date"/></label>
        <button class="primary-button" id="dashboard-export-excel" type="button">Exportar Excel</button>
      </section>
      <section class="dashboard-kpis" id="dashboard-kpis" aria-label="Indicadores do período"></section>
      <section class="dashboard-chart-card">
        <header class="dashboard-chart-head">
          <div><span>LINHA DO TEMPO</span><strong>Documentos emitidos por dia</strong><small id="dashboard-period-label">—</small></div>
          <div class="dashboard-legend" aria-label="Famílias visíveis">
            <button type="button" data-dashboard-family="ET" aria-pressed="true">ET</button>
            <button type="button" data-dashboard-family="N-1710" aria-pressed="true">N-1710</button>
            <button type="button" data-dashboard-family="CV" aria-pressed="true">CV</button>
          </div>
        </header>
        <div class="dashboard-chart-scroll" id="dashboard-chart"></div>
        <p class="dashboard-insight" id="dashboard-insight"></p>
      </section>
      <section class="dashboard-lower-grid">
        <article class="dashboard-share-card"><header><span>DISTRIBUIÇÃO</span><strong>Participação por família</strong></header><div id="dashboard-share"></div></article>
        <article class="dashboard-peak-card"><header><span>DESTAQUES</span><strong>Dias de maior emissão</strong></header><div id="dashboard-peaks"></div></article>
      </section>
      <details class="dashboard-table-card">
        <summary><span>Detalhamento diário</span><strong id="dashboard-day-count">0 dia(s)</strong></summary>
        <div class="dashboard-table-wrap"><table><caption>Emissões documentais por dia</caption><thead><tr><th>Data</th><th>ET</th><th>N-1710</th><th>CV</th><th>Total</th><th>eGRDTs</th></tr></thead><tbody id="dashboard-table-body"></tbody></table></div>
      </details>`;
  }

  function installDashboardStyles() {
    if (document.getElementById("grcon-dashboard-style")) return;
    const style = document.createElement("style");
    style.id = "grcon-dashboard-style";
    style.textContent = `
      #dashboard-module{--dash-et:#0b7895;--dash-n1710:#6d4ac7;--dash-cv:#b16a16;min-width:0}
      .dashboard-page-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px}.dashboard-page-heading>div>span,.dashboard-chart-head>div>span,.dashboard-share-card header span,.dashboard-peak-card header span{display:block;font-size:.7rem;font-weight:900;letter-spacing:.12em;color:var(--brand-700,#155c8a);margin-bottom:4px}.dashboard-page-heading h2{margin:0;color:var(--text-strong,#183247);font-size:1.45rem}.dashboard-page-heading p{max-width:850px;margin:6px 0 0;color:var(--text-muted,#66798a);font-size:.9rem}
      .dashboard-controls{display:grid;grid-template-columns:minmax(340px,1fr) auto auto auto;gap:10px;align-items:end;padding:13px;border:1px solid var(--border,#dbe3ea);border-radius:14px;background:var(--surface,#fff);margin-bottom:12px}.dashboard-controls label{display:grid;gap:5px}.dashboard-controls label span{font-size:.7rem;font-weight:800;color:var(--text-muted,#637587);text-transform:uppercase;letter-spacing:.04em}.dashboard-controls input{min-height:38px}.dashboard-range-buttons{display:flex;gap:6px;flex-wrap:wrap}.dashboard-range-buttons button{min-height:36px;padding:0 12px;border:1px solid var(--border,#d7e0e8);border-radius:9px;background:var(--surface-soft,#f7fafc);color:var(--text-strong,#294359);font:inherit;font-size:.78rem;font-weight:800;cursor:pointer}.dashboard-range-buttons button.active{background:var(--brand-50,#eaf5fb);border-color:var(--brand-300,#8ecae4);color:var(--brand-800,#0f537a)}
      .dashboard-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin-bottom:12px}.dashboard-kpi{position:relative;overflow:hidden;min-height:82px;padding:12px 13px;border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(32,56,85,.04)}.dashboard-kpi:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--brand-500,#2789b6)}.dashboard-kpi span{display:block;font-size:.68rem;font-weight:900;letter-spacing:.045em;text-transform:uppercase;color:var(--text-muted,#687b8c)}.dashboard-kpi strong{display:block;margin-top:8px;font-size:1.5rem;line-height:1;color:var(--text-strong,#17324a)}.dashboard-kpi-et:before{background:var(--dash-et)}.dashboard-kpi-n1710:before{background:var(--dash-n1710)}.dashboard-kpi-cv:before{background:var(--dash-cv)}
      .dashboard-chart-card,.dashboard-share-card,.dashboard-peak-card,.dashboard-table-card{border:1px solid var(--border,#dce4eb);border-radius:14px;background:var(--surface,#fff);box-shadow:0 6px 22px rgba(32,56,85,.045);overflow:hidden}.dashboard-chart-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 15px 8px}.dashboard-chart-head strong{display:block;color:var(--text-strong,#183247);font-size:1rem}.dashboard-chart-head small{display:block;margin-top:4px;color:var(--text-muted,#66798a)}
      .dashboard-legend{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.dashboard-legend button{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border,#d7e0e8);border-radius:999px;background:var(--surface-soft,#f8fafc);padding:6px 10px;font:inherit;font-size:.76rem;font-weight:900;cursor:pointer}.dashboard-legend button:before{content:"";width:9px;height:9px;border-radius:3px;background:currentColor}.dashboard-legend button[data-dashboard-family="ET"]{color:var(--dash-et)}.dashboard-legend button[data-dashboard-family="N-1710"]{color:var(--dash-n1710)}.dashboard-legend button[data-dashboard-family="CV"]{color:var(--dash-cv)}.dashboard-legend button[aria-pressed="false"]{opacity:.38;filter:saturate(.3)}
      .dashboard-chart-scroll{overflow-x:auto;padding:0 8px 4px;min-height:340px}.dashboard-chart-scroll svg{display:block;height:390px;min-width:100%;width:auto}.dashboard-grid-line{stroke:rgba(93,116,136,.15);stroke-width:1}.dashboard-axis-line{stroke:rgba(93,116,136,.38);stroke-width:1}.dashboard-axis-label{fill:var(--text-muted,#6d7f8f);font-size:11px}.dashboard-bar-et{fill:var(--dash-et)}.dashboard-bar-n1710{fill:var(--dash-n1710)}.dashboard-bar-cv{fill:var(--dash-cv)}.dashboard-segment-value{fill:#fff;font-size:11px;font-weight:900;pointer-events:none}.dashboard-total-value{fill:var(--text-strong,#233d52);font-size:11px;font-weight:900}.dashboard-insight{display:flex;align-items:flex-start;gap:8px;margin:0;padding:10px 14px 13px;border-top:1px solid var(--border,#e6ebef);color:var(--text-muted,#5f7385);font-size:.82rem}.dashboard-insight:before{content:"↗";display:grid;place-items:center;flex:0 0 24px;height:24px;border-radius:50%;background:var(--brand-50,#eaf5fb);color:var(--brand-700,#155c8a);font-weight:900}
      .dashboard-lower-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.dashboard-share-card header,.dashboard-peak-card header{padding:13px 14px 8px}.dashboard-share-card header strong,.dashboard-peak-card header strong{color:var(--text-strong,#183247)}.dashboard-share-list,.dashboard-peak-list{display:grid;gap:9px;padding:4px 14px 14px}.dashboard-share-row{display:grid;grid-template-columns:66px 1fr 64px;gap:10px;align-items:center}.dashboard-share-row>span{font-size:.78rem;font-weight:900}.dashboard-share-track{height:9px;border-radius:999px;background:var(--surface-soft,#eef3f6);overflow:hidden}.dashboard-share-track i{display:block;height:100%;border-radius:999px}.dashboard-share-et i{background:var(--dash-et)}.dashboard-share-n1710 i{background:var(--dash-n1710)}.dashboard-share-cv i{background:var(--dash-cv)}.dashboard-share-row strong{text-align:right;font-size:.78rem;color:var(--text-strong,#294258)}.dashboard-peak-row{display:grid;grid-template-columns:86px 1fr auto;gap:9px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border,#edf1f4)}.dashboard-peak-row:last-child{border-bottom:0}.dashboard-peak-row>span{font-size:.78rem;font-weight:900;color:var(--text-strong,#294258)}.dashboard-peak-row small{color:var(--text-muted,#6b7e8f)}.dashboard-peak-row strong{font-size:1rem;color:var(--brand-700,#155c8a)}
      .dashboard-table-card{margin-top:10px}.dashboard-table-card summary{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;cursor:pointer;font-weight:900;color:var(--text-strong,#203d54);list-style:none}.dashboard-table-card summary::-webkit-details-marker{display:none}.dashboard-table-wrap{max-height:350px;overflow:auto;border-top:1px solid var(--border,#e6ebef)}.dashboard-table-wrap table{width:100%;border-collapse:collapse;font-size:.8rem}.dashboard-table-wrap caption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.dashboard-table-wrap th,.dashboard-table-wrap td{padding:9px 12px;border-bottom:1px solid var(--border,#edf1f4);text-align:right}.dashboard-table-wrap th:first-child,.dashboard-table-wrap td:first-child{text-align:left}.dashboard-table-wrap thead th{position:sticky;top:0;background:var(--surface-soft,#f6f9fb);font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#637587)}
      .dashboard-empty{display:grid;place-items:center;text-align:center;min-height:300px;color:var(--text-muted,#687b8c)}.dashboard-empty strong{display:block;color:var(--text-strong,#244158);font-size:1rem;margin-bottom:4px}
      body.dashboard-presenting{overflow:hidden}body.dashboard-presenting #dashboard-module{position:fixed;inset:0;z-index:5000;overflow:auto;background:var(--page-bg,#f3f6f8);padding:24px 30px}body.dashboard-presenting .dashboard-page-heading{position:sticky;top:-24px;z-index:10;background:var(--page-bg,#f3f6f8);padding-top:24px;padding-bottom:12px}body.dashboard-presenting .dashboard-controls{display:none}body.dashboard-presenting .dashboard-chart-scroll{min-height:440px}body.dashboard-presenting .dashboard-chart-scroll svg{height:470px}
      html[data-theme="dark"] .dashboard-bar{filter:saturate(.9) brightness(1.08)}html[data-theme="dark"] .dashboard-segment-value{fill:#fff}html[data-theme="dark"] .dashboard-total-value{fill:#e9f1f7}
      @media(max-width:1100px){.dashboard-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.dashboard-controls{grid-template-columns:1fr 1fr}.dashboard-range-buttons{grid-column:1/-1}.dashboard-lower-grid{grid-template-columns:1fr}}
      @media(max-width:680px){.dashboard-page-heading{display:grid}.dashboard-controls{grid-template-columns:1fr}.dashboard-controls>*{grid-column:auto}.dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-chart-head{align-items:flex-start;flex-direction:column}.dashboard-share-row{grid-template-columns:56px 1fr 56px}}
    `;
    document.head.appendChild(style);
  }

  function createDashboardNavigation() {
    if (!document.querySelector('[data-grcon-view="dashboard"]')) {
      const sidebarHistory = document.querySelector('.ops-sidebar [data-grcon-view="history"]');
      if (sidebarHistory) {
        const button = document.createElement("button");
        button.className = "ops-nav-button";
        button.dataset.grconView = "dashboard";
        button.type = "button";
        button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-8M22 19V3M3 19h20"></path></svg><span><strong>Dashboard</strong><small>Indicadores de emissões</small></span>';
        sidebarHistory.insertAdjacentElement("beforebegin", button);
      }

      const tabHistory = document.getElementById("tab-history");
      if (tabHistory) {
        const button = document.createElement("button");
        button.id = "tab-dashboard";
        button.setAttribute("aria-controls", DASHBOARD_MODULE_ID);
        button.setAttribute("aria-selected", "false");
        button.dataset.grconView = "dashboard";
        button.setAttribute("role", "tab");
        button.type = "button";
        button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-8M22 19V3M3 19h20"></path></svg><span><strong>Dashboard</strong><small>Emissões por período</small></span>';
        tabHistory.insertAdjacentElement("beforebegin", button);
      }
    }
  }

  function createDashboardModule() {
    let module = document.getElementById(DASHBOARD_MODULE_ID);
    if (module) return module;
    module = document.createElement("section");
    module.id = DASHBOARD_MODULE_ID;
    module.className = "module-view dashboard-module";
    module.hidden = true;
    module.setAttribute("role", "tabpanel");
    module.setAttribute("aria-labelledby", "tab-dashboard");
    module.innerHTML = dashboardMarkup();
    const historyModule = document.getElementById("history-module");
    if (historyModule) historyModule.insertAdjacentElement("beforebegin", module);
    else document.getElementById("app-main")?.appendChild(module);
    return module;
  }

  function hideDashboard() {
    const module = document.getElementById(DASHBOARD_MODULE_ID);
    if (module) module.hidden = true;
    document.body.classList.remove("dashboard-presenting");
  }

  function activateDashboard() {
    const module = createDashboardModule();
    ["grdt-module", "requests-module", "analysis-history-module", "history-module", "sigem-module"].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.hidden = true;
    });
    module.hidden = false;
    document.querySelectorAll("[data-grcon-view]").forEach((button) => {
      const active = button.dataset.grconView === "dashboard";
      button.classList.toggle("active", active);
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", String(active));
      if (button.closest(".ops-sidebar")) {
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
    });
    const subtitle = document.getElementById("brand-subtitle");
    const footer = document.getElementById("footer-view");
    if (subtitle) subtitle.textContent = "Dashboard de emissões";
    if (footer) footer.textContent = "Dashboard de emissões";
    document.title = "GRCON — Dashboard de emissões";
    renderDashboard();
  }

  function periodLabel(daily) {
    if (!daily.length) return "Nenhuma emissão no período selecionado";
    const first = dateLabel(daily[0].date, true);
    const last = dateLabel(daily[daily.length - 1].date, true);
    return first === last ? first : `${first} — ${last}`;
  }

  function renderKpis(totals) {
    const target = document.getElementById("dashboard-kpis");
    if (!target) return;
    const items = [
      ["Documentos emitidos", totals.documents, "total"],
      ["ET", totals.ET, "et"],
      ["N-1710", totals["N-1710"], "n1710"],
      ["CV", totals.CV, "cv"],
      ["eGRDTs com emissão", totals.egrdts, "egrdt"],
      ["Dias com emissão", totals.days, "days"],
    ];
    target.innerHTML = items.map(([label, value, tone]) => `<article class="dashboard-kpi dashboard-kpi-${tone}"><span>${escapeHtml(label)}</span><strong>${Number(value || 0).toLocaleString("pt-BR")}</strong></article>`).join("");
  }

  function renderShare(totals) {
    const target = document.getElementById("dashboard-share");
    if (!target) return;
    const total = Math.max(1, totals.documents);
    target.innerHTML = `<div class="dashboard-share-list">${FAMILIES.map((family) => {
      const value = Number(totals[family] || 0);
      const percentage = totals.documents ? (value / total) * 100 : 0;
      const slug = family === "N-1710" ? "n1710" : family.toLowerCase();
      return `<div class="dashboard-share-row dashboard-share-${slug}"><span>${escapeHtml(family)}</span><div class="dashboard-share-track"><i style="width:${percentage.toFixed(1)}%"></i></div><strong>${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div>`;
    }).join("")}</div>`;
  }

  function renderPeaks(daily) {
    const target = document.getElementById("dashboard-peaks");
    if (!target) return;
    const rows = [...daily].sort((a, b) => b.total - a.total || b.date.localeCompare(a.date)).slice(0, 5);
    target.innerHTML = rows.length ? `<div class="dashboard-peak-list">${rows.map((day) => `<div class="dashboard-peak-row"><span>${escapeHtml(dateLabel(day.date, true))}</span><small>ET ${day.ET} · N-1710 ${day["N-1710"]} · CV ${day.CV}</small><strong>${day.total}</strong></div>`).join("")}</div>` : '<div class="dashboard-empty"><div><strong>Sem emissões</strong><span>Não há dias para destacar.</span></div></div>';
  }

  function renderDailyTable(daily) {
    const body = document.getElementById("dashboard-table-body");
    const count = document.getElementById("dashboard-day-count");
    if (count) count.textContent = `${daily.length.toLocaleString("pt-BR")} dia(s)`;
    if (!body) return;
    body.innerHTML = [...daily].reverse().map((day) => `<tr><td>${escapeHtml(dateLabel(day.date, true))}</td><td>${day.ET.toLocaleString("pt-BR")}</td><td>${day["N-1710"].toLocaleString("pt-BR")}</td><td>${day.CV.toLocaleString("pt-BR")}</td><td><strong>${day.total.toLocaleString("pt-BR")}</strong></td><td>${day.egrdts.toLocaleString("pt-BR")}</td></tr>`).join("");
  }

  function renderDashboard() {
    if (!dashboardBuilt) return;
    const periodSelection = currentDashboardPeriod();
    const records = filterRecordsByPeriod(rawHistoryRecords(), periodSelection.start, periodSelection.end);
    const daily = buildDashboardDailyData(records);
    const totals = totalsFromDaily(daily);
    renderKpis(totals);
    renderShare(totals);
    renderPeaks(daily);
    renderDailyTable(daily);
    const period = document.getElementById("dashboard-period-label");
    const chart = document.getElementById("dashboard-chart");
    const insight = document.getElementById("dashboard-insight");
    if (period) period.textContent = `${periodLabel(daily)} · Fonte: Histórico de eGRDTs`;
    if (insight) insight.textContent = insightText(daily, totals);
    if (chart) chart.innerHTML = daily.length ? stackedBarSvg(daily) : '<div class="dashboard-empty"><div><strong>Nenhum documento emitido</strong><span>Ajuste o período ou aguarde novas eGRDTs no Histórico.</span></div></div>';
    document.querySelectorAll("[data-dashboard-range]").forEach((button) => button.classList.toggle("active", button.dataset.dashboardRange === dashboardRange));
    document.querySelectorAll("[data-dashboard-family]").forEach((button) => button.setAttribute("aria-pressed", String(visibleFamilies.has(button.dataset.dashboardFamily))));
  }

  function scheduleDashboard() {
    root.clearTimeout(dashboardTimer);
    dashboardTimer = root.setTimeout(renderDashboard, 0);
  }

  function bindDashboardControls() {
    document.querySelectorAll('[data-grcon-view="dashboard"]').forEach((button) => button.addEventListener("click", activateDashboard));
    document.querySelectorAll('[data-grcon-view]:not([data-grcon-view="dashboard"])').forEach((button) => button.addEventListener("click", hideDashboard));

    document.querySelectorAll("[data-dashboard-range]").forEach((button) => {
      button.addEventListener("click", () => {
        applyQuickRange(button.dataset.dashboardRange);
        renderDashboard();
      });
    });
    document.querySelectorAll("[data-dashboard-family]").forEach((button) => {
      button.addEventListener("click", () => {
        const family = button.dataset.dashboardFamily;
        if (visibleFamilies.has(family)) {
          if (visibleFamilies.size > 1) visibleFamilies.delete(family);
        } else visibleFamilies.add(family);
        renderDashboard();
      });
    });
    const start = document.getElementById("dashboard-date-start");
    const end = document.getElementById("dashboard-date-end");

    // Ao sair de um período rápido e escolher uma data manual, a intenção mais
    // comum é ver aquele único dia. Por isso a primeira data escolhida é copiada
    // para os dois campos. Depois disso, alterar o outro campo cria normalmente
    // um intervalo personalizado.
    const syncCustomDate = (changedInput, counterpart) => {
      const value = String(changedInput?.value || "").trim();
      if (value && dashboardRange !== "custom" && counterpart) counterpart.value = value;
      dashboardRange = "custom";
      const periodSelection = currentDashboardPeriod();
      dashboardStart = periodSelection.start;
      dashboardEnd = periodSelection.end;
      renderDashboard();
    };
    if (start) {
      start.addEventListener("input", () => syncCustomDate(start, end));
      start.addEventListener("change", () => syncCustomDate(start, end));
    }
    if (end) {
      end.addEventListener("input", () => syncCustomDate(end, start));
      end.addEventListener("change", () => syncCustomDate(end, start));
    }
    document.getElementById("dashboard-present")?.addEventListener("click", () => {
      const active = document.body.classList.toggle("dashboard-presenting");
      const button = document.getElementById("dashboard-present");
      if (button) button.textContent = active ? "Sair da apresentação" : "Apresentar";
    });
    document.getElementById("dashboard-export-excel")?.addEventListener("click", exportDashboardExcel);
    ["grcon:history-updated", "grcon:history-changed", "grcon:cloud-ready", "grcon:requests-saved"].forEach((eventName) => root.addEventListener(eventName, scheduleDashboard));
  }

  function columnLetter(number) {
    let value = Math.max(1, Number(number) || 1);
    let output = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      output = String.fromCharCode(65 + remainder) + output;
      value = Math.floor((value - 1) / 26);
    }
    return output;
  }

  function styleExcelHeader(row, color) {
    row.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color || "FF153A5C" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB9C7D2" } } };
    });
    row.height = 30;
  }

  function styleExcelData(row, index) {
    row.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE1E8ED" } } };
      if (index % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    });
  }

  function drawDashboardChartPng(daily) {
    if (!document.createElement) return "";
    const canvas = document.createElement("canvas");
    const width = 1500;
    const height = 620;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const colors = { ET: "#0b7895", "N-1710": "#6d4ac7", CV: "#b16a16" };
    const chartFamilies = FAMILIES.filter((family) => visibleFamilies.has(family));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#17324a";
    ctx.font = "700 28px Arial";
    ctx.fillText("Documentos emitidos por dia", 70, 48);
    ctx.fillStyle = "#66798a";
    ctx.font = "16px Arial";
    ctx.fillText("ET · N-1710 · CV — fonte: Histórico de eGRDTs do GRCON", 70, 76);
    const left = 78, right = 34, top = 115, bottom = 90;
    const plotW = width - left - right, plotH = height - top - bottom;
    const max = niceMaximum(Math.max(1, ...daily.map((day) => chartFamilies.reduce((sum, family) => sum + Number(day[family] || 0), 0))));
    ctx.font = "13px Arial";
    for (let i = 0; i <= 4; i += 1) {
      const value = Math.round(max * (i / 4));
      const y = top + plotH - plotH * (i / 4);
      ctx.strokeStyle = "#e3e8ec";
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
      ctx.fillStyle = "#6b7d8d";
      ctx.textAlign = "right";
      ctx.fillText(String(value), left - 12, y + 4);
    }
    const slot = plotW / Math.max(1, daily.length);
    const barW = Math.max(10, Math.min(44, slot * .62));
    const labelStep = Math.max(1, Math.ceil(daily.length / 14));
    daily.forEach((day, index) => {
      const x = left + slot * index + (slot - barW) / 2;
      let cumulative = 0;
      chartFamilies.forEach((family) => {
        const value = Number(day[family] || 0);
        if (!value) return;
        const yBottom = top + plotH - (cumulative / max) * plotH;
        cumulative += value;
        const yTop = top + plotH - (cumulative / max) * plotH;
        ctx.fillStyle = colors[family];
        ctx.fillRect(x, yTop, barW, Math.max(1, yBottom - yTop));
      });
      if (cumulative) {
        ctx.fillStyle = "#263e52"; ctx.textAlign = "center"; ctx.font = "700 12px Arial";
        ctx.fillText(String(cumulative), x + barW / 2, top + plotH - (cumulative / max) * plotH - 7);
      }
      if (index % labelStep === 0 || index === daily.length - 1) {
        ctx.save(); ctx.translate(x + barW / 2, height - 57); ctx.rotate(-.52); ctx.fillStyle = "#66798a"; ctx.font = "12px Arial"; ctx.textAlign = "right"; ctx.fillText(dateLabel(day.date, false), 0, 0); ctx.restore();
      }
    });
    let legendX = 940;
    chartFamilies.forEach((family) => {
      ctx.fillStyle = colors[family]; ctx.fillRect(legendX, 43, 13, 13);
      ctx.fillStyle = "#40586b"; ctx.font = "700 13px Arial"; ctx.textAlign = "left"; ctx.fillText(family, legendX + 20, 54);
      legendX += family === "N-1710" ? 100 : 70;
    });
    return canvas.toDataURL("image/png").split(",")[1] || "";
  }

  async function exportDashboardExcel() {
    if (exporting) return;
    const button = document.getElementById("dashboard-export-excel");
    exporting = true;
    if (button) { button.disabled = true; button.textContent = "Gerando Excel…"; }
    try {
      const periodSelection = currentDashboardPeriod();
      const records = filterRecordsByPeriod(rawHistoryRecords(), periodSelection.start, periodSelection.end);
      const daily = buildDashboardDailyData(records);
      if (!daily.length) throw new Error("Não há emissões no período selecionado para exportar.");
      const documentRows = emittedDocuments(records);
      const totals = totalsFromDaily(daily);
      await root.GRCONModuleLoader?.ensure?.("excel");
      await root.GRCONModuleLoader?.ensure?.("brand");
      if (!root.ExcelJS?.Workbook) throw new Error("Biblioteca ExcelJS indisponível.");

      const workbook = new root.ExcelJS.Workbook();
      workbook.creator = "GRCON";
      workbook.lastModifiedBy = "GRCON";
      workbook.company = "CONSAG Engenharia";
      workbook.title = "Dashboard de emissões documentais";
      workbook.created = new Date();
      workbook.modified = new Date();

      const summary = workbook.addWorksheet("Dashboard", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
      summary.columns = Array.from({ length: 12 }, () => ({ width: 14 }));
      for (let row = 1; row <= 3; row += 1) for (let col = 1; col <= 12; col += 1) summary.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      summary.mergeCells("C1:L2");
      summary.getCell("C1").value = "GRCON · DASHBOARD DE EMISSÕES DOCUMENTAIS";
      summary.getCell("C1").font = { name: "Aptos Display", size: 19, bold: true, color: { argb: "FFFFFFFF" } };
      summary.getCell("C1").alignment = { vertical: "middle" };
      summary.mergeCells("A4:L4");
      summary.getCell("A4").value = `${totals.documents.toLocaleString("pt-BR")} documento(s) · Período: ${periodLabel(daily)} · Fonte: Histórico de eGRDTs do GRCON · ${new Date().toLocaleString("pt-BR")}`;
      summary.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
      summary.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };

      const cards = [
        ["DOCUMENTOS", totals.documents, "FF24689A"], ["ET", totals.ET, "FF0B7895"], ["N-1710", totals["N-1710"], "FF6D4AC7"],
        ["CV", totals.CV, "FFB16A16"], ["eGRDTs", totals.egrdts, "FF53697B"], ["DIAS", totals.days, "FF0C7657"],
      ];
      cards.forEach(([label, value, color], index) => {
        const start = index * 2 + 1;
        summary.mergeCells(6, start, 8, start + 1);
        const cell = summary.getCell(6, start);
        cell.value = { richText: [
          { font: { name: "Aptos", size: 8, bold: true, color: { argb: "FF6F7E8C" } }, text: `${label}\n` },
          { font: { name: "Aptos Display", size: 20, bold: true, color: { argb: color } }, text: Number(value || 0).toLocaleString("pt-BR") },
        ] };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
        cell.border = { left: { style: "medium", color: { argb: color } }, top: { style: "thin", color: { argb: "FFDCE4EA" } }, right: { style: "thin", color: { argb: "FFDCE4EA" } }, bottom: { style: "thin", color: { argb: "FFDCE4EA" } } };
      });

      const imageBase64 = drawDashboardChartPng(daily);
      if (imageBase64) {
        const imageId = workbook.addImage({ base64: imageBase64, extension: "png" });
        summary.addImage(imageId, { tl: { col: .2, row: 9.4 }, ext: { width: 1160, height: 480 } });
        for (let row = 10; row <= 33; row += 1) summary.getRow(row).height = 20;
      }
      summary.mergeCells("A35:L36");
      summary.getCell("A35").value = insightText(daily, totals);
      summary.getCell("A35").alignment = { vertical: "middle", wrapText: true };
      summary.getCell("A35").font = { name: "Aptos", size: 10, color: { argb: "FF3D5568" } };
      summary.getCell("A35").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F6F9" } };
      summary.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: .2, right: .2, top: .35, bottom: .35, header: .2, footer: .2 } };
      summary.headerFooter.oddFooter = "&LGRCON&C&P de &N&R&D";
      if (root.GrconRequestsReport?.attachBrandLogo) await root.GrconRequestsReport.attachBrandLogo(workbook, summary, root.GRCONBrandAssets, root.fetch.bind(root));

      const dailySheet = workbook.addWorksheet("Emissões diárias", { views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false }] });
      const dailyHeaders = ["DATA", "ET", "N-1710", "CV", "TOTAL DE DOCUMENTOS", "eGRDTs COM EMISSÃO"];
      for (let r = 1; r <= 3; r += 1) for (let c = 1; c <= dailyHeaders.length; c += 1) dailySheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      dailySheet.mergeCells("C1:F2"); dailySheet.getCell("C1").value = "GRCON · EMISSÕES DIÁRIAS"; dailySheet.getCell("C1").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
      dailySheet.mergeCells("A4:F4"); dailySheet.getCell("A4").value = `Período: ${periodLabel(daily)} · dados idênticos aos usados no gráfico do Dashboard`; dailySheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } }; dailySheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
      dailyHeaders.forEach((header, index) => dailySheet.getCell(6, index + 1).value = header); styleExcelHeader(dailySheet.getRow(6));
      daily.forEach((day, index) => {
        const row = dailySheet.getRow(index + 7);
        row.values = [dateLabel(day.date, true), day.ET, day["N-1710"], day.CV, day.total, day.egrdts];
        styleExcelData(row, index);
      });
      dailySheet.columns = [{ width: 15 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 23 }, { width: 21 }];
      dailySheet.autoFilter = { from: "A6", to: `F${daily.length + 6}` };
      if (root.GrconRequestsReport?.attachBrandLogo) await root.GrconRequestsReport.attachBrandLogo(workbook, dailySheet, root.GRCONBrandAssets, root.fetch.bind(root));

      const docsSheet = workbook.addWorksheet("Documentos emitidos", { views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false, zoomScale: 80 }] });
      const docHeaders = ["DATA", "eGRDT", "FAMÍLIA", "DOCUMENTO", "REVISÃO", "TÍTULO", "DISCIPLINA", "CAMINHO DATABOOK", "QTD. ARQUIVOS", "ARQUIVOS DA EMISSÃO"];
      for (let r = 1; r <= 3; r += 1) for (let c = 1; c <= docHeaders.length; c += 1) docsSheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      docsSheet.mergeCells(`C1:${columnLetter(docHeaders.length)}2`); docsSheet.getCell("C1").value = "GRCON · DOCUMENTOS EMITIDOS"; docsSheet.getCell("C1").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
      docsSheet.mergeCells(`A4:${columnLetter(docHeaders.length)}4`); docsSheet.getCell("A4").value = "Rastreabilidade documento a documento das emissões consideradas no Dashboard."; docsSheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
      docHeaders.forEach((header, index) => docsSheet.getCell(6, index + 1).value = header); styleExcelHeader(docsSheet.getRow(6));
      documentRows.forEach((item, index) => {
        const row = docsSheet.getRow(index + 7);
        row.values = [dateLabel(item.date, true), item.egrdt, item.family, item.document, item.revision, item.title, item.discipline, item.databook, item.fileCount, item.files];
        styleExcelData(row, index);
      });
      docsSheet.columns = [{ width: 14 }, { width: 36 }, { width: 12 }, { width: 44 }, { width: 12 }, { width: 44 }, { width: 20 }, { width: 42 }, { width: 14 }, { width: 55 }];
      docsSheet.autoFilter = { from: "A6", to: `${columnLetter(docHeaders.length)}${documentRows.length + 6}` };
      if (root.GrconRequestsReport?.attachBrandLogo) await root.GrconRequestsReport.attachBrandLogo(workbook, docsSheet, root.GRCONBrandAssets, root.fetch.bind(root));

      const buffer = await workbook.xlsx.writeBuffer();
      const validation = new root.ExcelJS.Workbook();
      await validation.xlsx.load(buffer);
      if (!validation.getWorksheet("Dashboard") || !validation.getWorksheet("Emissões diárias") || !validation.getWorksheet("Documentos emitidos")) throw new Error("A planilha do Dashboard não pôde ser validada.");
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `GRCON_DASHBOARD_EMISSOES_${(dashboardStart || daily[0].date).replace(/-/g, "")}_A_${(dashboardEnd || daily[daily.length - 1].date).replace(/-/g, "")}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); root.setTimeout(() => URL.revokeObjectURL(url), 15000);
      notify("Planilha do Dashboard gerada com resumo, gráfico, emissões diárias e documentos.", "success");
    } catch (error) {
      console.error("GRCON: falha ao exportar Dashboard", error);
      notify(error && error.message || "Não foi possível gerar a planilha do Dashboard.", "error");
    } finally {
      exporting = false;
      if (button) { button.disabled = false; button.textContent = "Exportar Excel"; }
    }
  }

  function initDashboard() {
    installDashboardStyles();
    createDashboardNavigation();
    createDashboardModule();
    dashboardBuilt = true;
    applyQuickRange("30");
    bindDashboardControls();
    renderDashboard();
  }

  function init() {
    removeResumeBand();
    bindHistorySummary();
    initDashboard();
    return true;
  }

  root.GrconRetomar = Object.freeze({
    init,
    _debug: Object.freeze({ legacyResumeContract }),
    render() {
      removeResumeBand();
      scheduleHistorySummary();
      scheduleDashboard();
    },
  });

  root.GrconHistoryDashboard = Object.freeze({
    activate: activateDashboard,
    render: renderDashboard,
    exportExcel: exportDashboardExcel,
    _debug: Object.freeze({ buildDashboardDailyData, filterRecordsByPeriod, emittedDocuments, totalsFromDaily }),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
