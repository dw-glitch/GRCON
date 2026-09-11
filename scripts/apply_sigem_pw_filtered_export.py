from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho em {path}, encontrado {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) UI da Situação das Revisões: estado, botão, mesma fonte filtrada e exportação.
replace_once(
    "sigem_pw_revision_section.js",
    '    searchTimer: null,\n  };',
    '    searchTimer: null,\n    exporting: false,\n    exportMessage: "",\n    exportMessageKind: "info",\n  };',
    "estado de exportação",
)

replace_once(
    "sigem_pw_revision_section.js",
    '.spw-rev-summary{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 11px;background:var(--surface-soft,#f7fafc);border-bottom:1px solid var(--border,#e6ebef);font-size:.7rem;color:var(--text-muted,#66798a)}.spw-rev-summary strong{color:var(--text-strong,#294258)}',
    '.spw-rev-summary{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 11px;background:var(--surface-soft,#f7fafc);border-bottom:1px solid var(--border,#e6ebef);font-size:.7rem;color:var(--text-muted,#66798a)}.spw-rev-summary strong{color:var(--text-strong,#294258)}.spw-rev-summary-main{display:flex;align-items:center;gap:9px;flex-wrap:wrap;min-width:0}.spw-rev-export{display:inline-flex!important;align-items:center;gap:6px;min-height:32px!important;white-space:nowrap}.spw-rev-export svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8}.spw-rev-export[disabled]{cursor:not-allowed;opacity:.55}.spw-rev-export-feedback{font-size:.66rem;color:var(--text-muted,#66798a)}.spw-rev-export-feedback.success{color:var(--success-700,#246b4e)}.spw-rev-export-feedback.error{color:var(--danger-700,#9f342f)}',
    "estilo do botão",
)

replace_once(
    "sigem_pw_revision_section.js",
    '@media(max-width:560px){.spw-rev-cards,.spw-rev-toolbar{grid-template-columns:1fr}.spw-rev-head{display:grid}}',
    '@media(max-width:560px){.spw-rev-cards,.spw-rev-toolbar{grid-template-columns:1fr}.spw-rev-head{display:grid}.spw-rev-summary{align-items:flex-start;flex-direction:column}.spw-rev-summary-main{width:100%}.spw-rev-export{width:100%;justify-content:center}}',
    "responsividade do botão",
)

replace_once(
    "sigem_pw_revision_section.js",
    '        state.filters.situation = state.filters.situation === value ? "attention" : value;\n        state.page = 1;',
    '        state.filters.situation = state.filters.situation === value ? "attention" : value;\n        state.exportMessage = "";\n        state.page = 1;',
    "limpar feedback ao trocar card",
)

replace_once(
    "sigem_pw_revision_section.js",
    '      const why = event.target.closest("[data-spw-rev-why]");',
    '      const exportButton = event.target.closest("[data-spw-rev-export]");\n      if (exportButton) {\n        void exportFilteredRows();\n        return;\n      }\n      const why = event.target.closest("[data-spw-rev-why]");',
    "clique de exportação",
)

replace_once(
    "sigem_pw_revision_section.js",
    '      state.filters[field] = event.target.value;\n      state.page = 1;',
    '      state.filters[field] = event.target.value;\n      state.exportMessage = "";\n      state.page = 1;',
    "limpar feedback ao trocar filtro",
)

replace_once(
    "sigem_pw_revision_section.js",
    '        if (event.target.id === "spw-rev-search") state.filters.search = event.target.value;\n        else state.filters.documentList = event.target.value;\n        state.page = 1;',
    '        if (event.target.id === "spw-rev-search") state.filters.search = event.target.value;\n        else state.filters.documentList = event.target.value;\n        state.exportMessage = "";\n        state.page = 1;',
    "limpar feedback ao pesquisar",
)

