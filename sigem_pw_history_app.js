(function (root) {
  "use strict";

  const SECTION_ID = "spw-history-section";
  const STYLE_ID = "spw-history-style";
  const state = {
    ready: false,
    syncing: false,
    sourceSigem: [],
    sourcePw: [],
    comparisons: [],
    period: "30",
    documentClass: "",
    selectedSnapshotId: "",
    lastPerformance: { recordMs: 0, loadMs: 0, renderMs: 0 },
  };

  function Core() { return root.GrconSigemPwHistory; }
  function App() { return root.GrconSigemPwDashboardUi; }
  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function fmtMaybe(value) { return value === null || value === undefined ? "Não disponível" : fmt(value); }
  function pct(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "Não disponível"; }
  function fmtDate(value) { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d) : "Não disponível"; }
  function fmtShortDate(value) { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d) : "—"; }
  function deltaText(value) { const n = Number(value || 0); return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmt(Math.abs(n))}`; }
  function nowMs() { return root.performance && root.performance.now ? root.performance.now() : Date.now(); }
  function notify(message, kind) { if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info"); else if (kind === "error") root.alert(message); }
  function downloadBlob(blob, name) {
    if (root.GrconUtils && typeof root.GrconUtils.downloadBlob === "function") return root.GrconUtils.downloadBlob(blob, name);
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style"); style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID}{margin-top:16px}.spw-inner-nav{position:sticky;top:0;z-index:7;display:flex;gap:6px;flex-wrap:wrap;padding:8px;margin:0 0 10px;border:1px solid var(--border,#dce4eb);border-radius:11px;background:color-mix(in srgb,var(--surface,#fff) 94%,transparent);backdrop-filter:blur(8px)}.spw-inner-nav button{min-height:34px;padding:6px 10px;border:0;border-radius:8px;background:transparent;color:var(--text-muted,#617486);font-size:.72rem;font-weight:900;cursor:pointer}.spw-inner-nav button:hover,.spw-inner-nav button:focus-visible{background:var(--brand-50,#eaf5fb);color:var(--brand-800,#155c8a)}
      .spw-base-age,.spw-anomaly-note{display:flex;gap:8px;align-items:flex-start;margin:8px 0 0;padding:9px 11px;border:1px solid var(--warning-200,#ead7aa);border-radius:9px;background:var(--warning-50,#fff9ea);color:var(--text-muted,#617486);font-size:.72rem;line-height:1.4}.spw-base-age[hidden],.spw-anomaly-note[hidden]{display:none}.spw-base-age strong,.spw-anomaly-note strong{color:var(--text-strong,#294258)}
      .spw-action-section{margin-top:14px}.spw-action-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.spw-action-card{border:1px solid var(--border,#dce4eb);border-radius:12px;background:var(--surface,#fff);padding:11px 12px;box-shadow:0 5px 18px rgba(32,56,85,.04)}.spw-action-card span,.spw-delta-card span{font-size:.61rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-action-card strong{display:block;margin-top:5px;font-size:1.35rem;color:var(--text-strong,#17324a)}.spw-action-card small,.spw-delta-card small{display:block;margin-top:4px;color:var(--text-muted,#66798a);font-size:.67rem;line-height:1.35}.spw-action-card.attention,.spw-delta-card.attention{border-left:4px solid var(--warning-500,#c68a28)}.spw-action-card.pending{border-left:4px solid var(--brand-500,#2789b6)}.spw-action-card.success,.spw-delta-card.progress{border-left:4px solid var(--success-500,#3f8f68)}.spw-delta-card.neutral{border-left:4px solid var(--brand-400,#55a6ca)}
      .spw-history-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:9px}.spw-history-head h3{margin:0;color:var(--text-strong,#183247);font-size:1.05rem}.spw-history-head p{max-width:850px;margin:4px 0 0;color:var(--text-muted,#66798a);font-size:.75rem;line-height:1.45}.spw-history-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.spw-history-actions button{min-height:34px}.spw-history-filters{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-bottom:9px;padding:9px 10px;border:1px solid var(--border,#dce4eb);border-radius:10px;background:var(--surface,#fff)}.spw-history-filters label{display:grid;gap:4px;min-width:150px}.spw-history-filters label span{font-size:.61rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-history-filters select{min-height:35px}.spw-history-source{margin-left:auto;color:var(--text-muted,#66798a);font-size:.68rem;max-width:540px;text-align:right}
      .spw-history-question{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 13px;border:1px solid var(--border,#dce4eb);border-radius:12px;background:var(--surface-soft,#f7fafc);margin-bottom:9px}.spw-history-question strong{display:block;color:var(--text-strong,#183247);font-size:.86rem}.spw-history-question span{display:block;margin-top:3px;color:var(--text-muted,#66798a);font-size:.72rem;line-height:1.4}.spw-history-question b{white-space:nowrap;color:var(--brand-800,#155c8a);font-size:.78rem}.spw-delta-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:9px}.spw-delta-card{border:1px solid var(--border,#dce4eb);border-radius:11px;background:var(--surface,#fff);padding:10px 11px}.spw-delta-card strong{display:block;margin-top:5px;font-size:1.12rem;color:var(--text-strong,#17324a)}
      .spw-history-charts{display:grid;grid-template-columns:1fr 1fr;gap:9px}.spw-history-card{border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(32,56,85,.04);overflow:hidden}.spw-history-card header{padding:12px 13px 7px}.spw-history-card header strong{display:block;color:var(--text-strong,#183247);font-size:.88rem}.spw-history-card header small{display:block;margin-top:3px;color:var(--text-muted,#66798a);font-size:.68rem;line-height:1.4}.spw-history-chart{overflow-x:auto;padding:0 8px 8px}.spw-history-chart svg{display:block;width:100%;min-width:520px;height:auto}.spw-h-grid{stroke:var(--border,#e7edf2);stroke-width:1}.spw-h-axis{fill:var(--text-muted,#718291);font-size:10px}.spw-h-line{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.spw-h-line.sigem{stroke:var(--spw-sigem,#0b7895)}.spw-h-line.pw{stroke:var(--spw-pw,#6d4ac7)}.spw-h-line.issued{stroke:var(--spw-issued,#b16a16)}.spw-h-line.postpw{stroke:var(--warning-600,#a66b14)}.spw-h-line.postsigem{stroke:var(--danger-500,#c74b43)}.spw-h-line.awaiting{stroke:var(--brand-500,#2789b6)}.spw-h-point{stroke:var(--surface,#fff);stroke-width:2}.spw-h-point.sigem{fill:var(--spw-sigem,#0b7895)}.spw-h-point.pw{fill:var(--spw-pw,#6d4ac7)}.spw-h-point.issued{fill:var(--spw-issued,#b16a16)}.spw-h-point.postpw{fill:var(--warning-600,#a66b14)}.spw-h-point.postsigem{fill:var(--danger-500,#c74b43)}.spw-h-point.awaiting{fill:var(--brand-500,#2789b6)}.spw-h-legend{display:flex;gap:9px;flex-wrap:wrap;padding:0 13px 9px;color:var(--text-muted,#66798a);font-size:.65rem}.spw-h-legend span:before{content:"";display:inline-block;width:9px;height:3px;margin-right:5px;vertical-align:middle;background:currentColor}.spw-h-legend .sigem{color:var(--spw-sigem,#0b7895)}.spw-h-legend .pw{color:var(--spw-pw,#6d4ac7)}.spw-h-legend .issued{color:var(--spw-issued,#b16a16)}
      .spw-history-table-card{margin-top:9px;border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);overflow:hidden}.spw-history-table-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:12px 13px 8px}.spw-history-table-head strong{color:var(--text-strong,#183247);font-size:.88rem}.spw-history-table-head small{color:var(--text-muted,#66798a);font-size:.68rem}.spw-history-table-wrap{overflow:auto;max-height:420px}.spw-history-table{width:100%;border-collapse:collapse;font-size:.7rem}.spw-history-table th,.spw-history-table td{padding:8px 9px;border-top:1px solid var(--border,#edf1f4);text-align:left;white-space:nowrap}.spw-history-table thead th{position:sticky;top:0;background:var(--surface-soft,#f6f9fb);font-size:.58rem;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-history-table button{border:0;background:transparent;color:var(--brand-700,#155c8a);font-weight:900;cursor:pointer}.spw-h-delta{display:block;margin-top:2px;font-size:.61rem;color:var(--text-muted,#66798a)}.spw-history-empty{padding:28px 16px;text-align:center;color:var(--text-muted,#66798a)}.spw-history-empty strong{display:block;color:var(--text-strong,#294258);margin-bottom:4px}
      .spw-history-overlay{position:fixed;inset:0;z-index:10020;background:rgba(18,37,52,.38);display:flex;justify-content:flex-end}.spw-history-overlay[hidden]{display:none}.spw-history-drawer{width:min(760px,94vw);height:100%;background:var(--surface,#fff);box-shadow:-14px 0 40px rgba(20,40,60,.18);overflow:auto;padding:15px}.spw-history-drawer header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.spw-history-drawer h3{margin:3px 0;color:var(--text-strong,#183247)}.spw-history-drawer p{margin:0;color:var(--text-muted,#66798a);font-size:.72rem}.spw-history-close{border:0;background:var(--surface-soft,#eef3f6);width:34px;height:34px;border-radius:50%;font-size:1.2rem;cursor:pointer}.spw-history-detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.spw-history-detail-grid article{padding:9px;border:1px solid var(--border,#dce4eb);border-radius:9px}.spw-history-detail-grid span{font-size:.6rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-history-detail-grid strong{display:block;margin-top:4px;color:var(--text-strong,#183247)}.spw-history-change{margin-top:12px}.spw-history-change h4{margin:0 0 6px;font-size:.78rem;color:var(--text-strong,#294258)}.spw-history-change-list{max-height:235px;overflow:auto;border:1px solid var(--border,#e4eaef);border-radius:8px}.spw-history-change-list div{padding:7px 8px;border-top:1px solid var(--border,#eef2f5);font-size:.67rem}.spw-history-change-list div:first-child{border-top:0}.spw-history-change-list strong{display:block;color:var(--text-strong,#294258)}.spw-history-change-list span{color:var(--text-muted,#66798a)}
      @media(max-width:1180px){.spw-delta-grid{grid-template-columns:repeat(3,1fr)}.spw-history-charts{grid-template-columns:1fr}.spw-action-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.spw-history-head{display:grid}.spw-history-actions{justify-content:flex-start}.spw-history-source{margin-left:0;text-align:left}.spw-delta-grid,.spw-action-grid,.spw-history-detail-grid{grid-template-columns:1fr 1fr}.spw-inner-nav{position:static}}@media(max-width:520px){.spw-delta-grid,.spw-action-grid,.spw-history-detail-grid{grid-template-columns:1fr}.spw-history-question{display:grid}}
    `;
    document.head.appendChild(style);
  }

  function shell() { return document.getElementById("sigem-pw-dashboard-module"); }
  function ensureNavigation() {
    const host = shell(); if (!host || document.getElementById("spw-inner-nav")) return;
    const nav = document.createElement("nav"); nav.id = "spw-inner-nav"; nav.className = "spw-inner-nav"; nav.setAttribute("aria-label", "Seções do Dashboard SIGEM × PW");
    nav.innerHTML = `<button type="button" data-spw-jump="spw-current-anchor">Visão geral</button><button type="button" data-spw-jump="spw-action-anchor">Pendências</button><button type="button" data-spw-jump="spw-revision-section">Revisões</button><button type="button" data-spw-jump="${SECTION_ID}">Evolução</button>`;
    host.querySelector(".spw-page-heading")?.insertAdjacentElement("afterend", nav);
    const current = document.createElement("span"); current.id = "spw-current-anchor"; current.hidden = true; host.querySelector(".spw-section-title")?.insertAdjacentElement("beforebegin", current);
  }
  function ensureHelp() {
    const grid = shell()?.querySelector(".spw-help-grid"); if (!grid || document.getElementById("spw-help-evolution")) return;
    const item = document.createElement("div"); item.id = "spw-help-evolution"; item.innerHTML = `<strong>Evolução</strong><p>Registra como os principais indicadores mudaram a cada nova versão válida das bases carregadas no GRCON.</p>`; grid.appendChild(item);
  }
  function ensureAgeNotice() {
    const host = shell(); if (!host || document.getElementById("spw-base-age-note")) return;
    const note = document.createElement("div"); note.id = "spw-base-age-note"; note.className = "spw-base-age"; note.hidden = true; host.querySelector(".spw-base-grid")?.insertAdjacentElement("afterend", note);
  }
  function ensureActionSection() {
    const host = shell(); if (!host || document.getElementById("spw-action-section")) return;
    const section = document.createElement("section"); section.id = "spw-action-section"; section.className = "spw-action-section";
    section.innerHTML = `<span id="spw-action-anchor" hidden></span><div class="spw-section-title"><div><span class="spw-kicker">O QUE PRECISA SER FEITO</span><h3>Fila operacional entre os sistemas</h3><p>Transforma a diferença entre as bases em ações concretas, sem misturar documento cadastrado com documento emitido.</p></div></div><div class="spw-action-grid" id="spw-action-grid"></div>`;
    host.querySelector(".spw-executive")?.insertAdjacentElement("afterend", section);
  }
  function ensureSection() {
    ensureStyle(); ensureNavigation(); ensureHelp(); ensureAgeNotice(); ensureActionSection();
    const host = shell(); if (!host) return null;
    let section = document.getElementById(SECTION_ID);
    if (!section) {
      section = document.createElement("section"); section.id = SECTION_ID;
      section.innerHTML = `<header class="spw-history-head"><div><span class="spw-kicker">EVOLUÇÃO OPERACIONAL</span><h3>Evolução SIGEM × ProjectWise</h3><p>Acompanhe como o acervo, as emissões, o alinhamento e as pendências mudam a cada versão real das bases. O histórico representa importações reais; dias sem atualização não recebem pontos artificiais.</p></div><div class="spw-history-actions"><button class="secondary-button" id="spw-history-export" type="button">Exportar histórico</button><button class="text-button" id="spw-history-clear" type="button">Gerenciar histórico</button></div></header><div class="spw-history-filters"><label><span>Classe documental</span><select id="spw-history-class"><option value="">Todas as classes</option><option>ET</option><option>N-1710</option><option>CV</option></select></label><label><span>Período</span><select id="spw-history-period"><option value="7">Últimos 7 dias</option><option value="30" selected>Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todo período</option></select></label><div class="spw-history-source" id="spw-history-source"></div></div><div class="spw-anomaly-note" id="spw-anomaly-note" hidden></div><div class="spw-history-question" id="spw-history-question"></div><div class="spw-delta-grid" id="spw-history-deltas"></div><div class="spw-history-charts"><article class="spw-history-card"><header><strong>Evolução do acervo documental</strong><small>SIGEM, PW cadastrado e PW emitido. O gráfico funciona mesmo enquanto somente uma das bases possui histórico.</small></header><div class="spw-h-legend"><span class="sigem">SIGEM</span><span class="pw">PW cadastrado</span><span class="issued">PW emitido</span></div><div class="spw-history-chart" id="spw-history-acervo"></div></article><article class="spw-history-card"><header><strong>Evolução das pendências</strong><small>Para pendências, diminuir geralmente representa avanço. Crescimento do acervo é informativo e não recebe automaticamente semântica positiva/negativa.</small></header><div class="spw-history-chart" id="spw-history-pending"></div></article></div><article class="spw-history-table-card"><div class="spw-history-table-head"><div><strong>Histórico do comparativo</strong><br><small>Cada linha registra as últimas versões SIGEM e PW disponíveis naquele momento.</small></div><small id="spw-history-count"></small></div><div class="spw-history-table-wrap" id="spw-history-table"></div></article><div class="spw-history-overlay" id="spw-history-overlay" hidden><aside class="spw-history-drawer" role="dialog" aria-modal="true" aria-labelledby="spw-history-detail-title"><header><div><span class="spw-kicker">DETALHES DA ATUALIZAÇÃO</span><h3 id="spw-history-detail-title">Snapshot</h3><p id="spw-history-detail-subtitle"></p></div><button class="spw-history-close" id="spw-history-close" type="button" aria-label="Fechar">×</button></header><div id="spw-history-detail-body"></div></aside></div>`;
      const revision = document.getElementById("spw-revision-section"); if (revision) revision.insertAdjacentElement("afterend", section); else host.appendChild(section);
    }
    bind(); return section;
  }

  function bind() {
    const host = shell(); if (!host || host.dataset.spwHistoryBound === "1") return; host.dataset.spwHistoryBound = "1";
    host.addEventListener("click", (event) => {
      const jump = event.target.closest("[data-spw-jump]"); if (jump) { document.getElementById(jump.getAttribute("data-spw-jump"))?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const snapshot = event.target.closest("[data-spw-history-snapshot]"); if (snapshot) { void openSnapshot(snapshot.getAttribute("data-spw-history-snapshot")); return; }
      if (event.target.closest("#spw-history-close")) closeDetails();
      if (event.target.closest("#spw-history-export")) void exportHistory();
      if (event.target.closest("#spw-history-clear")) void manageHistory();
    });
    host.addEventListener("change", (event) => {
      if (event.target.id === "spw-history-class") { state.documentClass = event.target.value; render(); }
      if (event.target.id === "spw-history-period") { state.period = event.target.value; render(); }
    });
    root.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDetails(); });
  }

  function classMetric(snapshot, system) {
    if (!snapshot) return { total: null, emitted: null };
    if (!state.documentClass) return { total: snapshot.metrics.comparableDocuments, emitted: system === "pw" ? snapshot.metrics.emittedDocuments : null };
    return { total: snapshot.metrics.classes?.[state.documentClass] ?? 0, emitted: system === "pw" ? snapshot.metrics.emittedByClass?.[state.documentClass] ?? 0 : null };
  }
  function comparisonMetric(snapshot) {
    if (!snapshot) return null;
    if (!state.documentClass) return snapshot.metrics;
    return (snapshot.metrics.classes || []).find((item) => item.documentClass === state.documentClass) || { sigem: 0, pwRegistered: 0, pwEmitted: 0, matched: 0, aligned: 0, postPw: 0, postSigem: 0, awaitingEmission: 0, coverage: null, emissionRate: null };
  }
  function cutoff() { return state.period === "all" ? -Infinity : Date.now() - Number(state.period || 30) * 86400000; }
  function filteredComparisons() { const min = cutoff(); return state.comparisons.filter((snapshot) => Date.parse(snapshot.importedAt || snapshot.recordedAt || 0) >= min); }
  function sourceTimeline() {
    const events = [
      ...state.sourceSigem.map((snapshot) => ({ system: "sigem", snapshot })),
      ...state.sourcePw.map((snapshot) => ({ system: "pw", snapshot })),
    ].sort((a, b) => Date.parse(a.snapshot.importedAt || 0) - Date.parse(b.snapshot.importedAt || 0));
    let sigem = null, pw = null; const points = [];
    for (const event of events) {
      if (event.system === "sigem") sigem = event.snapshot; else pw = event.snapshot;
      const sm = classMetric(sigem, "sigem"), pm = classMetric(pw, "pw");
      points.push({ importedAt: event.snapshot.importedAt, sigem: sm.total, pwRegistered: pm.total, pwEmitted: pm.emitted, sigemFileName: sigem?.fileName || "", pwFileName: pw?.fileName || "" });
    }
    const min = cutoff(); return points.filter((point) => Date.parse(point.importedAt || 0) >= min);
  }
  function deltaView(previous, current) {
    const a = comparisonMetric(previous), b = comparisonMetric(current); if (!a || !b) return null;
    const out = {}; ["sigem", "pwRegistered", "pwEmitted", "matched", "postPw", "postSigem", "awaitingEmission", "aligned"].forEach((key) => { out[key] = Number(b[key] || 0) - Number(a[key] || 0); }); return out;
  }

  function renderAgeNotice() {
    const note = document.getElementById("spw-base-age-note"), app = App(); if (!note || !app) return;
    const a = Date.parse(app.state?.sigem?.meta?.importedAt || 0), b = Date.parse(app.state?.pw?.meta?.importedAt || 0); if (!a || !b || Math.abs(a - b) < 86400000) { note.hidden = true; return; }
    note.hidden = false; note.innerHTML = `<span>ⓘ</span><div><strong>As bases possuem datas de atualização diferentes.</strong><br>As comparações refletem as últimas versões disponíveis. SIGEM: ${esc(fmtDate(a))} · PW: ${esc(fmtDate(b))}.</div>`;
  }
  function renderActions() {
    const target = document.getElementById("spw-action-grid"); if (!target) return; const latest = state.comparisons[state.comparisons.length - 1];
    if (!latest) { target.innerHTML = `<div class="spw-history-empty" style="grid-column:1/-1"><strong>Comparativo não disponível</strong>É necessário ter uma base válida do SIGEM e uma do PW para calcular o comparativo.</div>`; return; }
    const m = latest.metrics; const card = (label, value, css, note) => `<article class="spw-action-card ${css}"><span>${esc(label)}</span><strong>${fmt(value)}</strong><small>${esc(note)}</small></article>`;
    target.innerHTML = [card("Postar no PW", m.postPw, "attention", "Não localizado no PW ou PW em revisão anterior."), card("Postar no SIGEM", m.postSigem, "attention", "Exclusivo do PW ou PW em revisão posterior."), card("Aguardando emissão no PW", m.awaitingEmission, "pending", "Revisão correta cadastrada, ainda sem evidência de emissão."), card("Alinhados", m.aligned, "success", "Mesma revisão aplicável localizada e emitida no PW.")].join("");
  }
  function median(values) { const sorted = values.slice().sort((a, b) => a - b); if (!sorted.length) return 0; const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; }
  function anomalyFor(history, system) {
    if (history.length < 4) return null;
    const values = history.map((snapshot) => Number(classMetric(snapshot, system).total || 0));
    const ratios = []; for (let i = 1; i < values.length - 1; i += 1) if (values[i - 1] > 0) ratios.push(Math.abs(values[i] - values[i - 1]) / values[i - 1]);
    const previous = values[values.length - 2], current = values[values.length - 1]; if (!previous) return null;
    const latest = Math.abs(current - previous) / previous, baseline = median(ratios.slice(-8));
    const threshold = Math.max(0.05, baseline * 4); if (latest <= threshold) return null;
    return { system: system === "sigem" ? "SIGEM" : "ProjectWise", previous, current, variation: latest, threshold };
  }
  function renderAnomaly() {
    const note = document.getElementById("spw-anomaly-note"); if (!note) return; const alerts = [anomalyFor(state.sourceSigem, "sigem"), anomalyFor(state.sourcePw, "pw")].filter(Boolean);
    if (!alerts.length) { note.hidden = true; return; }
    note.hidden = false; const a = alerts[alerts.length - 1]; note.innerHTML = `<span>⚠</span><div><strong>Variação incomum na base ${esc(a.system)}.</strong><br>A quantidade comparável mudou de ${fmt(a.previous)} para ${fmt(a.current)}. Confirme se o arquivo corresponde ao escopo esperado. A base não foi rejeitada; o alerta usa o padrão histórico recente como referência.</div>`;
  }
  function trend(field, value) { const n = Number(value || 0); if (["postPw", "postSigem", "awaitingEmission"].includes(field)) return n < 0 ? ["progress", "redução de pendência"] : n > 0 ? ["attention", "aumento de pendência"] : ["neutral", "sem variação"]; if (["pwEmitted", "aligned"].includes(field)) return n > 0 ? ["progress", "avanço operacional"] : n < 0 ? ["attention", "quantidade diminuiu; confira a base"] : ["neutral", "sem variação"]; return ["neutral", n ? "variação do acervo" : "sem variação"]; }
  function renderDeltas(items) {
    const q = document.getElementById("spw-history-question"), target = document.getElementById("spw-history-deltas"); if (!q || !target) return;
    if (items.length < 2) { q.innerHTML = `<div><strong>Estamos evoluindo?</strong><span>Ainda não há atualizações suficientes para calcular evolução. O próximo arquivo válido permitirá comparar os resultados.</span></div><b>Aguardando próxima atualização</b>`; target.innerHTML = ""; return; }
    const previous = items[items.length - 2], current = items[items.length - 1], d = deltaView(previous, current), a = comparisonMetric(previous), b = comparisonMetric(current), pendingBefore = Number(a.postPw || 0) + Number(a.postSigem || 0) + Number(a.awaitingEmission || 0), pendingNow = Number(b.postPw || 0) + Number(b.postSigem || 0) + Number(b.awaitingEmission || 0), transitions = current.delta?.transitions;
    let verdict = "Evolução mista", explanation = "Houve movimentos em direções diferentes; consulte os deltas e as mudanças por documento.";
    if (pendingNow < pendingBefore && d.aligned >= 0) { verdict = "Avanço operacional"; explanation = `As pendências caíram em ${fmt(pendingBefore - pendingNow)} e os alinhados variaram ${deltaText(d.aligned)}.`; }
    else if (pendingNow > pendingBefore && d.aligned <= 0) { verdict = "Exige atenção"; explanation = `As pendências aumentaram em ${fmt(pendingNow - pendingBefore)}. Isso pode refletir novas revisões ou mudança de base; não é tratado automaticamente como exclusão.`; }
    q.innerHTML = `<div><strong>Estamos evoluindo?</strong><span>${esc(explanation)}</span></div><b>${esc(verdict)}</b>`;
    const cards = [["SIGEM", d.sigem, "sigem", "Acervo: variação informativa"], ["PW cadastrado", d.pwRegistered, "pwRegistered", "Acervo: variação informativa"], ["PW emitido", d.pwEmitted, "pwEmitted", "Mais emitidos representa avanço"], ["Pendentes para PW", d.postPw, "postPw", transitions ? `${fmt(transitions.resolved || 0)} pendência(s) resolvida(s)` : "Comparado ao ponto anterior"], ["Alinhados", d.aligned, "aligned", transitions ? `${fmt(transitions.becameAligned || 0)} passou(ram) a alinhado` : "Comparado ao ponto anterior"]];
    target.innerHTML = cards.map(([label, value, field, note]) => { const t = trend(field, value); return `<article class="spw-delta-card ${t[0]}"><span>${esc(label)}</span><strong>${esc(deltaText(value))}</strong><small>${esc(`${t[1]} · ${note}`)}</small></article>`; }).join("");
  }

  function chartSvg(items, series, valueOf) {
    if (!items.length) return `<div class="spw-history-empty"><strong>Sem histórico suficiente</strong>Os pontos aparecem somente quando uma base real é importada.</div>`;
    const width = 760, height = 250, left = 52, right = 16, top = 18, bottom = 38, plotW = width - left - right, plotH = height - top - bottom;
    const values = []; items.forEach((item) => series.forEach((s) => { const value = valueOf(item, s.key); if (value !== null && value !== undefined) values.push(Number(value)); })); const max = Math.max(1, ...values), yMax = max * 1.08;
    const x = (i) => left + (items.length === 1 ? plotW / 2 : i / (items.length - 1) * plotW), y = (v) => top + plotH - Number(v || 0) / yMax * plotH, parts = [];
    [0, .25, .5, .75, 1].forEach((ratio) => { const yy = top + plotH - ratio * plotH; parts.push(`<line class="spw-h-grid" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text class="spw-h-axis" text-anchor="end" x="${left - 7}" y="${yy + 4}">${fmt(Math.round(yMax * ratio))}</text>`); });
    const every = Math.max(1, Math.ceil(items.length / 7)); items.forEach((item, i) => { if (i % every === 0 || i === items.length - 1) parts.push(`<text class="spw-h-axis" text-anchor="middle" x="${x(i)}" y="${height - 14}">${esc(fmtShortDate(item.importedAt))}</text>`); });
    series.forEach((s) => {
      const available = items.map((item, i) => ({ item, i, value: valueOf(item, s.key) })).filter((point) => point.value !== null && point.value !== undefined); if (!available.length) return;
      parts.push(`<polyline class="spw-h-line ${s.css}" points="${available.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")}"/>`);
      available.forEach((p, localIndex) => { const prev = localIndex ? available[localIndex - 1].value : null, delta = prev === null ? "" : ` · variação ${deltaText(Number(p.value) - Number(prev))}`; parts.push(`<circle class="spw-h-point ${s.css}" cx="${x(p.i)}" cy="${y(p.value)}" r="4"><title>${esc(`${fmtDate(p.item.importedAt)} · ${s.label}: ${fmt(p.value)}${delta} · SIGEM: ${p.item.sigemFileName || "—"} · PW: ${p.item.pwFileName || "—"}`)}</title></circle>`); });
    });
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map((s) => s.label).join(", "))}">${parts.join("")}</svg>`;
  }
  function renderCharts(comparisons) {
    const acervo = sourceTimeline(); document.getElementById("spw-history-acervo").innerHTML = chartSvg(acervo, [{ key: "sigem", label: "SIGEM", css: "sigem" }, { key: "pwRegistered", label: "PW cadastrado", css: "pw" }, { key: "pwEmitted", label: "PW emitido", css: "issued" }], (item, key) => item[key]);
    document.getElementById("spw-history-pending").innerHTML = chartSvg(comparisons, [{ key: "postPw", label: "Postar no PW", css: "postpw" }, { key: "postSigem", label: "Postar no SIGEM", css: "postsigem" }, { key: "awaitingEmission", label: "Aguardando emissão", css: "awaiting" }], (snapshot, key) => comparisonMetric(snapshot)?.[key] ?? null);
  }
  function renderTable(items) {
    const target = document.getElementById("spw-history-table"), count = document.getElementById("spw-history-count"); if (!target) return; if (count) count.textContent = `${fmt(items.length)} snapshot(s) comparativo(s)`;
    if (!items.length) { target.innerHTML = `<div class="spw-history-empty"><strong>Sem comparativos registrados</strong>É necessário ter uma base válida do SIGEM e uma do PW. O histórico individual de cada sistema continua sendo preservado separadamente.</div>`; return; }
    const rows = items.slice().reverse().map((snapshot, ri) => { const oi = items.length - 1 - ri, previous = oi > 0 ? items[oi - 1] : null, m = comparisonMetric(snapshot), d = previous ? deltaView(previous, snapshot) : null, cell = (value, delta) => `${fmtMaybe(value)}${delta !== null && delta !== undefined ? `<span class="spw-h-delta">${esc(deltaText(delta))}</span>` : ""}`; return `<tr><td><button type="button" data-spw-history-snapshot="${esc(snapshot.id)}">${esc(fmtDate(snapshot.importedAt))}</button></td><td>${cell(m.sigem, d?.sigem)}</td><td>${cell(m.pwRegistered, d?.pwRegistered)}</td><td>${cell(m.pwEmitted, d?.pwEmitted)}</td><td>${cell(m.matched, d?.matched)}</td><td>${cell(m.postPw, d?.postPw)}</td><td>${cell(m.postSigem, d?.postSigem)}</td><td>${cell(m.aligned, d?.aligned)}</td><td>${pct(m.coverage)}</td></tr>`; }).join("");
    target.innerHTML = `<table class="spw-history-table"><thead><tr><th>Data</th><th>SIGEM</th><th>PW cadastrado</th><th>PW emitido</th><th>Nas duas bases</th><th>Postar PW</th><th>Postar SIGEM</th><th>Alinhados</th><th>Cobertura</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderSourceText() { const target = document.getElementById("spw-history-source"); if (!target) return; const s = state.sourceSigem.at(-1), p = state.sourcePw.at(-1); target.textContent = `Histórico individual: SIGEM ${state.sourceSigem.length} · PW ${state.sourcePw.length}. Últimos: SIGEM ${fmtDate(s?.importedAt)} · PW ${fmtDate(p?.importedAt)}.`; }
  function render() { const started = nowMs(); ensureSection(); renderAgeNotice(); renderActions(); renderAnomaly(); renderSourceText(); const items = filteredComparisons(); renderDeltas(items); renderCharts(items); renderTable(items); state.lastPerformance.renderMs = nowMs() - started; }

  async function loadHistory() { const started = nowMs(); [state.sourceSigem, state.sourcePw, state.comparisons] = await Promise.all([Core().listSourceSnapshots("sigem"), Core().listSourceSnapshots("pw"), Core().listComparisonSnapshots()]); state.lastPerformance.loadMs = nowMs() - started; }
  async function recordCurrent(reason, changedSystem) {
    if (state.syncing) return null; const app = App(); if (!app?.state) return null; state.syncing = true; const started = nowMs();
    try {
      const result = await Core().recordActiveBases(app.state.sigem, app.state.pw, { recordedAt: new Date().toISOString(), reason }); state.lastPerformance.recordMs = nowMs() - started; await loadHistory(); render();
      if (changedSystem && result?.[changedSystem]?.duplicate) notify("Esta base já foi registrada anteriormente. Ela permanece ativa sem criar um ponto histórico duplicado.", "info");
      return result;
    } catch (error) { console.error("[SIGEM×PW][history] registro:", error); notify("A base atual foi carregada, mas o histórico de evolução não pôde ser atualizado. As bases ativas foram preservadas.", "warn"); return null; }
    finally { state.syncing = false; }
  }
  async function syncAfterEvent(event, system) { try { if (event?.detail?.source !== "sigem-pw-dashboard" && App()?.refresh) await App().refresh("histórico SIGEM × PW"); await recordCurrent("base-updated", system); } catch (error) { console.error("[SIGEM×PW][history] sincronização:", error); } }

  function transitionReason(item) {
    const before = item?.before, after = item?.after;
    if (item?.mode === "resolved") return `Passou de ${before?.state || "pendente"} para alinhado.`;
    if (item?.mode === "new-pending" && before?.state === "aligned" && after?.state === "post-pw" && text(before?.sigemRevision) !== text(after?.sigemRevision)) return "Nova revisão identificada no SIGEM ainda não refletida no PW.";
    if (item?.mode === "new-pending") return `Passou de ${before?.state || "sem pendência"} para ${after?.state || "pendente"}.`;
    if (item?.mode === "changed-revision") return `SIGEM ${before?.sigemRevision || "—"} → ${after?.sigemRevision || "—"}; PW ${before?.pwRevision || "—"} → ${after?.pwRevision || "—"}.`;
    return `${before?.state || "—"} → ${after?.state || "—"}`;
  }
  function changeList(title, rows, empty) {
    const values = rows || []; return `<section class="spw-history-change"><h4>${esc(title)} · ${fmt(values.length)}</h4><div class="spw-history-change-list">${values.length ? values.slice(0, 250).map((item) => { const row = item.after || item.before || {}; return `<div><strong>${esc(row.document || row.key || item.key)}</strong><span>${esc(row.documentClass || "")} · ${esc(transitionReason(item))}</span></div>`; }).join("") : `<div>${esc(empty)}</div>`}${values.length > 250 ? `<div><strong>Lista resumida</strong><span>Exibindo os primeiros 250 de ${fmt(values.length)} itens para manter a interface responsiva.</span></div>` : ""}</div></section>`;
  }
  async function openSnapshot(id) {
    const snapshot = state.comparisons.find((item) => item.id === id); if (!snapshot) return; const overlay = document.getElementById("spw-history-overlay"), body = document.getElementById("spw-history-detail-body"); if (!overlay || !body) return; overlay.hidden = false; state.selectedSnapshotId = id; document.getElementById("spw-history-detail-title").textContent = fmtDate(snapshot.importedAt); document.getElementById("spw-history-detail-subtitle").textContent = `SIGEM: ${snapshot.sigemFileName || "—"} · PW: ${snapshot.pwFileName || "—"}`; body.innerHTML = `<div class="spw-history-empty"><strong>Carregando mudanças desta atualização…</strong>O detalhamento é lido somente agora.</div>`;
    try {
      const changes = await Core().loadSnapshotChanges(snapshot.id), m = snapshot.metrics, d = snapshot.delta?.metrics, sourceS = state.sourceSigem.find((s) => s.id === snapshot.sigemSnapshotId), sourceP = state.sourcePw.find((p) => p.id === snapshot.pwSnapshotId);
      body.innerHTML = `<div class="spw-history-detail-grid"><article><span>SIGEM</span><strong>${fmt(m.sigem)}</strong></article><article><span>PW cadastrado</span><strong>${fmt(m.pwRegistered)}</strong></article><article><span>PW emitido</span><strong>${fmt(m.pwEmitted)}</strong></article><article><span>Postar no PW</span><strong>${fmt(m.postPw)}</strong></article><article><span>Postar no SIGEM</span><strong>${fmt(m.postSigem)}</strong></article><article><span>Alinhados</span><strong>${fmt(m.aligned)}</strong></article><article><span>Cobertura</span><strong>${pct(m.coverage)}</strong></article><article><span>Taxa de emissão PW</span><strong>${pct(m.emissionRate)}</strong></article><article><span>Motor</span><strong>${esc(snapshot.calculationVersion)}</strong></article></div><section class="spw-history-change"><h4>Fontes e qualidade</h4><div class="spw-history-change-list"><div><strong>SIGEM · ${esc(snapshot.sigemFileName || "—")}</strong><span>${esc(fmtDate(snapshot.sigemImportedAt))} · ${fmt(sourceS?.metrics?.rawRecords || 0)} registros brutos · ${fmt(sourceS?.metrics?.outsideScope || 0)} fora do escopo · ${fmt(sourceS?.metrics?.invalidRecords || 0)} inválidos</span></div><div><strong>ProjectWise · ${esc(snapshot.pwFileName || "—")}</strong><span>${esc(fmtDate(snapshot.pwImportedAt))} · ${fmt(sourceP?.metrics?.rawRecords || 0)} registros brutos · ${fmt(sourceP?.metrics?.outsideScope || 0)} fora do escopo · ${fmt(sourceP?.metrics?.invalidRecords || 0)} inválidos</span></div>${d ? `<div><strong>Variação agregada</strong><span>SIGEM ${deltaText(d.sigem)} · PW ${deltaText(d.pwRegistered)} · emitidos ${deltaText(d.pwEmitted)} · Postar PW ${deltaText(d.postPw)} · alinhados ${deltaText(d.aligned)}</span></div>` : ""}</div></section>${snapshot.delta ? changeList("Pendências resolvidas", changes?.resolved, "Nenhuma pendência passou a alinhada.") + changeList("Novas pendências", changes?.newPending, "Nenhuma nova pendência identificada.") + changeList("Passaram a ficar alinhados", changes?.becameAligned, "Nenhum documento mudou para alinhado.") + changeList("Mudaram de revisão", changes?.changedRevision, "Nenhuma mudança de revisão.") : `<section class="spw-history-change"><h4>Primeiro comparativo</h4><div class="spw-history-change-list"><div>Não existe ponto anterior para calcular mudanças.</div></div></section>`}`;
    } catch (error) { body.innerHTML = `<div class="spw-history-empty"><strong>Não foi possível carregar o detalhamento.</strong>${esc(error.message || error)}</div>`; }
  }
  function closeDetails() { const overlay = document.getElementById("spw-history-overlay"); if (overlay) overlay.hidden = true; state.selectedSnapshotId = ""; }

  async function exportHistory() {
    if (!state.comparisons.length && !state.sourceSigem.length && !state.sourcePw.length) return notify("Ainda não há histórico para exportar.", "info");
    try {
      if (root.GRCONModuleLoader) await root.GRCONModuleLoader.ensure("xlsx"); if (!root.XLSX) throw new Error("Motor Excel indisponível.");
      const wb = root.XLSX.utils.book_new();
      const comparisonRows = state.comparisons.map((s) => ({ Data: s.importedAt, "Arquivo SIGEM": s.sigemFileName, "Arquivo PW": s.pwFileName, SIGEM: s.metrics.sigem, "PW cadastrado": s.metrics.pwRegistered, "PW emitido": s.metrics.pwEmitted, "Nas duas bases": s.metrics.matched, "Postar PW": s.metrics.postPw, "Postar SIGEM": s.metrics.postSigem, "Aguardando emissão": s.metrics.awaitingEmission, Alinhados: s.metrics.aligned, Cobertura: s.metrics.coverage, "Taxa emissão PW": s.metrics.emissionRate, "Pendências resolvidas": s.delta?.transitions?.resolved || 0, "Novas pendências": s.delta?.transitions?.newPending || 0, "Versão cálculo": s.calculationVersion }));
      const sourceRows = (items) => items.map((s) => ({ Data: s.importedAt, Arquivo: s.fileName, Fingerprint: s.fingerprint, "Registros brutos": s.metrics.rawRecords, "Documentos comparáveis": s.metrics.comparableDocuments, ET: s.metrics.classes?.ET || 0, "N-1710": s.metrics.classes?.["N-1710"] || 0, CV: s.metrics.classes?.CV || 0, "Fora do escopo": s.metrics.outsideScope, Inválidos: s.metrics.invalidRecords, Emitidos: s.metrics.emittedDocuments, "Versão cálculo": s.calculationVersion }));
      root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.json_to_sheet(comparisonRows.length ? comparisonRows : [{ Informação: "Ainda sem comparativo SIGEM × PW" }]), "Comparativo");
      root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.json_to_sheet(sourceRows(state.sourceSigem)), "SIGEM"); root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.json_to_sheet(sourceRows(state.sourcePw)), "ProjectWise");
      const buffer = root.XLSX.write(wb, { bookType: "xlsx", type: "array" }); downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `GRCON_Historico_SIGEM_PW_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`);
    } catch (error) { notify(error.message || "Não foi possível exportar o histórico.", "error"); }
  }
  async function manageHistory() {
    const total = state.sourceSigem.length + state.sourcePw.length + state.comparisons.length; if (!total) return notify("O histórico ainda está vazio.", "info");
    if (!root.confirm(`Gerenciar histórico\n\nExistem ${total} snapshots locais.\n\nOK = limpar o histórico de evolução desta máquina.\nCancelar = manter tudo.\n\nAs bases SIGEM/PW ativas não serão apagadas.`)) return;
    if (!root.confirm("Confirma a exclusão permanente dos snapshots históricos locais? As bases ativas permanecem intactas.")) return;
    try { await Core().clearHistory(); await loadHistory(); render(); notify("Histórico de evolução local limpo. As bases ativas foram preservadas.", "success"); } catch (error) { notify(error.message || "Não foi possível limpar o histórico.", "error"); }
  }

  async function activate() { ensureSection(); if (!state.ready) { await loadHistory(); state.ready = true; } await recordCurrent("dashboard-open", null); render(); }
  root.addEventListener("grcon:conference-updated", (event) => { void syncAfterEvent(event, "sigem"); });
  root.addEventListener("grcon:pw-base-updated", (event) => { void syncAfterEvent(event, "pw"); });
  root.GrconSigemPwHistoryUi = Object.freeze({ activate, refresh: async () => { await loadHistory(); render(); }, recordCurrent, state });
})(window);
