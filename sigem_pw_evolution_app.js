(function (root) {
  "use strict";

  const SECTION_ID = "spw-history-section";
  const STYLE_ID = "spw-evolution-v2-style";
  const PAGE_SIZE = 100;
  const state = {
    ready: false,
    busy: false,
    sigem: [],
    pw: [],
    unavailable: { sigem: 0, pw: 0 },
    ldUniverse: null,
    ldSignature: "",
    selections: { sigemPrev: "", sigemCurrent: "", pwPrev: "", pwCurrent: "" },
    comparison: null,
    listMode: "sigem-new",
    filters: { query: "", documentClass: "", documentType: "", revision: "", status: "", discipline: "", tag: "", eap: "", source: "" },
    page: 1,
    filteredRows: [],
    bound: false,
    eventTimer: null,
  };

  function Core() { return root.GrconSigemPwEvolution; }
  function History() { return root.GrconSigemPwHistory; }
  function Management() { return root.GrconSigemPwHistoryManagement; }
  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function fmtDate(value) { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d) : "—"; }
  function notify(message, kind) { if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info"); else if (kind === "error") root.alert(message); }
  function downloadBlob(blob, name) {
    if (root.GrconUtils && typeof root.GrconUtils.downloadBlob === "function") return root.GrconUtils.downloadBlob(blob, name);
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function selected(system, role) {
    const key = `${system}${role === "previous" ? "Prev" : "Current"}`;
    return (state[system] || []).find((item) => item.id === state.selections[key]) || null;
  }
  function ordered(list) { return (list || []).slice().sort((a, b) => Date.parse(a.importedAt || 0) - Date.parse(b.importedAt || 0)); }
  function hasValidatedLd() { return Boolean(state.ldUniverse && state.ldUniverse.available); }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style"); style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID}.spw-evo-v2{margin-top:16px;min-width:0}.spw-evo-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:10px}.spw-evo-head h3{margin:0;color:var(--text-strong,#183247);font-size:1.08rem}.spw-evo-head p{margin:4px 0 0;max-width:820px;color:var(--text-muted,#66798a);font-size:.75rem;line-height:1.45}.spw-evo-actions{display:flex;gap:7px;flex-wrap:wrap}.spw-evo-scope{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:0 0 10px;padding:8px 10px;border:1px solid var(--border,#dce4eb);border-radius:10px;background:var(--surface-soft,#f7fafc);font-size:.7rem;color:var(--text-muted,#66798a)}.spw-evo-scope strong{color:var(--text-strong,#294258)}.spw-evo-scope.required{border-color:rgba(198,138,40,.45);background:var(--warning-50,#fff9ea)}
      .spw-evo-selectors{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px}.spw-evo-source{padding:10px 11px;border:1px solid var(--border,#dce4eb);border-radius:11px;background:var(--surface,#fff)}.spw-evo-source header{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}.spw-evo-source header strong{font-size:.79rem;color:var(--text-strong,#294258)}.spw-evo-source header small{font-size:.64rem;color:var(--text-muted,#66798a)}.spw-evo-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:7px;align-items:end}.spw-evo-pair label{display:grid;gap:4px}.spw-evo-pair label span,.spw-evo-filters span{font-size:.58rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-evo-pair select,.spw-evo-filters input,.spw-evo-filters select{min-height:35px;min-width:0}.spw-evo-arrow{padding-bottom:9px;color:var(--text-muted,#66798a);font-weight:900}
      .spw-evo-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.spw-evo-kpi{appearance:none;text-align:left;border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);padding:13px;cursor:pointer;box-shadow:0 5px 18px rgba(32,56,85,.04)}.spw-evo-kpi:disabled{cursor:not-allowed;opacity:.62}.spw-evo-kpi span{display:block;font-size:.62rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-evo-kpi strong{display:block;margin-top:5px;font-size:1.65rem;color:var(--text-strong,#17324a)}.spw-evo-kpi small{display:block;margin-top:4px;font-size:.68rem;color:var(--text-muted,#66798a)}.spw-evo-kpi.sigem{border-left:4px solid var(--spw-sigem,#0b7895)}.spw-evo-kpi.pw{border-left:4px solid var(--spw-pw,#6d4ac7)}.spw-evo-kpi.pending{border-left:4px solid var(--warning-500,#c68a28)}
      .spw-evo-net{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0 10px;padding:8px 10px;border:1px solid var(--border,#e0e7ed);border-radius:9px;background:var(--surface-soft,#f8fafc);font-size:.69rem;color:var(--text-muted,#66798a)}.spw-evo-net button{border:0;background:transparent;color:var(--brand-700,#155c8a);font:inherit;font-weight:900;cursor:pointer;padding:0}.spw-evo-net b{color:var(--text-strong,#294258)}
      .spw-evo-audit{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px}.spw-evo-audit article{padding:9px 10px;border:1px solid var(--border,#dce4eb);border-radius:10px;background:var(--surface,#fff)}.spw-evo-audit strong{font-size:.72rem;color:var(--text-strong,#294258)}.spw-evo-audit p{margin:4px 0 0;font-size:.66rem;line-height:1.45;color:var(--text-muted,#66798a)}
      .spw-evo-tabs{display:flex;gap:5px;flex-wrap:wrap;margin:10px 0 7px}.spw-evo-tabs button{min-height:32px;border:1px solid var(--border,#dce4eb);border-radius:8px;background:var(--surface,#fff);color:var(--text-muted,#66798a);font-size:.66rem;font-weight:900;padding:6px 9px;cursor:pointer}.spw-evo-tabs button.active{background:var(--brand-50,#eaf5fb);border-color:var(--brand-200,#b7dced);color:var(--brand-800,#155c8a)}
      .spw-evo-filters{display:grid;grid-template-columns:2fr repeat(8,minmax(105px,1fr));gap:7px;padding:9px;border:1px solid var(--border,#dce4eb);border-radius:10px;background:var(--surface,#fff)}.spw-evo-filters label{display:grid;gap:4px}.spw-evo-list-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:8px}.spw-evo-list-head strong{font-size:.78rem;color:var(--text-strong,#294258)}.spw-evo-list-head small{font-size:.66rem;color:var(--text-muted,#66798a)}
      .spw-evo-table-wrap{overflow:auto;max-height:520px;margin-top:6px;border:1px solid var(--border,#dce4eb);border-radius:10px;background:var(--surface,#fff)}.spw-evo-table{width:100%;border-collapse:collapse;font-size:.68rem}.spw-evo-table th,.spw-evo-table td{padding:8px 9px;border-bottom:1px solid var(--border,#edf1f4);text-align:left;white-space:nowrap}.spw-evo-table thead th{position:sticky;top:0;z-index:1;background:var(--surface-soft,#f6f9fb);font-size:.56rem;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-evo-table tbody tr{cursor:pointer}.spw-evo-table tbody tr:hover{background:var(--surface-soft,#f8fafc)}.spw-evo-empty{padding:26px 14px;text-align:center;color:var(--text-muted,#66798a);font-size:.72rem}.spw-evo-empty strong{display:block;color:var(--text-strong,#294258);margin-bottom:3px}.spw-evo-pager{display:flex;justify-content:flex-end;gap:6px;align-items:center;margin-top:7px}.spw-evo-pager span{font-size:.67rem;color:var(--text-muted,#66798a)}
      .spw-evo-overlay{position:fixed;inset:0;z-index:10055;display:flex;justify-content:flex-end;background:rgba(18,37,52,.42)}.spw-evo-overlay[hidden]{display:none}.spw-evo-drawer{width:min(720px,96vw);height:100%;overflow:auto;padding:16px;background:var(--surface,#fff);box-shadow:-16px 0 44px rgba(20,40,60,.2)}.spw-evo-drawer header{display:flex;justify-content:space-between;gap:12px}.spw-evo-drawer h3{margin:3px 0;color:var(--text-strong,#183247)}.spw-evo-close{width:34px;height:34px;border:0;border-radius:50%;background:var(--surface-soft,#eef3f6);font-size:1.2rem;cursor:pointer}.spw-evo-detail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.spw-evo-detail div{padding:9px;border:1px solid var(--border,#e1e7ec);border-radius:8px}.spw-evo-detail span{display:block;font-size:.58rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-evo-detail strong{display:block;margin-top:3px;color:var(--text-strong,#294258);overflow-wrap:anywhere}
      @media(max-width:1120px){.spw-evo-filters{grid-template-columns:repeat(4,1fr)}.spw-evo-filters label:first-child{grid-column:1/-1}}@media(max-width:760px){.spw-evo-head{display:grid}.spw-evo-selectors,.spw-evo-audit,.spw-evo-kpis{grid-template-columns:1fr}.spw-evo-filters{grid-template-columns:1fr 1fr}.spw-evo-filters label:first-child{grid-column:1/-1}}@media(max-width:480px){.spw-evo-pair{grid-template-columns:1fr}.spw-evo-arrow{display:none}.spw-evo-filters,.spw-evo-detail{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function option(snapshot) {
    return `<option value="${esc(snapshot.id)}">${esc(`${fmtDate(snapshot.importedAt)} · ${snapshot.fileName || "base"} · ${fmt(snapshot.audit?.acceptedRecords || 0)} registros`)}</option>`;
  }
  function pairDefaults(system) {
    const list = ordered(state[system]);
    if (!list.length) return;
    const currentKey = `${system}Current`, previousKey = `${system}Prev`;
    if (!list.some((row) => row.id === state.selections[currentKey])) state.selections[currentKey] = list.at(-1).id;
    const currentIndex = list.findIndex((row) => row.id === state.selections[currentKey]);
    if (!list.some((row) => row.id === state.selections[previousKey])) state.selections[previousKey] = currentIndex > 0 ? list[currentIndex - 1].id : "";
  }

  async function readLdUniverse(force) {
    const input = document.getElementById("ld-input");
    const files = input && input.files ? [...input.files] : [];
    const signature = files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|");
    if (!force && state.ldUniverse && signature === state.ldSignature) return state.ldUniverse;
    state.ldSignature = signature;
    if (!files.length) { state.ldUniverse = Core().buildLdUniverse([], []); return state.ldUniverse; }
    if (root.GRCONModuleLoader) await root.GRCONModuleLoader.ensure("xlsx");
    const technical = [], history = [];
    for (const file of files) {
      try {
        const workbook = root.GrconLdCompatibility?.workbookFor?.(file) || root.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const parsed = root.TriagemCore.parseWorkbook(workbook, file.name, file.lastModified, root.GrconLdCompatibility?.profileFor?.(file));
        technical.push(...(parsed.records || [])); history.push(...(parsed.history || []));
      } catch (error) { console.warn(`[SIGEM×PW][evolution] LD ${file.name}:`, error); }
      await new Promise((resolve) => root.setTimeout(resolve, 0));
    }
    state.ldUniverse = Core().buildLdUniverse(technical, history);
    return state.ldUniverse;
  }

  async function readPayloadMap() {
    const history = History(), management = Management(), output = new Map();
    if (!history || typeof history.openDb !== "function") return output;
    const db = await history.openDb();
    try {
      const values = await new Promise((resolve, reject) => {
        const tx = db.transaction(history.STORES.meta, "readonly"), request = tx.objectStore(history.STORES.meta).getAll();
        request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error || new Error("Falha ao ler payloads históricos."));
      });
      const prefix = management?.PAYLOAD_PREFIX || "sourcePayload:";
      values.forEach((row) => {
        if (!row || !text(row.key).startsWith(prefix) || !row.value || !Array.isArray(row.value.records)) return;
        output.set(text(row.value.snapshotId) || text(row.key).slice(prefix.length), row.value);
      });
    } finally { db.close(); }
    return output;
  }

  async function buildPreparedSnapshots(system, metadata, payloads, universe) {
    const output = []; let unavailable = 0;
    for (const sourceSnapshot of ordered(metadata)) {
      const payload = payloads.get(sourceSnapshot.id);
      if (!payload || !Array.isArray(payload.records)) { unavailable += 1; continue; }
      const base = { meta: { ...(payload.meta || {}), fileName: payload.meta?.fileName || sourceSnapshot.fileName, importedAt: payload.meta?.importedAt || sourceSnapshot.importedAt }, records: payload.records };
      try { output.push(Core().buildSnapshot(system, base, universe, { snapshotId: sourceSnapshot.id, sourceSnapshotId: sourceSnapshot.id })); }
      catch (error) { console.warn(`[SIGEM×PW][evolution] snapshot ${sourceSnapshot.id}:`, error); unavailable += 1; }
      if (output.length % 4 === 0) await new Promise((resolve) => root.setTimeout(resolve, 0));
    }
    return { output, unavailable };
  }

  async function loadSnapshots(forceLd) {
    if (state.busy) return;
    state.busy = true;
    try {
      if (Management()?.ensureCurrentPayloads) await Management().ensureCurrentPayloads();
      const universe = await readLdUniverse(Boolean(forceLd));
      if (!universe.available) {
        state.sigem = []; state.pw = []; state.unavailable = { sigem: 0, pw: 0 }; state.comparison = null; render(); return;
      }
      const [sigemMeta, pwMeta, payloads] = await Promise.all([History().listSourceSnapshots("sigem"), History().listSourceSnapshots("pw"), readPayloadMap()]);
      const [sigem, pw] = await Promise.all([buildPreparedSnapshots("sigem", sigemMeta, payloads, universe), buildPreparedSnapshots("pw", pwMeta, payloads, universe)]);
      state.sigem = sigem.output; state.pw = pw.output; state.unavailable = { sigem: sigem.unavailable, pw: pw.unavailable };
      pairDefaults("sigem"); pairDefaults("pw"); recalculate();
    } finally { state.busy = false; }
  }

  function recalculate() {
    if (!hasValidatedLd()) { state.comparison = null; render(); return; }
    state.comparison = Core().comparePeriod(selected("sigem", "previous"), selected("sigem", "current"), selected("pw", "previous"), selected("pw", "current"));
    state.page = 1; render();
  }

  function ensureSection() {
    ensureStyle();
    const section = document.getElementById(SECTION_ID); if (!section) return null;
    section.classList.add("spw-evo-v2"); section.dataset.evolutionVersion = "2";
    section.innerHTML = `
      <header class="spw-evo-head"><div><span class="spw-kicker">EVOLUÇÃO</span><h3>Movimentação real entre bases</h3><p>Novos registros, saídas e o que entrou no SIGEM e ainda não foi identificado no ProjectWise. Uma nova revisão do mesmo código conta como nova ocorrência.</p></div><div class="spw-evo-actions"><button class="secondary-button" id="spw-evo-export" type="button">Exportar lista</button><button class="text-button" id="spw-history-manage" type="button">Gerenciar histórico</button></div></header>
      <div class="spw-evo-scope" id="spw-evo-scope"></div><div class="spw-evo-selectors" id="spw-evo-selectors"></div><div class="spw-evo-kpis" id="spw-evo-kpis"></div><div class="spw-evo-net" id="spw-evo-net"></div><div class="spw-evo-audit" id="spw-evo-audit"></div><nav class="spw-evo-tabs" id="spw-evo-tabs" aria-label="Listas da evolução"></nav>
      <div class="spw-evo-filters">
        <label><span>Código / lista de códigos</span><input id="spw-evo-filter-query" placeholder="Cole códigos separados por linha, vírgula ou ;"/></label>
        <label><span>Classe</span><select id="spw-evo-filter-class"><option value="">Todas</option><option>ET</option><option>N-1710</option><option>CV</option></select></label>
        <label><span>Tipo documental</span><input id="spw-evo-filter-document-type" placeholder="REP, RL, DE..."/></label>
        <label><span>Revisão</span><input id="spw-evo-filter-revision" placeholder="A"/></label>
        <label><span>Status</span><input id="spw-evo-filter-status" placeholder="Status"/></label>
        <label><span>Disciplina</span><input id="spw-evo-filter-discipline" placeholder="Disciplina"/></label>
        <label><span>TAG</span><input id="spw-evo-filter-tag" placeholder="TAG"/></label>
        <label><span>EAP</span><input id="spw-evo-filter-eap" placeholder="1.1.1.1"/></label>
        <label><span>Origem</span><select id="spw-evo-filter-source"><option value="">SIGEM + PW</option><option value="sigem">SIGEM</option><option value="pw">PW</option></select></label>
      </div>
      <div class="spw-evo-list-head"><div><strong id="spw-evo-list-title"></strong><br><small id="spw-evo-list-subtitle"></small></div><small id="spw-evo-list-count"></small></div><div class="spw-evo-table-wrap" id="spw-evo-table"></div><div class="spw-evo-pager" id="spw-evo-pager"></div>
      <div class="spw-evo-overlay" id="spw-evo-overlay" hidden><aside class="spw-evo-drawer" role="dialog" aria-modal="true"><header><div><span class="spw-kicker">RASTREABILIDADE</span><h3 id="spw-evo-detail-title">Registro</h3></div><button class="spw-evo-close" id="spw-evo-close" type="button" aria-label="Fechar">×</button></header><div id="spw-evo-detail-body"></div></aside></div>`;
    const navButton = document.querySelector('[data-spw-jump="spw-history-section"]'); if (navButton) navButton.textContent = "Evolução";
    return section;
  }

  function renderScope() {
    const target = document.getElementById("spw-evo-scope"); if (!target) return;
    const u = state.ldUniverse;
    target.classList.toggle("required", !u?.available);
    if (u?.available) target.innerHTML = `<strong>Escopo validado pelas LDs</strong><span>${fmt(u.uniqueDocumentCount)} documentos de referência · ${fmt(u.technicalDocumentCount)} com linha técnica. Código, revisão, TAG, EAP, disciplina e demais dados disponíveis são usados na rastreabilidade.</span><button type="button" class="text-button" id="spw-evo-refresh-ld">Revalidar LD</button>`;
    else target.innerHTML = `<strong>LD necessária para calcular a evolução</strong><span>Carregue as LDs no seletor principal do GRCON. Os números operacionais não são calculados apenas pela exportação SIGEM/PW, evitando que documentos externos inflem o dashboard.</span>`;
  }

  function renderSelectors() {
    const target = document.getElementById("spw-evo-selectors"); if (!target) return;
    const block = (system, label) => {
      const list = ordered(state[system]), previousKey = `${system}Prev`, currentKey = `${system}Current`;
      return `<section class="spw-evo-source"><header><strong>${label}</strong><small>${fmt(list.length)} base(s) utilizável(is)${state.unavailable[system] ? ` · ${fmt(state.unavailable[system])} antiga(s) sem payload bruto` : ""}</small></header><div class="spw-evo-pair"><label><span>Base anterior</span><select data-evo-select="${previousKey}" ${hasValidatedLd() ? "" : "disabled"}><option value="">— sem anterior —</option>${list.map(option).join("")}</select></label><span class="spw-evo-arrow">→</span><label><span>Base atual</span><select data-evo-select="${currentKey}" ${hasValidatedLd() ? "" : "disabled"}>${list.map(option).join("")}</select></label></div></section>`;
    };
    target.innerHTML = block("sigem", "SIGEM") + block("pw", "ProjectWise");
    target.querySelectorAll("[data-evo-select]").forEach((select) => { select.value = state.selections[select.dataset.evoSelect] || ""; });
  }

  function renderKpis() {
    const target = document.getElementById("spw-evo-kpis"), net = document.getElementById("spw-evo-net"); if (!target || !net) return;
    const c = state.comparison || {}, s = c.sigem, p = c.pw, r = c.relation || {}, disabled = hasValidatedLd() ? "" : "disabled", value = (n) => hasValidatedLd() ? fmt(n || 0) : "—";
    target.innerHTML = `<button class="spw-evo-kpi sigem" data-evo-list="sigem-new" ${disabled}><span>Novos no SIGEM</span><strong>${hasValidatedLd()?"+":""}${value(s?.added?.length)}</strong><small>Ver registros</small></button><button class="spw-evo-kpi pw" data-evo-list="pw-new" ${disabled}><span>Novos no PW</span><strong>${hasValidatedLd()?"+":""}${value(p?.added?.length)}</strong><small>Ver registros</small></button><button class="spw-evo-kpi pending" data-evo-list="missing-pw" ${disabled}><span>Ainda não no PW</span><strong>${value(r.newSigemMissingPw?.length)}</strong><small>Novos SIGEM sem correspondência atual no PW</small></button>`;
    if (!hasValidatedLd()) { net.innerHTML = `<span>Os indicadores serão liberados após a validação das LDs.</span>`; return; }
    net.innerHTML = `<span><b>SIGEM</b> novos +${fmt(s?.added?.length || 0)} · <button data-evo-list="removed-sigem">não encontrados −${fmt(s?.removed?.length || 0)}</button> · líquido ${s ? (s.net > 0 ? "+" : "") + fmt(s.net) : "—"}</span><span><b>PW</b> novos +${fmt(p?.added?.length || 0)} · <button data-evo-list="removed-pw">não encontrados −${fmt(p?.removed?.length || 0)}</button> · líquido ${p ? (p.net > 0 ? "+" : "") + fmt(p.net) : "—"}</span><span><button data-evo-list="both">Chegaram nas duas bases: ${fmt(r.newInBoth?.length || 0)}</button></span>`;
  }

  function auditArticle(label, snapshot) {
    if (!snapshot) return `<article><strong>${label}</strong><p>Selecione uma base para ver a auditoria.</p></article>`;
    const a = snapshot.audit || {}, reasons = Object.entries(a.discardReasons || {}).sort((x,y)=>y[1]-x[1]).slice(0,4).map(([reason,count])=>`${reason}: ${fmt(count)}`).join(" · ");
    return `<article><strong>${label} · ${esc(snapshot.fileName || "base")}</strong><p>${fmt(a.rawRecords)} brutos · ${fmt(a.acceptedRecords)} aceitos · ${fmt(a.uniqueDocuments)} documentos únicos · ${fmt(a.validRevisionRecords)} registros/revisões válidos · ${fmt(a.technicalDuplicates)} duplicidade(s) técnica(s) · ${fmt(a.discardedRecords)} descartado(s).${reasons ? ` ${esc(reasons)}` : ""}</p></article>`;
  }
  function renderAudit() {
    const target = document.getElementById("spw-evo-audit"); if (!target) return;
    target.innerHTML = hasValidatedLd() ? auditArticle("SIGEM atual", selected("sigem","current")) + auditArticle("PW atual", selected("pw","current")) : `<article><strong>Auditoria SIGEM</strong><p>Aguardando LD válida.</p></article><article><strong>Auditoria PW</strong><p>Aguardando LD válida.</p></article>`;
  }

  const LIST_LABELS = {
    "sigem-new": ["Cadastrados no SIGEM", "Registros que não existiam na base SIGEM anterior."],
    "pw-new": ["Encontrados no ProjectWise", "Registros que não existiam na base PW anterior."],
    both: ["Chegaram nas duas bases", "Novas ocorrências equivalentes no SIGEM e no PW no período selecionado."],
    "missing-pw": ["Novos SIGEM ainda não identificados no PW", "Novas ocorrências SIGEM sem correspondência na base PW atual."],
    "removed-sigem": ["Não encontrados nesta base SIGEM", "Ocorrências presentes na base anterior e ausentes na atual; não significam exclusão definitiva."],
    "removed-pw": ["Não encontrados nesta base PW", "Ocorrências presentes na base anterior e ausentes na atual; não significam exclusão definitiva."],
    discarded: ["Descartados do escopo", "Registros fora do universo GRCON/LD ou reprovados pelas regras de codificação."],
  };
  function rowsForMode() {
    if (!hasValidatedLd()) return [];
    const c = state.comparison || {}, r = c.relation || {};
    if (state.listMode === "sigem-new") return c.sigem?.added || [];
    if (state.listMode === "pw-new") return c.pw?.added || [];
    if (state.listMode === "both") return r.newInBoth || [];
    if (state.listMode === "missing-pw") return r.newSigemMissingPw || [];
    if (state.listMode === "removed-sigem") return c.sigem?.removed || [];
    if (state.listMode === "removed-pw") return c.pw?.removed || [];
    if (state.listMode === "discarded") return [...(selected("sigem","current")?.rejected || []), ...(selected("pw","current")?.rejected || [])];
    return [];
  }
  function queryTokens(value) { return text(value).split(/[\n,;]+/).map((item) => Core().norm(item)).filter(Boolean); }
  function rowPasses(row) {
    const f = state.filters, tokens = queryTokens(f.query);
    if (tokens.length && !tokens.some((token) => Core().norm(row.document).includes(token))) return false;
    if (f.documentClass && text(row.documentClass) !== f.documentClass) return false;
    if (f.documentType && !Core().norm(row.documentType).includes(Core().norm(f.documentType))) return false;
    if (f.source && text(row.system) !== f.source) return false;
    if (f.revision && Core().normalizeRevision(row.revision) !== Core().normalizeRevision(f.revision)) return false;
    if (f.status && !Core().norm(row.status || row.reason).includes(Core().norm(f.status))) return false;
    if (f.discipline && !Core().norm(row.discipline).includes(Core().norm(f.discipline))) return false;
    if (f.tag && !Core().norm(row.tag).includes(Core().norm(f.tag))) return false;
    if (f.eap && !Core().norm(row.eap).includes(Core().norm(f.eap))) return false;
    return true;
  }
  function filterRows() { state.filteredRows = rowsForMode().filter(rowPasses); return state.filteredRows; }

  function renderTabs() {
    const target = document.getElementById("spw-evo-tabs"); if (!target) return;
    const c = state.comparison || {}, r = c.relation || {}, counts = { "sigem-new": c.sigem?.added?.length || 0, "pw-new": c.pw?.added?.length || 0, both: r.newInBoth?.length || 0, "missing-pw": r.newSigemMissingPw?.length || 0, "removed-sigem": c.sigem?.removed?.length || 0, "removed-pw": c.pw?.removed?.length || 0, discarded: (selected("sigem","current")?.rejected?.length || 0) + (selected("pw","current")?.rejected?.length || 0) };
    target.innerHTML = Object.entries(LIST_LABELS).map(([key,[label]]) => `<button type="button" class="${state.listMode===key?"active":""}" data-evo-list="${key}" ${hasValidatedLd()?"":"disabled"}>${esc(label)} · ${hasValidatedLd()?fmt(counts[key]):"—"}</button>`).join("");
  }

  function renderTable() {
    const target = document.getElementById("spw-evo-table"), pager = document.getElementById("spw-evo-pager"); if (!target || !pager) return;
    const rows = filterRows(), [title, subtitle] = LIST_LABELS[state.listMode] || ["Registros",""];
    document.getElementById("spw-evo-list-title").textContent = title; document.getElementById("spw-evo-list-subtitle").textContent = subtitle; document.getElementById("spw-evo-list-count").textContent = hasValidatedLd() ? `${fmt(rows.length)} registro(s) após filtro` : "LD necessária";
    if (!hasValidatedLd()) { target.innerHTML = `<div class="spw-evo-empty"><strong>Evolução não calculada.</strong>Carregue as LDs para validar o universo documental antes da comparação.</div>`; pager.innerHTML = ""; return; }
    const pages = Math.max(1, Math.ceil(rows.length/PAGE_SIZE)); state.page = Math.min(Math.max(1,state.page),pages); const start=(state.page-1)*PAGE_SIZE, pageRows=rows.slice(start,start+PAGE_SIZE);
    if (!pageRows.length) target.innerHTML = `<div class="spw-evo-empty"><strong>Nenhum registro nesta relação.</strong>A contagem e a lista usam exatamente a mesma origem de dados.</div>`;
    else target.innerHTML = `<table class="spw-evo-table"><thead><tr><th>Código</th><th>Rev.</th><th>Classe</th><th>Tipo</th><th>Status</th><th>Disciplina</th><th>TAG</th><th>EAP</th><th>Data</th><th>Origem</th></tr></thead><tbody>${pageRows.map((row,index)=>`<tr data-evo-row="${start+index}"><td><strong>${esc(row.document||"—")}</strong></td><td>${esc(row.revision||"—")}</td><td>${esc(row.documentClass||"—")}</td><td>${esc(row.documentType||"—")}</td><td>${esc(row.status||row.reason||"—")}</td><td>${esc(row.discipline||"—")}</td><td>${esc(row.tag||"—")}</td><td>${esc(row.eap||"—")}</td><td>${esc(row.date||"—")}</td><td>${esc((row.system||"").toUpperCase()||"—")}</td></tr>`).join("")}</tbody></table>`;
    pager.innerHTML = `<button class="secondary-button compact" type="button" data-evo-page="prev" ${state.page<=1?"disabled":""}>Anterior</button><span>Página ${fmt(state.page)} de ${fmt(pages)}</span><button class="secondary-button compact" type="button" data-evo-page="next" ${state.page>=pages?"disabled":""}>Próxima</button>`;
  }

  function render() {
    if (!document.getElementById(SECTION_ID)?.classList.contains("spw-evo-v2")) ensureSection();
    renderScope(); renderSelectors(); renderKpis(); renderAudit(); renderTabs(); renderTable();
  }

  function openDetail(row) {
    if (!row) return;
    const overlay=document.getElementById("spw-evo-overlay"),body=document.getElementById("spw-evo-detail-body"); if(!overlay||!body)return;
    document.getElementById("spw-evo-detail-title").textContent=`${row.document||"Registro"}${row.revision?` · Rev. ${row.revision}`:""}`;
    const removed = state.listMode === "removed-sigem" || state.listMode === "removed-pw";
    const snapshot = selected(row.system === "pw" ? "pw" : "sigem", removed ? "previous" : "current");
    const existed = removed ? "Sim, na base anterior" : ["sigem-new","pw-new","both","missing-pw"].includes(state.listMode) ? "Não como esta ocorrência" : "Não entrou no universo válido";
    const fields=[
      ["Código",row.document],["Revisão",row.revision],["Título",row.title],["Classe",row.documentClass],["Tipo documental",row.documentType],["TAG",row.tag],["EAP",row.eap],["Disciplina",row.discipline],
      ["Status SIGEM",row.system==="sigem"?row.status:""],["Status PW",row.matchedPw?.status||(row.system==="pw"?row.status:"")],["Data SIGEM",row.system==="sigem"?row.date:""],["Data PW",row.matchedPw?.date||(row.system==="pw"?row.date:"")],
      ["Origem",(row.system||"").toUpperCase()],["Snapshot",snapshot?`${fmtDate(snapshot.importedAt)} · ${snapshot.fileName||"base"}`:"—"],["Existia anteriormente?",existed],["Emissão PW",row.system==="pw"?(row.emitted?`Emitido (${row.lastEmission||"evidência"})`:row.lastEmission||"Não indicada"):(row.matchedPw?(row.matchedPw.emitted?`Emitido (${row.matchedPw.lastEmission||"evidência"})`:row.matchedPw.lastEmission||"Não indicada"):"—")],
      ["LD",row.ldSource?`${row.ldSource}${row.ldSheet?` · ${row.ldSheet}`:""}${row.ldRow?` · linha ${row.ldRow}`:""}`:(row.ldValidated?"Validado":"—")],["Prazo LD",row.ldPrazo],["Motivo de descarte",row.reason],["Chave da ocorrência",row.occurrenceKey],["Situação SIGEM × PW",row.matchedPw?`Correspondência: ${row.matchedPw.document} · Rev. ${row.matchedPw.revision}`:state.listMode==="missing-pw"?"Ainda não identificada no PW atual":"—"]
    ];
    body.innerHTML=`<div class="spw-evo-detail">${fields.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value||"—")}</strong></div>`).join("")}</div>`; overlay.hidden=false;
  }

  async function exportVisible() {
    const rows=state.filteredRows.slice(); if(!rows.length){notify("Não há registros filtrados para exportar.","warning");return;}
    try {
      if(root.GRCONModuleLoader)await root.GRCONModuleLoader.ensure("xlsx");
      const data=rows.map((row)=>({Código:row.document||"",Revisão:row.revision||"",Classe:row.documentClass||"","Tipo documental":row.documentType||"",Título:row.title||"",Status:row.status||row.reason||"",Disciplina:row.discipline||"",TAG:row.tag||"",EAP:row.eap||"",Data:row.date||"",Origem:(row.system||"").toUpperCase(),"Emissão PW":row.system==="pw"?(row.emitted?"Emitido":row.lastEmission||""):"","LD origem":row.ldSource||"","LD aba":row.ldSheet||"","Prazo LD":row.ldPrazo||"","Motivo descarte":row.reason||""}));
      const ws=root.XLSX.utils.json_to_sheet(data),wb=root.XLSX.utils.book_new();root.XLSX.utils.book_append_sheet(wb,ws,"Evolução");const out=root.XLSX.write(wb,{bookType:"xlsx",type:"array"});
      downloadBlob(new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),`GRCON_Evolucao_${state.listMode}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.xlsx`);
    } catch(error){notify(error.message||"Não foi possível exportar a relação.","error");}
  }

  function bind() {
    if(state.bound)return;state.bound=true;
    document.addEventListener("change",(event)=>{
      const select=event.target.closest?.("[data-evo-select]"); if(select){state.selections[select.dataset.evoSelect]=select.value;recalculate();return;}
      const map={"spw-evo-filter-class":"documentClass","spw-evo-filter-source":"source","spw-evo-filter-document-type":"documentType","spw-evo-filter-revision":"revision","spw-evo-filter-status":"status","spw-evo-filter-discipline":"discipline","spw-evo-filter-tag":"tag","spw-evo-filter-eap":"eap"};
      if(map[event.target.id]){state.filters[map[event.target.id]]=event.target.value;state.page=1;renderTable();}
    });
    document.addEventListener("input",(event)=>{
      const map={"spw-evo-filter-query":"query","spw-evo-filter-document-type":"documentType","spw-evo-filter-revision":"revision","spw-evo-filter-status":"status","spw-evo-filter-discipline":"discipline","spw-evo-filter-tag":"tag","spw-evo-filter-eap":"eap"};
      if(!map[event.target.id])return;state.filters[map[event.target.id]]=event.target.value;state.page=1;renderTable();
    });
    document.addEventListener("click",(event)=>{
      const list=event.target.closest?.("[data-evo-list]");if(list&&!list.disabled){state.listMode=list.dataset.evoList;state.page=1;renderTabs();renderTable();document.getElementById("spw-evo-table")?.scrollIntoView({behavior:"smooth",block:"nearest"});return;}
      const page=event.target.closest?.("[data-evo-page]");if(page){state.page+=page.dataset.evoPage==="next"?1:-1;renderTable();return;}
      const row=event.target.closest?.("[data-evo-row]");if(row){openDetail(state.filteredRows[Number(row.dataset.evoRow)]);return;}
      if(event.target.closest?.("#spw-evo-close")){document.getElementById("spw-evo-overlay").hidden=true;return;}
      if(event.target.closest?.("#spw-evo-export")){void exportVisible();return;}
      if(event.target.closest?.("#spw-evo-refresh-ld")){void loadSnapshots(true);return;}
      if(event.target.closest?.("#spw-history-manage")){root.GrconSigemPwHistoryRuntimeFix?.openManager?.();return;}
    });
    ["grcon:conference-updated","grcon:pw-base-updated"].forEach((name)=>root.addEventListener(name,()=>{clearTimeout(state.eventTimer);state.eventTimer=root.setTimeout(()=>{void loadSnapshots(false);},700);}));
    document.getElementById("ld-input")?.addEventListener("change",()=>{state.ldSignature="";void loadSnapshots(true);});
  }

  async function activate() {
    if(!Core()||!History())throw new Error("Motor de evolução SIGEM × PW indisponível.");
    ensureSection();bind();await loadSnapshots(false);state.ready=true;
  }

  root.GrconSigemPwEvolutionUi=Object.freeze({activate,refresh:loadSnapshots,state});
})(window);
