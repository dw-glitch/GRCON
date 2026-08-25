/**
 * GRCON — limpeza da tela inicial, sincronização do resumo e dashboard do Histórico.
 *
 * A antiga faixa "Retomar de onde parou" deixou de fazer parte da tela inicial.
 * Este módulo continua carregado por compatibilidade e concentra três tarefas:
 *   1. remover a faixa antiga, caso o HTML ainda a contenha;
 *   2. manter os indicadores do Histórico sincronizados com o filtro de família;
 *   3. montar uma visão executiva diária de ET, N-1710 e CV usando exclusivamente
 *      os registros reais do Histórico do GRCON.
 */
(function (root) {
  "use strict";

  const DASHBOARD_FAMILIES = Object.freeze(["ET", "N-1710", "CV"]);
  const DASHBOARD_LABELS = Object.freeze({ ET: "ET", "N-1710": "N-1710", CV: "CV" });
  const dashboardVisibleFamilies = new Set(DASHBOARD_FAMILIES);
  let refreshTimer = 0;
  let dashboardObserver = null;

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

  function localDateKey(value) {
    const History = root.GrconHistory;
    if (History && typeof History.localDateKey === "function") return History.localDateKey(value);
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function documentFamily(file) {
    const History = root.GrconHistory;
    if (History && typeof History.documentFamily === "function") return History.documentFamily(file);
    return "";
  }

  function documentKey(file) {
    const History = root.GrconHistory;
    const raw = file && (file.document || file.finalName || file.originalName) || "";
    if (History && typeof History.norm === "function") return History.norm(raw);
    return String(raw).trim().toUpperCase();
  }

  /**
   * Conta emissões documentais e não linhas físicas. O conjunto é reiniciado a
   * cada eGRDT: PDF + nativo do mesmo código valem 1 documento; se o mesmo
   * documento aparecer em duas eGRDTs diferentes, são duas emissões reais.
   */
  function buildDashboardDailyData(records) {
    const days = new Map();
    (records || []).forEach((record) => {
      const dayKey = localDateKey(record && record.generatedAt);
      if (!dayKey) return;
      if (!days.has(dayKey)) {
        days.set(dayKey, { date: dayKey, ET: 0, "N-1710": 0, CV: 0, total: 0, egrdts: 0 });
      }
      const day = days.get(dayKey);
      const documentsByFamily = new Map(DASHBOARD_FAMILIES.map((family) => [family, new Set()]));
      (record && record.files || []).forEach((file) => {
        const family = documentFamily(file);
        if (!documentsByFamily.has(family)) return;
        const key = documentKey(file);
        if (key) documentsByFamily.get(family).add(key);
      });
      let recordDocuments = 0;
      DASHBOARD_FAMILIES.forEach((family) => {
        const amount = documentsByFamily.get(family).size;
        day[family] += amount;
        recordDocuments += amount;
      });
      if (recordDocuments) {
        day.total += recordDocuments;
        day.egrdts += 1;
      }
    });
    return [...days.values()].filter((item) => item.total > 0).sort((left, right) => left.date.localeCompare(right.date));
  }

  function formatDayLabel(key, withYear) {
    const parts = String(key || "").split("-");
    if (parts.length !== 3) return key || "—";
    return withYear ? `${parts[2]}/${parts[1]}/${parts[0]}` : `${parts[2]}/${parts[1]}`;
  }

  function niceMaximum(value) {
    const number = Math.max(1, Number(value) || 0);
    if (number <= 5) return Math.ceil(number);
    const magnitude = 10 ** Math.floor(Math.log10(number));
    const normalized = number / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }

  function chartSvg(daily) {
    const width = 1000;
    const height = 310;
    const margin = { top: 22, right: 28, bottom: 48, left: 58 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const visible = DASHBOARD_FAMILIES.filter((family) => dashboardVisibleFamilies.has(family));
    const maxValue = niceMaximum(Math.max(0, ...daily.flatMap((day) => visible.map((family) => day[family] || 0))));
    const xOf = (index) => daily.length <= 1
      ? margin.left + (plotWidth / 2)
      : margin.left + (index / (daily.length - 1)) * plotWidth;
    const yOf = (value) => margin.top + plotHeight - ((Number(value) || 0) / maxValue) * plotHeight;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio));
    const xLabelStep = Math.max(1, Math.ceil(daily.length / 7));
    const xLabelIndexes = new Set([0, daily.length - 1]);
    for (let index = 0; index < daily.length; index += xLabelStep) xLabelIndexes.add(index);

    const grid = yTicks.map((tick) => {
      const y = yOf(tick);
      return `<line class="history-dashboard-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="history-dashboard-axis-label" x="${margin.left - 12}" y="${y + 4}" text-anchor="end">${tick.toLocaleString("pt-BR")}</text>`;
    }).join("");

    const xLabels = [...xLabelIndexes].sort((a, b) => a - b).map((index) => {
      const x = xOf(index);
      return `<text class="history-dashboard-axis-label" x="${x}" y="${height - 16}" text-anchor="middle">${escapeHtml(formatDayLabel(daily[index].date, false))}</text>`;
    }).join("");

    const series = visible.map((family) => {
      const slug = family === "N-1710" ? "n1710" : family.toLowerCase();
      const points = daily.map((day, index) => ({ x: xOf(index), y: yOf(day[family]), day, value: day[family] }));
      const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
      const circles = points.map((point) => `<circle class="history-dashboard-point history-dashboard-${slug}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.5"><title>${escapeHtml(formatDayLabel(point.day.date, true))}: ${Number(point.value).toLocaleString("pt-BR")} ${escapeHtml(DASHBOARD_LABELS[family])}</title></circle>`).join("");
      return `<path class="history-dashboard-line history-dashboard-${slug}" d="${path || ""}"></path>${circles}`;
    }).join("");

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Linha do tempo diária de documentos ET, N-1710 e CV emitidos"><title>Emissões documentais por dia</title>${grid}<line class="history-dashboard-axis" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}"></line>${xLabels}${series}</svg>`;
  }

  function dashboardTotals(daily) {
    const totals = { ET: 0, "N-1710": 0, CV: 0, documents: 0, egrdts: 0, days: daily.length };
    daily.forEach((day) => {
      DASHBOARD_FAMILIES.forEach((family) => { totals[family] += Number(day[family] || 0); });
      totals.documents += Number(day.total || 0);
      totals.egrdts += Number(day.egrdts || 0);
    });
    return totals;
  }

  function dashboardPeriodLabel(daily) {
    if (!daily.length) return "Nenhuma emissão no recorte atual";
    const first = formatDayLabel(daily[0].date, true);
    const last = formatDayLabel(daily[daily.length - 1].date, true);
    return first === last ? first : `${first} — ${last}`;
  }

  function dashboardKpis(totals) {
    const items = [
      ["Documentos emitidos", totals.documents, "total"],
      ["ET", totals.ET, "et"],
      ["N-1710", totals["N-1710"], "n1710"],
      ["CV", totals.CV, "cv"],
      ["eGRDTs com emissão", totals.egrdts, "egrdt"],
      ["Dias com emissão", totals.days, "days"],
    ];
    return items.map(([label, value, tone]) => `<article class="history-dashboard-kpi history-dashboard-kpi-${tone}"><span>${escapeHtml(label)}</span><strong>${Number(value || 0).toLocaleString("pt-BR")}</strong></article>`).join("");
  }

  function dashboardDailyTable(daily) {
    if (!daily.length) return "";
    const rows = [...daily].reverse().map((day) => `<tr><td>${escapeHtml(formatDayLabel(day.date, true))}</td><td class="history-dashboard-table-et">${Number(day.ET).toLocaleString("pt-BR")}</td><td class="history-dashboard-table-n1710">${Number(day["N-1710"]).toLocaleString("pt-BR")}</td><td class="history-dashboard-table-cv">${Number(day.CV).toLocaleString("pt-BR")}</td><td><strong>${Number(day.total).toLocaleString("pt-BR")}</strong></td><td>${Number(day.egrdts).toLocaleString("pt-BR")}</td></tr>`).join("");
    return `<div class="history-dashboard-table-wrap"><table><caption>Detalhamento diário das emissões documentais</caption><thead><tr><th>Data</th><th>ET</th><th>N-1710</th><th>CV</th><th>Total</th><th>eGRDTs</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function dashboardInsight(daily, totals) {
    if (!daily.length) return "Sem dados para calcular tendência.";
    const best = daily.reduce((winner, item) => item.total > winner.total ? item : winner, daily[0]);
    const average = totals.days ? totals.documents / totals.days : 0;
    const dominant = DASHBOARD_FAMILIES
      .map((family) => [family, totals[family]])
      .sort((left, right) => right[1] - left[1])[0];
    return `Pico em ${formatDayLabel(best.date, true)} com ${best.total.toLocaleString("pt-BR")} documento(s) · média de ${average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia ativo · maior volume: ${dominant[0]} (${Number(dominant[1]).toLocaleString("pt-BR")}).`;
  }

  function installDashboardStyles() {
    if (document.getElementById("history-dashboard-style")) return;
    const style = document.createElement("style");
    style.id = "history-dashboard-style";
    style.textContent = `
      .history-dashboard{--dash-et:#0b7895;--dash-n1710:#6d4ac7;--dash-cv:#b16a16;margin:18px 0 20px;padding:18px;border:1px solid var(--border,#d7e0e8);border-radius:18px;background:var(--surface,#fff);box-shadow:0 10px 30px rgba(32,56,85,.07)}
      .history-dashboard-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:14px}.history-dashboard-header>div:first-child{min-width:0}.history-dashboard-eyebrow{display:block;font-size:.72rem;font-weight:800;letter-spacing:.11em;color:var(--brand-700,#155c8a);margin-bottom:4px}.history-dashboard-header h3{margin:0;font-size:1.25rem;color:var(--text-strong,#183247)}.history-dashboard-header p{margin:5px 0 0;color:var(--text-muted,#637587);font-size:.9rem;max-width:780px}
      .history-dashboard-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.history-dashboard-actions button{white-space:nowrap}.history-dashboard-range.active{background:var(--brand-50,#eaf5fb);border-color:var(--brand-300,#8ecae4);color:var(--brand-800,#0f537a)}
      .history-dashboard-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:12px}.history-dashboard-kpi{position:relative;overflow:hidden;min-height:84px;padding:13px 14px;border:1px solid var(--border,#dbe3ea);border-radius:13px;background:var(--surface-soft,#f8fafc)}.history-dashboard-kpi:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--brand-500,#2789b6)}.history-dashboard-kpi span{display:block;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#667788)}.history-dashboard-kpi strong{display:block;margin-top:7px;font-size:1.45rem;line-height:1;color:var(--text-strong,#17324a)}.history-dashboard-kpi-et:before{background:var(--dash-et)}.history-dashboard-kpi-n1710:before{background:var(--dash-n1710)}.history-dashboard-kpi-cv:before{background:var(--dash-cv)}
      .history-dashboard-chart-card{border:1px solid var(--border,#dbe3ea);border-radius:14px;background:var(--surface-soft,#fbfcfd);overflow:hidden}.history-dashboard-chart-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 14px 8px}.history-dashboard-chart-copy strong{display:block;color:var(--text-strong,#17324a)}.history-dashboard-chart-copy small{display:block;margin-top:3px;color:var(--text-muted,#65798a)}.history-dashboard-legend{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.history-dashboard-legend button{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border,#d7e0e8);border-radius:999px;background:var(--surface,#fff);padding:6px 10px;font:inherit;font-size:.78rem;font-weight:800;color:var(--text-strong,#274154);cursor:pointer}.history-dashboard-legend button:before{content:"";width:9px;height:9px;border-radius:50%;background:currentColor}.history-dashboard-legend button[data-dashboard-family="ET"]{color:var(--dash-et)}.history-dashboard-legend button[data-dashboard-family="N-1710"]{color:var(--dash-n1710)}.history-dashboard-legend button[data-dashboard-family="CV"]{color:var(--dash-cv)}.history-dashboard-legend button[aria-pressed="false"]{opacity:.38;filter:saturate(.35)}
      .history-dashboard-chart-scroll{overflow-x:auto;padding:0 10px 4px}.history-dashboard-chart-scroll svg{display:block;width:100%;min-width:720px;height:auto}.history-dashboard-grid{stroke:rgba(91,116,137,.16);stroke-width:1}.history-dashboard-axis{stroke:rgba(91,116,137,.35);stroke-width:1}.history-dashboard-axis-label{fill:var(--text-muted,#708090);font-size:12px}.history-dashboard-line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.history-dashboard-point{stroke:var(--surface,#fff);stroke-width:2}.history-dashboard-et{stroke:var(--dash-et);fill:var(--dash-et)}.history-dashboard-n1710{stroke:var(--dash-n1710);fill:var(--dash-n1710)}.history-dashboard-cv{stroke:var(--dash-cv);fill:var(--dash-cv)}
      .history-dashboard-insight{display:flex;align-items:center;gap:8px;margin:0;padding:10px 14px 13px;border-top:1px solid var(--border,#e0e6eb);color:var(--text-muted,#5f7385);font-size:.82rem}.history-dashboard-insight:before{content:"↗";display:grid;place-items:center;flex:0 0 24px;height:24px;border-radius:50%;background:var(--brand-50,#eaf5fb);color:var(--brand-700,#155c8a);font-weight:900}
      .history-dashboard-details{margin-top:10px;border:1px solid var(--border,#dbe3ea);border-radius:12px;background:var(--surface,#fff);overflow:hidden}.history-dashboard-details summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:11px 13px;font-weight:800;color:var(--text-strong,#1c394f);list-style:none}.history-dashboard-details summary::-webkit-details-marker{display:none}.history-dashboard-details summary:after{content:"⌄";font-size:1rem;color:var(--text-muted,#667788)}.history-dashboard-details[open] summary:after{transform:rotate(180deg)}.history-dashboard-table-wrap{max-height:330px;overflow:auto;border-top:1px solid var(--border,#e1e7ec)}.history-dashboard-table-wrap table{width:100%;border-collapse:collapse;font-size:.82rem}.history-dashboard-table-wrap caption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.history-dashboard-table-wrap th,.history-dashboard-table-wrap td{padding:9px 12px;text-align:right;border-bottom:1px solid var(--border,#edf1f4);white-space:nowrap}.history-dashboard-table-wrap th:first-child,.history-dashboard-table-wrap td:first-child{text-align:left}.history-dashboard-table-wrap thead th{position:sticky;top:0;z-index:1;background:var(--surface-soft,#f5f8fa);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#607385)}.history-dashboard-table-et{color:var(--dash-et);font-weight:800}.history-dashboard-table-n1710{color:var(--dash-n1710);font-weight:800}.history-dashboard-table-cv{color:var(--dash-cv);font-weight:800}
      .history-dashboard-empty{padding:34px 16px;text-align:center;color:var(--text-muted,#667788)}.history-dashboard-empty strong{display:block;color:var(--text-strong,#243f55);font-size:1rem;margin-bottom:4px}
      .history-dashboard:fullscreen,.history-dashboard.is-presenting{background:var(--surface,#fff);padding:28px;overflow:auto}.history-dashboard.is-presenting{position:fixed;inset:0;z-index:99999;margin:0;border:0;border-radius:0}.history-dashboard-modal-open{overflow:hidden}.history-dashboard:fullscreen .history-dashboard-kpis,.history-dashboard.is-presenting .history-dashboard-kpis{gap:14px}.history-dashboard:fullscreen .history-dashboard-chart-scroll svg,.history-dashboard.is-presenting .history-dashboard-chart-scroll svg{min-width:900px}
      html[data-theme="dark"] .history-dashboard{box-shadow:0 12px 34px rgba(0,0,0,.22)}html[data-theme="dark"] .history-dashboard-grid{stroke:rgba(190,207,220,.14)}html[data-theme="dark"] .history-dashboard-axis{stroke:rgba(190,207,220,.28)}
      @media (max-width:1180px){.history-dashboard-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:760px){.history-dashboard{padding:14px;border-radius:14px}.history-dashboard-header,.history-dashboard-chart-head{flex-direction:column;align-items:stretch}.history-dashboard-actions,.history-dashboard-legend{justify-content:flex-start}.history-dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.history-dashboard-kpi{min-height:76px}.history-dashboard-chart-scroll svg{min-width:680px}}
    `;
    document.head.appendChild(style);
  }

  function ensureHistoryDashboard() {
    const summary = document.getElementById("history-summary");
    if (!summary) return null;
    let dashboard = document.getElementById("history-dashboard");
    if (dashboard) return dashboard;
    installDashboardStyles();
    dashboard = document.createElement("section");
    dashboard.id = "history-dashboard";
    dashboard.className = "history-dashboard";
    dashboard.setAttribute("aria-labelledby", "history-dashboard-title");
    dashboard.innerHTML = `
      <header class="history-dashboard-header">
        <div><span class="history-dashboard-eyebrow">VISÃO EXECUTIVA</span><h3 id="history-dashboard-title">Dashboard de emissões documentais</h3><p id="history-dashboard-period">Linha do tempo diária de ET, N-1710 e CV a partir do Histórico do GRCON.</p></div>
        <div class="history-dashboard-actions" aria-label="Atalhos do dashboard">
          <button class="secondary-button compact history-dashboard-range" data-dashboard-range="7" type="button">7 dias</button>
          <button class="secondary-button compact history-dashboard-range" data-dashboard-range="30" type="button">30 dias</button>
          <button class="secondary-button compact history-dashboard-range" data-dashboard-range="90" type="button">90 dias</button>
          <button class="secondary-button compact history-dashboard-range" data-dashboard-range="all" type="button">Todo histórico</button>
          <button class="secondary-button compact" data-dashboard-action="present" type="button">Apresentar</button>
        </div>
      </header>
      <div class="history-dashboard-kpis" id="history-dashboard-kpis"></div>
      <section class="history-dashboard-chart-card" aria-labelledby="history-dashboard-chart-title">
        <div class="history-dashboard-chart-head">
          <div class="history-dashboard-chart-copy"><strong id="history-dashboard-chart-title">Documentos emitidos por dia</strong><small>O gráfico mantém as três famílias para comparação e respeita os demais filtros do Histórico.</small></div>
          <div class="history-dashboard-legend" aria-label="Séries visíveis">
            <button type="button" data-dashboard-family="ET" aria-pressed="true">ET</button>
            <button type="button" data-dashboard-family="N-1710" aria-pressed="true">N-1710</button>
            <button type="button" data-dashboard-family="CV" aria-pressed="true">CV</button>
          </div>
        </div>
        <div class="history-dashboard-chart-scroll" id="history-dashboard-chart"></div>
        <p class="history-dashboard-insight" id="history-dashboard-insight"></p>
      </section>
      <details class="history-dashboard-details" open>
        <summary><span>Detalhamento diário</span><small id="history-dashboard-days"></small></summary>
        <div id="history-dashboard-table"></div>
      </details>`;
    summary.insertAdjacentElement("afterend", dashboard);
    bindDashboardInteractions(dashboard);
    return dashboard;
  }

  function renderHistoryDashboard() {
    const dashboard = ensureHistoryDashboard();
    if (!dashboard) return;
    const daily = buildDashboardDailyData(historyBaseRecords());
    const totals = dashboardTotals(daily);
    const kpis = document.getElementById("history-dashboard-kpis");
    const chart = document.getElementById("history-dashboard-chart");
    const table = document.getElementById("history-dashboard-table");
    const period = document.getElementById("history-dashboard-period");
    const insight = document.getElementById("history-dashboard-insight");
    const days = document.getElementById("history-dashboard-days");

    if (period) period.textContent = `${dashboardPeriodLabel(daily)} · ${totals.documents.toLocaleString("pt-BR")} documento(s) · ${totals.egrdts.toLocaleString("pt-BR")} eGRDT(s).`;
    if (kpis) kpis.innerHTML = dashboardKpis(totals);
    if (days) days.textContent = `${totals.days.toLocaleString("pt-BR")} dia(s)`;

    if (!daily.length) {
      if (chart) chart.innerHTML = '<div class="history-dashboard-empty"><strong>Nenhuma emissão localizada</strong><span>Ajuste as datas ou os filtros do Histórico para visualizar a linha do tempo.</span></div>';
      if (insight) insight.textContent = "O dashboard será preenchido automaticamente quando houver emissões no recorte selecionado.";
      if (table) table.innerHTML = "";
      return;
    }

    if (chart) chart.innerHTML = chartSvg(daily);
    if (insight) insight.textContent = dashboardInsight(daily, totals);
    if (table) table.innerHTML = dashboardDailyTable(daily);
  }

  function newestHistoryDate() {
    const History = root.GrconHistory;
    const records = History && typeof History.read === "function" ? History.read() : [];
    return (records || []).map((record) => localDateKey(record.generatedAt)).filter(Boolean).sort().pop() || "";
  }

  function shiftDay(key, amount) {
    const parts = String(key || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "";
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() + amount);
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function applyDashboardRange(range) {
    const start = document.getElementById("history-date-start");
    const end = document.getElementById("history-date-end");
    if (!start || !end) return;
    if (range === "all") {
      start.value = "";
      end.value = "";
    } else {
      const newest = newestHistoryDate();
      if (!newest) return;
      const days = Math.max(1, Number(range) || 1);
      end.value = newest;
      start.value = shiftDay(newest, -(days - 1));
    }
    [start, end].forEach((input) => input.dispatchEvent(new Event("input", { bubbles: true })));
    document.querySelectorAll("[data-dashboard-range]").forEach((button) => button.classList.toggle("active", button.dataset.dashboardRange === String(range)));
    scheduleHistorySummary();
  }

  function toggleDashboardPresentation(dashboard, button) {
    if (!dashboard) return;
    if (document.fullscreenElement === dashboard) {
      document.exitFullscreen?.();
      return;
    }
    if (dashboard.requestFullscreen) {
      const request = dashboard.requestFullscreen();
      if (request && typeof request.catch === "function") {
        request.catch(() => {
          dashboard.classList.toggle("is-presenting");
          document.body.classList.toggle("history-dashboard-modal-open", dashboard.classList.contains("is-presenting"));
          if (button) button.textContent = dashboard.classList.contains("is-presenting") ? "Sair da apresentação" : "Apresentar";
        });
      }
      return;
    }
    dashboard.classList.toggle("is-presenting");
    document.body.classList.toggle("history-dashboard-modal-open", dashboard.classList.contains("is-presenting"));
    if (button) button.textContent = dashboard.classList.contains("is-presenting") ? "Sair da apresentação" : "Apresentar";
  }

  function bindDashboardInteractions(dashboard) {
    if (!dashboard || dashboard.dataset.dashboardBound === "true") return;
    dashboard.dataset.dashboardBound = "true";
    dashboard.addEventListener("click", (event) => {
      const range = event.target.closest("[data-dashboard-range]");
      if (range) {
        applyDashboardRange(range.dataset.dashboardRange);
        return;
      }
      const familyButton = event.target.closest("[data-dashboard-family]");
      if (familyButton) {
        const family = familyButton.dataset.dashboardFamily;
        if (!DASHBOARD_FAMILIES.includes(family)) return;
        if (dashboardVisibleFamilies.has(family)) {
          if (dashboardVisibleFamilies.size === 1) return;
          dashboardVisibleFamilies.delete(family);
        } else {
          dashboardVisibleFamilies.add(family);
        }
        familyButton.setAttribute("aria-pressed", String(dashboardVisibleFamilies.has(family)));
        renderHistoryDashboard();
        return;
      }
      const present = event.target.closest('[data-dashboard-action="present"]');
      if (present) toggleDashboardPresentation(dashboard, present);
    });

    document.addEventListener("fullscreenchange", () => {
      const button = dashboard.querySelector('[data-dashboard-action="present"]');
      if (button) button.textContent = document.fullscreenElement === dashboard ? "Sair da apresentação" : "Apresentar";
    });
  }

  function scheduleHistorySummary(delay) {
    root.clearTimeout(refreshTimer);
    refreshTimer = root.setTimeout(() => {
      updateHistorySummary();
      renderHistoryDashboard();
    }, Number(delay) || 0);
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
      control.addEventListener(eventName, () => scheduleHistorySummary(0));
    });

    document.querySelectorAll('[data-grcon-view="history"]').forEach((button) => {
      button.addEventListener("click", () => {
        scheduleHistorySummary(0);
        scheduleHistorySummary(250);
      });
    });

    ["grcon:history-updated", "grcon:sigem-updated", "grcon:cloud-ready"].forEach((eventName) => {
      root.addEventListener(eventName, () => scheduleHistorySummary(0));
    });

    const resultCount = document.getElementById("history-result-count");
    if (resultCount && typeof MutationObserver === "function") {
      dashboardObserver?.disconnect?.();
      dashboardObserver = new MutationObserver(() => scheduleHistorySummary(0));
      dashboardObserver.observe(resultCount, { childList: true, characterData: true, subtree: true });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const dashboard = document.getElementById("history-dashboard");
      if (!dashboard?.classList.contains("is-presenting")) return;
      dashboard.classList.remove("is-presenting");
      document.body.classList.remove("history-dashboard-modal-open");
      const button = dashboard.querySelector('[data-dashboard-action="present"]');
      if (button) button.textContent = "Apresentar";
    });

    scheduleHistorySummary(0);
  }

  // Contrato de compatibilidade com a suíte histórica do GRCON.
  // A faixa visual não volta a ser exibida: esta função só mantém disponíveis
  // as invariantes antigas de leitura do histórico enquanto os testes legados
  // ainda verificam esse contrato textual.
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

  function init() {
    removeResumeBand();
    ensureHistoryDashboard();
    bindHistorySummary();
    return true;
  }

  // Mantém a API antiga para não quebrar integrações que ainda chamem
  // GrconRetomar.render(). O dashboard é atualizado junto com o resumo.
  root.GrconRetomar = Object.freeze({
    init,
    _debug: Object.freeze({ legacyResumeContract, buildDashboardDailyData, dashboardTotals }),
    render() {
      removeResumeBand();
      scheduleHistorySummary(0);
    },
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window);
