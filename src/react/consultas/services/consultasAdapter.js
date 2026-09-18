/**
 * GRCON — Adaptador entre a ilha React de Consultas e os módulos legados.
 *
 * Nenhum componente React deve tocar em `window`, `TriagemCore`,
 * `GrconRequestsCore`, `GrconRequestsReport`, `GrconAllocationCenter`,
 * `GrconFileAccess`, `GRCONModuleLoader`, `GrconGrdtHistoryIndicator`,
 * `GrconLdMemory`, `GrconNotify` ou `GrconCloud` diretamente: tudo passa por
 * aqui. Isso mantém a regra documental (parseWorkbook/buildIndex/lookupDocument
 * e as demais regras de requests_core.js) intacta e reutilizada, sem duplicar
 * nada em React.
 *
 * Arquivo escrito como script clássico (sem `import`/`export`), no mesmo
 * padrão dos demais módulos do GRCON: o carregador de módulos injeta
 * `<script>` em sequência, e `check:syntax` roda `node --check` neste arquivo
 * como arquivo `.js` solto (não há empacotador nesta primeira migração).
 *
 * @typedef {Record<string, unknown>} LdRecord
 * @typedef {Record<string, unknown>} LdHistoryEntry
 * @typedef {Record<string, unknown>} DocumentIndex
 * @typedef {Record<string, unknown>} LookupResult
 * @typedef {Record<string, unknown>} ConsultationRow
 * @typedef {Record<string, unknown>} AllocationCenterIndex
 *
 * @typedef {Object} LdEntry
 * @property {string} id
 * @property {File} file
 * @property {string} name
 * @property {number} size
 * @property {LdRecord[]} records
 * @property {LdHistoryEntry[]} history
 * @property {string} error
 *
 * @typedef {Object} ParsedDocument
 * @property {string} document
 * @property {string} [requestedTitle]
 *
 * @typedef {Object} ExportTemplateColumn
 * @property {string} key
 * @property {string} header
 * @property {number} [width]
 *
 * @typedef {Object} ExportTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} base
 * @property {ExportTemplateColumn[]} columns
 * @property {boolean} [builtIn]
 * @property {string} [scope]
 *
 * @typedef {Object} ExportRow
 * @property {string} situation
 * @property {string} document
 * @property {string} [ldDocument]
 * @property {string} [ldForm]
 * @property {string} [ntFormsDetail]
 * @property {string} [ntSearchMessage]
 * @property {string} [title]
 * @property {string} [sigemLdRevision]
 * @property {string} [sigemLdRevisionCell]
 * @property {string} [allocated]
 * @property {string} [allocation]
 * @property {string} [lastGrdt]
 * @property {string} [issued]
 * @property {string} [issuedCell]
 * @property {string} [issuedEgrdt]
 * @property {string} [issuedAt]
 * @property {string} [issuedRevision]
 * @property {string} [issuedRevisionCell]
 * @property {string} [sigemStatus]
 * @property {string} [centerStatus]
 * @property {string} [centerFiscalAnswer]
 * @property {string} [centerAllocationCell]
 * @property {string} [ld]
 * @property {string} [allLds]
 * @property {string} [rule]
 */
