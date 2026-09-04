(function (root) {
  "use strict";

  let observer = null;
  let decorating = false;
  const LAST_EXPORT_KEY = "grcon-requests-last-export";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
  }

  function ensureHeader() {
    const row = document.querySelector("#requests-table thead tr");
    if (!row || row.querySelector("[data-requests-taxonomy-heading]")) return;
    const title = [...row.children].find((cell) => text(cell.textContent).toUpperCase() === "TÍTULO NA LD");
    if (!title) return;
    const heading = document.createElement("th");
    heading.dataset.requestsTaxonomyHeading = "";
    heading.textContent = "Taxonomia Interna";
    heading.title = "Valor literal da coluna Taxonomia Interna na mesma linha da LD considerada pela Consulta";
    title.after(heading);
  }

  function decorateRows() {
    if (decorating) return;
    const ui = root.GrconRequestsUi;
    const tbody = document.getElementById("requests-tbody");
    if (!ui?.state || !tbody) return;
    decorating = true;
    try {
      ensureHeader();
      tbody.querySelectorAll("tr[data-doc]").forEach((tr) => {
        if (tr.querySelector("[data-requests-taxonomy-cell]")) return;
        const result = ui.state.results.get(tr.dataset.doc) || null;
        const cells = [...tr.children];
        // Estrutura nativa da tabela: checkbox, situação, documento, código LD,
        // título. A Taxonomia entra logo depois do título, antes de Alocado?.
        const titleCell = cells[4] || null;
        if (!titleCell) return;
        const cell = document.createElement("td");
        cell.dataset.requestsTaxonomyCell = "";
        cell.className = "requests-col-taxonomia";
        const value = text(result && result.internalTaxonomy);
        cell.innerHTML = value
          ? `<span title="Taxonomia Interna da mesma linha da LD considerada">${escapeHtml(value)}</span>`
          : '<span class="requests-vazio">—</span>';
        titleCell.after(cell);
      });
    } finally {
      decorating = false;
    }
  }

  function scheduleDecorate() {
    if (typeof queueMicrotask === "function") queueMicrotask(decorateRows);
    else Promise.resolve().then(decorateRows);
  }

  function outputRows() {
    const ui = root.GrconRequestsUi;
    if (!ui?.state || !ui._debug?.linhasParaSaida) return [];
    const baseRows = ui._debug.linhasParaSaida();
    const items = ui.state.documents.filter((item) => ui.state.results.has(item.id));
    return baseRows.map((row, index) => {
      const result = items[index] ? ui.state.results.get(items[index].id) : null;
      return { ...row, internalTaxonomy: text(result && result.internalTaxonomy) || "—" };
    });
  }

  function currentModel() {
    const ui = root.GrconRequestsUi;
    const select = document.getElementById("requests-modelo-select");
    const selected = select && select.value;
    return ui?.state?.modelos?.find((model) => model.id === selected)
      || ui?.state?.modelos?.[0]
      || root.GrconRequestsReport?.BUILTIN_EXPORT_TEMPLATES?.[0]
      || null;
  }

  function rememberLastExport(model) {
    try {
      root.localStorage.setItem(LAST_EXPORT_KEY, JSON.stringify({ id: model.id, name: model.name, at: new Date().toISOString() }));
    } catch (_) { /* conveniência local */ }
    const button = document.getElementById("requests-modelo-repeat");
    if (button) {
      button.hidden = false;
      button.textContent = `Repetir “${model.name}”`;
    }
  }

  async function copyResults() {
    const rows = outputRows();
    const Report = root.GrconRequestsReport;
    if (!rows.length || !Report) return;
    const header = Report.COLUMNS.map((column) => column.header).join("\t");
    const cell = (value) => String(value === null || value === undefined ? "" : value).replace(/\s*\n\s*/g, " · ");
    const body = rows.map((row) => Report.COLUMNS.map((column) => cell(row[column.key])).join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(`${header}\n${body}`);
      notify(`${rows.length} linha(s) copiadas com Taxonomia Interna.`, "success");
    } catch (_) {
      notify("O navegador bloqueou a cópia automática. Use a exportação para Excel.", "warn");
    }
  }

  async function exportExcel(modelOption) {
    const Report = root.GrconRequestsReport;
    const rows = outputRows();
    const model = Report && Report.normalizeExportTemplate(modelOption || currentModel());
    if (!rows.length || !Report || !model) {
      notify("Consulte os documentos antes de exportar.", "warn");
      return;
    }
    const button = document.getElementById("requests-export");
    if (button) button.disabled = true;
    try {
      await root.GRCONModuleLoader.ensure("excel");
      await root.GRCONModuleLoader.ensure("brand");
      const workbook = new root.ExcelJS.Workbook();
      workbook.creator = "GRCON";
      workbook.company = "CONSAG Engenharia";
      workbook.title = model.name;
      const sheet = workbook.addWorksheet("Consulta", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
      const names = (root.GrconRequestsUi?.state?.lds || []).filter((item) => !item.error).map((item) => item.name).join(" · ");
      Report.writeConsultationSheet(sheet, rows, {
        columns: model.columns,
        title: `GRCON · ${model.name.toUpperCase()}`,
        footer: `GRCON · ${model.name}`,
        metadata: `${rows.length.toLocaleString("pt-BR")} linha(s) · modelo “${model.name}” · ${new Date().toLocaleString("pt-BR")}`,
        ldNames: names,
      });
      await Report.attachBrandLogo(workbook, sheet, root.GRCONBrandAssets, root.fetch.bind(root));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      link.href = url;
      link.download = `GRCON_CONSULTA_${stamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      root.setTimeout(() => URL.revokeObjectURL(url), 10000);
      rememberLastExport(model);
      notify(`Planilha gerada com ${rows.length} linha(s) e Taxonomia Interna no modelo “${model.name}”.`, "success");
    } catch (error) {
      console.error(error);
      notify((error && error.message) || "Não foi possível gerar a planilha.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function repeatLastExport() {
    let last = null;
    try { last = JSON.parse(root.localStorage.getItem(LAST_EXPORT_KEY) || "null"); } catch (_) { last = null; }
    if (!last || !last.id) return;
    const model = root.GrconRequestsUi?.state?.modelos?.find((item) => item.id === last.id);
    if (!model) {
      notify(`O modelo “${last.name}” não existe mais. Escolha outro para exportar.`, "warn");
      return;
    }
    const select = document.getElementById("requests-modelo-select");
    if (select) select.value = model.id;
    await exportExcel(model);
  }

  function interceptExports() {
    document.addEventListener("click", (event) => {
      const copy = event.target.closest?.("#requests-copy");
      const exportButton = event.target.closest?.("#requests-export");
      const repeat = event.target.closest?.("#requests-modelo-repeat");
      if (!copy && !exportButton && !repeat) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (copy) void copyResults();
      else if (repeat) void repeatLastExport();
      else void exportExcel();
    }, true);
  }

  function install() {
    ensureHeader();
    const tbody = document.getElementById("requests-tbody");
    if (tbody) {
      observer?.disconnect?.();
      // Observa apenas substituições das linhas da tabela. As células que este
      // módulo acrescenta ficam dentro das TRs e não realimentam o observer.
      observer = new MutationObserver(scheduleDecorate);
      observer.observe(tbody, { childList: true, subtree: false });
    }
    interceptExports();
    scheduleDecorate();
  }

  root.GrconRequestsTaxonomyUi = Object.freeze({ install, outputRows, decorateRows });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})(window);