insert_functions = r'''
  function filteredRows(filters) {
    if (!state.analysis) return [];
    return Core().filterRows(state.analysis.rows, filters || state.filters);
  }

  function syncImmediateTextFilters() {
    if (state.searchTimer) {
      root.clearTimeout(state.searchTimer);
      state.searchTimer = null;
    }
    const search = document.getElementById("spw-rev-search");
    const list = document.getElementById("spw-rev-document-list");
    if (search) state.filters.search = search.value;
    if (list) state.filters.documentList = list.value;
  }

  function notifyExport(message, kind) {
    state.exportMessage = text(message);
    state.exportMessageKind = kind || "info";
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") console.error("[SIGEM×PW][exportação]", message);
    else console.info("[SIGEM×PW][exportação]", message);
  }

  function yieldUi() {
    return new Promise((resolve) => {
      if (typeof root.requestAnimationFrame === "function") root.requestAnimationFrame(() => resolve());
      else root.setTimeout(resolve, 0);
    });
  }

  async function exportFilteredRows() {
    if (state.exporting || !state.analysis) return;
    syncImmediateTextFilters();
    const filtersSnapshot = { ...state.filters };
    const rows = filteredRows(filtersSnapshot);
    if (!rows.length) {
      notifyExport("Nenhum documento disponível para exportação.", "info");
      renderTable();
      return;
    }
    state.exporting = true;
    state.exportMessage = `Gerando Excel com ${fmt(rows.length)} registro(s)...`;
    state.exportMessageKind = "info";
    renderTable();
    await yieldUi();
    try {
      if (!root.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
      await root.GRCONModuleLoader.ensure("report");
      if (!root.GrconSigemPwRevisionReport) await root.GRCONModuleLoader.ensure("sigem_pw_revision_report.js");
      const Report = root.GrconSigemPwRevisionReport;
      if (!Report || typeof Report.buildWorkbook !== "function") throw new Error("Exportador Excel da análise SIGEM × PW indisponível.");
      const buffer = await Report.buildWorkbook(rows, filtersSnapshot, {
        brandAssets: root.GRCONBrandAssets || null,
        createdAt: new Date(),
      });
      const blob = new Blob([buffer], { type: Report.MIME_XLSX });
      const filename = Report.downloadName(filtersSnapshot, new Date());
      if (root.GrconUtils && typeof root.GrconUtils.downloadBlob === "function") root.GrconUtils.downloadBlob(blob, filename);
      else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.hidden = true;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        root.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notifyExport(`Excel gerado com sucesso. ${fmt(rows.length)} registro(s) exportado(s).`, "success");
    } catch (error) {
      console.error("[SIGEM×PW] exportação da lista filtrada:", error);
      notifyExport(error && error.message ? error.message : "Não foi possível gerar o Excel da lista filtrada.", "error");
    } finally {
      state.exporting = false;
      renderTable();
    }
  }

'''
replace_once(
    "sigem_pw_revision_section.js",
    '  function renderTable() {\n',
    insert_functions + '  function renderTable() {\n',
    "funções da exportação",
)

replace_once(
    "sigem_pw_revision_section.js",
    '    const rows = Core().filterRows(state.analysis.rows, state.filters);',
    '    const rows = filteredRows();',
    "fonte única de filteredRows",
)

old_summary = '    if (summary) summary.innerHTML = `<span><strong>${fmt(rows.length)}</strong> documento(s) no filtro · mostrando ${rows.length ? fmt(start + 1) : 0}–${fmt(Math.min(start + PAGE_SIZE, rows.length))}</span><span>Análise: ${ms(state.analysis.metrics.durationMs)} ms · ${fmt(state.analysis.metrics.documentsCompared)} documentos comparáveis</span>`;'
new_summary = '''    if (summary) {
      const disabled = !rows.length || state.exporting;
      const title = !rows.length ? "Nenhum documento disponível para exportação." : state.exporting ? "Aguarde a conclusão da exportação atual." : `Exportar os ${fmt(rows.length)} documento(s) resultantes dos filtros atuais, em todas as páginas.`;
      const feedback = state.exportMessage ? `<span class="spw-rev-export-feedback ${escapeHtml(state.exportMessageKind)}" aria-live="polite">${escapeHtml(state.exportMessage)}</span>` : "";
      summary.innerHTML = `<div class="spw-rev-summary-main"><span><strong>${fmt(rows.length)}</strong> documento(s) no filtro · mostrando ${rows.length ? fmt(start + 1) : 0}–${fmt(Math.min(start + PAGE_SIZE, rows.length))}</span><button class="secondary-button compact spw-rev-export" type="button" data-spw-rev-export ${disabled ? "disabled" : ""} title="${escapeHtml(title)}" aria-label="Exportar lista filtrada para Excel"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"></path></svg><span>${state.exporting ? "Gerando Excel..." : "Exportar lista filtrada"}</span></button>${feedback}</div><span>Análise: ${ms(state.analysis.metrics.durationMs)} ms · ${fmt(state.analysis.metrics.documentsCompared)} documentos comparáveis</span>`;
    }'''
replace_once(
    "sigem_pw_revision_section.js",
    old_summary,
    new_summary,
    "resumo com exportação",
)

replace_once(
    "sigem_pw_revision_section.js",
    '    state.analysis = result;\n    if (root.console && typeof root.console.debug === "function")',
    '    state.analysis = result;\n    state.exportMessage = "";\n    if (root.console && typeof root.console.debug === "function")',
    "limpar feedback em nova análise",
)

replace_once(
    "sigem_pw_revision_section.js",
    '  root.GrconSigemPwRevisionUi = Object.freeze({ activate, refresh: () => render(true), state });',
    '  root.GrconSigemPwRevisionUi = Object.freeze({ activate, refresh: () => render(true), state, filteredRows: () => filteredRows(), exportFilteredRows });',
    "API da seção",
)