(function (root) {
  "use strict";

  const CHAVE_MODELOS = "grcon-requests-export-templates";
  const CHAVE_ULTIMA = "grcon-requests-last-export";
  const EVENTO_MODELOS = "grcon:export-templates-changed";

  function core() { return root.TriagemCore; }
  function requestsCore() { return root.GrconRequestsCore; }
  function requestsReport() { return root.GrconRequestsReport; }
  function allocationCenter() { return root.GrconAllocationCenter; }

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
  }

  async function ensureGroup(name) {
    if (!root.GRCONModuleLoader) throw new Error("O carregador de módulos do GRCON não está disponível.");
    await root.GRCONModuleLoader.ensure(name);
  }

  /** @param {File} file @param {string} context @returns {Promise<ArrayBuffer>} */
  async function readFileBuffer(file, context) {
    if (root.GrconFileAccess) return root.GrconFileAccess.read(file, { context, retries: 1 });
    return file.arrayBuffer();
  }

  /**
   * Lê uma LD anexada com o mesmo motor da Triagem de GRDT.
   * @param {File} file
   * @returns {Promise<{ records: LdRecord[]; history: LdHistoryEntry[] }>}
   */
  async function parseLd(file) {
    await ensureGroup("xlsx");
    const buffer = await readFileBuffer(file, "a LD controlada");
    const workbook = root.XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: false });
    const parsed = core().parseWorkbook(workbook, file.name, file.lastModified);
    return { records: parsed.records || [], history: parsed.history || [] };
  }

  /**
   * Reconstrói o índice de busca a partir das LDs válidas anexadas.
   * @param {LdEntry[]} lds
   * @returns {DocumentIndex | null}
   */
  function buildIndex(lds) {
    const validas = lds.filter((item) => !item.error && item.records.length);
    if (!validas.length) return null;
    const registros = validas.flatMap((item) => item.records);
    const historico = validas.flatMap((item) => item.history || []);
    return core().buildIndex(registros, historico);
  }

  function rememberLastLd(file) {
    if (root.GrconLdMemory) {
      try { root.GrconLdMemory.saveLastLd(file); } catch (_error) { /* conveniência, não requisito */ }
    }
  }

  /** @returns {{ name: string } | null} */
  function getLastLd() {
    if (root.GrconLdMemory && root.GrconLdMemory.getLastLd) return root.GrconLdMemory.getLastLd();
    return null;
  }

  /**
   * Lê e indexa o Controle de Solicitações (central de alocação), opcional.
   * @param {File} file
   * @returns {Promise<AllocationCenterIndex>}
   */
  async function parseAllocationCenterFile(file) {
    const AC = allocationCenter();
    if (!AC) throw new Error("O leitor da central não está disponível.");
    await ensureGroup("xlsx");
    const buffer = await readFileBuffer(file, "o Controle de Solicitações");
    const workbook = root.XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: false });
    const indice = AC.parseAllocationCenter(workbook, { xlsx: root.XLSX, core: core() });
    indice.nomeArquivo = file.name;
    return indice;
  }

  /**
   * @param {string} document
   * @param {AllocationCenterIndex | null} centralIndex
   * @returns {Record<string, unknown>}
   */
  function centerFieldsFor(document, centralIndex) {
    const AC = allocationCenter();
    if (!AC || !centralIndex || !centralIndex.ok) return {};
    return AC.centerFields(AC.allocationCenterLookup(document, centralIndex, core()));
  }

  /** @param {string} input @returns {ParsedDocument[]} */
  function parseDocumentList(input) {
    return requestsCore().parseDocumentList(input);
  }

  /**
   * @template {{ document: string }} T
   * @param {T[]} items
   * @returns {{ items: T[]; removed: T[] }}
   */
  function dedupeDocuments(items) {
    return requestsCore().dedupeDocuments(items);
  }

  /**
   * Reproduz `historicoDoGrcon`: procura primeiro pela grafia da LD (a que vai
   * para a eGRDT) e só depois pelo código informado.
   * @param {LookupResult} resultado
   * @param {string} informado
   * @returns {LdHistoryEntry[]}
   */
  function historyEntriesFor(resultado, informado) {
    const indicador = root.GrconGrdtHistoryIndicator;
    if (!indicador || typeof indicador.getEntries !== "function") return [];
    const chosen = /** @type {Record<string, unknown> | undefined} */ (resultado && resultado.chosen);
    const candidatos = [
      chosen && chosen.document,
      resultado && resultado.ldDocument,
      informado,
    ].map(text).filter(Boolean);
    for (const candidato of [...new Set(candidatos)]) {
      const entradas = indicador.getEntries(candidato);
      if (entradas && entradas.length) return entradas;
    }
    return [];
  }

  function refreshHistoryIndicator() {
    root.GrconGrdtHistoryIndicator?.refresh?.();
  }

  /**
   * Consulta um único documento e devolve a linha já mesclada (situação,
   * alocação, GRDT/SIGEM e, quando houver central, status da fiscal). Usa
   * exatamente as mesmas três chamadas de requests_app.js — nenhuma regra é
   * reescrita aqui.
   * @param {string} document
   * @param {string} requestedTitle
   * @param {DocumentIndex} index
   * @param {AllocationCenterIndex | null} centralIndex
   * @returns {ConsultationRow}
   */
  function lookupDocument(document, requestedTitle, index, centralIndex) {
    const RC = requestsCore();
    const resultado = RC.lookupDocument(document, index, { requestedTitle });
    return {
      ...RC.consultationRow(resultado),
      ...RC.issuedColumns(historyEntriesFor(resultado, document)),
      ...centerFieldsFor(document, centralIndex),
    };
  }

  /**
   * Projeta uma linha de resultado no formato usado para cópia/exportação —
   * mesma seleção de campos de `linhasParaSaida()` em requests_app.js.
   * @param {string} document
   * @param {ConsultationRow} linha
   * @returns {ExportRow}
   */
  function buildExportRow(document, linha) {
    return {
      situation: /** @type {string} */ (linha.situation),
      document,
      ldDocument: /** @type {string} */ (linha.ldDocument),
      ldForm: /** @type {string} */ (linha.ldForm),
      ntFormsDetail: /** @type {string} */ (linha.ntFormsDetail),
      ntSearchMessage: /** @type {string} */ (linha.ntSearchMessage),
      title: /** @type {string} */ (linha.title),
      sigemLdRevision: /** @type {string} */ (linha.sigemLdRevision),
      sigemLdRevisionCell: /** @type {string} */ (linha.sigemLdRevisionCell),
      allocated: /** @type {string} */ (linha.allocated),
      allocation: /** @type {string} */ (linha.allocation),
      lastGrdt: /** @type {string} */ (linha.lastGrdt),
      issued: /** @type {string} */ (linha.issued),
      issuedCell: /** @type {string} */ (linha.issuedCell),
      issuedEgrdt: /** @type {string} */ (linha.issuedEgrdt),
      issuedAt: /** @type {string} */ (linha.issuedAt),
      issuedRevision: /** @type {string} */ (linha.issuedRevision),
      issuedRevisionCell: /** @type {string} */ (linha.issuedRevisionCell),
      sigemStatus: /** @type {string} */ (linha.sigemStatus),
      centerStatus: /** @type {string} */ (linha.centerStatus),
      centerFiscalAnswer: /** @type {string} */ (linha.centerFiscalAnswer),
      centerAllocationCell: /** @type {string} */ (linha.centerAllocationCell),
      ld: /** @type {string} */ (linha.ld),
      allLds: /** @type {string} */ (linha.allLds),
      rule: /** @type {string} */ (linha.rule),
    };
  }

  /** @param {ExportRow[]} rows */
  async function copyRowsToClipboard(rows) {
    const Report = requestsReport();
    const header = Report.COLUMNS.map((column) => column.header).join("\t");
    const cell = (value) => String(value === null || value === undefined ? "" : value).replace(/\s*\n\s*/g, " · ");
    const body = rows.map((row) => Report.COLUMNS.map((column) => cell(/** @type {Record<string, unknown>} */(row)[column.key])).join("\t")).join("\n");
    await navigator.clipboard.writeText(`${header}\n${body}`);
  }

  function modelosLocais() {
    try {
      const bruto = JSON.parse(root.localStorage.getItem(CHAVE_MODELOS) || "[]");
      return (Array.isArray(bruto) ? bruto : []).map((item) => requestsReport().normalizeExportTemplate({ ...item, scope: "local" }));
    } catch (_error) {
      return [];
    }
  }

  /** Reproduz `carregarModelos()`: embutidos + salvos localmente + da equipe. */
  async function loadExportTemplates() {
    const Report = requestsReport();
    const porId = new Map();
    Report.BUILTIN_EXPORT_TEMPLATES.forEach((modelo) => porId.set(modelo.id, modelo));
    modelosLocais().forEach((modelo) => porId.set(modelo.id, modelo));
    const Cloud = root.GrconCloud;
    if (Cloud && Cloud.getExportTemplates) {
      const salvos = await Cloud.getExportTemplates();
      (salvos || []).forEach((modelo) => porId.set(modelo.id, Report.normalizeExportTemplate({ ...modelo, scope: "equipe" })));
    }
    return [...porId.values()];
  }

  function rememberLastExport(template) {
    try {
      root.localStorage.setItem(CHAVE_ULTIMA, JSON.stringify({ id: template.id, name: template.name, at: new Date().toISOString() }));
    } catch (_error) { /* repetir a última é conveniência, não requisito */ }
  }

  /** @returns {{ id: string; name: string } | null} */
  function getLastExport() {
    try {
      const bruto = JSON.parse(root.localStorage.getItem(CHAVE_ULTIMA) || "null");
      return bruto && bruto.id ? bruto : null;
    } catch (_error) {
      return null;
    }
  }

  function onExportTemplatesChanged(callback) {
    root.addEventListener(EVENTO_MODELOS, callback);
    return () => root.removeEventListener(EVENTO_MODELOS, callback);
  }

  /**
   * Gera e baixa o arquivo Excel com o mesmo construtor da Triagem (mesmo
   * layout, mesma logomarca).
   * @param {ExportRow[]} rows
   * @param {ExportTemplate} template
   * @param {string} ldNames
   */
  async function exportRowsToExcel(rows, template, ldNames) {
    const Report = requestsReport();
    await ensureGroup("excel");
    await ensureGroup("brand");
    const workbook = new root.ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.company = "CONSAG Engenharia";
    workbook.title = template.name;
    const sheet = workbook.addWorksheet("Consulta", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
    Report.writeConsultationSheet(sheet, rows, {
      columns: template.columns,
      title: `GRCON · ${template.name.toUpperCase()}`,
      footer: `GRCON · ${template.name}`,
      metadata: `${rows.length.toLocaleString("pt-BR")} linha(s) · modelo "${template.name}" · ${new Date().toLocaleString("pt-BR")}`,
      ldNames,
    });
    await Report.attachBrandLogo(workbook, sheet, root.GRCONBrandAssets, root.fetch.bind(root));
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const carimbo = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.href = url;
    link.download = `GRCON_CONSULTA_${carimbo}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 10000);
    rememberLastExport(template);
  }

  /** @param {unknown} value */
  function normalizeExportTemplate(value) {
    return requestsReport().normalizeExportTemplate(value);
  }

  let exportRowsProvider = () => [];
  /** Usado pela aba legada "Modelos de exportação" para prever com dados reais. */
  function getExportRows() { return exportRowsProvider(); }
  /** @param {() => ExportRow[]} provider */
  function setExportRowsProvider(provider) { exportRowsProvider = provider || (() => []); }

  root.GrconConsultasAdapter = Object.freeze({
    notify,
    parseLd,
    buildIndex,
    rememberLastLd,
    getLastLd,
    parseAllocationCenterFile,
    parseDocumentList,
    dedupeDocuments,
    lookupDocument,
    buildExportRow,
    copyRowsToClipboard,
    loadExportTemplates,
    onExportTemplatesChanged,
    exportRowsToExcel,
    normalizeExportTemplate,
    getLastExport,
    refreshHistoryIndicator,
    getExportRows,
    setExportRowsProvider,
  });
})(window);
