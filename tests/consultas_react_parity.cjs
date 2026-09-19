const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const ExcelJS = require("../exceljs.min.js");
const Triagem = require("../core.js");
const RequestsOriginal = require("../requests_core.js");
const ReportOriginal = require("../requests_report.js");

globalThis.TriagemCore = Triagem;
globalThis.GrconRequestsCore = RequestsOriginal;
globalThis.GrconRequestsReport = ReportOriginal;
const Taxonomy = require("../requests_taxonomy_core.js");
const Report = Taxonomy.wrapReport(ReportOriginal);

function transpileModule(filePath, jsx, overrides = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: jsx ? ts.JsxEmit.ReactJSX : undefined,
      esModuleInterop: true,
    },
    fileName: path.basename(filePath),
  }).outputText;
  const testModule = { exports: {} };
  const sandbox = {
    module: testModule,
    exports: testModule.exports,
    require,
    console,
    window: {},
    navigator: { clipboard: { writeText: async () => {} } },
    document: {},
    Blob,
    URL,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    ...overrides,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(compiled, sandbox, { filename: filePath });
  return { exports: testModule.exports, sandbox };
}

(async () => {
  const root = path.resolve(__dirname, "..");
  const adapterPath = path.join(root, "src/react/consultas/services/consultasAdapter.ts");
  const componentsPath = path.join(root, "src/react/consultas/components/consultasComponents.tsx");
  const hookPath = path.join(root, "src/react/consultas/hooks/useConsultas.ts");

  const adapterLoad = transpileModule(adapterPath, false, {
    window: { GrconRequestsReport: Report },
  });
  const adapter = adapterLoad.exports.consultasAdapter;

  const sourceRow = {
    situation: "Localizado",
    ldDocument: "C1O_RNEST_U32_3.1.1.1_TUB_RIR_nt-NF-1288-CONEXOES",
    ldForm: "Com nt-",
    ntFormsDetail: "Com nt-: forma usada nesta consulta",
    ntSearchMessage: "Pesquisado com e sem nt-",
    title: "TÍTULO CONTROLADO",
    internalTaxonomy: "TX-LITERAL / A01",
    sigemLdRevision: "B",
    sigemLdRevisionCell: "B",
    allocated: "SIM — Alocado",
    allocation: "C1O-ALOC-CM-0001-2026",
    lastGrdt: "GRDT-2026-0001",
    issued: "SIM",
    issuedCell: "0130870-C1O-PGV-G-0001/2026 - eGRDT\n18/09/2026",
    issuedEgrdt: "0130870-C1O-PGV-G-0001/2026 - eGRDT",
    issuedAt: "18/09/2026",
    issuedRevision: "B",
    issuedRevisionCell: "B",
    sigemStatus: "Em Análise",
    centerStatus: "Postado",
    centerFiscalAnswer: "Conforme",
    centerAllocationCell: "C1O-ALOC-CM-0001-2026",
    ld: "LD_003.xlsx",
    allLds: "LD_003.xlsx | LD_005.xlsx",
    rule: "correspondência exata",
    occurrenceCount: 2,
    needsManualValidation: false,
  };
  const exportRow = adapter.buildExportRow("DOC-TESTE", sourceRow);

  for (const column of Report.COLUMNS) {
    assert.ok(Object.prototype.hasOwnProperty.call(exportRow, column.key),
      `buildExportRow precisa projetar ${column.key}`);
  }
  assert.equal(exportRow.internalTaxonomy, "TX-LITERAL / A01");

  let copied = "";
  const copyLoad = transpileModule(adapterPath, false, {
    window: { GrconRequestsReport: Report },
    navigator: { clipboard: { writeText: async (value) => { copied = value; } } },
  });
  await copyLoad.exports.consultasAdapter.copyRowsToClipboard([exportRow]);
  assert.match(copied, /TAXONOMIA INTERNA/);
  assert.match(copied, /TX-LITERAL \/ A01/);
  assert.doesNotMatch(copied, /eGRDT\n18\/09\/2026/);

  const model = Report.BUILTIN_EXPORT_TEMPLATES.find((item) => item.base === "consulta");
  assert.ok(model);
  const preview = Report.previewExportTemplate(model, [exportRow], 5);
  const taxPreview = preview.headers.indexOf("TAXONOMIA INTERNA");
  assert.ok(taxPreview > -1);
  assert.equal(preview.rows[0][taxPreview], "TX-LITERAL / A01");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Consulta");
  Report.writeConsultationSheet(sheet, [exportRow], {
    columns: model.columns,
    title: "GRCON · TESTE",
    metadata: "paridade React",
    ldNames: "LD_003.xlsx",
  });
  const taxIndex = model.columns.findIndex((column) => column.key === "internalTaxonomy");
  assert.ok(taxIndex > -1);
  assert.equal(sheet.getCell(15, taxIndex + 1).value, "TX-LITERAL / A01");

  const components = transpileModule(componentsPath, true).exports;

  const ldReady = { id: "ld-ready", name: "LD_OK.xlsx", size: 10, records: [{}], history: [], error: "" };
  const ldLoading = { id: "ld-loading", name: "LD_LENDO.xlsx", size: 11, records: [], history: [], error: "" };
  const ldError = { id: "ld-error", name: "LD_ERRO.xlsx", size: 12, records: [], history: [], error: "Arquivo inválido" };
  let ldState = components.deriveLdVisualState([ldReady, ldLoading, ldError], 1);
  assert.equal(ldState.total, 3);
  assert.equal(ldState.ready, 1);
  assert.equal(ldState.loading, 1);
  assert.equal(ldState.errors, 1);
  assert.equal(ldState.complete, false, "LD não pode concluir enquanto outra ainda está lendo ou tem erro");
  assert.match(ldState.summary, /1 pronta/);
  assert.match(ldState.summary, /1 sendo lida/);
  assert.match(ldState.summary, /1 com erro/);

  ldState = components.deriveLdVisualState([
    ldReady,
    { ...ldReady, id: "ld-ready-2", name: "LD_OK_2.xlsx" },
    { ...ldReady, id: "ld-ready-3", name: "LD_OK_3.xlsx" },
  ], 3);
  assert.equal(ldState.complete, true, "o painel só conclui quando todas as LDs terminaram sem erro");
  assert.equal(ldState.loading, 0);
  assert.equal(ldState.errors, 0);
  assert.match(ldState.summary, /3 LD\(s\) válida\(s\)/);

  ldState = components.deriveLdVisualState([ldReady, ldError], 1);
  assert.equal(ldState.complete, false, "erro precisa permanecer visível em vez de recolher o painel");
  assert.match(ldState.summary, /1 válida/);
  assert.match(ldState.summary, /1 com erro/);

  const item = { id: "doc-1", document: "DOC-TESTE", selected: true };
  const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(components.ResultsTable, {
    visibleRows: [{ item, linha: sourceRow }],
    hasDocuments: true,
    onToggle: () => {},
    onToggleAll: () => {},
    allSelected: true,
    someSelected: true,
    central: { ok: true },
    filterKey: "",
  }));
  assert.ok(markup.indexOf("Documento") < markup.indexOf("Título"));
  assert.ok(markup.indexOf("Título") < markup.indexOf("Taxonomia Interna"));
  assert.ok(markup.indexOf("Taxonomia Interna") < markup.indexOf("Alocação"));
  assert.match(markup, /requests-col-taxonomia/);
  assert.match(markup, /TX-LITERAL \/ A01/);
  assert.match(markup, /Status SIGEM/);
  assert.match(markup, /Detalhes/);
  assert.doesNotMatch(markup, /Emitido pelo GRCON/);
  assert.doesNotMatch(markup, /Resposta da fiscal/);

  const detailMarkup = ReactDOMServer.renderToStaticMarkup(React.createElement(components.DocumentDetailsDrawer, {
    entry: { item, linha: sourceRow },
    central: { ok: true },
    onClose: () => {},
  }));
  assert.match(detailMarkup, /Código localizado na LD/);
  assert.match(detailMarkup, /C1O_RNEST_U32_3\.1\.1\.1_TUB_RIR_nt-NF-1288-CONEXOES/);
  assert.match(detailMarkup, /Última GRDT/);
  assert.match(detailMarkup, /Emitido pelo GRCON/);
  assert.match(detailMarkup, /Revisão emitida/);
  assert.match(detailMarkup, /Revisão Colar SIGEM/);
  assert.match(detailMarkup, /Status SIGEM/);
  assert.match(detailMarkup, /Status da central/);
  assert.match(detailMarkup, /Resposta fiscal/);
  assert.match(detailMarkup, /Todas as LDs/);
  assert.match(detailMarkup, /Regra \/ evidência/);
  assert.match(detailMarkup, /TX-LITERAL \/ A01/);
  assert.match(detailMarkup, /role="dialog"/);
  assert.match(detailMarkup, /aria-modal="true"/);
  assert.match(detailMarkup, /requests-detail-drawer[^>]*tabindex="-1"/);
  assert.match(detailMarkup, /requests-detail-overlay[^>]*tabindex="-1"[^>]*aria-hidden="true"/);

  const emptyMarkup = ReactDOMServer.renderToStaticMarkup(React.createElement(components.ResultsTable, {
    visibleRows: [{ item, linha: { ...sourceRow, internalTaxonomy: "" } }],
    hasDocuments: true,
    onToggle: () => {},
    onToggleAll: () => {},
    allSelected: true,
    someSelected: true,
    central: { ok: true },
    filterKey: "",
  }));
  const taxCell = emptyMarkup.match(/<td class="requests-col-taxonomia">([\s\S]*?)<\/td>/);
  assert.ok(taxCell);
  assert.match(taxCell[1], /—/);

  const manyRows = Array.from({ length: 500 }, (_, index) => ({
    item: { id: `doc-${index + 1}`, document: `DOC-${String(index + 1).padStart(4, "0")}`, selected: true },
    linha: sourceRow,
  }));
  const pagedMarkup = ReactDOMServer.renderToStaticMarkup(React.createElement(components.ResultsTable, {
    visibleRows: manyRows,
    hasDocuments: true,
    onToggle: () => {},
    onToggleAll: () => {},
    allSelected: true,
    someSelected: true,
    central: { ok: true },
    filterKey: "",
  }));
  assert.equal((pagedMarkup.match(/data-doc=/g) || []).length, 100,
    "a tabela visual deve limitar o DOM a 100 documentos por página");
  assert.match(pagedMarkup, /Mostrando 1–100 de 500/);
  assert.match(pagedMarkup, /Página 1 de 5/);

  const exportRows500 = manyRows.map(({ item, linha }) => adapter.buildExportRow(item.document, linha));
  await copyLoad.exports.consultasAdapter.copyRowsToClipboard(exportRows500);
  const copiedDocuments = [...copied.matchAll(/DOC-\d{4}/g)].map((match) => match[0]);
  assert.equal(new Set(copiedDocuments).size, 500,
    "cópia precisa usar o dataset completo, não somente a página visual");

  const workbook500 = new ExcelJS.Workbook();
  const sheet500 = workbook500.addWorksheet("Consulta");
  Report.writeConsultationSheet(sheet500, exportRows500, {
    columns: model.columns,
    title: "GRCON · TESTE 500",
    metadata: "paginação visual não limita exportação",
    ldNames: "LD_003.xlsx",
  });
  const documentColumn = model.columns.findIndex((column) => column.key === "document") + 1;
  let exportedDocumentCount = 0;
  sheet500.eachRow((row, rowNumber) => {
    if (rowNumber >= 15 && String(row.getCell(documentColumn).value || "").startsWith("DOC-")) exportedDocumentCount += 1;
  });
  assert.equal(exportedDocumentCount, 500,
    "Excel precisa receber o dataset completo, não somente a página visual");

  const hookSource = fs.readFileSync(hookPath, "utf8");
  assert.match(hookSource, /const exportRows = useMemo\(\(\) => documents/,
    "cópia/exportação precisa continuar derivada do conjunto completo de documentos");
  assert.doesNotMatch(hookSource, /const exportRows = useMemo\(\(\) => visibleRows/,
    "paginação/filtro visual não pode limitar o dataset de exportação");
  const runStart = hookSource.indexOf("const runQuery");
  const runEnd = hookSource.indexOf("const exportRows", runStart);
  const runQuery = hookSource.slice(runStart, runEnd);
  assert.match(runQuery, /try\s*\{/);
  assert.match(runQuery, /catch\s*\(error\)/);
  assert.match(runQuery, /finally\s*\{/);
  assert.ok(runQuery.indexOf("setRunning(false)") > runQuery.indexOf("finally"));
  assert.match(runQuery, /Não foi possível concluir a consulta/);

  const loader = fs.readFileSync(path.join(root, "grcon_module_loader.js"), "utf8");
  const groupStart = loader.indexOf("requests: [");
  const groupEnd = loader.indexOf("],", groupStart);
  const requestGroup = loader.slice(groupStart, groupEnd);
  for (const dependency of [
    "core.js", "requests_core.js", "requests_report.js", "allocation_center.js",
    "grcon_file_access.js", "ld_memory.js", "grdt_history_indicator.js",
    "requests_taxonomy_core.js", "requests_app.js", "react-dist/consultas-app.js",
  ]) {
    assert.ok(requestGroup.includes(dependency), `grupo requests precisa carregar ${dependency}`);
  }
  assert.ok(requestGroup.indexOf("requests_taxonomy_core.js") < requestGroup.indexOf("react-dist/consultas-app.js"));

  const bundle = fs.readFileSync(path.join(root, "react-dist/consultas-app.js"), "utf8");
  assert.doesNotMatch(bundle, /process\\.env\\.NODE_ENV/,
    "bundle React não pode depender do global Node process no navegador");

  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(indexHtml, /\\n<link/,
    "index.html não pode conter texto literal \\n entre tags do head");
  const headStart = indexHtml.indexOf("<head>");
  const headEnd = indexHtml.indexOf("</head>");
  assert.ok(headStart >= 0 && headEnd > headStart, "head precisa fechar no local lógico");
  const headHtml = indexHtml.slice(headStart, headEnd);
  for (const stylesheet of ["requests.css", "react-ui.css", "requests-phase-b.css"]) {
    assert.match(headHtml, new RegExp(`<link href="${stylesheet.replace(".", "\\.")}" rel="stylesheet" media="print" data-grcon-async-style=""\\s*/>`),
      `${stylesheet} precisa permanecer dentro do head e no bootstrap assíncrono`);
  }

  const phaseBCss = fs.readFileSync(path.join(root, "requests-phase-b.css"), "utf8");
  assert.match(phaseBCss, /\.requests-detail-drawer/);
  assert.match(phaseBCss, /\.requests-pagination/);
  assert.match(phaseBCss, /prefers-reduced-motion/);

  const componentSource = fs.readFileSync(componentsPath, "utf8");
  assert.match(componentSource, /body\.style\.overflow = "hidden"/,
    "drawer precisa bloquear scroll do body");
  assert.match(componentSource, /body\.style\.overflow = previousOverflow/,
    "drawer precisa restaurar exatamente o overflow anterior");
  assert.match(componentSource, /event\.key !== "Tab"/,
    "drawer precisa manter Tab e Shift\+Tab dentro do modal");
  assert.match(componentSource, /previousFocus\?\.isConnected/,
    "drawer precisa devolver foco ao acionador");
  assert.match(componentSource, /document\.addEventListener\("pointerdown", onPointerDown\)/,
    "Mais ações precisa fechar no clique fora");
  assert.match(componentSource, /event\.key !== "Escape"/,
    "Mais ações precisa tratar Escape");
  assert.match(componentSource, /detailsRef\.current\.open = false/,
    "Mais ações precisa fechar depois de executar a ação");
  assert.match(componentSource, /todas as páginas/,
    "seleção global precisa deixar claro que não se limita à página visual");

  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(sw, /phase-a-history-react1/);
  assert.match(sw, /phase-b-consultas-ui1-hardening1/);
  assert.match(sw, /react-ui\.css/);
  assert.match(sw, /requests-phase-b\.css/);
  const heavyStart = sw.indexOf("const HEAVY_ASSETS");
  const heavyEnd = sw.indexOf("]);", heavyStart);
  assert.doesNotMatch(sw.slice(heavyStart, heavyEnd), /consultas-app\.js/);

  console.log("✓ paridade React de Consultas, Taxonomia, cópia, preview, Excel, erro assíncrono, loader e PWA");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
