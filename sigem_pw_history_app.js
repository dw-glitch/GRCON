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
  function escapeHtml(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function pct(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—"; }
  function fmtDate(value) { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d) : "Não disponível"; }
  function fmtShortDate(value) { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d) : "—"; }
  function deltaText(value, suffix) { const n = Number(value || 0); return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmt(Math.abs(n))}${suffix || ""}`; }
  function notify(message, kind) { if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info"); else if (kind === "error") root.alert(message); }
  function nowMs() { return root.performance && root.performance.now ? root.performance.now() : Date.now(); }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID}{margin-top:16px}.spw-inner-nav{position:sticky;top:0;z-index:7;display:flex;gap:6px;flex-wrap:wrap;padding:8px;margin:0 0 10px;border:1px solid var(--border,#dce4eb);border-radius:11px;background:color-mix(in srgb,var(--surface,#fff) 94%,transparent);backdrop-filter:blur(8px)}.spw-inner-nav button{min-height:34px;padding:6px 10px;border:0;border-radius:8px;background:transparent;color:var(--text-muted,#617486);font-size:.72rem;font-weight:900;cursor:pointer}.spw-inner-nav button:hover,.spw-inner-nav button:focus-visible{background:var(--brand-50,#eaf5fb);color:var(--brand-800,#155c8a)}
      .spw-base-age{display:flex;gap:8px;align-items:flex-start;margin:8px 0 0;padding:9px 11px;border:1px solid var(--warning-200,#ead7aa);border-radius:9px;background:var(--warning-50,#fff9ea);color:var(--text-muted,#617486);font-size:.72rem;line-height:1.4}.spw-base-age[hidden]{display:none}.spw-base-age strong{color:var(--text-strong,#294258)}
      .spw-action-section{margin-top:14px}.spw-action-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.spw-action-card{border:1px solid var(--border,#dce4eb);border-radius:12px;background:var(--surface,#fff);padding:11px 12px;box-shadow:0 5px 18px rgba(32,56,85,.04)}.spw-action-card span{font-size:.62rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-action-card strong{display:block;margin-top:5px;font-size:1.35rem;color:var(--text-strong,#17324a)}.spw-action-card small{display:block;margin-top:4px;color:var(--text-muted,#66798a);font-size:.68rem;line-height:1.35}.spw-action-card.attention{border-left:4px solid var(--warning-500,#c68a28)}.spw-action-card.pending{border-left:4px solid var(--brand-500,#2789b6)}.spw-action-card.success{border-left:4px solid var(--success-500,#3f8f68)}
      .spw-history-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:9px}.spw-history-head h3{margin:0;color:var(--text-strong,#183247);font-size:1.05rem}.spw-history-head p{max-width:850px;margin:4px 0 0;color:var(--text-muted,#66798a);font-size:.75rem;line-height:1.45}.spw-history-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.spw-history-actions button{min-height:34px}
      .spw-history-filters{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-bottom:9px;padding:9px 10px;border:1px solid var(--border,#dce4eb);border-radius:10px;background:var(--surface,#fff)}.spw-history-filters label{display:grid;gap:4px;min-width:150px}.spw-history-filters label span{font-size:.61rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-history-filters select{min-height:35px}.spw-history-source{margin-left:auto;color:var(--text-muted,#66798a);font-size:.68rem;max-width:520px;text-align:right}
      .spw-history-question{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 13px;border:1px solid var(--border,#dce4eb);border-radius:12px;background:var(--surface-soft,#f7fafc);margin-bottom:9px}.spw-history-question strong{display:block;color:var(--text-strong,#183247);font-size:.86rem}.spw-history-question span{display:block;margin-top:3px;color:var(--text-muted,#66798a);font-size:.72rem;line-height:1.4}.spw-history-question b{white-space:nowrap;color:var(--brand-800,#155c8a);font-size:.78rem}
      .spw-delta-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:9px}.spw-delta-card{border:1px solid var(--border,#dce4eb);border-radius:11px;background:var(--surface,#fff);padding:10px 11px}.spw-delta-card span{font-size:.61rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-delta-card strong{display:block;margin-top:5px;font-size:1.12rem;color:var(--text-strong,#17324a)}.spw-delta-card small{display:block;margin-top:3px;font-size:.66rem;color:var(--text-muted,#66798a)}.spw-delta-card.progress{border-left:4px solid var(--success-500,#3f8f68)}.spw-delta-card.attention{border-left:4px solid var(--warning-500,#c68a28)}.spw-delta-card.neutral{border-left:4px solid var(--brand-400,#55a6ca)}
      .spw-history-charts{display:grid;grid-template-columns:1fr 1fr;gap:9px}.spw-history-card{border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(32,56,85,.04);overflow:hidden}.spw-history-card header{padding:12px 13px 7px}.spw-history-card header strong{display:block;color:var(--text-strong,#183247);font-size:.88rem}.spw-history-card header small{display:block;margin-top:3px;color:var(--text-muted,#66798a);font-size:.68rem;line-height:1.4}.spw-history-chart{overflow-x:auto;padding:0 8px 8px}.spw-history-chart svg{display:block;width:100%;min-width:520px;height:auto}.spw-h-grid{stroke:var(--border,#e7edf2);stroke-width:1}.spw-h-axis{fill:var(--text-muted,#718291);font-size:10px}.spw-h-line{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.spw-h-line.sigem{stroke:var(--spw-sigem,#0b7895)}.spw-h-line.pw{stroke:var(--spw-pw,#6d4ac7)}.spw-h-line.issued{stroke:var(--spw-issued,#b16a16)}.spw-h-line.postpw{stroke:var(--warning-600,#a66b14)}.spw-h-line.postsigem{stroke:var(--danger-500,#c74b43)}.spw-h-line.awaiting{stroke:var(--brand-500,#2789b6)}.spw-h-point{stroke:var(--surface,#fff);stroke-width:2}.spw-h-point.sigem{fill:var(--spw-sigem,#0b7895)}.spw-h-point.pw{fill:var(--spw-pw,#6d4ac7)}.spw-h-point.issued{fill:var(--spw-issued,#b16a16)}.spw-h-point.postpw{fill:var(--warning-600,#a66b14)}.spw-h-point.postsigem{fill:var(--danger-500,#c74b43)}.spw-h-point.awaiting{fill:var(--brand-500,#2789b6)}.spw-h-legend{display:flex;gap:8px;flex-wrap:wrap;padding:0 13px 9px;color:var(--text-muted,#66798a);font-size:.65rem}.spw-h-legend span:before{content:"";display:inline-block;width:9px;height:3px;margin-right:5px;vertical-align:middle;background:currentColor}.spw-h-legend .sigem{color:var(--spw-sigem,#0b7895)}.spw-h-legend .pw{color:var(--spw-pw,#6d4ac7)}.spw-h-legend .issued{color:var(--spw-issued,#b16a16)}
      .spw-history-table-card{margin-top:9px;border:1px solid var(--border,#dce4eb);border-radius:13px;background:var(--surface,#fff);overflow:hidden}.spw-history-table-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:12px 13px 8px}.spw-history-table-head strong{color:var(--text-strong,#183247);font-size:.88rem}.spw-history-table-head small{color:var(--text-muted,#66798a);font-size:.68rem}.spw-history-table-wrap{overflow:auto;max-height:420px}.spw-history-table{width:100%;border-collapse:collapse;font-size:.7rem}.spw-history-table th,.spw-history-table td{padding:8px 9px;border-top:1px solid var(--border,#edf1f4);text-align:left;white-space:nowrap}.spw-history-table thead th{position:sticky;top:0;background:var(--surface-soft,#f6f9fb);font-size:.58rem;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-history-table button{border:0;background:transparent;color:var(--brand-700,#155c8a);font-weight:900;cursor:pointer}.spw-h-delta{display:block;margin-top:2px;font-size:.61rem;color:var(--text-muted,#66798a)}.spw-history-empty{padding:28px 16px;text-align:center;color:var(--text-muted,#66798a)}.spw-history-empty strong{display:block;color:var(--text-strong,#294258);margin-bottom:4px}
      .spw-history-overlay{position:fixed;inset:0;z-index:10020;background:rgba(18,37,52,.38);display:flex;justify-content:flex-end}.spw-history-overlay[hidden]{display:none}.spw-history-drawer{width:min(760px,94vw);height:100%;background:var(--surface,#fff);box-shadow:-14px 0 40px rgba(20,40,60,.18);overflow:auto;padding:15px}.spw-history-drawer header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.spw-history-drawer h3{margin:3px 0;color:var(--text-strong,#183247)}.spw-history-drawer p{margin:0;color:var(--text-muted,#66798a);font-size:.72rem}.spw-history-close{border:0;background:var(--surface-soft,#eef3f6);width:34px;height:34px;border-radius:50%;font-size:1.2rem;cursor:pointer}.spw-history-detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.spw-history-detail-grid article{padding:9px;border:1px solid var(--border,#dce4eb);border-radius:9px}.spw-history-detail-grid span{font-size:.6rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-history-detail-grid strong{display:block;margin-top:4px;color:var(--text-strong,#183247)}.spw-history-change{margin-top:12px}.spw-history-change h4{margin:0 0 6px;font-size:.78rem;color:var(--text-strong,#294258)}.spw-history-change-list{max-height:220px;overflow:auto;border:1px solid var(--border,#e4eaef);border-radius:8px}.spw-history-change-list div{padding:7px 8px;border-top:1px solid var(--border,#eef2f5);font-size:.67rem}.spw-history-change-list div:first-child{border-top:0}.spw-history-change-list strong{display:block;color:var(--text-strong,#294258)}.spw-history-change-list span{color:var(--text-muted,#66798a)}
      @media(max-width:1180px){.spw-delta-grid{grid-template-columns:repeat(3,1fr)}.spw-history-charts{grid-template-columns:1fr}.spw-action-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:760px){.spw-history-head{display:grid}.spw-history-actions{justify-content:flex-start}.spw-history-source{margin-left:0;text-align:left}.spw-delta-grid,.spw-action-grid,.spw-history-detail-grid{grid-template-columns:1fr 1fr}.spw-inner-nav{position:static}}
      @media(max-width:520px){.spw-delta-grid,.spw-action-grid,.spw-history-detail-grid{grid-template-columns:1fr}.spw-history-question{display:grid}}
    `;
    document.head.appendChild(style);
  }

  function shell() { return document.getElementById("sigem-pw-dashboard-module"); }
  function ensureNavigation() {
    const host = shell(); if (!host || document.getElementById("spw-inner-nav")) return;
    const nav = document.createElement("nav");
    nav.id = "spw-inner-nav";
    nav.className = "spw-inner-nav";
    nav.setAttribute("aria-label", "Seções do Dashboard SIGEM × PW");
    nav.innerHTML = `<button type="button" data-spw-jump="spw-current-anchor">Visão geral</button><button type="button" data-spw-jump="spw-action-anchor">Pendências</button><button type="button" data-spw-jump="spw-revision-section">Revisões</button><button type="button" data-spw-jump="${SECTION_ID}">Evolução</button>`;
    const heading = host.querySelector(".spw-page-heading");
    if (heading) heading.insertAdjacentElement("afterend", nav); else host.prepend(nav);
    let current = document.getElementById("spw-current-anchor");
    if (!current) { current = document.createElement("span"); current.id = "spw-current-anchor"; current.hidden = true; host.querySelector(".spw-section-title")?.insertAdjacentElement("beforebegin", current); }
  }
  function ensureAgeNotice() {
    const host = shell(); if (!host || document.getElementById("spw-base-age-note")) return;
    const note = document.createElement("div"); note.id = "spw-base-age-note"; note.className = "spw-base-age"; note.hidden = true;
    host.querySelector(".spw-base-grid")?.insertAdjacentElement("afterend", note);
  }
  function ensureActionSection() {
    const host = shell(); if (!host || document.getElementById("spw-action-section")) return;
    const section = document.createElement("section");
    section.id = "spw-action-section"; section.className = "spw-action-section";
    section.innerHTML = `<span id="spw-action-anchor" hidden></span><div class="spw-section-title"><div><span class="spw-kicker">O QUE PRECISA SER FEITO</span><h3>Fila operacional entre os sistemas</h3><p>Transforma a diferença entre as bases em ações concretas, sem misturar “cadastrado” com “emitido”.</p></div></div><div class="spw-action-grid" id="spw-action-grid"></div>`;
    const executive = host.querySelector(".spw-executive");
    if (executive) executive.insertAdjacentElement("afterend", section); else host.appendChild(section);
  }
  function ensureSection() {
    ensureStyle(); ensureNavigation(); ensureAgeNotice(); ensureActionSection();
    const host = shell(); if (!host) return null;
    let section = document.getElementById(SECTION_ID);
    if (!section) {
      section = document.createElement("section"); section.id = SECTION_ID;
      section.innerHTML = `
        <header class="spw-history-head"><div><span class="spw-kicker">EVOLUÇÃO OPERACIONAL</span><h3>Evolução SIGEM × ProjectWise</h3><p>Acompanhe como o acervo, as emissões, o alinhamento e as pendências mudam a cada versão real das bases importadas. Nenhum dia é criado artificialmente.</p></div><div class="spw-history-actions"><button class="secondary-button" id="spw-history-export" type="button">Exportar histórico</button><button class="text-button" id="spw-history-clear" type="button">Gerenciar histórico</button></div></header>
        <div class="spw-history-filters"><label><span>Classe documental</span><select id="spw-history-class"><option value="">Todas as classes</option><option>ET</option><option>N-1710</option><option>CV</option></select></label><label><span>Período</span><select id="spw-history-period"><option value="7">Últimos 7 dias</option><option value="30" selected>Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todo período</option></select></label><div class="spw-history-source" id="spw-history-source"></div></div>
        <div class="spw-history-question" id="spw-history-question"></div>
        <div class="spw-delta-grid" id="spw-history-deltas"></div>
        <div class="spw-history-charts"><article class="spw-history-card"><header><strong>Evolução do acervo documental</strong><small>Acompanhe SIGEM, PW cadastrado e PW emitido a cada atualização das bases.</small></header><div class="spw-h-legend"><span class="sigem">SIGEM</span><span class="pw">PW cadastrado</span><span class="issued">PW emitido</span></div><div class="spw-history-chart" id="spw-history-acervo"></div></article><article class="spw-history-card"><header><strong>Evolução das pendências</strong><small>Para pendências, diminuir geralmente representa avanço operacional. Crescimento do acervo, por outro lado, é informativo.</small></header><div class="spw-history-chart" id="spw-history-pending"></div></article></div>
        <article class="spw-history-table-card"><div class="spw-history-table-head"><div><strong>Histórico do comparativo</strong><br><small>Cada linha representa uma combinação real das últimas bases SIGEM e PW disponíveis naquele momento.</small></div><small id="spw-history-count"></small></div><div class="spw-history-table-wrap" id="spw-history-table"></div></article>
        <div class="spw-history-overlay" id="spw-history-overlay" hidden><aside class="spw-history-drawer" role="dialog" aria-modal="true" aria-labelledby="spw-history-detail-title"><header><div><span class="spw-kicker">DETALHES DA ATUALIZAÇÃO</span><h3 id="spw-history-detail-title">Snapshot</h3><p id="spw-history-detail-subtitle"></p></div><button class="spw-history-close" id="spw-history-close" type="button" aria-label="Fechar">×</button></header><div id="spw-history-detail-body"></div></aside></div>`;
      const revision = document.getElementById("spw-revision-section");
      if (revision) revision.insertAdjacentElement("afterend", section); else host.appendChild(section);
    }
    bind();
    return section;
  }

  function bind() {
    const host = shell(); if (!host || host.dataset.spwHistoryBound === "1") return;
    host.dataset.spwHistoryBound = "1";
    host.addEventListener("click", (event) => {
      const jump = event.target.closest("[data-spw-jump]");
      if (jump) { document.getElementById(jump.getAttribute("data-spw-jump"))?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const snapshot = event.target.closest("[data-spw-history-snapshot]");
      if (snapshot) { void openSnapshot(snapshot.getAttribute("data-spw-history-snapshot")); return; }
      if (event.target.closest("#spw-history-close")) closeDetails();
      if (event.target.closest("#spw-history-export")) exportHistory();
      if (event.target.closest("#spw-history-clear")) void manageHistory();
    });
    host.addEventListener("change", (event) => {
      if (event.target.id === "spw-history-class") { state.documentClass = event.target.value; render(); }
      if (event.target.id === "spw-history-period") { state.period = event.target.value; render(); }
    });
    root.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDetails(); });
  }

  function currentMetric(snapshot) {
    if (!snapshot) return null;
    if (!state.documentClass) return snapshot.metrics;
    return (snapshot.metrics && snapshot.metrics.classes || []).find((row) => row.documentClass === state.documentClass) || {
      sigem: 0, pwRegistered: 0, pwEmitted: 0, matched: 0, sigemOnly: 0, pwOnly: 0, aligned: 0, postPw: 0, postSigem: 0, awaitingEmission: 0, coverage: null, emissionRate: null,
    };
  }
  function filteredComparisons() {
    let items = state.comparisons.slice();
    if (state.period !== "all") {
      const days = Number(state.period || 30); const cutoff = Date.now() - days * 86400000;
      items = items.filter((snapshot) => Date.parse(snapshot.importedAt || snapshot.recordedAt || 0) >= cutoff);
    }
    return items;
  }
  function metricDeltaForView(previous, current) {
    const a = currentMetric(previous), b = currentMetric(current); if (!a || !b) return null;
    const fields = ["sigem", "pwRegistered", "pwEmitted", "matched", "postPw", "postSigem", "awaitingEmission", "aligned"];
    const out = {}; fields.forEach((field) => { out[field] = Number(b[field] || 0) - Number(a[field] || 0); });
    out.coverage = Number.isFinite(a.coverage) && Number.isFinite(b.coverage) ? b.coverage - a.coverage : null;
    out.emissionRate = Number.isFinite(a.emissionRate) && Number.isFinite(b.emissionRate) ? b.emissionRate - a.emissionRate : null;
    return out;
  }

  function renderAgeNotice() {
    const note = document.getElementById("spw-base-age-note"), app = App(); if (!note || !app) return;
    const a = Date.parse(app.state?.sigem?.meta?.importedAt || 0), b = Date.parse(app.state?.pw?.meta?.importedAt || 0);
    if (!a || !b) { note.hidden = true; return; }
    const diffHours = Math.abs(a - b) / 3600000;
    if (diffHours < 24) { note.hidden = true; return; }
    note.hidden = false;
    note.innerHTML = `<span>ⓘ</span><div><strong>As bases possuem datas de atualização diferentes.</strong><br>As comparações refletem as últimas versões disponíveis de cada sistema. SIGEM: ${escapeHtml(fmtDate(a))} · PW: ${escapeHtml(fmtDate(b))}.</div>`;
  }
  function renderActionCards() {
    const target = document.getElementById("spw-action-grid"); if (!target) return;
    const latest = state.comparisons[state.comparisons.length - 1];
    if (!latest) { target.innerHTML = `<div class="spw-history-empty" style="grid-column:1/-1"><strong>Comparativo não disponível</strong>É necessário ter uma base válida do SIGEM e uma do PW para calcular as ações entre os sistemas.</div>`; return; }
    const m = latest.metrics;
    const card = (label, value, css, note) => `<article class="spw-action-card ${css}"><span>${escapeHtml(label)}</span><strong>${fmt(value)}</strong><small>${escapeHtml(note)}</small></article>`;
    target.innerHTML = [
      card("Postar no PW", m.postPw, "attention", "Não localizado no PW ou PW em revisão anterior."),
      card("Postar no SIGEM", m.postSigem, "attention", "Exclusivos do PW ou PW em revisão posterior, conforme estado consolidado."),
      card("Aguardando emissão no PW", m.awaitingEmission, "pending", "Revisão correta cadastrada, mas ainda sem evidência de emissão."),
      card("Alinhados", m.aligned, "success", "Mesma revisão aplicável localizada e emitida no PW."),
    ].join("");
  }

  function trendSemantic(field, delta) {
    const n = Number(delta || 0);
    if (["postPw", "postSigem", "awaitingEmission"].includes(field)) return n < 0 ? ["progress", "redução de pendência"] : n > 0 ? ["attention", "aumento de pendência"] : ["neutral", "sem variação"];
    if (["pwEmitted", "aligned"].includes(field)) return n > 0 ? ["progress", "avanço operacional"] : n < 0 ? ["attention", "quantidade diminuiu; verifique a base"] : ["neutral", "sem variação"];
    return ["neutral", n ? "variação do acervo" : "sem variação"];
  }
  function renderQuestionAndDeltas(items) {
    const q = document.getElementById("spw-history-question"), target = document.getElementById("spw-history-deltas"); if (!q || !target) return;
    if (items.length < 2) {
      q.innerHTML = `<div><strong>Estamos evoluindo?</strong><span>Ainda não há atualizações suficientes para calcular evolução. O próximo arquivo válido permitirá comparar os resultados.</span></div><b>Aguardando próxima atualização</b>`;
      target.innerHTML = ""; return;
    }
    const previous = items[items.length - 2], current = items[items.length - 1], delta = metricDeltaForView(previous, current), transition = current.delta && current.delta.transitions;
    const pendingBefore = Number(currentMetric(previous).postPw || 0) + Number(currentMetric(previous).postSigem || 0) + Number(currentMetric(previous).awaitingEmission || 0);
    const pendingNow = Number(currentMetric(current).postPw || 0) + Number(currentMetric(current).postSigem || 0) + Number(currentMetric(current).awaitingEmission || 0);
    let verdict = "Evolução mista"; let explanation = "Houve movimentos em direções diferentes; consulte os deltas e as mudanças por documento.";
    if (pendingNow < pendingBefore && delta.aligned >= 0) { verdict = "Avanço operacional"; explanation = `O total de pendências caiu em ${fmt(pendingBefore - pendingNow)} e os alinhados variaram ${deltaText(delta.aligned)} desde o comparativo anterior.`; }
    else if (pendingNow > pendingBefore && delta.aligned <= 0) { verdict = "Exige atenção"; explanation = `O total de pendências aumentou em ${fmt(pendingNow - pendingBefore)}. Isso pode refletir novas revisões ou mudança de base; não é tratado automaticamente como exclusão.`; }
    q.innerHTML = `<div><strong>Estamos evoluindo?</strong><span>${escapeHtml(explanation)}</span></div><b>${escapeHtml(verdict)}</b>`;
    const cards = [
      ["SIGEM", delta.sigem, "sigem", "Acervo: variação informativa"],
      ["PW cadastrado", delta.pwRegistered, "pwRegistered", "Acervo: variação informativa"],
      ["PW emitido", delta.pwEmitted, "pwEmitted", "Mais emitidos representa avanço"],
      ["Pendentes para PW", delta.postPw, "postPw", transition ? `${fmt(transition.resolved || 0)} pendência(s) resolvida(s)` : "Comparado ao ponto anterior"],
      ["Alinhados", delta.aligned, "aligned", transition ? `${fmt(transition.becameAligned || 0)} passou(ram) a alinhado` : "Comparado ao ponto anterior"],
    ];
    target.innerHTML = cards.map(([label, value, field, note]) => { const semantic = trendSemantic(field, value); return `<article class="spw-delta-card ${semantic[0]}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(deltaText(value))}</strong><small>${escapeHtml(`${semantic[1]} · ${note}`)}</small></article>`; }).join("");
  }

  function chartSvg(items, series, metricSelector) {
    if (!items.length) return `<div class="spw-history-empty"><strong>Sem histórico suficiente</strong>Os pontos aparecem somente quando uma base real é importada.</div>`;
    const width = 760, height = 250, margin = { top: 18, right: 16, bottom: 38, left: 52 }, plotW = width - margin.left - margin.right, plotH = height - margin.top - margin.bottom;
    const values = []; items.forEach((snapshot) => series.forEach((entry) => values.push(Number(metricSelector(snapshot, entry.key) || 0))));
    const max = Math.max(1, ...values); const yMax = max * 1.08; const x = (index) => margin.left + (items.length === 1 ? plotW / 2 : index / (items.length - 1) * plotW); const y = (value) => margin.top + plotH - Number(value || 0) / yMax * plotH;
    const parts = [];
    [0, .25, .5, .75, 1].forEach((ratio) => { const yy = margin.top + plotH - ratio * plotH; parts.push(`<line class="spw-h-grid" x1="${margin.left}" y1="${yy}" x2="${width - margin.right}" y2="${yy}"/><text class="spw-h-axis" text-anchor="end" x="${margin.left - 7}" y="${yy + 4}">${fmt(Math.round(yMax * ratio))}</text>`); });
    const labelEvery = Math.max(1, Math.ceil(items.length / 7)); items.forEach((snapshot, index) => { if (index % labelEvery === 0 || index === items.length - 1) parts.push(`<text class="spw-h-axis" text-anchor="middle" x="${x(index)}" y="${height - 14}">${escapeHtml(fmtShortDate(snapshot.importedAt))}</text>`); });
    series.forEach((entry) => {
      const points = items.map((snapshot, index) => `${x(index)},${y(metricSelector(snapshot, entry.key))}`).join(" ");
      parts.push(`<polyline class="spw-h-line ${entry.css}" points="${points}"/>`);
      items.forEach((snapshot, index) => {
        const value = metricSelector(snapshot, entry.key), previous = index ? metricSelector(items[index - 1], entry.key) : null, delta = previous === null ? "" : ` · variação ${deltaText(Number(value || 0) - Number(previous || 0))}`;
        parts.push(`<circle class="spw-h-point ${entry.css}" cx="${x(index)}" cy="${y(value)}" r="4"><title>${escapeHtml(`${fmtDate(snapshot.importedAt)} · ${entry.label}: ${fmt(value)}${delta} · SIGEM: ${snapshot.sigemFileName || "—"} · PW: ${snapshot.pwFileName || "—"}`)}</title></circle>`);
      });
    });
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(series.map((item) => item.label).join(", "))}">${parts.join("")}</svg>`;
  }
  function renderCharts(items) {
    const metric = (snapshot, key) => Number(currentMetric(snapshot)?.[key] || 0);
    document.getElementById("spw-history-acervo").innerHTML = chartSvg(items, [{ key: "sigem", label: "SIGEM", css: "sigem" }, { key: "pwRegistered", label: "PW cadastrado", css: "pw" }, { key: "pwEmitted", label: "PW emitido", css: "issued" }], metric);
    document.getElementById("spw-history-pending").innerHTML = chartSvg(items, [{ key: "postPw", label: "Postar no PW", css: "postpw" }, { key: "postSigem", label: "Postar no SIGEM", css: "postsigem" }, { key: "awaitingEmission", label: "Aguardando emissão", css: "awaiting" }], metric);
  }
  function renderTable(items) {
    const target = document.getElementById("spw-history-table"), count = document.getElementById("spw-history-count"); if (!target) return;
    if (count) count.textContent = `${fmt(items.length)} snapshot(s) comparativo(s)`;
    if (!items.length) { target.innerHTML = `<div class="spw-history-empty"><strong>Sem comparativos registrados</strong>É necessário ter uma base válida do SIGEM e uma do PW. O histórico individual continua sendo preservado separadamente.</div>`; return; }
    const rows = items.slice().reverse().map((snapshot, reverseIndex) => {
      const originalIndex = items.length - 1 - reverseIndex, prev = originalIndex > 0 ? items[originalIndex - 1] : null, m = currentMetric(snapshot), d = prev ? metricDeltaForView(prev, snapshot) : null;
      const cell = (value, delta) => `${fmt(value)}${delta ? `<span class="spw-h-delta">${escapeHtml(deltaText(delta))}</span>` : ""}`;
      return `<tr><td><button type="button" data-spw-history-snapshot="${escapeHtml(snapshot.id)}">${escapeHtml(fmtDate(snapshot.importedAt))}</button></td><td>${cell(m.sigem, d?.sigem)}</td><td>${cell(m.pwRegistered, d?.pwRegistered)}</td><td>${cell(m.pwEmitted, d?.pwEmitted)}</td><td>${cell(m.matched ?? m.matched, d?.matched)}</td><td>${cell(m.postPw, d?.postPw)}</td><td>${cell(m.postSigem, d?.postSigem)}</td><td>${cell(m.aligned, d?.aligned)}</td><td>${pct(m.coverage)}</td></tr>`;
    }).join("");
    target.innerHTML = `<table class="spw-history-table"><thead><tr><th>Data</th><th>SIGEM</th><th>PW cadastrado</th><th>PW emitido</th><th>Nas duas bases</th><th>Postar PW</th><th>Postar SIGEM</th><th>Alinhados</th><th>Cobertura</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderSourceText() {
    const target = document.getElementById("spw-history-source"); if (!target) return;
    const sigem = state.sourceSigem[state.sourceSigem.length - 1], pw = state.sourcePw[state.sourcePw.length - 1];
    target.textContent = `Histórico individual: SIGEM ${state.sourceSigem.length} snapshot(s) · PW ${state.sourcePw.length} snapshot(s). Últimos: SIGEM ${fmtDate(sigem?.importedAt)} · PW ${fmtDate(pw?.importedAt)}.`;
  }
  function render() {
    const started = nowMs(); ensureSection(); renderAgeNotice(); renderActionCards(); renderSourceText(); const items = filteredComparisons(); renderQuestionAndDeltas(items); renderCharts(items); renderTable(items); state.lastPerformance.renderMs = nowMs() - started;
  }

  async function loadHistory() {
    const started = nowMs();
    const [sigem, pw, comparisons] = await Promise.all([Core().listSourceSnapshots("sigem"), Core().listSourceSnapshots("pw"), Core().listComparisonSnapshots()]);
    state.sourceSigem = sigem; state.sourcePw = pw; state.comparisons = comparisons; state.lastPerformance.loadMs = nowMs() - started;
  }
  async function recordCurrent(reason) {
    if (state.syncing) return;
    const app = App(); if (!app || !app.state) return;
    state.syncing = true; const started = nowMs();
    try {
      const result = await Core().recordActiveBases(app.state.sigem, app.state.pw, { recordedAt: new Date().toISOString(), reason });
      state.lastPerformance.recordMs = nowMs() - started;
      await loadHistory(); render();
      if ((result.sigem && result.sigem.duplicate) || (result.pw && result.pw.duplicate)) {
        // Não interrompe nem polui: a informação fica disponível para diagnóstico e evita inflação do histórico.
        if (root.GRCON_DEBUG_SIGEM_PW_HISTORY === true) console.debug("[SIGEM×PW][history] base já registrada", result);
      }
    } catch (error) { console.error("[SIGEM×PW][history] registro:", error); notify("A base atual foi carregada, mas o histórico de evolução não pôde ser atualizado. Os dados ativos foram preservados.", "warn"); }
    finally { state.syncing = false; }
  }
  async function syncAfterEvent(event) {
    try {
      if (event?.detail?.source !== "sigem-pw-dashboard" && App() && typeof App().refresh === "function") await App().refresh("histórico SIGEM × PW");
      await recordCurrent("base-updated");
    } catch (error) { console.error("[SIGEM×PW][history] sincronização:", error); }
  }

  function changeRows(currentDocs, previousDocs, keys) {
    const current = new Map(currentDocs.map((row) => [row.key, row])), previous = new Map(previousDocs.map((row) => [row.key, row]));
    return (keys || []).slice(0, 250).map((key) => current.get(key) || previous.get(key)).filter(Boolean);
  }
  function renderChangeList(title, rows, emptyText) {
    return `<section class="spw-history-change"><h4>${escapeHtml(title)} · ${fmt(rows.length)}</h4><div class="spw-history-change-list">${rows.length ? rows.map((row) => `<div><strong>${escapeHtml(row.document || row.key)}</strong><span>${escapeHtml(row.documentClass || "")} · SIGEM ${escapeHtml(row.sigemRevision || "—")} · PW ${escapeHtml(row.pwRevision || "—")} · ${escapeHtml(row.reason || row.state || "")}</span></div>`).join("") : `<div>${escapeHtml(emptyText || "Nenhum documento nesta mudança.")}</div>`}</div></section>`;
  }
  async function openSnapshot(id) {
    const snapshot = state.comparisons.find((item) => item.id === id); if (!snapshot) return;
    const overlay = document.getElementById("spw-history-overlay"), body = document.getElementById("spw-history-detail-body"); if (!overlay || !body) return;
    state.selectedSnapshotId = id; overlay.hidden = false; document.getElementById("spw-history-detail-title").textContent = fmtDate(snapshot.importedAt); document.getElementById("spw-history-detail-subtitle").textContent = `SIGEM: ${snapshot.sigemFileName || "—"} · PW: ${snapshot.pwFileName || "—"}`; body.innerHTML = `<div class="spw-history-empty"><strong>Carregando mudanças desta atualização…</strong>O detalhamento documental é lido do IndexedDB somente agora.</div>`;
    try {
      const currentDocs = await Core().loadSnapshotDocuments(snapshot.id); let previousDocs = [], transition = null;
      if (snapshot.delta?.previousSnapshotId) { previousDocs = await Core().loadSnapshotDocuments(snapshot.delta.previousSnapshotId); transition = Core().compareComparisonDocuments(previousDocs, currentDocs); }
      const m = snapshot.metrics, d = snapshot.delta?.metrics;
      body.innerHTML = `<div class="spw-history-detail-grid"><article><span>SIGEM</span><strong>${fmt(m.sigem)}</strong></article><article><span>PW cadastrado</span><strong>${fmt(m.pwRegistered)}</strong></article><article><span>PW emitido</span><strong>${fmt(m.pwEmitted)}</strong></article><article><span>Postar no PW</span><strong>${fmt(m.postPw)}</strong></article><article><span>Postar no SIGEM</span><strong>${fmt(m.postSigem)}</strong></article><article><span>Alinhados</span><strong>${fmt(m.aligned)}</strong></article><article><span>Cobertura</span><strong>${pct(m.coverage)}</strong></article><article><span>Taxa de emissão PW</span><strong>${pct(m.emissionRate)}</strong></article><article><span>Motor</span><strong>${escapeHtml(snapshot.calculationVersion)}</strong></article></div><section class="spw-history-change"><h4>Fontes deste comparativo</h4><div class="spw-history-change-list"><div><strong>SIGEM</strong><span>${escapeHtml(snapshot.sigemFileName || "—")} · ${escapeHtml(fmtDate(snapshot.sigemImportedAt))}</span></div><div><strong>ProjectWise</strong><span>${escapeHtml(snapshot.pwFileName || "—")} · ${escapeHtml(fmtDate(snapshot.pwImportedAt))}</span></div>${d ? `<div><strong>Variação agregada</strong><span>SIGEM ${deltaText(d.sigem)} · PW ${deltaText(d.pwRegistered)} · Emitidos ${deltaText(d.pwEmitted)} · Postar PW ${deltaText(d.postPw)} · Alinhados ${deltaText(d.aligned)}</span></div>` : ""}</div></section>${transition ? renderChangeList("Pendências resolvidas", changeRows(currentDocs, previousDocs, transition.keys.resolved), "Nenhuma pendência passou a alinhada.") + renderChangeList("Novas pendências", changeRows(currentDocs, previousDocs, transition.keys.newPending), "Nenhuma nova pendência identificada.") + renderChangeList("Passaram a ficar alinhados", changeRows(currentDocs, previousDocs, transition.keys.becameAligned), "Nenhum documento mudou para alinhado.") + renderChangeList("Mudaram de revisão", changeRows(currentDocs, previousDocs, transition.keys.changedRevision), "Nenhuma mudança de revisão.") : `<section class="spw-history-change"><h4>Primeiro comparativo</h4><div class="spw-history-change-list"><div>Não existe ponto anterior para calcular mudanças.</div></div></section>`}`;
    } catch (error) { body.innerHTML = `<div class="spw-history-empty"><strong>Não foi possível carregar o detalhamento.</strong>${escapeHtml(error.message || error)}</div>`; }
  }
  function closeDetails() { const overlay = document.getElementById("spw-history-overlay"); if (overlay) overlay.hidden = true; state.selectedSnapshotId = ""; }

  function exportHistory() {
    const items = state.comparisons; if (!items.length) return notify("Ainda não há histórico comparativo para exportar.", "info");
    const quote = (value) => `"${text(value).replace(/"/g, '""')}"`;
    const rows = [["Data", "Arquivo SIGEM", "Arquivo PW", "SIGEM", "PW cadastrado", "PW emitido", "Nas duas bases", "Postar PW", "Postar SIGEM", "Aguardando emissão", "Alinhados", "Cobertura", "Taxa emissão PW", "Pendências resolvidas", "Novas pendências", "Versão cálculo"]];
    items.forEach((snapshot) => rows.push([snapshot.importedAt, snapshot.sigemFileName, snapshot.pwFileName, snapshot.metrics.sigem, snapshot.metrics.pwRegistered, snapshot.metrics.pwEmitted, snapshot.metrics.matched, snapshot.metrics.postPw, snapshot.metrics.postSigem, snapshot.metrics.awaitingEmission, snapshot.metrics.aligned, snapshot.metrics.coverage, snapshot.metrics.emissionRate, snapshot.delta?.transitions?.resolved || 0, snapshot.delta?.transitions?.newPending || 0, snapshot.calculationVersion]));
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(quote).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    if (root.GrconUtils?.downloadBlob) root.GrconUtils.downloadBlob(blob, `GRCON_Historico_SIGEM_PW_${new Date().toISOString().slice(0, 10)}.csv`);
  }
  async function manageHistory() {
    const total = state.sourceSigem.length + state.sourcePw.length + state.comparisons.length;
    if (!total) return notify("O histórico ainda está vazio.", "info");
    const approved = root.confirm(`Gerenciar histórico\n\nExistem ${total} snapshots locais.\n\nOK = limpar todo o histórico de evolução desta máquina.\nCancelar = manter tudo.\n\nAs bases SIGEM/PW ativas não serão apagadas.`);
    if (!approved) return;
    const second = root.confirm("Confirma a exclusão permanente dos snapshots históricos locais? Esta ação não apaga as bases ativas, mas remove a evolução registrada nesta máquina.");
    if (!second) return;
    try { await Core().clearHistory(); await loadHistory(); render(); notify("Histórico de evolução local limpo. As bases ativas foram preservadas.", "success"); }
    catch (error) { notify(error.message || "Não foi possível limpar o histórico.", "error"); }
  }

  async function activate() {
    ensureSection();
    if (!state.ready) { await loadHistory(); state.ready = true; }
    await recordCurrent("dashboard-open");
    render();
  }

  root.addEventListener("grcon:conference-updated", (event) => { void syncAfterEvent(event); });
  root.addEventListener("grcon:pw-base-updated", (event) => { void syncAfterEvent(event); });
  root.GrconSigemPwHistoryUi = Object.freeze({ activate, refresh: async () => { await loadHistory(); render(); }, recordCurrent, state });
})(window);