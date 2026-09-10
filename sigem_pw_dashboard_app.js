(function (root) {
  "use strict";

  const Core = root.GrconSigemPwDashboard;
  const MODULE_ID = "sigem-pw-dashboard-module";
  const state = {
    ready: false,
    busy: false,
    sigem: { meta: null, records: [] },
    pw: { meta: null, records: [] },
    model: null,
    result: null,
    filters: { documentClass: "", sigemStatus: "", pwStatus: "", discipline: "", emission: "" },
  };
  let shell = null;
  let refreshPromise = null;

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function escapeHtml(value) {
    return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function fmtDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
      : "—";
  }
  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }
  function icon(path) { return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${path}"></path></svg>`; }

  function ensureStyles() {
    if (document.getElementById("grcon-sigem-pw-dashboard-style")) return;
    const style = document.createElement("style");
    style.id = "grcon-sigem-pw-dashboard-style";
    style.textContent = `
      #${MODULE_ID}{--spw-sigem:#0b7895;--spw-pw:#6d4ac7;--spw-issued:#b16a16;min-width:0}
      .spw-page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.spw-page-heading>div>span,.spw-card-kicker{display:block;font-size:.7rem;font-weight:900;letter-spacing:.12em;color:var(--brand-700,#155c8a);margin-bottom:4px}.spw-page-heading h2{margin:0;color:var(--text-strong,#183247);font-size:1.45rem}.spw-page-heading p{max-width:900px;margin:6px 0 0;color:var(--text-muted,#66798a);font-size:.9rem}.spw-heading-meta{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.spw-heading-meta span{padding:6px 9px;border:1px solid var(--border,#dce4eb);border-radius:999px;background:var(--surface,#fff);color:var(--text-muted,#66798a);font-size:.72rem;font-weight:800}
      .spw-base-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.spw-base-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 14px;border:1px solid var(--border,#dce4eb);border-radius:14px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(32,56,85,.04)}.spw-base-card span{display:block;font-size:.67rem;font-weight:900;letter-spacing:.08em;color:var(--brand-700,#155c8a)}.spw-base-card strong{display:block;margin-top:4px;color:var(--text-strong,#183247);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spw-base-card small{display:block;margin-top:3px;color:var(--text-muted,#66798a)}.spw-base-card em{display:inline-block;margin-top:7px;font-size:.7rem;font-style:normal;font-weight:800;color:var(--text-muted,#66798a)}.spw-base-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}.spw-base-actions button svg,.spw-page-heading button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8}
      .spw-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:10px}.spw-kpi{position:relative;overflow:hidden;min-height:92px;padding:12px 13px;border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(32,56,85,.04)}.spw-kpi:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--brand-500,#2789b6)}.spw-kpi.sigem:before{background:var(--spw-sigem)}.spw-kpi.pw:before{background:var(--spw-pw)}.spw-kpi.issued:before{background:var(--spw-issued)}.spw-kpi.gap:before{background:var(--danger-500,#c74b43)}.spw-kpi span{display:block;font-size:.68rem;font-weight:900;letter-spacing:.045em;text-transform:uppercase;color:var(--text-muted,#687b8c)}.spw-kpi strong{display:block;margin-top:8px;font-size:1.55rem;line-height:1;color:var(--text-strong,#17324a)}.spw-kpi small{display:block;margin-top:8px;color:var(--text-muted,#66798a);font-size:.72rem}.spw-kpi strong.empty{font-size:1.2rem;color:var(--text-muted,#66798a)}
      .spw-filter-card,.spw-chart-card,.spw-table-card,.spw-status-card,.spw-quality-card{border:1px solid var(--border,#dce4eb);border-radius:14px;background:var(--surface,#fff);box-shadow:0 6px 22px rgba(32,56,85,.045)}.spw-filter-card{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr)) auto;gap:9px;align-items:end;padding:12px 13px;margin-bottom:10px}.spw-filter-card label{display:grid;gap:5px}.spw-filter-card label span{font-size:.67rem;font-weight:900;color:var(--text-muted,#637587);text-transform:uppercase;letter-spacing:.04em}.spw-filter-card select{min-height:38px}.spw-filter-note{grid-column:1/-1;color:var(--text-muted,#6b7e8f);font-size:.72rem}
      .spw-chart-card{overflow:hidden}.spw-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 15px 9px}.spw-card-head strong{display:block;color:var(--text-strong,#183247);font-size:1rem}.spw-card-head small{display:block;margin-top:4px;color:var(--text-muted,#66798a)}.spw-legend{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.spw-legend span{display:inline-flex;align-items:center;gap:7px;padding:5px 9px;border:1px solid var(--border,#d7e0e8);border-radius:999px;background:var(--surface-soft,#f8fafc);font-size:.73rem;font-weight:900}.spw-legend span:before{content:"";width:9px;height:9px;border-radius:3px;background:currentColor}.spw-legend .sigem{color:var(--spw-sigem)}.spw-legend .pw{color:var(--spw-pw)}.spw-legend .issued{color:var(--spw-issued)}.spw-chart-scroll{overflow-x:auto;padding:0 8px 6px;min-height:350px}.spw-chart-scroll svg{display:block;height:390px;min-width:100%;width:auto}.spw-grid-line{stroke:rgba(93,116,136,.15);stroke-width:1}.spw-axis-line{stroke:rgba(93,116,136,.38);stroke-width:1}.spw-axis-label{fill:var(--text-muted,#6d7f8f);font-size:11px}.spw-total-value{fill:var(--text-strong,#233d52);font-size:10px;font-weight:900}.spw-bar-sigem{fill:var(--spw-sigem)}.spw-bar-pw{fill:var(--spw-pw)}.spw-bar-issued{fill:var(--spw-issued)}.spw-insight{display:flex;gap:8px;align-items:flex-start;margin:0;padding:10px 14px 13px;border-top:1px solid var(--border,#e6ebef);color:var(--text-muted,#5f7385);font-size:.8rem}.spw-insight:before{content:"↗";display:grid;place-items:center;flex:0 0 24px;height:24px;border-radius:50%;background:var(--brand-50,#eaf5fb);color:var(--brand-700,#155c8a);font-weight:900}
      .spw-table-card{margin-top:10px;overflow:hidden}.spw-table-wrap{max-height:420px;overflow:auto;border-top:1px solid var(--border,#e6ebef)}.spw-table-wrap table{width:100%;border-collapse:collapse;font-size:.79rem}.spw-table-wrap th,.spw-table-wrap td{padding:9px 11px;border-bottom:1px solid var(--border,#edf1f4);text-align:right;white-space:nowrap}.spw-table-wrap th:first-child,.spw-table-wrap td:first-child{text-align:left}.spw-table-wrap thead th{position:sticky;top:0;z-index:1;background:var(--surface-soft,#f6f9fb);font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#637587)}.spw-table-wrap tbody tr:hover{background:var(--surface-soft,#f8fafc)}.spw-gap-value{font-weight:900;color:var(--danger-700,#9c332c)}
      .spw-lower-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.spw-status-card{overflow:hidden}.spw-status-list{display:grid;gap:8px;padding:2px 14px 14px}.spw-status-row{display:grid;grid-template-columns:minmax(145px,1fr) minmax(80px,2fr) 54px;gap:10px;align-items:center}.spw-status-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.76rem;font-weight:800;color:var(--text-strong,#294258)}.spw-status-track{height:8px;border-radius:999px;background:var(--surface-soft,#eef3f6);overflow:hidden}.spw-status-track i{display:block;height:100%;border-radius:999px;background:var(--brand-500,#2789b6)}.spw-status-row strong{text-align:right;font-size:.76rem;color:var(--text-strong,#294258)}
      .spw-quality-card{margin-top:10px;padding:13px 14px}.spw-quality-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:9px}.spw-quality-grid div{padding:9px 10px;border-radius:10px;background:var(--surface-soft,#f6f9fb)}.spw-quality-grid span{display:block;font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#66798a)}.spw-quality-grid strong{display:block;margin-top:4px;color:var(--text-strong,#183247)}.spw-rule{margin:10px 0 0;padding-top:10px;border-top:1px solid var(--border,#e6ebef);color:var(--text-muted,#66798a);font-size:.76rem;line-height:1.5}
      .spw-empty{display:grid;place-items:center;text-align:center;min-height:250px;color:var(--text-muted,#687b8c)}.spw-empty strong{display:block;color:var(--text-strong,#244158);font-size:1rem;margin-bottom:4px}.spw-progress{display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:10px;background:var(--brand-50,#eaf5fb);color:var(--brand-800,#0f537a);font-size:.78rem;font-weight:800;margin-bottom:10px}.spw-progress i{width:15px;height:15px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spw-spin .7s linear infinite}@keyframes spw-spin{to{transform:rotate(360deg)}}
      html[data-theme="dark"] .spw-chart-scroll svg{filter:saturate(.95) brightness(1.05)}
      @media(max-width:1200px){.spw-filter-card{grid-template-columns:repeat(3,minmax(160px,1fr))}.spw-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.spw-quality-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:800px){.spw-base-grid,.spw-lower-grid{grid-template-columns:1fr}.spw-filter-card{grid-template-columns:1fr 1fr}.spw-page-heading{display:grid}.spw-heading-meta{justify-content:flex-start}}
      @media(max-width:560px){.spw-kpis,.spw-filter-card,.spw-quality-grid{grid-template-columns:1fr}.spw-card-head{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function createShell() {
    ensureStyles();
    shell = document.getElementById(MODULE_ID);
    if (!shell) {
      shell = document.createElement("section");
      shell.id = MODULE_ID;
      shell.className = "module-view";
      shell.hidden = true;
      document.querySelector("main.workspace")?.appendChild(shell);
    }
    shell.setAttribute("role", "tabpanel");
    shell.setAttribute("aria-label", "Dashboard SIGEM × ProjectWise");
    shell.innerHTML = `
      <header class="spw-page-heading">
        <div><span>CONTROLE DOCUMENTAL INTEGRADO</span><h2>Dashboard SIGEM × ProjectWise</h2><p>Compare documentos únicos, cadastros e emissões com a mesma identidade documental usada pelo GRCON.</p></div>
        <div class="spw-heading-meta"><span id="spw-meta-sigem">SIGEM · sem base</span><span id="spw-meta-pw">PW · sem base</span></div>
      </header>
      <div class="spw-progress" id="spw-progress" hidden><i></i><span>Processando base…</span></div>
      <section class="spw-base-grid" aria-label="Bases vigentes">
        <article class="spw-base-card"><div id="spw-sigem-base"></div><div class="spw-base-actions"><button class="secondary-button" id="spw-sigem-update" type="button">${icon("M12 3v12M8 7l4-4 4 4M5 14v5h14v-5")}<span>Atualizar Consulta Geral</span></button><input id="spw-sigem-file" hidden type="file" accept=".xlsx,.xls,.xlsm"/></div></article>
        <article class="spw-base-card"><div id="spw-pw-base"></div><div class="spw-base-actions"><button class="secondary-button" id="spw-pw-update" type="button">${icon("M12 3v12M8 7l4-4 4 4M5 14v5h14v-5")}<span>Atualizar base PW</span></button><input id="spw-pw-file" hidden type="file" accept=".csv,.txt,text/csv"/></div></article>
      </section>
      <section class="spw-kpis" id="spw-kpis" aria-label="Indicadores SIGEM e ProjectWise"></section>
      <section class="spw-filter-card" id="spw-filters">
        <label><span>Classe documental</span><select id="spw-class"><option value="">Todas</option></select></label>
        <label><span>Status SIGEM</span><select id="spw-sigem-status"><option value="">Todos</option></select></label>
        <label><span>Status PW</span><select id="spw-pw-status"><option value="">Todos</option></select></label>
        <label><span>Disciplina PW</span><select id="spw-discipline"><option value="">Todas</option></select></label>
        <label><span>Emissão PW</span><select id="spw-emission"><option value="">Todos</option><option value="emitted">Emitidos</option><option value="not-emitted">Não emitidos</option></select></label>
        <button class="text-button" id="spw-clear" type="button">Limpar filtros</button>
        <small class="spw-filter-note">Filtros específicos de SIGEM/PW atuam somente na base que possui esse atributo; os gaps continuam calculados por conjuntos documentais visíveis, nunca por subtração bruta.</small>
      </section>
      <section class="spw-chart-card">
        <header class="spw-card-head"><div><span class="spw-card-kicker">COMPARAÇÃO POR CLASSE</span><strong>Documentos por Classe — SIGEM × ProjectWise</strong><small id="spw-chart-note">Documentos únicos conforme identidade GRCON</small></div><div class="spw-legend"><span class="sigem">SIGEM</span><span class="pw">PW Cadastrado</span><span class="issued">PW Emitido</span></div></header>
        <div class="spw-chart-scroll" id="spw-chart"></div>
        <p class="spw-insight" id="spw-insight">Carregue as bases para iniciar a comparação.</p>
      </section>
      <section class="spw-table-card">
        <header class="spw-card-head"><div><span class="spw-card-kicker">RESUMO EXATO</span><strong>Comparação detalhada por classe</strong><small>Gaps calculados por matching documental real</small></div></header>
        <div class="spw-table-wrap" id="spw-table"></div>
      </section>
      <section class="spw-lower-grid">
        <article class="spw-status-card"><header class="spw-card-head"><div><span class="spw-card-kicker">SIGEM</span><strong>Status atual por documento</strong><small>Última revisão identificada na Consulta Geral</small></div></header><div class="spw-status-list" id="spw-sigem-status-list"></div></article>
        <article class="spw-status-card"><header class="spw-card-head"><div><span class="spw-card-kicker">PROJECTWISE</span><strong>Estado atual por documento</strong><small>o_statename da revisão corrente</small></div></header><div class="spw-status-list" id="spw-pw-status-list"></div></article>
      </section>
      <section class="spw-quality-card"><span class="spw-card-kicker">QUALIDADE DAS BASES</span><strong>Leitura, deduplicação e rastreabilidade</strong><div class="spw-quality-grid" id="spw-quality"></div><p class="spw-rule" id="spw-rule"></p></section>`;
    bind();
    return shell;
  }

  function el(id) { return shell?.querySelector(`#${id}`); }

  function bind() {
    el("spw-sigem-update")?.addEventListener("click", () => el("spw-sigem-file")?.click());
    el("spw-pw-update")?.addEventListener("click", () => el("spw-pw-file")?.click());
    el("spw-sigem-file")?.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) void importSigem(file);
    });
    el("spw-pw-file")?.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) void importPw(file);
    });
    const bindings = {
      "spw-class": "documentClass",
      "spw-sigem-status": "sigemStatus",
      "spw-pw-status": "pwStatus",
      "spw-discipline": "discipline",
      "spw-emission": "emission",
    };
    Object.entries(bindings).forEach(([id, field]) => el(id)?.addEventListener("change", () => {
      state.filters[field] = el(id).value;
      renderFromModel(false);
    }));
    el("spw-clear")?.addEventListener("click", () => {
      Object.keys(state.filters).forEach((field) => { state.filters[field] = ""; });
      ["spw-class", "spw-sigem-status", "spw-pw-status", "spw-discipline", "spw-emission"].forEach((id) => { if (el(id)) el(id).value = ""; });
      renderFromModel(false);
    });
  }

  function setBusy(busy, label) {
    state.busy = busy;
    const progress = el("spw-progress");
    if (progress) {
      progress.hidden = !busy;
      const span = progress.querySelector("span");
      if (span) span.textContent = label || "Processando base…";
    }
    [el("spw-sigem-update"), el("spw-pw-update"), el("spw-clear")].forEach((button) => { if (button) button.disabled = busy; });
  }

  async function yieldFrame() {
    await new Promise((resolve) => root.requestAnimationFrame ? root.requestAnimationFrame(resolve) : root.setTimeout(resolve, 0));
  }

  async function ensureConferenceRuntime() {
    if (!root.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await root.GRCONModuleLoader.ensure("posting_conference_core.js");
    return root.GrconPostingConference;
  }

  function sheetHeaderRows(sheet, limit) {
    const XLSX = root.XLSX;
    if (!sheet || !sheet["!ref"] || !XLSX?.utils) return [];
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const endRow = Math.min(range.e.r, range.s.r + Math.max(1, Number(limit) || 40) - 1);
    const output = [];
    for (let row = range.s.r; row <= endRow; row += 1) {
      const values = [];
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        values[column - range.s.c] = cell ? text(cell.w !== undefined ? cell.w : cell.v) : "";
      }
      output.push(values);
    }
    return output;
  }

  function validateSigemWorkbook(workbook, Conference) {
    let best = null;
    (workbook?.SheetNames || []).forEach((sheetName) => {
      const matrix = sheetHeaderRows(workbook.Sheets[sheetName], 40);
      const detection = Conference.detectColumns(matrix, 40);
      if (!detection) return;
      if (!best || detection.score > best.detection.score) best = { sheetName, detection };
    });
    if (!best) throw new Error("Consulta Geral inválida: não foi possível localizar Documento e Revisão nas primeiras linhas.");
    const required = ["document", "revision", "status", "documentType"];
    const missing = required.filter((field) => best.detection.columns[field] < 0);
    if (missing.length) {
      const names = { document: "Documento", revision: "Revisão", status: "Status", documentType: "Tipo de documento" };
      throw new Error(`Consulta Geral inválida: campo(s) obrigatório(s) não localizado(s): ${missing.map((field) => names[field]).join(", ")}. A base vigente foi preservada.`);
    }
    return best;
  }

  async function importSigem(file) {
    setBusy(true, "Validando e indexando a Consulta Geral…");
    await yieldFrame();
    try {
      await root.GRCONModuleLoader.ensure("xlsx");
      const Conference = await ensureConferenceRuntime();
      const buffer = await file.arrayBuffer();
      const workbook = root.XLSX.read(buffer, { type: "array", cellDates: false, dense: false });
      validateSigemWorkbook(workbook, Conference);
      const importedAt = new Date().toISOString();
      const result = await Conference.importWorkbook(workbook, {
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        importedAt,
      }, root.GrconHistory?.read?.() || [], { now: importedAt, reason: "sigem-pw-dashboard" });
      state.sigem = { meta: result.parsed.meta, records: result.parsed.records };
      rebuildModel();
      root.dispatchEvent(new CustomEvent("grcon:conference-updated", { detail: { summary: result.summary, changes: result.changes, baseMeta: result.parsed.meta, source: "sigem-pw-dashboard" } }));
      notify(`Consulta Geral atualizada: ${fmt(result.parsed.meta.recordCount)} registros processados.`, "success");
      renderFromModel(true);
    } catch (error) {
      console.error("[SIGEM×PW] Consulta Geral:", error);
      notify(error.message || "Não foi possível atualizar a Consulta Geral. A última base válida foi mantida.", "error");
    } finally { setBusy(false); }
  }

  async function parsePwFile(file, fileMeta) {
    if (typeof Worker === "undefined") {
      const source = await file.text();
      return Core.parsePwCsv(source, fileMeta);
    }
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      let worker;
      try { worker = new Worker(new URL("workers/sigem_pw_dashboard.worker.js", document.baseURI)); }
      catch (error) { reject(error); return; }
      const cleanup = () => worker.terminate();
      worker.addEventListener("message", (event) => {
        const payload = event.data || {};
        cleanup();
        if (payload.ok && payload.parsed) resolve(payload.parsed);
        else reject(new Error(payload.error || "Falha ao processar a base ProjectWise."));
      }, { once: true });
      worker.addEventListener("error", (event) => {
        cleanup();
        reject(event.error || new Error(event.message || "Worker da base ProjectWise falhou."));
      }, { once: true });
      worker.postMessage({ buffer, meta: fileMeta }, [buffer]);
    }).catch(async (error) => {
      console.warn("[SIGEM×PW] Worker PW indisponível; usando processamento local:", error);
      const source = await file.text();
      return Core.parsePwCsv(source, fileMeta);
    });
  }

  async function importPw(file) {
    setBusy(true, "Validando e indexando a base ProjectWise…");
    await yieldFrame();
    try {
      if (!/\.(?:csv|txt)$/i.test(file.name || "")) throw new Error("A relação ProjectWise deve ser fornecida em CSV. A última base válida foi mantida.");
      const importedAt = new Date().toISOString();
      const parsed = await parsePwFile(file, { fileName: file.name, fileSize: file.size, lastModified: file.lastModified, importedAt });
      const validatedModel = Core.createModel([], parsed.records);
      parsed.meta.uniqueDocumentCount = validatedModel.pwAll.size;
      parsed.meta.emittedDocumentCount = [...validatedModel.pwAll.values()].filter((document) => document.emitted).length;
      const base = { meta: parsed.meta, records: validatedModel.normalizedPw };
      await Core.savePwBase(base);
      state.pw = base;
      rebuildModel();
      root.dispatchEvent(new CustomEvent("grcon:pw-base-updated", { detail: { baseMeta: parsed.meta, source: "sigem-pw-dashboard" } }));
      notify(`Base PW atualizada: ${fmt(parsed.meta.sourceRowCount)} registros brutos · ${fmt(parsed.meta.uniqueDocumentCount)} documentos únicos.`, "success");
      renderFromModel(true);
    } catch (error) {
      console.error("[SIGEM×PW] ProjectWise:", error);
      notify(error.message || "Não foi possível atualizar a base ProjectWise. A última base válida foi mantida.", "error");
    } finally { setBusy(false); }
  }

  function rebuildModel() {
    state.model = Core.createModel(state.sigem.records || [], state.pw.records || []);
  }

  function optionHtml(value, label) {
    return `<option value="${escapeHtml(value)}">${escapeHtml(label || value)}</option>`;
  }

  function syncSelect(id, values, current, allLabel) {
    const select = el(id);
    if (!select) return;
    const list = [...new Set((values || []).filter(Boolean))];
    select.innerHTML = optionHtml("", allLabel) + list.map((value) => optionHtml(value)).join("");
    select.value = list.includes(current) ? current : "";
  }

  function renderFilters(result) {
    const options = result?.filterOptions || { classes: [], sigemStatuses: [], pwStatuses: [], disciplines: [] };
    syncSelect("spw-class", options.classes, state.filters.documentClass, "Todas");
    syncSelect("spw-sigem-status", options.sigemStatuses, state.filters.sigemStatus, "Todos");
    syncSelect("spw-pw-status", options.pwStatuses, state.filters.pwStatus, "Todos");
    syncSelect("spw-discipline", options.disciplines, state.filters.discipline, "Todas");
    const emission = el("spw-emission");
    if (emission) emission.value = state.filters.emission;
  }

  function renderBaseCards(result) {
    const sigemMeta = state.sigem.meta;
    const pwMeta = state.pw.meta;
    const quality = result?.quality || {};
    el("spw-sigem-base").innerHTML = sigemMeta
      ? `<span>BASE SIGEM · CONSULTA GERAL</span><strong title="${escapeHtml(sigemMeta.fileName)}">${escapeHtml(sigemMeta.fileName || "Consulta Geral")}</strong><small>Atualizada em ${fmtDate(sigemMeta.importedAt)}</small><em>${fmt(sigemMeta.recordCount)} registros/revisões · ${fmt(quality.sigemUniqueDocuments)} documentos GRCON</em>`
      : `<span>BASE SIGEM</span><strong>Consulta Geral não carregada</strong><small>Use “Atualizar Consulta Geral”.</small><em>O Dashboard não interpreta base ausente como zero.</em>`;
    el("spw-pw-base").innerHTML = pwMeta
      ? `<span>BASE PROJECTWISE</span><strong title="${escapeHtml(pwMeta.fileName)}">${escapeHtml(pwMeta.fileName || "Relação PW")}</strong><small>Atualizada em ${fmtDate(pwMeta.importedAt)}</small><em>${fmt(pwMeta.sourceRowCount)} registros brutos · ${fmt(quality.pwUniqueDocuments)} documentos GRCON</em>`
      : `<span>BASE PROJECTWISE</span><strong>Base ProjectWise não carregada</strong><small>Use “Atualizar base PW”.</small><em>O Dashboard não interpreta base ausente como zero.</em>`;
    el("spw-meta-sigem").textContent = sigemMeta ? `SIGEM · ${fmtDate(sigemMeta.importedAt)}` : "SIGEM · sem base";
    el("spw-meta-pw").textContent = pwMeta ? `PW · ${fmtDate(pwMeta.importedAt)}` : "PW · sem base";
  }

  function kpi(label, value, css, note, available) {
    return `<article class="spw-kpi ${css}"><span>${escapeHtml(label)}</span><strong class="${available ? "" : "empty"}">${available ? fmt(value) : "Base ausente"}</strong><small>${escapeHtml(note || "")}</small></article>`;
  }

  function renderKpis(result) {
    const s = result?.summary || {};
    const hasSigem = Boolean(state.sigem.meta);
    const hasPw = Boolean(state.pw.meta);
    el("spw-kpis").innerHTML = [
      kpi("Total SIGEM", s.sigem, "sigem", "Documentos únicos", hasSigem),
      kpi("PW cadastrado", s.pwRegistered, "pw", "Documentos únicos", hasPw),
      kpi("PW emitido", s.pwEmitted, "issued", hasPw ? `${fmt(s.gapPwToEmitted)} cadastrado(s) ainda sem emissão` : "Aguardando base PW", hasPw),
      kpi("Pendente SIGEM → PW", s.gapSigemToPw, "gap", hasSigem && hasPw ? `${fmt(s.pwExclusive)} documento(s) exclusivos no PW` : "Requer as duas bases", hasSigem && hasPw),
    ].join("");
  }

  function niceMaximum(value) {
    const number = Math.max(1, Number(value) || 0);
    if (number <= 5) return Math.ceil(number);
    const magnitude = 10 ** Math.floor(Math.log10(number));
    const normalized = number / magnitude;
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  }

  function groupedBarSvg(rows) {
    if (!rows?.length) return `<div class="spw-empty"><div><strong>Sem classes para exibir</strong><span>Carregue uma base válida ou ajuste os filtros.</span></div></div>`;
    const width = Math.max(980, rows.length * 78 + 100);
    const height = 390;
    const margin = { top: 34, right: 22, bottom: 62, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maximum = niceMaximum(Math.max(...rows.flatMap((row) => [row.sigem, row.pwRegistered, row.pwEmitted]), 1));
    const slot = plotWidth / rows.length;
    const groupWidth = Math.min(58, slot * .78);
    const gap = 3;
    const barWidth = Math.max(8, (groupWidth - gap * 2) / 3);
    const y = (value) => margin.top + plotHeight - (Number(value || 0) / maximum) * plotHeight;
    const parts = [];
    [0, .25, .5, .75, 1].forEach((ratio) => {
      const value = Math.round(maximum * ratio);
      const yy = y(value);
      parts.push(`<line class="spw-grid-line" x1="${margin.left}" y1="${yy}" x2="${width - margin.right}" y2="${yy}"/><text class="spw-axis-label" text-anchor="end" x="${margin.left - 9}" y="${yy + 4}">${fmt(value)}</text>`);
    });
    parts.push(`<line class="spw-axis-line" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}"/>`);
    rows.forEach((row, index) => {
      const center = margin.left + slot * index + slot / 2;
      const start = center - groupWidth / 2;
      const series = [
        ["SIGEM", row.sigem, "spw-bar-sigem"],
        ["PW Cadastrado", row.pwRegistered, "spw-bar-pw"],
        ["PW Emitido", row.pwEmitted, "spw-bar-issued"],
      ];
      series.forEach(([label, value, css], seriesIndex) => {
        const x = start + seriesIndex * (barWidth + gap);
        const yy = y(value);
        const h = Math.max(0, margin.top + plotHeight - yy);
        const title = `${row.documentClass} · ${label}: ${fmt(value)} · Faltam no PW: ${fmt(row.gapSigemToPw)} · Aguardando emissão: ${fmt(row.gapPwToEmitted)}`;
        parts.push(`<rect class="${css}" x="${x.toFixed(2)}" y="${yy.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" rx="3"><title>${escapeHtml(title)}</title></rect>`);
        if (value > 0 && rows.length <= 18) parts.push(`<text class="spw-total-value" text-anchor="middle" x="${(x + barWidth / 2).toFixed(2)}" y="${Math.max(12, yy - 5).toFixed(2)}">${fmt(value)}</text>`);
      });
      parts.push(`<text class="spw-axis-label" text-anchor="middle" x="${center.toFixed(2)}" y="${height - 34}">${escapeHtml(row.documentClass)}</text>`);
    });
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparação de documentos SIGEM, PW cadastrado e PW emitido por classe">${parts.join("")}</svg>`;
  }

  function renderChart(result) {
    const hasAny = Boolean(state.sigem.meta || state.pw.meta);
    el("spw-chart").innerHTML = hasAny ? groupedBarSvg(result.classes) : `<div class="spw-empty"><div><strong>Nenhuma base carregada</strong><span>Atualize a Consulta Geral e a relação PW para comparar.</span></div></div>`;
    const s = result?.summary || {};
    el("spw-insight").textContent = state.sigem.meta && state.pw.meta
      ? `${fmt(s.matched)} documento(s) estão presentes nas duas bases. ${fmt(s.gapSigemToPw)} documento(s) do SIGEM não foram localizados no PW e ${fmt(s.pwExclusive)} aparecem somente no PW.`
      : "O gráfico preserva a distinção entre base ausente e base carregada; nenhum zero artificial é exibido.";
  }

  function renderTable(result) {
    if (!state.sigem.meta && !state.pw.meta) {
      el("spw-table").innerHTML = `<div class="spw-empty"><div><strong>Sem dados</strong><span>Carregue pelo menos uma base.</span></div></div>`;
      return;
    }
    const body = (result.classes || []).map((row) => `<tr><td><strong>${escapeHtml(row.documentClass)}</strong></td><td>${fmt(row.sigem)}</td><td>${fmt(row.pwRegistered)}</td><td>${fmt(row.pwEmitted)}</td><td class="spw-gap-value">${fmt(row.gapSigemToPw)}</td><td>${fmt(row.gapPwToEmitted)}</td><td>${fmt(row.pwExclusive)}</td></tr>`).join("");
    el("spw-table").innerHTML = `<table><caption>Comparação documental por classe</caption><thead><tr><th>Classe</th><th>SIGEM</th><th>PW cadastrado</th><th>PW emitido</th><th>Gap SIGEM→PW</th><th>Gap PW→Emitido</th><th>Exclusivos PW</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  function statusRows(items, total) {
    if (!items?.length) return `<div class="spw-empty" style="min-height:140px"><div><strong>Sem status disponível</strong><span>A base correspondente ainda não foi carregada.</span></div></div>`;
    const max = Math.max(1, ...items.slice(0, 10).map((item) => item.count));
    return items.slice(0, 10).map((item) => `<div class="spw-status-row" title="${escapeHtml(item.label)}"><span>${escapeHtml(item.label)}</span><div class="spw-status-track"><i style="width:${Math.max(2, item.count / max * 100).toFixed(2)}%"></i></div><strong>${fmt(item.count)}</strong></div>`).join("") + (items.length > 10 ? `<small style="padding:0 14px 14px;color:var(--text-muted,#66798a)">+ ${fmt(items.length - 10)} status adicionais · ${fmt(total)} documentos no filtro</small>` : "");
  }

  function renderStatuses(result) {
    el("spw-sigem-status-list").innerHTML = statusRows(state.sigem.meta ? result.sigemStatus : [], result.summary.sigem);
    el("spw-pw-status-list").innerHTML = statusRows(state.pw.meta ? result.pwStatus : [], result.summary.pwRegistered);
  }

  function renderQuality(result) {
    const q = result.quality || {};
    const sigemMeta = state.sigem.meta || {};
    const pwMeta = state.pw.meta || {};
    const cells = [
      ["SIGEM · registros/revisões", state.sigem.meta ? fmt(sigemMeta.recordCount || q.sigemRawRecords) : "—"],
      ["SIGEM · documentos únicos", state.sigem.meta ? fmt(q.sigemUniqueDocuments) : "—"],
      ["PW · registros brutos / válidos", state.pw.meta ? `${fmt(pwMeta.sourceRowCount)} / ${fmt(pwMeta.recordCount)}` : "—"],
      ["PW · documentos / emitidos", state.pw.meta ? `${fmt(q.pwUniqueDocuments)} / ${fmt(q.pwEmittedDocuments)}` : "—"],
      ["PW · linhas ignoradas", state.pw.meta ? fmt(pwMeta.invalidCount) : "—"],
      ["PW · emissão desconhecida", state.pw.meta ? fmt(pwMeta.unknownEmissionCount) : "—"],
      ["Não classificados · SIGEM", state.sigem.meta ? fmt(q.unclassified?.sigem) : "—"],
      ["Não classificados · PW", state.pw.meta ? fmt(q.unclassified?.pw) : "—"],
    ];
    el("spw-quality").innerHTML = cells.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    el("spw-rule").textContent = `Regra de emissão PW: ${Core.EMISSION_RULE}`;
  }

  function renderFromModel(refreshOptions) {
    if (!state.model) rebuildModel();
    state.result = Core.aggregateModel(state.model, state.filters);
    renderBaseCards(state.result);
    renderKpis(state.result);
    if (refreshOptions !== false) renderFilters(state.result);
    renderChart(state.result);
    renderTable(state.result);
    renderStatuses(state.result);
    renderQuality(state.result);
  }

  async function refreshBases(reason) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const bases = await Core.loadBases();
        state.sigem = bases.sigem && bases.sigem.meta ? bases.sigem : { meta: null, records: [] };
        state.pw = bases.pw && bases.pw.meta ? bases.pw : { meta: null, records: [] };
        rebuildModel();
        renderFromModel(true);
        state.ready = true;
      } catch (error) {
        console.error(`[SIGEM×PW] atualização ${reason || ""}:`, error);
        notify(error.message || "Não foi possível ler as bases persistidas do Dashboard SIGEM × PW.", "error");
      }
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function activate() {
    createShell();
    shell.hidden = false;
    if (!state.ready) {
      setBusy(true, "Carregando bases vigentes…");
      await yieldFrame();
      await refreshBases("ativação");
      setBusy(false);
    } else renderFromModel(false);
  }

  root.addEventListener("grcon:conference-updated", (event) => {
    if (event?.detail?.source === "sigem-pw-dashboard") return;
    void refreshBases("Consulta Geral atualizada em outro módulo");
  });
  root.addEventListener("grcon:pw-base-updated", (event) => {
    if (event?.detail?.source === "sigem-pw-dashboard") return;
    void refreshBases("base PW atualizada em outro módulo");
  });

  root.GrconSigemPwDashboardUi = Object.freeze({ activate, refresh: refreshBases, state });
})(window);