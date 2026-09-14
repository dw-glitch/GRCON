(function (root) {
  "use strict";

  const Core = root.GrconSigemPwDashboard;
  const MODULE_ID = "sigem-pw-dashboard-module";
  const PAGE_SIZE = 100;
  const PRE_STAGE7_RESET_KEY = "sigem-pw-stage7-preupdate-reset-v1";
  const LISTS = Object.freeze({
    differences: "Diferenças", sigem: "Postado no SIGEM", pw: "Cadastrado no PW",
    toRegisterPw: "Cadastrar no PW", pwNotEmitted: "PW não emitido",
    pwExclusive: "Somente no PW", aligned: "Alinhado e emitido",
  });
  const state = {
    ready: false, busy: false,
    sigem: { meta: null, records: [] }, pw: { meta: null, records: [] }, ld: { meta: null, records: [] },
    history: { version: 3, snapshots: [] }, model: null, result: null, readiness: null,
    filters: { documentClass: "", query: "" }, activeList: "differences", page: 1,
  };
  let shell = null;
  let refreshPromise = null;

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function escapeHtml(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function fmtDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date) : "—";
  }
  function notify(message, kind) { if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info"); else if (kind === "error") root.alert(message); }
  function icon(path) { return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${path}"></path></svg>`; }

  function ensureStyles() {
    if (document.getElementById("grcon-sigem-pw-dashboard-style")) return;
    const style = document.createElement("style");
    style.id = "grcon-sigem-pw-dashboard-style";
    style.textContent = `
      #${MODULE_ID}{--spw-sigem:#0b7895;--spw-pw:#6d4ac7;--spw-issued:#b16a16;--spw-ok:#238560;min-width:0}
      .spw-page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.spw-page-heading>div>span,.spw-kicker{display:block;font-size:.68rem;font-weight:900;letter-spacing:.1em;color:var(--brand-700,#155c8a);margin-bottom:4px}.spw-page-heading h2{margin:0;color:var(--text-strong,#183247);font-size:1.45rem}.spw-page-heading p{max-width:880px;margin:6px 0 0;color:var(--text-muted,#66798a);font-size:.88rem}.spw-heading-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.spw-heading-actions button,.spw-base-actions button{display:inline-flex;align-items:center;gap:7px}.spw-heading-actions svg,.spw-base-actions svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8}
      .spw-progress{display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:10px;background:var(--brand-50,#eaf5fb);color:var(--brand-800,#0f537a);font-size:.78rem;font-weight:800;margin-bottom:10px}.spw-progress i{width:15px;height:15px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spw-spin .7s linear infinite}@keyframes spw-spin{to{transform:rotate(360deg)}}
      .spw-readiness{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;margin-bottom:10px;padding:10px 13px;border:1px solid var(--border,#dce4eb);border-left:5px solid var(--brand-500,#2382ad);border-radius:11px;background:var(--surface,#fff);color:var(--text-strong,#183247)}.spw-readiness[data-status="ready"]{border-left-color:var(--success-500,#2f8a64);background:#f2fbf7}.spw-readiness[data-status="partial"]{border-left-color:var(--warning-500,#c68a28);background:#fffaf0}.spw-readiness[data-status="attention"]{border-left-color:var(--danger-500,#c74b43);background:#fff6f5}.spw-readiness-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:rgba(35,130,173,.12);font-weight:900}.spw-readiness[data-status="ready"] .spw-readiness-icon{background:rgba(47,138,100,.13);color:#216d4d}.spw-readiness[data-status="attention"] .spw-readiness-icon{background:rgba(199,75,67,.12);color:#9d342f}.spw-readiness strong,.spw-readiness small{display:block}.spw-readiness small{margin-top:2px;color:var(--text-muted,#66798a);font-size:.72rem;line-height:1.4}.spw-readiness details{font-size:.68rem;color:var(--text-muted,#66798a)}.spw-readiness summary{cursor:pointer;font-weight:800;white-space:nowrap}.spw-readiness-checks{display:grid;gap:4px;margin-top:7px;min-width:290px}.spw-readiness-checks span{display:block}.spw-readiness-checks .fail{color:var(--danger-700,#9d342f);font-weight:800}
      .spw-base-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px}.spw-base-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:13px 14px;border:1px solid var(--border,#dce4eb);border-radius:14px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(32,56,85,.04)}.spw-base-card span{display:block;font-size:.65rem;font-weight:900;letter-spacing:.075em;color:var(--brand-700,#155c8a)}.spw-base-card strong{display:block;margin-top:4px;color:var(--text-strong,#183247);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spw-base-card small,.spw-base-card em{display:block;margin-top:3px;color:var(--text-muted,#66798a);font-size:.7rem;font-style:normal}.spw-base-card em{margin-top:7px;font-weight:800}.spw-base-actions{display:flex;justify-content:flex-end}
      .spw-system-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.spw-system-card{position:relative;overflow:hidden;padding:16px;border:1px solid var(--border,#dce4eb);border-radius:15px;background:var(--surface,#fff);box-shadow:0 6px 22px rgba(32,56,85,.05)}.spw-system-card:before{content:"";position:absolute;inset:0 auto 0 0;width:5px;background:var(--spw-sigem)}.spw-system-card.pw:before{background:var(--spw-pw)}.spw-system-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.spw-system-head h3{margin:0;font-size:1.08rem;color:var(--text-strong,#183247)}.spw-system-head small{display:block;margin-top:4px;color:var(--text-muted,#66798a)}.spw-system-total{text-align:right}.spw-system-total span{display:block;font-size:.65rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-system-total strong{display:block;margin-top:3px;font-size:2rem;line-height:1;color:var(--text-strong,#183247)}.spw-system-split{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:15px}.spw-system-card.pw .spw-system-split{grid-template-columns:repeat(4,1fr)}.spw-system-split div{padding:10px;border-radius:11px;background:var(--surface-soft,#f5f8fa)}.spw-system-split span{display:block;font-size:.63rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#66798a)}.spw-system-split strong{display:block;margin-top:5px;font-size:1.08rem;color:var(--text-strong,#183247)}
      .spw-actions-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:10px}.spw-kpi{position:relative;overflow:hidden;min-height:92px;padding:12px 13px;border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(32,56,85,.04)}.spw-kpi:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--danger-500,#c74b43)}.spw-kpi.warn:before{background:var(--spw-issued)}.spw-kpi.pw:before{background:var(--spw-pw)}.spw-kpi.ok:before{background:var(--spw-ok)}.spw-kpi span{display:block;font-size:.65rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#687b8c)}.spw-kpi strong{display:block;margin-top:8px;font-size:1.5rem;line-height:1;color:var(--text-strong,#17324a)}.spw-kpi small{display:block;margin-top:8px;color:var(--text-muted,#66798a);font-size:.7rem}
      .spw-list-card{border:1px solid var(--border,#dce4eb);border-radius:14px;background:var(--surface,#fff);box-shadow:0 6px 22px rgba(32,56,85,.045);overflow:hidden}.spw-list-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 15px 10px}.spw-list-head strong{display:block;color:var(--text-strong,#183247);font-size:1rem}.spw-list-head small{display:block;margin-top:4px;color:var(--text-muted,#66798a)}.spw-list-tabs{display:flex;gap:6px;overflow-x:auto;padding:0 15px 10px}.spw-list-tabs button{white-space:nowrap;border:1px solid var(--border,#dce4eb);border-radius:999px;background:var(--surface,#fff);color:var(--text-muted,#66798a);padding:6px 10px;font:inherit;font-size:.72rem;font-weight:800;cursor:pointer}.spw-list-tabs button.active{background:var(--brand-50,#eaf5fb);border-color:var(--brand-300,#8ecae4);color:var(--brand-800,#0f537a)}.spw-list-filters{display:grid;grid-template-columns:minmax(240px,1fr) 190px auto;gap:8px;padding:10px 15px;border-top:1px solid var(--border,#edf1f4);background:var(--surface-soft,#f8fafb)}.spw-list-filters input,.spw-list-filters select{min-height:38px}.spw-table-wrap{max-height:560px;overflow:auto;border-top:1px solid var(--border,#e6ebef)}.spw-table-wrap table{width:100%;border-collapse:collapse;font-size:.76rem}.spw-table-wrap th,.spw-table-wrap td{padding:9px 10px;border-bottom:1px solid var(--border,#edf1f4);text-align:left;vertical-align:top}.spw-table-wrap thead th{position:sticky;top:0;z-index:1;background:var(--surface-soft,#f6f9fb);font-size:.63rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#637587)}.spw-table-wrap tbody tr:hover{background:var(--surface-soft,#f8fafc)}.spw-code{min-width:310px;font-weight:800;color:var(--text-strong,#183247);word-break:break-word}.spw-pill{display:inline-flex;padding:3px 7px;border-radius:999px;background:var(--brand-50,#eaf5fb);color:var(--brand-800,#0f537a);font-size:.65rem;font-weight:900;white-space:nowrap}.spw-situation{font-weight:800}.spw-situation.danger{color:var(--danger-700,#9c332c)}.spw-situation.warn{color:#9a5b0d}.spw-situation.ok{color:#1e7656}.spw-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 15px;color:var(--text-muted,#66798a);font-size:.73rem}.spw-pager-actions{display:flex;align-items:center;gap:7px}.spw-empty{display:grid;place-items:center;text-align:center;min-height:220px;padding:24px;color:var(--text-muted,#687b8c)}.spw-empty strong{display:block;color:var(--text-strong,#244158);font-size:1rem;margin-bottom:4px}
      .spw-history{width:min(880px,calc(100vw - 28px));max-height:min(720px,calc(100vh - 28px));padding:0;border:0;border-radius:16px;background:var(--surface,#fff);color:var(--text-strong,#183247);box-shadow:0 24px 70px rgba(10,35,52,.28)}.spw-history::backdrop{background:rgba(12,34,48,.52)}.spw-history-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 17px;border-bottom:1px solid var(--border,#dce4eb)}.spw-history-head h3{margin:0}.spw-history-body{max-height:580px;overflow:auto;padding:10px 17px 17px}.spw-history-row{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border,#edf1f4)}.spw-history-row strong,.spw-history-row small{display:block}.spw-history-row small{margin-top:3px;color:var(--text-muted,#66798a)}.spw-history-kind{font-size:.65rem;font-weight:900;color:var(--brand-700,#155c8a)}.spw-current{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:999px;background:#e6f6ef;color:#1e7656;font-size:.6rem;font-weight:900}
      @media(max-width:1180px){.spw-base-grid{grid-template-columns:1fr}.spw-actions-grid{grid-template-columns:repeat(2,1fr)}.spw-system-card.pw .spw-system-split{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:820px){.spw-system-grid{grid-template-columns:1fr}.spw-page-heading{display:grid}.spw-heading-actions{justify-content:flex-start}.spw-list-filters{grid-template-columns:1fr}.spw-history-row{grid-template-columns:70px minmax(0,1fr)}.spw-readiness{grid-template-columns:auto minmax(0,1fr)}.spw-readiness details{grid-column:1/-1}.spw-readiness-checks{min-width:0}}
      @media(max-width:560px){.spw-actions-grid,.spw-system-split,.spw-system-card.pw .spw-system-split{grid-template-columns:1fr}.spw-system-head{display:grid}.spw-system-total{text-align:left}.spw-history-row{grid-template-columns:1fr}.spw-code{min-width:240px}}
    `;
    document.head.appendChild(style);
  }

  function createShell() {
    ensureStyles();
    shell = document.getElementById(MODULE_ID);
    if (!shell) { shell = document.createElement("section"); shell.id = MODULE_ID; shell.className = "module-view"; shell.hidden = true; document.querySelector("main.workspace")?.appendChild(shell); }
    shell.setAttribute("role", "tabpanel"); shell.setAttribute("aria-label", "Dashboard SIGEM × ProjectWise");
    shell.innerHTML = `
      <header class="spw-page-heading"><div><span>CONTROLE DOCUMENTAL INTEGRADO</span><h2>Dashboard SIGEM × ProjectWise</h2><p>Comparação por código + revisão, limitada às classes ET e N-1710 da LD da Qualidade.</p></div><div class="spw-heading-actions"><button class="secondary-button" id="spw-history-open" type="button">${icon("M4 6h16M6 3h12l1 3H5l1-3M7 9v9h10V9M10 12h4")}<span>Gerenciar histórico</span></button><button class="primary-button" id="spw-export" type="button">${icon("M12 3v12M8 11l4 4 4-4M5 19h14")}<span>Exportar lista</span></button></div></header>
      <div class="spw-progress" id="spw-progress" hidden><i></i><span>Processando base…</span></div>
      <section class="spw-readiness" id="spw-readiness" data-status="empty" aria-live="polite"></section>
      <section class="spw-base-grid" aria-label="Bases vigentes">
        <article class="spw-base-card"><div id="spw-sigem-base"></div><div class="spw-base-actions"><button class="secondary-button" id="spw-sigem-update" type="button">${icon("M12 3v12M8 7l4-4 4 4M5 14v5h14v-5")}<span>Atualizar Consulta Geral</span></button><input id="spw-sigem-file" hidden type="file" accept=".xlsx,.xls,.xlsm"/></div></article>
        <article class="spw-base-card"><div id="spw-pw-base"></div><div class="spw-base-actions"><button class="secondary-button" id="spw-pw-update" type="button">${icon("M12 3v12M8 7l4-4 4 4M5 14v5h14v-5")}<span>Atualizar base PW</span></button><input id="spw-pw-file" hidden type="file" accept=".csv,.txt,text/csv"/></div></article>
        <article class="spw-base-card"><div id="spw-ld-base"></div><div class="spw-base-actions"><button class="secondary-button" id="spw-ld-update" type="button">${icon("M12 3v12M8 7l4-4 4 4M5 14v5h14v-5")}<span>Atualizar LD da Qualidade</span></button><input id="spw-ld-file" hidden type="file" accept=".xlsx,.xls,.xlsm"/></div></article>
      </section>
      <section class="spw-system-grid" id="spw-system-grid" aria-label="Totais SIGEM e ProjectWise"></section><section class="spw-actions-grid" id="spw-actions-grid" aria-label="Diferenças entre as bases"></section>
      <section class="spw-list-card"><header class="spw-list-head"><div><span class="spw-kicker">RELAÇÃO DETALHADA</span><strong id="spw-list-title">Diferenças</strong><small>Documentos e revisões que exigem conferência ou ação.</small></div></header><div class="spw-list-tabs" id="spw-list-tabs"></div><div class="spw-list-filters"><input id="spw-query" type="search" placeholder="Pesquisar código, revisão, status ou situação" aria-label="Pesquisar na lista"/><select id="spw-class" aria-label="Filtrar classe"><option value="">ET e N-1710</option><option value="ET">ET</option><option value="N-1710">N-1710</option></select><button class="text-button" id="spw-clear" type="button">Limpar filtros</button></div><div class="spw-table-wrap" id="spw-table"></div><div class="spw-pager"><span id="spw-page-info"></span><div class="spw-pager-actions"><button class="secondary-button" id="spw-prev" type="button">Anterior</button><button class="secondary-button" id="spw-next" type="button">Próxima</button></div></div></section>
      <dialog class="spw-history" id="spw-base-history"><header class="spw-history-head"><div><span class="spw-kicker">BASES IMPORTADAS</span><h3>Gerenciar histórico</h3></div><button class="secondary-button" id="spw-base-history-close" type="button">Fechar</button></header><div class="spw-history-body" id="spw-base-history-body"></div></dialog>`;
    bind(); return shell;
  }

  function el(id) { return shell?.querySelector(`#${id}`); }
  function bindFile(buttonId, inputId, importer) {
    el(buttonId)?.addEventListener("click", () => el(inputId)?.click());
    el(inputId)?.addEventListener("change", (event) => { const file = event.target.files && event.target.files[0]; event.target.value = ""; if (file) void importer(file); });
  }
  function bind() {
    bindFile("spw-sigem-update", "spw-sigem-file", importSigem); bindFile("spw-pw-update", "spw-pw-file", importPw); bindFile("spw-ld-update", "spw-ld-file", importLd);
    el("spw-class")?.addEventListener("change", () => { state.filters.documentClass = el("spw-class").value; state.page = 1; renderFromModel(false); });
    el("spw-query")?.addEventListener("input", () => { state.filters.query = el("spw-query").value; state.page = 1; renderList(); });
    el("spw-clear")?.addEventListener("click", () => { state.filters = { documentClass: "", query: "" }; state.page = 1; el("spw-class").value = ""; el("spw-query").value = ""; renderFromModel(false); });
    el("spw-list-tabs")?.addEventListener("click", (event) => { const button = event.target.closest("button[data-list]"); if (!button || !LISTS[button.dataset.list]) return; state.activeList = button.dataset.list; state.page = 1; renderList(); });
    el("spw-prev")?.addEventListener("click", () => { state.page = Math.max(1, state.page - 1); renderList(); }); el("spw-next")?.addEventListener("click", () => { state.page += 1; renderList(); });
    el("spw-export")?.addEventListener("click", () => void exportCurrentList()); el("spw-history-open")?.addEventListener("click", () => void openHistory()); el("spw-base-history-close")?.addEventListener("click", () => el("spw-base-history")?.close());
    el("spw-base-history-body")?.addEventListener("click", (event) => { const button = event.target.closest("button[data-delete-snapshot]"); if (button) void removeSnapshot(button.dataset.deleteSnapshot); });
  }
  function setBusy(busy, label) {
    state.busy = busy; const progress = el("spw-progress"); if (progress) { progress.hidden = !busy; progress.querySelector("span").textContent = label || "Processando base…"; }
    ["spw-sigem-update", "spw-pw-update", "spw-ld-update", "spw-history-open", "spw-export", "spw-clear"].forEach((id) => { if (el(id)) el(id).disabled = busy; });
  }
  async function yieldFrame() { await new Promise((resolve) => root.requestAnimationFrame ? root.requestAnimationFrame(resolve) : root.setTimeout(resolve, 0)); }
  async function ensureConferenceRuntime() { if (!root.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível."); await root.GRCONModuleLoader.ensure("posting_conference_core.js"); return root.GrconPostingConference; }

  function sheetMatrix(sheet, maxColumns) {
    const XLSX = root.XLSX; if (!sheet || !sheet["!ref"] || !XLSX?.utils) return [];
    const range = XLSX.utils.decode_range(sheet["!ref"]); const endColumn = Math.min(range.e.c, Math.max(1, Number(maxColumns) || 40) - 1); const output = [];
    for (let row = range.s.r; row <= range.e.r; row += 1) { const values = []; for (let column = range.s.c; column <= endColumn; column += 1) { const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]; values[column - range.s.c] = cell ? text(cell.w !== undefined ? cell.w : cell.v) : ""; } output.push(values); }
    return output;
  }
  function validateSigemWorkbook(workbook, Conference) {
    let best = null;
    (workbook?.SheetNames || []).forEach((sheetName) => { const detection = Conference.detectColumns(sheetMatrix(workbook.Sheets[sheetName], 80).slice(0, 40), 40); if (detection && (!best || detection.score > best.detection.score)) best = { sheetName, detection }; });
    if (!best) throw new Error("Consulta Geral inválida: não foi possível localizar Documento e Revisão nas primeiras linhas.");
    if (["document", "revision", "status", "documentType"].some((field) => best.detection.columns[field] < 0)) throw new Error("Consulta Geral inválida: faltam Documento, Revisão, Status ou Tipo de documento. A base vigente foi preservada.");
    return best;
  }

  async function rollbackStagedImport(recorded, dashboardWrites) {
    const History = root.GrconSigemPwHistory;
    const failures = [];
    try {
      if (Array.isArray(dashboardWrites) && dashboardWrites.length) await Core.kvSetMany(dashboardWrites);
    } catch (error) { failures.push(`base ativa: ${error.message || "falha de restauração"}`); }
    try {
      if (recorded?.rollbackToken && History?.rollbackRecordedActiveBases) {
        await History.rollbackRecordedActiveBases(recorded);
      }
    } catch (error) { failures.push(`histórico: ${error.message || "falha de restauração"}`); }
    if (failures.length) throw new Error(`A recuperação automática não foi concluída (${failures.join("; ")}).`);
  }

  async function registerHistoryBeforeActivation(system, candidate, options) {
    const History = root.GrconSigemPwHistory;
    const Management = root.GrconSigemPwHistoryManagement;
    if (!History?.recordActiveBases || !History?.rollbackRecordedActiveBases || !Management?.capturePayload) {
      throw new Error("O histórico evolutivo não está disponível. A base vigente foi preservada.");
    }
    const values = options || {};
    const sigemBase = system === "sigem" ? candidate : values.sigemBase || state.sigem;
    const pwBase = system === "pw" ? candidate : values.pwBase || state.pw;
    const ldRecords = Array.isArray(values.ldRecords) ? values.ldRecords : state.ld.records || [];
    const recordedAt = text(values.recordedAt) || text(candidate.meta.importedAt) || new Date().toISOString();
    let recorded = null;
    try {
      recorded = await History.recordActiveBases(sigemBase, pwBase, {
        recordedAt,
        effectiveAt: recordedAt,
        changedSystem: system,
        reason: values.reason || "validated-import-before-activation",
        ldRecords,
      });
      const source = recorded && recorded[system];
      if (!source?.snapshot?.id) throw new Error("Snapshot da base validada não foi confirmado.");
      await Management.capturePayload(system, candidate, source.snapshot.id, { sigemBase, pwBase, ldRecords });
      return recorded;
    } catch (error) {
      if (recorded?.rollbackToken) {
        try { await History.rollbackRecordedActiveBases(recorded); }
        catch (rollbackError) {
          throw new Error(`A nova base não foi ativada, mas a recuperação do histórico falhou. ${rollbackError.message || "Reabra o GRCON antes de tentar novamente."}`);
        }
      }
      throw new Error(`A nova base foi validada, mas não pôde ser registrada no histórico e não foi ativada. ${error.message || "Tente novamente."}`);
    }
  }

  async function importSigem(file) {
    setBusy(true, "Validando e indexando a Consulta Geral…"); await yieldFrame();
    try {
      await root.GRCONModuleLoader.ensure("xlsx");
      const Conference = await ensureConferenceRuntime();
      if (!Conference?.prepareWorkbookImport || !Conference?.commitPreparedImport) throw new Error("Fluxo seguro da Consulta Geral indisponível.");
      const workbook = root.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: false });
      validateSigemWorkbook(workbook, Conference);
      const importedAt = new Date().toISOString();
      const result = await Conference.prepareWorkbookImport(
        workbook,
        { fileName: file.name, fileSize: file.size, lastModified: file.lastModified, importedAt },
        root.GrconHistory?.read?.() || [],
        { now: importedAt, reason: "sigem-pw-dashboard" }
      );
      const candidate = { meta: result.parsed.meta, records: result.parsed.records };
      const previousHistory = state.history;
      const recorded = await registerHistoryBeforeActivation("sigem", candidate, { reason: "sigem-import" });
      let saved;
      try {
        saved = await Core.saveSigemBase(candidate);
        await Conference.commitPreparedImport(result);
      } catch (error) {
        try {
          await rollbackStagedImport(recorded, [
            [Core.SIGEM_BASE_KEY, state.sigem],
            [Core.HISTORY_KEY, previousHistory],
          ]);
        } catch (rollbackError) {
          throw new Error(`${error.message || "Falha ao ativar a Consulta Geral."} ${rollbackError.message}`);
        }
        throw new Error(`${error.message || "Falha ao ativar a Consulta Geral."} A base anterior e o histórico foram restaurados.`);
      }
      state.sigem = saved;
      state.history = await Core.loadHistory();
      rebuildModel();
      renderFromModel(true);
      root.dispatchEvent(new CustomEvent("grcon:conference-updated", { detail: { summary: result.summary, changes: result.changes, baseMeta: state.sigem.meta, source: "sigem-pw-dashboard" } }));
      notify(`Consulta Geral atualizada: ${fmt(state.model.sigemEntries.size)} registros/revisões ET e N-1710.`, "success");
    } catch (error) { console.error("[SIGEM×PW] Consulta Geral:", error); notify(error.message || "Não foi possível atualizar a Consulta Geral. A última base válida foi mantida.", "error"); } finally { setBusy(false); }
  }
  async function parsePwFile(file, fileMeta) {
    if (typeof Worker === "undefined") return Core.parsePwCsv(await file.text(), fileMeta); const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => { let worker; try { worker = new Worker(new URL("workers/sigem_pw_dashboard.worker.js", document.baseURI)); } catch (error) { reject(error); return; } const cleanup = () => worker.terminate(); worker.addEventListener("message", (event) => { const payload = event.data || {}; cleanup(); payload.ok && payload.parsed ? resolve(payload.parsed) : reject(new Error(payload.error || "Falha ao processar a base ProjectWise.")); }, { once: true }); worker.addEventListener("error", (event) => { cleanup(); reject(event.error || new Error(event.message || "Worker da base ProjectWise falhou.")); }, { once: true }); worker.postMessage({ buffer, meta: fileMeta }, [buffer]); }).catch(async (error) => { console.warn("[SIGEM×PW] Worker PW indisponível; usando processamento local:", error); return Core.parsePwCsv(await file.text(), fileMeta); });
  }
  async function importPw(file) {
    setBusy(true, "Validando e indexando a base ProjectWise…"); await yieldFrame();
    try {
      if (!/\.(?:csv|txt)$/i.test(file.name || "")) throw new Error("A relação ProjectWise deve ser fornecida em CSV.");
      const importedAt = new Date().toISOString();
      const parsed = await parsePwFile(file, { fileName: file.name, fileSize: file.size, lastModified: file.lastModified, importedAt });
      const candidate = Core.sanitizePwBase({ meta: parsed.meta, records: parsed.records }, state.ld);
      const previousHistory = state.history;
      const recorded = await registerHistoryBeforeActivation("pw", candidate, { reason: "pw-import" });
      let saved;
      try {
        saved = await Core.savePwBase(candidate, state.ld);
      } catch (error) {
        try {
          await rollbackStagedImport(recorded, [
            [Core.PW_BASE_KEY, state.pw],
            [Core.HISTORY_KEY, previousHistory],
          ]);
        } catch (rollbackError) {
          throw new Error(`${error.message || "Falha ao ativar a base ProjectWise."} ${rollbackError.message}`);
        }
        throw new Error(`${error.message || "Falha ao ativar a base ProjectWise."} A base anterior e o histórico foram restaurados.`);
      }
      state.pw = saved;
      state.history = await Core.loadHistory();
      rebuildModel();
      renderFromModel(true);
      root.dispatchEvent(new CustomEvent("grcon:pw-base-updated", { detail: { baseMeta: state.pw.meta, source: "sigem-pw-dashboard" } }));
      notify(`Base PW atualizada: ${fmt(state.model.pwEntries.size)} registros/revisões válidos no universo ET e N-1710.`, "success");
    } catch (error) { console.error("[SIGEM×PW] ProjectWise:", error); notify(error.message || "Não foi possível atualizar a base ProjectWise. A última base válida foi mantida.", "error"); } finally { setBusy(false); }
  }
  async function importLd(file) {
    setBusy(true, "Lendo o universo N-1710 da LD da Qualidade…"); await yieldFrame();
    try {
      await root.GRCONModuleLoader.ensure("xlsx");
      const workbook = root.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: false });
      const sheetName = (workbook.SheetNames || []).find((name) => Core.normalizeHeader(name) === "N 1710");
      if (!sheetName) throw new Error("LD inválida: a aba N-1710 não foi localizada.");
      const parsed = Core.parseLdMatrix(sheetMatrix(workbook.Sheets[sheetName], 40), { fileName: file.name, fileSize: file.size, lastModified: file.lastModified, importedAt: new Date().toISOString(), sheetName });
      const candidateLd = { meta: parsed.meta, records: parsed.records };
      const candidatePw = state.pw.meta ? Core.sanitizePwBase(state.pw, candidateLd) : null;
      const previousHistory = state.history;
      const recorded = candidatePw
        ? await registerHistoryBeforeActivation("pw", candidatePw, { reason: "quality-ld-revalidation", recordedAt: parsed.meta.importedAt, ldRecords: candidateLd.records })
        : null;
      let saved;
      try {
        saved = await Core.saveLdAndReprocessPw(candidateLd, state.pw);
      } catch (error) {
        try {
          await rollbackStagedImport(recorded, [
            [Core.LD_BASE_KEY, state.ld],
            [Core.PW_BASE_KEY, state.pw],
            [Core.HISTORY_KEY, previousHistory],
          ]);
        } catch (rollbackError) {
          throw new Error(`${error.message || "Falha ao ativar a LD da Qualidade."} ${rollbackError.message}`);
        }
        throw new Error(`${error.message || "Falha ao ativar a LD da Qualidade."} A LD, o PW anterior e o histórico foram restaurados.`);
      }
      state.ld = saved.ld;
      if (saved.pw) state.pw = saved.pw;
      state.history = await Core.loadHistory();
      rebuildModel();
      renderFromModel(true);
      if (saved.pw) root.dispatchEvent(new CustomEvent("grcon:pw-base-updated", { detail: { baseMeta: state.pw.meta, source: "sigem-pw-dashboard-ld" } }));
      notify(`LD da Qualidade atualizada: ${fmt(parsed.meta.uniqueDocumentCount)} códigos N-1710 no universo válido.`, "success");
    } catch (error) { console.error("[SIGEM×PW] LD:", error); notify(error.message || "Não foi possível atualizar a LD da Qualidade.", "error"); } finally { setBusy(false); }
  }

  function rebuildModel() { state.model = Core.createModel(state.sigem.records || [], state.pw.records || [], state.ld.records || []); }
  function baseCard(kind, title, empty, result) {
    const base = state[kind]; if (!base.meta) return `<span>${escapeHtml(title)}</span><strong>${escapeHtml(empty)}</strong><small>Carregue uma base válida para iniciar.</small><em>${kind === "ld" ? "Sem a LD, N-1710 não entra nos cálculos." : "Base ausente não é tratada como zero."}</em>`;
    const count = kind === "sigem" ? result.quality.sigemEntries : kind === "pw" ? result.quality.pwEntries : result.quality.ldDocumentCount; const suffix = kind === "ld" ? "códigos N-1710 elegíveis" : "registros/revisões válidos";
    return `<span>${escapeHtml(title)}</span><strong title="${escapeHtml(base.meta.fileName)}">${escapeHtml(base.meta.fileName || title)}</strong><small>Atualizada em ${fmtDate(base.meta.importedAt)}</small><em>${fmt(count)} ${suffix}</em>`;
  }
  function classRow(name) { return state.result.classes.find((row) => row.documentClass === name) || { documentClass: name, sigem: 0, pwRegistered: 0, pwEmitted: 0, gapSigemToPw: 0, gapPwToEmitted: 0, pwExclusive: 0, matched: 0 }; }
  function renderBases() { el("spw-sigem-base").innerHTML = baseCard("sigem", "BASE SIGEM · CONSULTA GERAL", "Consulta Geral não carregada", state.result); el("spw-pw-base").innerHTML = baseCard("pw", "BASE PROJECTWISE", "Relação PW não carregada", state.result); el("spw-ld-base").innerHTML = baseCard("ld", "REFERÊNCIA N-1710 · LD DA QUALIDADE", "LD da Qualidade não carregada", state.result); }
  function renderSystems() {
    const s = state.result.summary; const et = classRow("ET"); const n = classRow("N-1710");
    el("spw-system-grid").innerHTML = `<article class="spw-system-card sigem"><div class="spw-system-head"><div><span class="spw-kicker">CONSULTA GERAL</span><h3>SIGEM</h3><small>Entradas postadas, contadas por código + revisão.</small></div><div class="spw-system-total"><span>Total</span><strong>${state.sigem.meta ? fmt(s.sigem) : "—"}</strong></div></div><div class="spw-system-split"><div><span>ET</span><strong>${state.sigem.meta ? fmt(et.sigem) : "—"}</strong></div><div><span>N-1710</span><strong>${state.sigem.meta && state.ld.meta ? fmt(n.sigem) : "—"}</strong></div></div></article><article class="spw-system-card pw"><div class="spw-system-head"><div><span class="spw-kicker">RELAÇÃO PROJECTWISE</span><h3>ProjectWise</h3><small>Cadastros e emissões, contados por código + revisão.</small></div><div class="spw-system-total"><span>Total cadastrado</span><strong>${state.pw.meta ? fmt(s.pwRegistered) : "—"}</strong></div></div><div class="spw-system-split"><div><span>ET</span><strong>${state.pw.meta ? fmt(et.pwRegistered) : "—"}</strong></div><div><span>N-1710</span><strong>${state.pw.meta && state.ld.meta ? fmt(n.pwRegistered) : "—"}</strong></div><div><span>Emitido</span><strong>${state.pw.meta ? fmt(s.pwEmitted) : "—"}</strong></div><div><span>Não emitido</span><strong>${state.pw.meta ? fmt(s.gapPwToEmitted) : "—"}</strong></div></div></article>`;
  }
  function kpi(label, value, css, note, available) { return `<article class="spw-kpi ${css}"><span>${escapeHtml(label)}</span><strong>${available ? fmt(value) : "—"}</strong><small>${escapeHtml(note)}</small></article>`; }
  function renderActions() {
    const s = state.result.summary; const both = Boolean(state.sigem.meta && state.pw.meta);
    el("spw-actions-grid").innerHTML = [kpi("Cadastrar no PW", s.gapSigemToPw, "", "Está no SIGEM e não foi localizado no PW", both), kpi("PW não emitido", s.gapPwToEmitted, "warn", "Cadastrado no PW, sem evidência de emissão", Boolean(state.pw.meta)), kpi("Somente no PW", s.pwExclusive, "pw", "Cadastro/revisão não localizado no SIGEM", both), kpi("Alinhado e emitido", state.result.lists.aligned.length, "ok", "Mesma entrada localizada e emitida nos dois sistemas", both)].join("");
  }
  function filteredRows() { const rows = state.result?.lists?.[state.activeList] || []; const query = Core.norm(state.filters.query); return query ? rows.filter((row) => Core.norm([row.document, row.revision, row.documentClass, row.sigemStatus, row.pwStatus, row.pwEmission, row.situation].join(" ")).includes(query)) : rows; }
  function situationClass(row) { if (row.situation === "Alinhado e emitido") return "ok"; if (row.situation.includes("não emitido")) return "warn"; return "danger"; }
  function renderList() {
    if (!state.result) return; el("spw-list-tabs").innerHTML = Object.entries(LISTS).map(([key, label]) => `<button type="button" data-list="${key}" class="${state.activeList === key ? "active" : ""}">${escapeHtml(label)} · ${fmt((state.result.lists[key] || []).length)}</button>`).join(""); el("spw-list-title").textContent = LISTS[state.activeList];
    const rows = filteredRows(); const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); state.page = Math.min(Math.max(1, state.page), pages); const start = (state.page - 1) * PAGE_SIZE; const visible = rows.slice(start, start + PAGE_SIZE);
    el("spw-table").innerHTML = visible.length ? `<table><caption>${escapeHtml(LISTS[state.activeList])}</caption><thead><tr><th>Classe</th><th>Documento</th><th>Revisão</th><th>Status SIGEM</th><th>Status PW</th><th>Emissão PW</th><th>Situação</th></tr></thead><tbody>${visible.map((row) => `<tr><td><span class="spw-pill">${escapeHtml(row.documentClass)}</span></td><td class="spw-code">${escapeHtml(row.document)}</td><td>${escapeHtml(row.revision)}</td><td>${escapeHtml(row.sigemStatus || "—")}</td><td>${escapeHtml(row.pwStatus || "—")}</td><td>${escapeHtml(row.pwEmission)}</td><td><span class="spw-situation ${situationClass(row)}">${escapeHtml(row.situation)}</span></td></tr>`).join("")}</tbody></table>` : `<div class="spw-empty"><div><strong>Nenhum registro encontrado</strong><span>Ajuste a lista ou os filtros.</span></div></div>`;
    el("spw-page-info").textContent = rows.length ? `${fmt(start + 1)}–${fmt(Math.min(start + PAGE_SIZE, rows.length))} de ${fmt(rows.length)} · página ${fmt(state.page)} de ${fmt(pages)}` : "0 registros"; el("spw-prev").disabled = state.page <= 1; el("spw-next").disabled = state.page >= pages;
  }
  function renderReadiness(unfilteredResult) {
    const Readiness = root.GrconSigemPwReadiness;
    const host = el("spw-readiness");
    if (!host || !Readiness?.assess) return;
    state.readiness = Readiness.assess(state, unfilteredResult);
    const assessment = state.readiness;
    const iconLabel = assessment.status === "ready" ? "✓" : assessment.status === "attention" ? "!" : "i";
    const applicable = assessment.checks.filter((item) => item.applicable);
    const checks = applicable.map((item) => `<span class="${item.passed ? "" : "fail"}">${item.passed ? "✓" : "!"} ${escapeHtml(item.label)}</span>`).join("");
    host.dataset.status = assessment.status;
    host.innerHTML = `<span class="spw-readiness-icon" aria-hidden="true">${iconLabel}</span><div><strong>${escapeHtml(assessment.title)}</strong><small>${escapeHtml(assessment.message)}</small></div>${applicable.length ? `<details><summary>${assessment.failedChecks.length ? fmt(assessment.failedChecks.length) + " atenção(ões)" : fmt(applicable.length) + " verificações OK"}</summary><div class="spw-readiness-checks">${checks}</div></details>` : ""}`;
  }
  function renderFromModel(resetPage) { if (!state.model) rebuildModel(); if (resetPage) state.page = 1; const readinessResult = Core.aggregateModel(state.model); state.result = Core.aggregateModel(state.model, { documentClass: state.filters.documentClass }); renderBases(); renderSystems(); renderActions(); renderList(); renderReadiness(readinessResult); }

  async function exportCurrentList() {
    try { const rows = filteredRows(); if (!rows.length) { notify("Não há registros na lista filtrada para exportar.", "info"); return; } await root.GRCONModuleLoader.ensure("xlsx"); const data = rows.map((row) => ({ Classe: row.documentClass, Documento: row.document, "Revisão": row.revision, "Status SIGEM": row.sigemStatus, "Status PW": row.pwStatus, "Emissão PW": row.pwEmission, "Situação": row.situation })); const worksheet = root.XLSX.utils.json_to_sheet(data); worksheet["!cols"] = [{ wch: 11 }, { wch: 58 }, { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 34 }]; const workbook = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(workbook, worksheet, "Relação"); const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, ""); root.XLSX.writeFile(workbook, `GRCON_SIGEM_PW_${state.activeList}_${stamp}.xlsx`, { compression: true }); notify(`Lista exportada com ${fmt(rows.length)} registros.`, "success"); }
    catch (error) { console.error("[SIGEM×PW] exportação:", error); notify(error.message || "Não foi possível exportar a lista.", "error"); }
  }
  function currentSnapshotId(kind) { return state[kind]?.meta?.snapshotId || ""; }
  function renderHistory() {
    const snapshots = [...(state.history.snapshots || [])].sort((left, right) => Core.parseDateMs(right.meta.importedAt) - Core.parseDateMs(left.meta.importedAt)); const labels = { sigem: "SIGEM", pw: "PW", ld: "LD" };
    el("spw-base-history-body").innerHTML = snapshots.length ? snapshots.map((item) => { const current = currentSnapshotId(item.meta.kind) === item.meta.snapshotId; return `<div class="spw-history-row"><div class="spw-history-kind">${labels[item.meta.kind] || "BASE"}</div><div><strong>${escapeHtml(item.meta.fileName || "Base sem nome")}${current ? '<span class="spw-current">ATUAL</span>' : ""}</strong><small>${fmtDate(item.meta.importedAt)} · ${fmt(item.records.length)} registros armazenados</small></div><button class="secondary-button" type="button" data-delete-snapshot="${escapeHtml(item.meta.snapshotId)}">Excluir</button></div>`; }).join("") : `<div class="spw-empty"><div><strong>Histórico vazio</strong><span>As próximas importações aparecerão aqui.</span></div></div>`;
  }
  async function openHistory() { state.history = await Core.loadHistory(); renderHistory(); const dialog = el("spw-base-history"); if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute("open", ""); }
  async function removeSnapshot(id) {
    const item = (state.history.snapshots || []).find((snapshot) => snapshot.meta.snapshotId === id); if (!item || !root.confirm(`Excluir a base “${item.meta.fileName || "sem nome"}” do histórico?`)) return;
    try { await Core.deleteSnapshot(id); await refreshBases("base excluída"); renderHistory(); notify("Base excluída do histórico.", "success"); } catch (error) { notify(error.message || "Não foi possível excluir a base do histórico.", "error"); }
  }
  async function clearPreStage7BasesOnce() {
    const alreadyReset = await Core.kvGet(PRE_STAGE7_RESET_KEY, false);
    if (alreadyReset) return false;
    const History = root.GrconSigemPwHistory;
    if (!History?.clearHistory) throw new Error("A limpeza segura do histórico SIGEM × PW não está disponível.");
    await History.clearHistory();
    const emptyBase = { meta: null, records: [] };
    await Core.kvSetMany([
      [Core.SIGEM_BASE_KEY, emptyBase],
      [Core.PW_BASE_KEY, emptyBase],
      [Core.LD_BASE_KEY, emptyBase],
      [Core.HISTORY_KEY, { version: Core.HISTORY_VERSION, snapshots: [], deletedIds: [] }],
      [Core.LEGACY_SIGEM_BASE_KEY, emptyBase],
      [Core.LEGACY_PW_BASE_KEY, emptyBase],
      ["confirmation-state", { version: 1, updatedAt: "", items: {} }],
      ["audit-log", []],
      [PRE_STAGE7_RESET_KEY, { completed: true, completedAt: new Date().toISOString() }],
    ]);
    try { root.localStorage?.removeItem("grcon.postingConference.historyIndex.v1"); } catch (_) { /* índice derivado */ }
    return true;
  }

  async function refreshBases(reason) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const resetApplied = await clearPreStage7BasesOnce();
        const bases = await Core.loadBases();
        state.sigem = bases.sigem?.meta ? bases.sigem : { meta: null, records: [] };
        state.pw = bases.pw?.meta ? bases.pw : { meta: null, records: [] };
        state.ld = bases.ld?.meta ? bases.ld : { meta: null, records: [] };
        state.history = bases.history || { version: 3, snapshots: [] };
        rebuildModel();
        renderFromModel(true);
        state.ready = true;
        if (resetApplied) notify("Bases anteriores SIGEM, PW e LD removidas. O módulo está pronto para novas importações.", "success");
      } catch (error) {
        console.error(`[SIGEM×PW] atualização ${reason || ""}:`, error);
        notify(error.message || "Não foi possível ler as bases persistidas do Dashboard.", "error");
      }
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function activate() { createShell(); shell.hidden = false; if (!state.ready) { setBusy(true, "Carregando bases vigentes…"); await yieldFrame(); await refreshBases("ativação"); setBusy(false); } else renderFromModel(false); }
  root.addEventListener("grcon:conference-updated", (event) => { if (event?.detail?.source !== "sigem-pw-dashboard") void refreshBases("Consulta Geral atualizada em outro módulo"); }); root.addEventListener("grcon:pw-base-updated", (event) => { if (event?.detail?.source !== "sigem-pw-dashboard") void refreshBases("base PW atualizada em outro módulo"); });
  root.GrconSigemPwDashboardUi = Object.freeze({ activate, refresh: refreshBases, clearPreStage7BasesOnce, state });
})(window);
