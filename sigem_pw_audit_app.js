(function (root) {
  "use strict";

  const MODULE_ID = "sigem-pw-dashboard-module";
  const STYLE_ID = "spw-pw-audit-style";
  const DIALOG_ID = "spw-pw-audit-dialog";
  const state = { ready: false, bound: false, selectedId: "", snapshots: [], audit: null, refreshTimer: 0 };

  function Dashboard() { return root.GrconSigemPwDashboard; }
  function Audit() { return root.GrconSigemPwAudit; }
  function App() { return root.GrconSigemPwDashboardUi; }
  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function fmtDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date) : "—";
  }
  function fmtBytes(value) {
    const size = Number(value || 0);
    if (!size) return "—";
    if (size < 1024 * 1024) return (size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " KB";
    return (size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
  }
  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error" && root.console) root.console.error(message);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#" + DIALOG_ID + "{width:min(920px,calc(100vw - 28px));max-height:min(780px,calc(100vh - 28px));padding:0;border:0;border-radius:16px;background:var(--surface,#fff);color:var(--text-strong,#183247);box-shadow:0 24px 70px rgba(10,35,52,.28)}" +
      "#" + DIALOG_ID + "::backdrop{background:rgba(12,34,48,.52)}" +
      ".spw-audit-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border,#dce4eb)}.spw-audit-head h3{margin:2px 0;color:var(--text-strong,#183247)}.spw-audit-head p{margin:4px 0 0;color:var(--text-muted,#66798a);font-size:.75rem}.spw-audit-actions{display:flex;gap:7px;flex-wrap:wrap}" +
      ".spw-audit-body{max-height:650px;overflow:auto;padding:14px 18px 18px}.spw-audit-picker{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:end;padding:11px;border:1px solid var(--border,#dce4eb);border-radius:11px;background:var(--surface-soft,#f7fafc)}.spw-audit-picker label{display:grid;gap:5px}.spw-audit-picker span{font-size:.65rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}" +
      ".spw-audit-verdict{display:flex;align-items:flex-start;gap:9px;margin-top:10px;padding:11px 12px;border-radius:11px;background:#eaf7f1;color:#1d6e52;font-size:.75rem}.spw-audit-verdict.attention{background:#fff6e5;color:#8a5a13}.spw-audit-verdict b{display:block;margin-bottom:2px}" +
      ".spw-audit-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.spw-audit-card{padding:11px 12px;border:1px solid var(--border,#dce4eb);border-radius:11px;background:var(--surface,#fff)}.spw-audit-card span{display:block;color:var(--text-muted,#66798a);font-size:.62rem;font-weight:900;text-transform:uppercase;line-height:1.3}.spw-audit-card strong{display:block;margin-top:6px;font-size:1.35rem;font-variant-numeric:tabular-nums;color:var(--text-strong,#183247)}" +
      ".spw-audit-section{margin-top:12px;padding:12px;border:1px solid var(--border,#dce4eb);border-radius:11px}.spw-audit-section h4{margin:0 0 8px;font-size:.8rem;color:var(--text-strong,#294258)}.spw-audit-checks{display:grid;grid-template-columns:1fr 1fr;gap:7px}.spw-audit-check{display:flex;align-items:center;gap:7px;padding:8px;border-radius:8px;background:var(--surface-soft,#f7fafc);font-size:.7rem}.spw-audit-check i{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#def2e8;color:#176548;font-style:normal;font-weight:900}.spw-audit-check.fail i{background:#fff0d8;color:#8a570c}" +
      ".spw-audit-trace{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.spw-audit-trace div{padding:8px;border-radius:8px;background:var(--surface-soft,#f7fafc);min-width:0}.spw-audit-trace span{display:block;font-size:.61rem;font-weight:900;text-transform:uppercase;color:var(--text-muted,#66798a)}.spw-audit-trace strong{display:block;margin-top:4px;font-size:.71rem;overflow-wrap:anywhere}.spw-audit-empty{padding:34px;text-align:center;color:var(--text-muted,#66798a)}.spw-audit-empty strong{display:block;margin-bottom:4px;color:var(--text-strong,#294258)}" +
      "@media(max-width:760px){.spw-audit-head{display:grid}.spw-audit-grid{grid-template-columns:1fr 1fr}.spw-audit-checks,.spw-audit-trace{grid-template-columns:1fr}}@media(max-width:480px){.spw-audit-picker,.spw-audit-grid{grid-template-columns:1fr}}";
    document.head.appendChild(style);
  }

  function ensureUi() {
    const host = document.getElementById(MODULE_ID);
    if (!host) return null;
    ensureStyle();
    let open = document.getElementById("spw-pw-audit-open");
    if (!open) {
      open = document.createElement("button");
      open.id = "spw-pw-audit-open";
      open.type = "button";
      open.className = "secondary-button";
      open.textContent = "Auditoria PW";
      const actions = host.querySelector(".spw-heading-actions");
      if (actions) actions.insertBefore(open, actions.firstChild);
    }
    let dialog = document.getElementById(DIALOG_ID);
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = DIALOG_ID;
      dialog.innerHTML = '<header class="spw-audit-head"><div><span class="spw-kicker">RASTREABILIDADE DA IMPORTAÇÃO</span><h3>Auditoria da base ProjectWise</h3><p>Conferência agregada da relação efetivamente utilizada pelo Dashboard.</p></div><div class="spw-audit-actions"><button class="secondary-button" id="spw-audit-export" type="button">Exportar auditoria</button><button class="text-button" id="spw-audit-close" type="button">Fechar</button></div></header><div class="spw-audit-body"><div class="spw-audit-picker"><label><span>Importação PW</span><select id="spw-audit-snapshot"></select></label><small id="spw-audit-count"></small></div><div id="spw-audit-content"></div></div>';
      host.appendChild(dialog);
    }
    return dialog;
  }

  function option(snapshot) {
    const currentId = text(App() && App().state && App().state.pw && App().state.pw.meta && App().state.pw.meta.snapshotId);
    const suffix = text(snapshot.meta.snapshotId) === currentId ? " · atual" : "";
    return '<option value="' + esc(snapshot.meta.snapshotId) + '">' + esc(fmtDate(snapshot.meta.importedAt) + " · " + (snapshot.meta.fileName || "Base PW") + suffix) + "</option>";
  }

  function selectedBase() {
    return state.snapshots.find((item) => text(item.meta && item.meta.snapshotId) === state.selectedId) || null;
  }

  function render() {
    const app = App();
    const open = document.getElementById("spw-pw-audit-open");
    if (open) open.disabled = !(app && app.state && app.state.pw && app.state.pw.meta);
    const select = document.getElementById("spw-audit-snapshot");
    const count = document.getElementById("spw-audit-count");
    const target = document.getElementById("spw-audit-content");
    if (!select || !target) return;
    select.innerHTML = state.snapshots.map(option).join("");
    select.value = state.selectedId;
    if (count) count.textContent = fmt(state.snapshots.length) + " importação(ões) PW disponível(is)";
    const base = selectedBase();
    state.audit = Audit().buildAudit(base, app && app.state && app.state.ld);
    if (!state.audit) {
      target.innerHTML = '<div class="spw-audit-empty"><strong>Base PW não disponível</strong>Carregue uma relação ProjectWise válida para gerar a auditoria.</div>';
      return;
    }
    const audit = state.audit;
    const m = audit.metrics;
    const t = audit.trace;
    const cards = [
      ["Entradas válidas", m.validEntries],
      ["Documentos únicos", m.uniqueDocuments],
      ["ET", m.classes.ET],
      ["N-1710", m.classes["N-1710"]],
      ["PW emitido", m.emittedEntries],
      ["PW não emitido", m.notEmittedEntries],
      ["Linhas válidas", m.validRows],
      ["Duplicidades consolidadas", m.consolidatedDuplicates],
    ];
    const verdictClass = audit.status === "validated" ? "" : " attention";
    const verdictTitle = audit.status === "validated" ? "Processamento validado" : "Processamento requer conferência";
    const checks = audit.checks.map((check) => '<div class="spw-audit-check' + (check.passed ? "" : " fail") + '"><i>' + (check.passed ? "✓" : "!") + "</i><span>" + esc(check.label) + "</span></div>").join("");
    const trace = [
      ["Arquivo PW", t.fileName || "—"],
      ["Importado em", fmtDate(t.importedAt)],
      ["Tamanho", fmtBytes(t.fileSize)],
      ["Snapshot PW", t.snapshotId || "—"],
      ["Versão do saneamento", t.scopeVersion || "—"],
      ["Regra aplicada", t.scopeRule || "ET + N-1710 da LD da Qualidade"],
      ["Snapshot LD", t.ldSnapshotId || "—"],
      ["Arquivo LD vigente", t.ldFileName || "Identificado pelo snapshot"],
    ].map((item) => '<div><span>' + esc(item[0]) + '</span><strong>' + esc(item[1]) + "</strong></div>").join("");
    target.innerHTML =
      '<div class="spw-audit-verdict' + verdictClass + '"><span>' + (audit.status === "validated" ? "✓" : "!") + '</span><div><b>' + verdictTitle + '</b>Os números abaixo usam somente entradas válidas por código + revisão, nas classes ET e N-1710 da LD da Qualidade.</div></div>' +
      '<div class="spw-audit-grid">' + cards.map((item) => '<article class="spw-audit-card"><span>' + esc(item[0]) + '</span><strong>' + fmt(item[1]) + "</strong></article>").join("") + "</div>" +
      '<section class="spw-audit-section"><h4>Verificações de integridade</h4><div class="spw-audit-checks">' + checks + "</div></section>" +
      '<section class="spw-audit-section"><h4>Identificação da importação</h4><div class="spw-audit-trace">' + trace + "</div></section>";
  }

  async function refresh(resetSelection) {
    const app = App();
    if (!app || !Dashboard() || !Audit()) return;
    const history = await Dashboard().loadHistory();
    const snapshots = (history.snapshots || []).filter((item) => item && item.meta && item.meta.kind === "pw" && Array.isArray(item.records));
    const current = app.state && app.state.pw;
    if (current && current.meta && !snapshots.some((item) => item.meta.snapshotId === current.meta.snapshotId)) snapshots.push(current);
    snapshots.sort((a, b) => Dashboard().parseDateMs(b.meta.importedAt) - Dashboard().parseDateMs(a.meta.importedAt));
    state.snapshots = snapshots;
    const currentId = text(current && current.meta && current.meta.snapshotId);
    if (resetSelection || !snapshots.some((item) => item.meta.snapshotId === state.selectedId)) state.selectedId = currentId || text(snapshots[0] && snapshots[0].meta.snapshotId);
    render();
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportAudit() {
    if (!state.audit) { notify("Não há auditoria PW disponível para exportação.", "info"); return; }
    const button = document.getElementById("spw-audit-export");
    try {
      if (button) { button.disabled = true; button.textContent = "Gerando Excel…"; }
      await root.GRCONModuleLoader.ensure("xlsx");
      const rows = Audit().exportRows(state.audit);
      const worksheet = root.XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [{ wch: 16 }, { wch: 42 }, { wch: 58 }];
      const workbook = root.XLSX.utils.book_new();
      root.XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoria PW");
      const output = root.XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      downloadBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "GRCON_Auditoria_PW_" + stamp + ".xlsx");
      notify("Auditoria PW exportada com sucesso.", "success");
    } catch (error) {
      notify(error.message || "Não foi possível exportar a auditoria PW.", "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Exportar auditoria"; }
    }
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;
    document.addEventListener("click", (event) => {
      if (event.target.closest && event.target.closest("#spw-pw-audit-open")) {
        void refresh(true).then(() => {
          const dialog = document.getElementById(DIALOG_ID);
          if (dialog && dialog.showModal) dialog.showModal(); else if (dialog) dialog.setAttribute("open", "");
        });
      }
      if (event.target.closest && event.target.closest("#spw-audit-close")) document.getElementById(DIALOG_ID)?.close();
      if (event.target.closest && event.target.closest("#spw-audit-export")) void exportAudit();
    });
    document.addEventListener("change", (event) => {
      if (event.target.id !== "spw-audit-snapshot") return;
      state.selectedId = event.target.value;
      render();
    });
    ["grcon:conference-updated", "grcon:pw-base-updated"].forEach((name) => root.addEventListener(name, () => {
      root.clearTimeout(state.refreshTimer);
      state.refreshTimer = root.setTimeout(() => { if (document.getElementById(DIALOG_ID)?.open) void refresh(true); else render(); }, 500);
    }));
  }

  async function activate() {
    ensureUi();
    bind();
    await refresh(false);
    state.ready = true;
  }

  root.GrconSigemPwAuditUi = Object.freeze({ activate, refresh, state });
})(window);