# 2) Runtime: carregar o report leve; ExcelJS continua lazy apenas no clique.
replace_once(
    "sigem_pw_dashboard_bootstrap.js",
    '    await root.GRCONModuleLoader.ensure("sigem_pw_revision_core.js");\n    await root.GRCONModuleLoader.ensure("sigem_pw_revision_section.js");',
    '    await root.GRCONModuleLoader.ensure("sigem_pw_revision_core.js");\n    await root.GRCONModuleLoader.ensure("sigem_pw_revision_report.js");\n    await root.GRCONModuleLoader.ensure("sigem_pw_revision_section.js");',
    "carregamento do report",
)
replace_once(
    "sigem_pw_dashboard_bootstrap.js",
    '!root.GrconSigemPwRevision || !root.GrconSigemPwRevisionUi ||',
    '!root.GrconSigemPwRevision || !root.GrconSigemPwRevisionReport || !root.GrconSigemPwRevisionUi ||',
    "assert do runtime",
)

# 3) Relatório: logo sem cobrir o título e lista de documentos completa em linhas próprias.
replace_once(
    "sigem_pw_revision_report.js",
    '["Lista de documentos", list.length ? list.join("\\n") : "Não utilizada"],',
    '["Lista de documentos", list.length ? `${list.length} código(s) informado(s); relação completa abaixo` : "Não utilizada"],',
    "metadado da lista",
)
replace_once(
    "sigem_pw_revision_report.js",
    '    applied.columns = [{ width: 30 }, { width: 85 }];\n    applied.mergeCells("A1:B2");\n    applied.getCell("A1").value = "GRCON · SIGEM × PROJECTWISE · FILTROS APLICADOS";\n    applied.getCell("A1").font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };\n    applied.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };\n    applied.getCell("A1").alignment = { vertical: "middle", horizontal: "center", wrapText: true };',
    '    applied.columns = [{ width: 22 }, { width: 30 }, { width: 42 }, { width: 42 }];\n    applied.mergeCells("C1:D2");\n    applied.getCell("C1").value = "GRCON · SIGEM × PROJECTWISE · FILTROS APLICADOS";\n    applied.getCell("C1").font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };\n    applied.getCell("C1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };\n    applied.getCell("C1").alignment = { vertical: "middle", horizontal: "center", wrapText: true };',
    "layout da logo",
)

filter_loop = '''    filterEntries(filters, source.length, createdAt).forEach(([label, value], index) => {
      const row = applied.addRow([label, value]);
      row.getCell(1).font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF53697B" } };
      row.getCell(2).font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      row.getCell(2).alignment = { vertical: "top", horizontal: "left", wrapText: true };
      if (index % 2) {
        row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
      }
    });'''
filter_loop_new = filter_loop + '''
    const listedDocuments = normalizedDocumentList(filters && filters.documentList);
    listedDocuments.forEach((code, index) => {
      const row = applied.addRow([`Documento da lista ${index + 1}`, code]);
      row.getCell(1).font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF53697B" } };
      row.getCell(2).font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      row.getCell(2).numFmt = "@";
    });'''
replace_once("sigem_pw_revision_report.js", filter_loop, filter_loop_new, "lista completa nos filtros")

# 4) Teste oficial do pacote.
replace_once(
    "package.json",
    'node tests/sigem_pw_revision_analysis.cjs && node tests/analyze_runtime_resilience.cjs',
    'node tests/sigem_pw_revision_analysis.cjs && node tests/sigem_pw_revision_export.cjs && node tests/analyze_runtime_resilience.cjs',
    "registrar teste de exportação",
)

# 5) Changelog.
changelog = Path("CHANGELOG.md")
current = changelog.read_text(encoding="utf-8")
entry = '''## 2026-09-11 — Exportação XLSX da lista filtrada no Dashboard SIGEM × PW

- “Situação das Revisões” ganhou o botão `Exportar lista filtrada` ao lado do contador do filtro.
- Tabela, contador e Excel reutilizam o mesmo `GrconSigemPwRevision.filterRows`; a paginação continua exclusiva da visualização e nunca limita o arquivo.
- O workbook `.xlsx` usa ExcelJS já vendorizado no GRCON e cria as abas `Lista Filtrada` e `Filtros Aplicados`, com diagnóstico do “Por quê?”, histórico de revisões, autofiltro e preservação textual de códigos/revisões.
- Pesquisa textual, lista de documentos e todos os selects do detalhamento são registrados e respeitados simultaneamente.
- Adicionado teste de regressão e volume `tests/sigem_pw_revision_export.cjs`, incluindo exportação sintética com mais de 15 mil registros.

'''
if not current.startswith(entry):
    changelog.write_text(entry + current, encoding="utf-8")
