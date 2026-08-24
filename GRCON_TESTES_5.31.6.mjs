import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const History = require(path.join(root, "history_core.js"));
const HistoryReport = require(path.join(root, "history_report.js"));
const Sequence = require(path.join(root, "egrdt_sequence.js"));
const Workbook = require(path.join(root, "grdt_workbook.js"));
const ExcelJS = require(path.join(root, "exceljs.min.js"));
const JSZip = require(path.join(root, "jszip.min.js"));
const Core = require(path.join(root, "core.js"));
const XLSX = require(path.join(root, "xlsx.full.min.js"));
const AllocationCenter = require(path.join(root, "allocation_center.js"));
const ReportSummary = require(path.join(root, "report_summary.js"));
const Requests = require(path.join(root, "requests_core.js"));
const RequestsReport = require(path.join(root, "requests_report.js"));
const Emission = require(path.join(root, "emission.js"));
const OutputGuard = require(path.join(root, "grcon_output_guard.js"));
const OutputAudit = require(path.join(root, "output_audit.js"));
const SheetJS = require(path.join(root, "xlsx.full.min.js"));
const checks = [];

function check(name, fn) {
  fn();
  checks.push(name);
}

function storage(initial = []) {
  const values = new Map([[History.STORAGE_KEY, JSON.stringify(initial)]]);
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function record(id, overrides = {}) {
  return History.cleanRecord({
    id,
    clientRecordId: id,
    egrdtNumber: Sequence.baseName(Number(id.replace(/\D/g, "")) || 1, 2026),
    generatedAt: "2026-08-03T12:00:00.000Z",
    outputType: "eGRDT final",
    files: [{ document: `DOC-${id}`, finalName: `DOC-${id}.pdf` }],
    ...overrides,
  });
}

function ldDocumentRecord(document, allocationStatus = "ALOCADO", sheet = "ET") {
  return {
    document,
    documentKey: Core.key(document),
    revision: "0",
    status: "",
    sigemStatus: "",
    title: "DOCUMENTO DE TESTE DA BUSCA NT",
    grdt: "",
    effectiveDate: "",
    format: "A4",
    discipline: "GERAL",
    documentType: "MA",
    purpose: "Para Informação",
    databook: "",
    fiscalComment: "",
    allocationStatus,
    allocation: allocationStatus === "ALOCADO" ? "ALOC-001" : "",
    sheet,
    row: 2,
    source: "LD_TESTE.xlsx",
    sourceTimestamp: 1,
    sourceOrder: 0,
    ldColumns: [],
  };
}

const ntBaseDocument = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019";
const ntDocument = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-SPE-AST-320019";
const n1710Document = "MA-5290.00-22000-ABC-C1O-001";
const cvDocument3 = "5900.0018047.05.2-ABC-CV-GER-001";
const cvDocument4 = "5900.0018047.05.2-C1O-CV-ELE-0001";

function cvLdRecord(document, discipline = "GERAL") {
  return {
    ...ldDocumentRecord(document, "ALOCADO", "CV"),
    title: "CURRÍCULO PROFISSIONAL",
    discipline,
    documentType: "",
    purpose: "Para Informação",
    format: "A4",
    source: "LD_001.xlsx",
  };
}

check("CV com sequencial de 3 dígitos localiza a aba CV da LD_001 e fica pronto para eGRDT", () => {
  const index = Core.buildIndex([cvLdRecord(cvDocument3)], []);
  assert.equal(Core.inferSheetFromName(`${cvDocument3}.pdf`), "CV");
  const result = Core.triageOne({ id: "cv-3", name: `${cvDocument3}.pdf` }, index, {});
  assert.equal(result.sheet, "CV");
  assert.equal(result.record.source, "LD_001.xlsx");
  assert.equal(result.decision, Core.READY);
  assert.equal(result.egrdt.documentType, "CV");
  assert.equal(result.egrdt.discipline, "GERAL");
  assert.deepEqual(Core.validateEgrdtData(result.egrdt), []);
});

check("CV com sequencial de 4 dígitos usa a mesma regra operacional eGRDT da aba CV", () => {
  const index = Core.buildIndex([cvLdRecord(cvDocument4, "ELÉTRICA")], []);
  assert.equal(Core.inferSheetFromName(`${cvDocument4}_A.pdf`), "CV");
  const result = Core.triageOne({ id: "cv-4", name: `${cvDocument4}.pdf` }, index, {});
  assert.equal(result.sheet, "CV");
  assert.equal(result.decision, Core.READY);
  assert.equal(result.egrdt.documentType, "CV");
  assert.equal(result.egrdt.discipline, "ELÉTRICA");
  assert.deepEqual(Core.validateEgrdtData(result.egrdt), []);
});

check("PDF com nt- localiza código sem nt- na LD e usa o nome oficial", () => {
  const index = Core.buildIndex([ldDocumentRecord(ntBaseDocument)], []);
  const result = Core.triageOne({ id: "nt-1", name: `${ntDocument}_0001.pdf` }, index, {});
  assert.equal(result.document, ntBaseDocument);
  assert.equal(result.documentLookup.matchedByNtVariant, true);
  assert.equal(result.documentLookup.ldForm, "Sem nt-");
  assert.equal(result.finalName, `${ntBaseDocument}_0001.pdf`);
  assert.equal(result.decision, Core.READY);
});

check("PDF sem nt- localiza código com nt- na LD e usa o nome oficial", () => {
  const index = Core.buildIndex([ldDocumentRecord(ntDocument)], []);
  const result = Core.triageOne({ id: "nt-2", name: `${ntBaseDocument}_0001.pdf` }, index, {});
  assert.equal(result.document, ntDocument);
  assert.equal(result.documentLookup.matchedByNtVariant, true);
  assert.equal(result.documentLookup.ldForm, "Com nt-");
  assert.equal(result.finalName, `${ntDocument}_0001.pdf`);
  assert.equal(result.decision, Core.READY);
});

check("busca alternativa preserva o bloqueio quando a forma da LD não está alocada", () => {
  const index = Core.buildIndex([ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO")], []);
  const result = Core.triageOne({ id: "nt-3", name: `${ntDocument}.pdf` }, index, {});
  assert.equal(result.document, ntBaseDocument);
  assert.equal(result.hardBlock, true);
  assert.equal(Core.allocationState(result.allocationStatus).kind, "not_allocated");
});

check("Não Alocado fica fora por padrão, mas a seleção manual permite gerar a GRDT", () => {
  const index = Core.buildIndex([ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO")], []);
  const result = Core.triageOne({ id: "manual-not-allocated", name: `${ntBaseDocument}.pdf` }, index, {});
  result.files = [{ name: `${ntBaseDocument}.pdf`, finalName: result.finalName, file: { size: 1 } }];
  result.egrdt = Core.buildEgrdtData(result.document, result.revision, result.finalName, result.record, result.sheet, "A4");

  const defaultPlan = Emission.createPlan([result], new Set([0]));
  assert.ok(defaultPlan.errors.some((message) => /bloqueado não pode ser emitido/i.test(message)));

  const manualPlan = Emission.createPlan([result], new Set([0]), { manualForceIndices: new Set([0]) });
  assert.deepEqual(manualPlan.errors, []);
  assert.equal(manualPlan.entries.length, 1);
  assert.equal(manualPlan.entries[0].manualAllocationOverride, true);
  assert.equal(manualPlan.items[0].manualAllocationOverride, true);
  assert.ok(manualPlan.warnings.some((message) => /incluído manualmente.*Não Alocado/i.test(message)));

  const guardBlocked = OutputGuard.validateRows([result], { maxItems: 48 });
  assert.equal(guardBlocked.valid, false);
  const guardManual = OutputGuard.validateRows([result], { maxItems: 48, manualForceRows: new Set([result]) });
  assert.equal(guardManual.valid, true);

  const otherBlock = {
    ...result,
    allocationStatus: "ALOCADO",
    blockCode: "technical_block",
    record: { ...result.record, allocationStatus: "ALOCADO" },
  };
  const protectedPlan = Emission.createPlan([otherBlock], new Set([0]), { manualForceIndices: new Set([0]) });
  assert.ok(protectedPlan.errors.some((message) => /bloqueado não pode ser emitido/i.test(message)));

  const summary = ReportSummary.buildRows([{ ...result, selectedForEgrdt: true, manuallyIncluded: true }], {})[0];
  assert.equal(summary.included, "SIM — MANUAL (LD NÃO ALOCADO)");
  assert.equal(summary.allocated, "NÃO — Não alocado");
  assert.match(summary.observation, /status original da LD foi preservado/i);
});

check("selecionar todos abrange documentos visíveis e registra inclusões manuais", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  // O rótulo da coluna é curto (cabe em 12rem); a explicação inteira fica no
  // title e no aria-label da caixa, que é onde o leitor de tela procura.
  assert.match(htmlSource, /id="select-all-ready"[^>]*type="checkbox"\/>Situação/);
  assert.match(htmlSource, /aria-label="Selecionar todos os documentos visíveis disponíveis para GRDT"/);
  assert.match(appSource, /const visibleIndices = filteredResultIndices\(\)/);
  assert.match(appSource, /manualAllocationOverrideAllowed\(row\)/);
  assert.match(appSource, /state\.manualForceInclude\.add\(index\)/);
  assert.match(appSource, /manualForceIndices: state\.manualForceInclude/);
});

check("quando as duas formas existem na LD a forma exata prevalece", () => {
  const index = Core.buildIndex([
    ldDocumentRecord(ntBaseDocument, "ALOCADO"),
    ldDocumentRecord(ntDocument, "NÃO ALOCADO"),
  ], []);
  const withoutNt = Core.triageOne({ id: "nt-4", name: `${ntBaseDocument}.pdf` }, index, {});
  const withNt = Core.triageOne({ id: "nt-5", name: `${ntDocument}.pdf` }, index, {});
  assert.equal(withoutNt.record.allocationStatus, "ALOCADO");
  assert.equal(withNt.record.allocationStatus, "NÃO ALOCADO");
});

check("relação registra as duas formas pesquisadas e o código oficial da LD", () => {
  const index = Core.buildIndex([ldDocumentRecord(ntBaseDocument)], []);
  const result = Core.triageOne({ id: "nt-6", name: `${ntDocument}.pdf` }, index, {});
  const summary = ReportSummary.buildRows([result], {})[0];
  assert.equal(summary.requestedDocument, ntDocument);
  assert.equal(summary.document, ntBaseDocument);
  assert.equal(summary.ldDocumentForm, "Sem nt-");
  assert.equal(summary.ntSearchResult, "LOCALIZADO NA OUTRA FORMA — USAR O CÓDIGO DA LD");
  assert.equal(summary.searchedWithoutNt, ntBaseDocument);
  assert.equal(summary.searchedWithNt, ntDocument);
  assert.equal(summary.ldDocument, ntBaseDocument);
  assert.match(summary.renameForEgrdt, /SIM — RENOMEADO/i);
  assert.match(summary.renameForEgrdt, /De:.*Para:/i);
  assert.match(summary.ntLookup, /Pesquisa com e sem nt-/);
  assert.doesNotMatch(summary.ntLookup, /NT-/);
  assert.match(summary.ntLookup, /código exatamente como está na LD/i);
  const executive = ReportSummary.executiveRows([summary])[0];
  assert.equal(executive.requestedDocument, ntDocument);
  assert.equal(executive.ldDocument, ntBaseDocument);
  assert.match(executive.renameForEgrdt, /De:.*Para:/i);
  assert.match(executive.ldEvidence, /LD_TESTE\.xlsx.*aba ET.*linha 2/i);
});

check("Resumo único prioriza decisão e preserva todas as evidências da auditoria", () => {
  const headers = ReportSummary.SUMMARY_COLUMNS.map((column) => column.header);
  assert.deepEqual(headers.slice(0, 9), [
    "SITUAÇÃO",
    "DOCUMENTO INFORMADO",
    "ENTRA NA EGRDT?",
    "O QUE FAZER",
    "ALOCADO?",
    "ALOCAÇÃO",
    "STATUS INTERNO",
    "SERÁ RENOMEADO?",
    "ARQUIVO QUE SERÁ POSTADO",
  ]);
  ReportSummary.COLUMNS.forEach((column) => {
    assert.ok(ReportSummary.SUMMARY_COLUMNS.some((summaryColumn) => summaryColumn.key === column.key), `Resumo não contém ${column.header}`);
    assert.equal(ReportSummary.SUMMARY_COLUMNS.filter((summaryColumn) => summaryColumn.key === column.key).length, 1);
  });
});

// ── Consultas ────────────────────────────────────────────────────────────
// As duas regras que atravessam o módulo: não inventar informação e não casar
// por semelhança. Os casos abaixo são os da seção de triagem por LD.

function consultaRecord(document, source, over = {}) {
  return {
    document, documentKey: Core.key(document), revision: "0", status: "", sigemStatus: "Não Postado",
    title: "Relatório de inspeção", grdt: "", effectiveDate: "", allocationStatus: "ALOCADO",
    allocation: "ALOC-1", allocationStage: "", sheet: "ET", row: 2, source,
    sourceTimestamp: 100, sourceOrder: 0, ldColumns: [], ...over,
  };
}

check("lista colada separa código e título e ignora linhas vazias", () => {
  const lista = Requests.parseDocumentList(`${ntBaseDocument}\tRelatório de inspeção\n\n${ntDocument}\n   \n`);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].document, ntBaseDocument);
  assert.equal(lista[0].requestedTitle, "Relatório de inspeção");
  assert.equal(lista[1].requestedTitle, "");
});

check("duplicidade sai pelo código normalizado sem perder o título informado", () => {
  const { items, removed } = Requests.dedupeDocuments([
    { document: ntBaseDocument, requestedTitle: "" },
    { document: ntBaseDocument.toLowerCase(), requestedTitle: "Título da segunda linha" },
    { document: "OUTRO-1", requestedTitle: "" },
  ]);
  assert.equal(items.length, 2);
  assert.equal(removed.length, 1);
  assert.equal(items[0].requestedTitle, "Título da segunda linha");
});

check("consulta de documento exato responde as seis colunas com confiança alta", () => {
  const index = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx", { grdt: "GRDT-0007", sigemStatus: "Postado" })], []);
  const resultado = Requests.lookupDocument(ntBaseDocument, index);
  const linha = Requests.consultationRow(resultado);
  assert.equal(resultado.confidence, "alta");
  assert.equal(resultado.needsManualValidation, false);
  assert.equal(linha.title, "Relatório de inspeção");
  assert.equal(linha.allocated, "SIM — Alocado");
  assert.equal(linha.lastGrdt, "GRDT-0007");
  assert.equal(linha.sigemStatus, "Postado");
  assert.equal(linha.ld, "LD_A.xlsx");
});

check("documento não localizado não recebe nenhum dado inventado", () => {
  const index = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx")], []);
  const linha = Requests.consultationRow(Requests.lookupDocument("C1O_RNEST_U32_9.9.9.9_INS_RIR_SPE-AST-999999", index));
  assert.equal(linha.situation, "Não localizado");
  for (const campo of ["title", "allocated", "lastGrdt", "sigemStatus", "ld"]) assert.equal(linha[campo], "");
});

check("consulta não casa por semelhança de título", () => {
  const index = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx", { title: "Relatório de inspeção" })], []);
  const resultado = Requests.lookupDocument("XXX_OUTRO_CODIGO_DIFERENTE", index, { requestedTitle: "Relatório de inspeção" });
  assert.equal(resultado.found, false);
});

check("mesmo documento em duas LDs com a mesma informação não é conflito", () => {
  const index = Core.buildIndex([
    consultaRecord(ntBaseDocument, "LD_A.xlsx"),
    consultaRecord(ntBaseDocument, "LD_B.xlsx", { sourceTimestamp: 200 }),
  ], []);
  const linha = Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, index));
  assert.equal(linha.occurrenceCount, 2);
  assert.equal(linha.allLds, "LD_A.xlsx | LD_B.xlsx");
  assert.match(linha.rule, /mesma informação/);
});

check("LDs que divergem elegem a mais recente, explicam a regra e pedem confirmação", () => {
  const index = Core.buildIndex([
    consultaRecord(ntBaseDocument, "LD_ANTIGA.xlsx", { allocationStatus: "NÃO ALOCADO", allocation: "", sourceTimestamp: 100 }),
    consultaRecord(ntBaseDocument, "LD_NOVA.xlsx", { allocationStatus: "ALOCADO", sourceTimestamp: 300 }),
  ], []);
  const resultado = Requests.lookupDocument(ntBaseDocument, index);
  const linha = Requests.consultationRow(resultado);
  assert.equal(resultado.conflicting, true);
  assert.equal(resultado.chosen.ld, "LD_NOVA.xlsx");
  assert.equal(linha.situation, "Requer validação manual");
  assert.match(linha.rule, /mais recente: LD_NOVA/);
});

check("empate entre LDs divergentes não preenche campo por palpite, mas diz o conflito", () => {
  const index = Core.buildIndex([
    consultaRecord(ntBaseDocument, "LD_A.xlsx", { allocationStatus: "NÃO ALOCADO", allocation: "", sourceTimestamp: 500 }),
    consultaRecord(ntBaseDocument, "LD_B.xlsx", { allocationStatus: "ALOCADO", sourceTimestamp: 500 }),
  ], []);
  const linha = Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, index));
  // Título, GRDT e LD escolhida continuam vazios: escolher um lado seria palpite.
  assert.equal(linha.title, "");
  assert.equal(linha.lastGrdt, "");
  assert.equal(linha.ld, "");
  // A alocação, não: deixar em branco fazia parecer que nada foi apurado,
  // quando o que existe é uma LD dizendo as duas coisas.
  assert.equal(linha.allocated, "CONFLITO — a LD registra ALOCADO e NÃO ALOCADO");
  assert.equal(linha.allocationKind, "conflict");
  assert.equal(linha.allLds, "LD_A.xlsx | LD_B.xlsx");
  assert.match(linha.rule, /Escolha qual vale/);
  assert.match(linha.rule, /As LDs divergem/, "arquivos diferentes: a mensagem cita as LDs");
});

check("linhas divergentes dentro da mesma LD não mandam procurar uma segunda LD", () => {
  const index = Core.buildIndex([
    { ...consultaRecord(ntBaseDocument, "LD_UNICA.xlsx", { allocationStatus: "NÃO ALOCADO", allocation: "" }), row: 15752 },
    { ...consultaRecord(ntBaseDocument, "LD_UNICA.xlsx", { allocationStatus: "ALOCADO", allocation: "C1O-ALOC-CM-0094-2026" }), row: 16155 },
  ], []);
  const linha = Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, index));
  assert.equal(linha.allocated, "CONFLITO — a LD registra ALOCADO e NÃO ALOCADO");
  assert.match(linha.rule, /traz linhas divergentes para o mesmo documento/);
  assert.match(linha.rule, /linha 15752/);
  assert.match(linha.rule, /linha 16155/);
  assert.doesNotMatch(linha.rule, /As LDs divergem/);
});

check("consulta aproveita a regra do nt- e rebaixa a confiança do resultado", () => {
  const index = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx")], []);
  const resultado = Requests.lookupDocument(ntDocument, index);
  assert.equal(resultado.found, true);
  assert.equal(resultado.confidence, "media");
  assert.equal(resultado.needsManualValidation, true);
  assert.equal(resultado.ldDocument, ntBaseDocument);
});

check("título da consulta sai exatamente como está na LD", () => {
  const original = "Relatório de Inspeção — Válvula 3\" (Ø nominal), rev. A";
  const index = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx", { title: original })], []);
  assert.equal(Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, index)).title, original);
});

check("o módulo de Solicitações saiu do GRCON e virou um atalho para o GRCON Flow", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  // Nem a seção, nem a view, nem a aba do módulo antigo continuam no HTML.
  assert.doesNotMatch(html, /id="solicitacoes-module"/);
  assert.doesNotMatch(html, /data-grcon-view="solicitacoes"/);
  assert.doesNotMatch(html, /id="tab-solicitacoes"/);
  // A Consultas continua com sua própria aba, intacta.
  assert.match(html, /data-grcon-view="requests"/);
  assert.match(html, /id="requests-module"/);
  // O lugar do antigo módulo agora é um link externo para o GRCON Flow.
  assert.match(html, /href="https:\/\/grcon-flow\.vercel\.app\/"/);
  assert.match(html, /class="ops-nav-button ops-nav-external"[^>]*href="https:\/\/grcon-flow\.vercel\.app\/"/);

  assert.ok(!fs.existsSync(path.join(root, "solicitacoes_app.js")), "solicitacoes_app.js não deve mais existir no pacote");

  const loader = fs.readFileSync(path.join(root, "grcon_module_loader.js"), "utf8");
  assert.doesNotMatch(loader, /solicitacoes/);

  const consulta = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  assert.doesNotMatch(consulta, /GrconSolicitacoesUi/, "sem referência ao módulo removido");

  const cloud = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  for (const rpc of ["grcon_save_request", "grcon_list_request_items", "grcon_update_request_items", "grcon_request_item_history"]) {
    assert.doesNotMatch(cloud, new RegExp(`rpc\\("${rpc}"`));
  }
});

check("a alocação da consulta distingue número de ALOC, coluna vazia e aba sem coluna", () => {
  const porNumero = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx", {
    allocationStatus: "", allocation: "C1O-ALOC-CM-0028-2026",
  })], []);
  assert.match(Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, porNumero)).allocated, /^SIM — alocação evidenciada pelo número/);

  const vazia = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx", {
    allocationStatus: "", allocation: "", allocationStatusColumn: "U", allocationStatusHeader: "CONFIRMAÇÃO DE ALOCAÇÃO",
  })], []);
  assert.match(Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, vazia)).allocated, /^NÃO INFORMADO/);

  const semColuna = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx", {
    allocationStatus: "", allocation: "", allocationStatusColumn: "", allocationStatusHeader: "",
  })], []);
  assert.match(Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, semColuna)).allocated, /^NÃO APURADO/);
});

check("modelo de exportação guarda ordem e nome das colunas escolhidas", () => {
  const modelo = RequestsReport.normalizeExportTemplate({
    name: "Minha planilha",
    base: "consulta",
    columns: [
      { key: "document", header: "Código do documento" },
      { key: "title", header: "Título" },
    ],
  });
  assert.equal(modelo.id, "minha-planilha");
  assert.equal(modelo.columns.length, 2);
  // O nome da coluna é do usuário; a chave continua sendo a do motor.
  assert.equal(modelo.columns[0].header, "Código do documento");
  assert.equal(modelo.columns[0].key, "document");

  const saida = RequestsReport.applyExportTemplate(modelo, [
    { document: "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-1", title: "Relatório", situation: "Localizado" },
  ]);
  assert.deepEqual(saida.headers, ["Código do documento", "Título"]);
  assert.deepEqual(saida.rows, [["C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-1", "Relatório"]]);
  // Coluna fora do modelo não aparece, mesmo existindo no dado.
  assert.equal(saida.rows[0].length, 2);

  // Chave desconhecida não vira coluna preenchida por engano: perde a chave e
  // sai em branco, em vez de o modelo inventar um campo que o motor não tem.
  const inventada = RequestsReport.normalizeExportTemplate({
    name: "X", base: "consulta", columns: [{ key: "campo_que_nao_existe", header: "Qualquer" }],
  });
  assert.equal(inventada.columns[0].key, "");
  assert.deepEqual(RequestsReport.applyExportTemplate(inventada, [{ campo_que_nao_existe: "valor" }]).rows, [[""]]);
});

check("modelo importado do painel oficial reproduz a estrutura e não inventa coluna", () => {
  // Cabeçalho real da consulta, com uma coluna que só existe na planilha da
  // equipe.
  const resultado = RequestsReport.importExportTemplate("Painel da equipe", [
    "documento",       // caixa diferente: mesmo rótulo
    "título na ld",    // idem
    "Coluna que só existe na rede",
    "",
  ], "consulta");

  const modelo = resultado.template;
  assert.equal(modelo.columns.length, 3, "a linha vazia não vira coluna");
  // A grafia do arquivo do usuário é preservada: o modelo é a planilha dele.
  assert.equal(modelo.columns[0].header, "documento");
  assert.equal(modelo.columns[0].key, "document");
  assert.equal(modelo.columns[1].key, "title");
  // O que o GRCON não reconhece fica sem chave, sai em branco e é informado.
  assert.equal(modelo.columns[2].key, "");
  assert.deepEqual(resultado.unmatched, ["Coluna que só existe na rede"]);
  assert.equal(resultado.matched, 2);

  const saida = RequestsReport.applyExportTemplate(modelo, [{ document: "C1O-1", title: "Relatório" }]);
  assert.deepEqual(saida.rows, [["C1O-1", "Relatório", ""]]);
});

check("importação de modelo casa por nome idêntico, nunca por semelhança", () => {
  // "Documento" e "Documentos" não são o mesmo rótulo. Casar por aproximação
  // encheria uma coluna com o conteúdo da outra.
  const resultado = RequestsReport.importExportTemplate("Aproximado", [
    "Documento",
    "Documentos",
    "Caminho",
  ], "consulta");
  assert.equal(resultado.template.columns[0].key, "document");
  assert.equal(resultado.template.columns[1].key, "", "plural não é o mesmo rótulo");
  assert.equal(resultado.template.columns[2].key, "", "prefixo não é o mesmo rótulo");
  assert.equal(resultado.matched, 1);
});

check("prévia do modelo mostra as linhas reais e diz quantas ficaram de fora", () => {
  const modelo = RequestsReport.BUILTIN_EXPORT_TEMPLATES.find((item) => item.base === "consulta");
  assert.ok(modelo.builtIn, "os modelos embutidos existem sem depender de cadastro");
  const linhas = Array.from({ length: 7 }, (_, indice) => ({ document: `DOC-${indice + 1}`, situation: "Localizado" }));
  const previa = RequestsReport.previewExportTemplate(modelo, linhas, 5);
  assert.equal(previa.rows.length, 5);
  assert.equal(previa.total, 7);
  assert.equal(previa.hidden, 2);
  // Sem dado não há prévia inventada.
  assert.deepEqual(RequestsReport.previewExportTemplate(modelo, [], 5).rows, []);
});

check("modelos de exportação passam pelo banco com papel conferido e sem RLS nova", () => {
  const sql = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.32.21.sql"), "utf8");
  // Tabela no schema privado, fora do PostgREST, e sem privilégio direto.
  assert.match(sql, /create table if not exists private\.grcon_export_templates/);
  assert.match(sql, /revoke all on table private\.grcon_export_templates from public, anon, authenticated;/);
  // Ler é de qualquer membro; salvar e excluir, só do proprietário.
  assert.match(sql, /private\.grcon_is_member\(target_workspace\)/);
  assert.match(sql, /Somente o proprietário pode salvar modelos de exportação/);
  assert.match(sql, /Somente o proprietário pode excluir modelos de exportação/);
  // Base é lista fechada: uma base desconhecida só apareceria na exportação.
  assert.match(sql, /base_limpa not in \('consulta', 'controle'\)/);
  // A restrição do usuário vale sem exceção: nenhuma política de RLS é criada.
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /alter policy/i);
  assert.doesNotMatch(sql, /drop policy/i);

  const cloud = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  assert.match(cloud, /grcon_get_export_templates/);
  assert.match(cloud, /grcon_save_export_template/);
  assert.match(cloud, /grcon_delete_export_template/);

  const app = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  // Sem área compartilhada o modelo ainda é salvo aqui: quem trabalha sozinho
  // não pode ficar sem o recurso.
  assert.match(app, /grcon-requests-export-templates/);
  // Repetir a última exportação nunca troca de modelo por conta própria.
  assert.match(app, /não existe mais\. Escolha outro para exportar/);
});

check("central de alocação só é aceita com caminho, aba e as duas colunas", () => {
  assert.equal(ReportSummary.normalizeAllocationCenter(null), null);
  assert.equal(ReportSummary.normalizeAllocationCenter({ path: "\\\\srv\\q\\Central.xlsx", sheet: "Central", keyColumn: "B" }), null);
  const central = ReportSummary.normalizeAllocationCenter({
    path: "\\\\servidor\\qualidade\\Central de Alocacao.xlsx",
    sheet: "Central",
    keyColumn: "b",
    commentColumn: "h",
  });
  assert.equal(central.fileName, "Central de Alocacao.xlsx");
  assert.equal(central.directory, "\\\\servidor\\qualidade\\");
  assert.equal(central.keyColumn, "B");
  assert.equal(central.commentColumn, "H");
  assert.equal(central.lastRow, 20000);
  assert.equal(ReportSummary.normalizeAllocationCenter({ ...central, lastRow: 500 }).lastRow, 500);
});

check("STATUS INTERNO prioriza o comentário da fiscal presente na LD", () => {
  assert.equal(ReportSummary.internalStatusText({ fiscalComment: "Liberado pela fiscalização", sigemStatus: "Não Postado" }), "Liberado pela fiscalização");
});

check("STATUS INTERNO cai no que o GRCON apurou quando não há comentário da fiscal", () => {
  assert.equal(ReportSummary.internalStatusText({ ntSearchResult: "NÃO LOCALIZADO NA LD" }), "Não consta na LD");
  assert.equal(ReportSummary.internalStatusText({ renameForEgrdt: "SIM — RENOMEADO PARA SEGUIR A LD.", ldDocument: "C1O_X_nt-NF-1" }), "Código que consta C1O_X_nt-NF-1");
  assert.equal(ReportSummary.internalStatusText({ included: "NÃO — EM ANÁLISE" }), "Em análise");
  assert.equal(ReportSummary.internalStatusText({ included: "SIM", sigemStatus: "Não Postado" }), "Não postado no SIGEM");
  assert.equal(ReportSummary.internalStatusText({ included: "SIM" }), "Não postado no SIGEM");
});

check("relação sem PDF físico preserva o DE → PARA depois de adotar o código da LD", () => {
  const index = Core.buildIndex([ldDocumentRecord(ntBaseDocument)], []);
  const match = Core.exactDocumentMatch(ntDocument, index);
  const lookup = Core.documentLookup(ntDocument, match, [match]);
  const result = Core.triageOne({
    id: "nt-relation-only",
    document: ntBaseDocument,
    name: `${ntDocument}.pdf`,
    documentLookupHint: lookup,
  }, index, {});
  const summary = ReportSummary.buildRows([result], {})[0];
  assert.equal(result.documentLookup.matchedByNtVariant, true);
  assert.ok(result.ntRename);
  assert.equal(result.ntRename.enviado, ntDocument);
  assert.equal(result.ntRename.naLd, ntBaseDocument);
  assert.match(summary.renameForEgrdt, /SIM — RENOMEADO/i);
  assert.match(summary.renameForEgrdt, new RegExp(`De: ${ntDocument.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

check("ausência na LD informa que as formas com e sem nt- foram pesquisadas", () => {
  const index = Core.buildIndex([], []);
  const result = Core.triageOne({ id: "nt-7", document: ntBaseDocument, name: `${ntBaseDocument}.pdf` }, index, {});
  assert.equal(result.status, "Não consta na LD");
  assert.deepEqual(result.documentLookup.searchedKeys, [ntBaseDocument, ntDocument]);
  assert.equal(result.documentLookup.resultLabel, "NÃO LOCALIZADO COM/SEM nt- NEM PELO TIPO + TAG");
  assert.match(result.documentLookup.message, /nenhum documento desse mesmo tipo foi localizado na LD/i);
  const summary = ReportSummary.buildRows([result], {})[0];
  const executive = ReportSummary.executiveRows([summary])[0];
  assert.match(executive.executiveAction, /não consta na LD/i);
  assert.doesNotMatch(executive.executiveAction, /não está alocado/i);
  // O Resumo é lido por gerência: nada de vocabulário do aplicativo.
  assert.doesNotMatch(executive.executiveAction, /GRCON|aba “Auditoria detalhada”/i);
});

check("N-1710 não pesquisa nem aceita uma forma artificial com nt-", () => {
  const index = Core.buildIndex([ldDocumentRecord(n1710Document, "ALOCADO", "N-1710")], []);
  const exact = Core.triageOne({ id: "n1710-1", document: n1710Document, name: `${n1710Document}_0001.pdf` }, index, {});
  assert.equal(exact.document, n1710Document);
  assert.equal(exact.documentLookup.appliesToNtRule, false);
  assert.equal(exact.documentLookup.resultLabel, "NÃO SE APLICA — localizado pela regra normal");
  assert.deepEqual(exact.documentLookup.searchedKeys, [n1710Document]);

  const invalidAlias = Core.triageOne({ id: "n1710-2", name: `nt-${n1710Document}_0001.pdf` }, index, {});
  assert.equal(invalidAlias.status, "Não consta na LD");
  assert.equal(invalidAlias.documentLookup.appliesToNtRule, false);
  assert.match(invalidAlias.documentLookup.message, /regra com\/sem nt- não se aplica/);
});

{
  const document = "DE-5290.00-22313-142-C1O-076";
  const record = {
    ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
    title: "BOMBA 32006 A ESTRUTURA METÁLICA PARA RETIDADA DA BOMBA",
    format: "A3",
    discipline: "RNEST UHDTD U-32 N-1710/CVL",
    documentType: "DE",
    purpose: "Para Construção",
    databook: "DATA BOOK C&M UHDTD U-32",
  };
  const nativeName = `${document}_0001_0.dwg`;
  const pdfName = `${document}_0001_0.pdf`;
  assert.equal(Core.proposedFileName(`${document}.dwg`, document, "0", "N-1710"), nativeName);
  assert.equal(Core.proposedFileName(`${document}.pdf`, document, "0", "N-1710"), pdfName);
  assert.equal(Core.proposedFileName(`${document}_0001.dwg`, document, "A", "N-1710"), `${document}_0001_A.dwg`);

  const row = {
    document, revision: "0", sheet: "N-1710", record, decision: Core.READY, hardBlock: false,
    egrdt: Core.buildEgrdtData(document, "0", pdfName, record, "N-1710", "A3"),
    // Ordem propositalmente invertida: o plano deve reproduzir o exemplo oficial, nativo antes do PDF.
    files: [
      { name: pdfName, finalName: pdfName, file: { size: 10 } },
      { name: nativeName, finalName: nativeName, file: { size: 20 } },
    ],
  };
  assert.equal(row.egrdt.discipline, "CIVIL");
  assert.deepEqual(Core.validateEgrdtData(row.egrdt), []);

  const pair = Emission.validateN1710Pair(row, row.files);
  assert.equal(pair.valid, true);
  assert.deepEqual(pair.sources.map((entry) => entry.name), [nativeName, pdfName]);

  const plan = Emission.createPlan([row], new Set([0]));
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.entries.length, 2);
  assert.equal(plan.items.length, 2);
  assert.deepEqual(plan.items.map((item) => item.fileName), [nativeName, pdfName]);
  assert.ok(plan.items.every((item) => item.document === document && item.revision === "0"));

  const bytes = await Workbook.build(plan.items);
  const verified = await Workbook.verify(bytes, plan.items);
  assert.equal(verified.checkedRows, 2);
  assert.deepEqual(verified.rows.map((item) => item.fileName), [nativeName, pdfName]);
  checks.push("N-1710 gera exatamente duas linhas por código — nativo + PDF — com _0001_revisão nos dois arquivos");

  const onlyPdf = { ...row, files: [row.files[0]] };
  const incomplete = Emission.createPlan([onlyPdf], new Set([0]));
  assert.ok(incomplete.errors.some((message) => /N-1710 exige exatamente 2 arquivos por código/i.test(message)));
  assert.ok(incomplete.errors.some((message) => /arquivo nativo/i.test(message)));
  checks.push("N-1710 bloqueia geração quando o par nativo + PDF está incompleto");
}

{
  const liDocument = "LI-5290.00-22313-91D-C1O-001";
  const liRow = {
    document: liDocument, revision: "A", sheet: "N-1710",
    files: [
      { name: `${liDocument}_0001_A.pdf`, finalName: `${liDocument}_0001_A.pdf`, file: { size: 10 } },
      { name: `${liDocument}_0001_A.xlsx`, finalName: `${liDocument}_0001_A.xlsx`, file: { size: 20 } },
    ],
  };
  const liPair = Emission.validateN1710Pair(liRow, liRow.files);
  assert.equal(liPair.valid, true);
  assert.equal(liPair.requiresExcelPair, true);
  assert.equal(liPair.documentType, "LI");
  assert.deepEqual(liPair.sources.map((entry) => entry.name), [
    `${liDocument}_0001_A.xlsx`,
    `${liDocument}_0001_A.pdf`,
  ]);

  const liRecord = {
    ...ldDocumentRecord(liDocument, "ALOCADO", "N-1710"),
    title: "LISTA DE INSTRUMENTOS",
    format: "A4",
    discipline: "INSTRUMENTAÇÃO",
    documentType: "LI",
    purpose: "Para Informação",
    databook: "DATA BOOK N-1710",
  };
  const liPlanRow = {
    ...liRow,
    record: liRecord,
    decision: Core.READY,
    hardBlock: false,
    egrdt: Core.buildEgrdtData(liDocument, "A", `${liDocument}_0001_A.xlsx`, liRecord, "N-1710", "A4"),
  };
  const liPlan = Emission.createPlan([liPlanRow], new Set([0]));
  assert.deepEqual(liPlan.errors, []);
  assert.deepEqual(liPlan.items.map((item) => item.fileName), [
    `${liDocument}_0001_A.xlsx`,
    `${liDocument}_0001_A.pdf`,
  ]);
  const liWorkbook = await Workbook.build(liPlan.items);
  const liVerified = await Workbook.verify(liWorkbook, liPlan.items);
  assert.equal(liVerified.checkedRows, 2);
  assert.deepEqual(liVerified.rows.map((item) => item.fileName), [
    `${liDocument}_0001_A.xlsx`,
    `${liDocument}_0001_A.pdf`,
  ]);

  const liWrongNative = Emission.validateN1710Pair(liRow, [
    { name: `${liDocument}_0001_A.dwg`, finalName: `${liDocument}_0001_A.dwg`, file: { size: 20 } },
    { name: `${liDocument}_0001_A.pdf`, finalName: `${liDocument}_0001_A.pdf`, file: { size: 10 } },
  ]);
  assert.equal(liWrongNative.valid, false);
  assert.ok(liWrongNative.errors.some((message) => /arquivo Excel/i.test(message)));
  assert.ok(liWrongNative.errors.some((message) => /não aceita outro tipo de arquivo nativo/i.test(message)));

  const mcDocument = "MC-5290.00-22313-911-C1O-001";
  const mcRow = {
    document: mcDocument, revision: "0", sheet: "N-1710",
    files: [
      { name: `${mcDocument}_0001_0.xlsm`, finalName: `${mcDocument}_0001_0.xlsm`, file: { size: 20 } },
      { name: `${mcDocument}_0001_0.pdf`, finalName: `${mcDocument}_0001_0.pdf`, file: { size: 10 } },
    ],
  };
  const mcPair = Emission.validateN1710Pair(mcRow, mcRow.files);
  assert.equal(mcPair.valid, true);
  assert.equal(mcPair.requiresExcelPair, true);
  assert.equal(mcPair.documentType, "MC");
  assert.deepEqual(mcPair.sources.map((entry) => entry.name), [
    `${mcDocument}_0001_0.xlsm`,
    `${mcDocument}_0001_0.pdf`,
  ]);
  assert.equal(Core.proposedFileName(`${mcDocument}.xlsb`, mcDocument, "0", "N-1710"), `${mcDocument}_0001_0.xlsb`);
  checks.push("LI e MC da N-1710 exigem e ordenam exatamente Excel + PDF, aceitando extensões Excel suportadas");
}

check("LD_001 prioriza DISCIPLINA sobre Disciplina Torre e adapta CIVIL/SEGURANCA para CIVIL na eGRDT", () => {
  globalThis.XLSX = SheetJS;
  const document = "DE-5290.00-22313-142-C1O-076";
  const headers = Array(25).fill("");
  headers[0] = "ITEM";
  headers[1] = "DOCUMENTO";
  headers[2] = "REVISÃO";
  headers[3] = "TÍTULO";
  headers[4] = "UNIDADE/ÁREA";
  headers[5] = "DISCIPLINA";
  headers[7] = "PROPÓSITO DE EMISSÃO";
  headers[12] = "GRDT";
  headers[13] = "STATUS";
  headers[16] = "STATUS SIGEM";
  headers[18] = "ALOCAÇÃO";
  headers[21] = "CAMINHO DATABOOK";
  headers[23] = "CONFIRMAÇÃO DE ALOCAÇÃO";
  headers[24] = "Disciplina Torre";

  const data = Array(25).fill("");
  data[0] = "2551";
  data[1] = document;
  data[2] = "0";
  data[3] = "DISPOSITIVO PARA RETIRADA DA BOMBA B-32006A";
  data[4] = "U-32";
  data[5] = "RNEST UHDT-D U32 CIVIL/SEGURANCA";
  data[7] = "PARA CONSTRUÇÃO";
  data[13] = "EM EMISSÃO";
  data[16] = "Não Postado";
  data[18] = "C1O-ALOC-CM-0062-2026";
  data[21] = "DATA BOOK C&M UHDTD U-32";
  data[23] = "ALOCADO";
  // A coluna auxiliar existe na LD real, mas está vazia para estes documentos.
  data[24] = "";

  const workbook = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(workbook, SheetJS.utils.aoa_to_sheet([
    ["LISTA DE DOCUMENTOS"], [""], [""], [""], ["DADOS DOS DOCUMENTOS"], headers, data,
  ]), "N-1710");

  const parsed = Core.parseWorkbook(workbook, "LD-5290.00-22313-91A-C1O-001_0001_E.xlsx", 1, null);
  const record = parsed.records.find((item) => item.document === document);
  assert.ok(record);
  assert.equal(record.discipline, "RNEST UHDT-D U32 CIVIL/SEGURANCA");
  const egrdt = Core.buildEgrdtData(document, "0", `${document}_0001_0.pdf`, record, "N-1710", "A3");
  assert.equal(egrdt.discipline, "CIVIL");
  assert.deepEqual(Core.validateEgrdtData(egrdt), []);
});

check("ET localiza variação silenciosa de separadores somente dentro do TAG", () => {
  const ld = "C1O_RNEST_U32_3.1.1.1_INS_US-ME.SPIE_nt-P-101-A";
  const input = "C1O_RNEST_U32_3.1.1.1_INS_US-ME.SPIE_nt-P101A";
  const index = Core.buildIndex([ldDocumentRecord(ld)], []);
  const match = Core.exactDocumentMatch(input, index);
  assert.ok(match);
  assert.equal(match.matchKind, "tag-format-variant");
  const result = Core.triageOne({ id: "tag-format", name: `${input}_0001.pdf` }, index, {});
  assert.equal(result.document, ld);
  assert.equal(result.finalName, `${ld}_0001.pdf`);
  assert.equal(result.decision, Core.READY);
  assert.equal(result.ntRename, null);
  assert.equal(result.documentLookup.resultLabel, "LOCALIZADO NA LD");
  assert.doesNotMatch(result.documentLookup.message, /erro|transcri|formata/i);
});

check("ET tolera uma única confusão alfanumérica comum no TAG quando a LD é inequívoca", () => {
  const ld = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019";
  const input = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-32O019";
  const index = Core.buildIndex([ldDocumentRecord(ld)], []);
  const match = Core.exactDocumentMatch(input, index);
  assert.ok(match);
  assert.equal(match.matchKind, "tag-transcription-variant");
  const result = Core.triageOne({ id: "tag-transcription", name: `${input}.pdf` }, index, {});
  assert.equal(result.document, ld);
  assert.equal(result.finalName, `${ld}.pdf`);
  assert.equal(result.decision, Core.READY);
});

check("busca tolerante do TAG não adivinha quando há mais de uma linha possível", () => {
  const prefix = "C1O_RNEST_U32_3.1.1.1_INS_RIR_";
  const index = Core.buildIndex([
    ldDocumentRecord(`${prefix}P-101-A`),
    ldDocumentRecord(`${prefix}P1-01A`),
  ], []);
  const result = Core.triageOne({ id: "tag-ambiguous", name: `${prefix}P.101A.pdf` }, index, {});
  assert.equal(result.status, "Código ambíguo no nome");
  assert.equal(result.decision, Core.REVIEW);
});

check("busca final por tipo + TAG corrige os Grupos 1 a 5 pela codificação oficial da LD", () => {
  const ld = "C1O_RNEST_U32_3.1.1.1_INS_RIR_P-101-A";
  const wrongPrefix = "C1O_RNEST_U34_3.1.1.1_INS_RIR_nt-P101A";
  const index = Core.buildIndex([ldDocumentRecord(ld)], []);
  const match = Core.exactDocumentMatch(wrongPrefix, index);
  assert.ok(match);
  assert.equal(match.matchKind, "report-tag");
  const result = Core.triageOne({ id: "report-tag", name: `${wrongPrefix}_0001.pdf` }, index, {});
  assert.equal(result.document, ld);
  assert.equal(result.finalName, `${ld}_0001.pdf`);
  assert.equal(result.decision, Core.READY);
  assert.equal(result.documentLookup.matchedByReportTag, true);
  assert.equal(result.documentLookup.searchedReportCode, "RIR");
  assert.equal(result.documentLookup.searchedTag, "P101A");
  assert.equal(result.documentLookup.resultLabel, "LOCALIZADO PELO TIPO + TAG — USAR O CÓDIGO DA LD");
  assert.match(result.documentLookup.message, /tipo.*RIR.*TAG.*P101A.*única correspondência/i);
  assert.ok(result.ldRename);
  const summary = ReportSummary.buildRows([result], {})[0];
  assert.match(summary.renameForEgrdt, /SIM — RENOMEADO.*De:.*Para:/i);
});

check("mesmo TAG em REP e RUFF preserva o tipo REP informado", () => {
  const tag = "P-101-A";
  const rep = `C1O_RNEST_U32_3.1.1.1_INS_REP_${tag}`;
  const ruff = `C1O_RNEST_U32_3.1.1.1_INS_RUFF_${tag}`;
  const input = `C1O_RNEST_U35_3.1.1.1_INS_REP_${tag}`;
  const index = Core.buildIndex([ldDocumentRecord(ruff), ldDocumentRecord(rep)], []);
  const match = Core.exactDocumentMatch(input, index);
  assert.ok(match);
  assert.equal(match.document, rep);
  assert.equal(match.matchKind, "report-tag");
  const result = Core.triageOne({ id: "rep-not-ruff", name: `${input}.pdf` }, index, {});
  assert.equal(result.document, rep);
  assert.equal(result.finalName, `${rep}.pdf`);
  assert.equal(result.documentLookup.searchedReportCode, "REP");
  assert.ok(result.ldRename);
  assert.doesNotMatch(result.document, /_RUFF_/);
});

check("REP não localiza nem renomeia para RUFF quando só o outro tipo possui o TAG", () => {
  const tag = "P-101-A";
  const ruff = `C1O_RNEST_U32_3.1.1.1_INS_RUFF_${tag}`;
  const input = `C1O_RNEST_U35_3.1.1.1_INS_REP_${tag}`;
  const index = Core.buildIndex([ldDocumentRecord(ruff)], []);
  assert.equal(Core.exactDocumentMatch(input, index), null);
  const result = Core.triageOne({ id: "rep-missing", name: `${input}.pdf` }, index, {});
  assert.equal(result.status, "Não consta na LD");
  assert.equal(result.decision, Core.REVIEW);
  assert.equal(result.documentLookup.searchedReportCode, "REP");
  assert.equal(result.documentLookup.resultLabel, "NÃO LOCALIZADO COM/SEM nt- NEM PELO TIPO + TAG");
  assert.match(result.documentLookup.message, /TAG igual pertencente a outro tipo documental não é aceito/i);
  assert.equal(result.ldRename, null);
  assert.doesNotMatch(result.finalName || "", /_RUFF_/);
});

check("regra de tipo + TAG é genérica e não usa uma lista fixa de siglas", () => {
  ["REP", "RUFF", "RIR", "TIPONORMA"].forEach((reportCode, position) => {
    const tag = `EQ-${position + 1}`;
    const ld = `C1O_RNEST_U32_3.1.1.1_INS_${reportCode}_${tag}`;
    const input = `C1O_RNEST_U34_3.1.1.1_INS_${reportCode}_${tag}`;
    const index = Core.buildIndex([ldDocumentRecord(ld)], []);
    const match = Core.exactDocumentMatch(input, index);
    assert.ok(match);
    assert.equal(match.document, ld);
    assert.equal(match.matchKind, "report-tag");
  });
});

check("tipo + TAG tolera uma confusão alfanumérica no TAG e mantém o mesmo tipo", () => {
  const ld = "C1O_RNEST_U32_3.1.1.1_INS_REP_P-10O-A";
  const input = "C1O_RNEST_U34_3.1.1.1_INS_REP_P-100-A";
  const index = Core.buildIndex([ldDocumentRecord(ld)], []);
  const match = Core.exactDocumentMatch(input, index);
  assert.ok(match);
  assert.equal(match.document, ld);
  assert.equal(match.matchKind, "report-tag-transcription");
  const result = Core.triageOne({ id: "report-tag-transcription", name: `${input}.pdf` }, index, {});
  assert.equal(result.finalName, `${ld}.pdf`);
  assert.ok(result.ldRename);
});

check("busca por tipo + TAG não escolhe automaticamente quando o mesmo tipo possui mais de um código", () => {
  const tag = "P-101-A";
  const index = Core.buildIndex([
    ldDocumentRecord(`C1O_RNEST_U32_3.1.1.1_INS_RIR_${tag}`),
    ldDocumentRecord(`C1O_RNEST_U34_3.1.1.1_INS_RIR_${tag}`),
  ], []);
  const input = `C1O_RNEST_U35_3.1.1.1_INS_RIR_${tag}`;
  assert.equal(Core.exactDocumentMatch(input, index), null);
  const result = Core.triageOne({ id: "report-tag-ambiguous", name: `${input}.pdf` }, index, {});
  assert.equal(result.status, "Código ambíguo no nome");
  assert.equal(result.decision, Core.REVIEW);
  assert.equal(result.documentLookup.searchResult, "ambiguous");
});

check("índice pesquisa 15.000 códigos ET na forma oposta sem limite de quantidade", () => {
  const total = 15000;
  const cases = Array.from({ length: total }, (_, index) => {
    const suffix = String(index + 1).padStart(5, "0");
    const withoutNt = `C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-TESTE-${suffix}`;
    const withNt = `C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-SPE-TESTE-${suffix}`;
    return { input: index % 2 ? withoutNt : withNt, ld: index % 2 ? withNt : withoutNt };
  });
  const index = Core.buildIndex(cases.map((item) => ldDocumentRecord(item.ld)), []);
  cases.forEach((item) => {
    const match = Core.exactDocumentMatch(item.input, index);
    assert.ok(match);
    assert.equal(match.document, item.ld);
    assert.equal(match.matchKind, "nt-variant");
  });
});

check("índice pesquisa 15.000 variações de separador do TAG sem varrer a LD", () => {
  const total = 15000;
  const cases = Array.from({ length: total }, (_, index) => {
    const suffix = String(index + 1).padStart(5, "0");
    return {
      input: `C1O_RNEST_U32_3.1.1.1_INS_RIR_PUMP${suffix}`,
      ld: `C1O_RNEST_U32_3.1.1.1_INS_RIR_PUMP-${suffix}`,
    };
  });
  const index = Core.buildIndex(cases.map((item) => ldDocumentRecord(item.ld)), []);
  cases.forEach((item) => {
    const match = Core.exactDocumentMatch(item.input, index);
    assert.ok(match);
    assert.equal(match.document, item.ld);
    assert.equal(match.matchKind, "tag-format-variant");
  });
});

check("índice pesquisa 15.000 códigos ET por tipo + TAG independente dos Grupos 1 a 5", () => {
  const total = 15000;
  const cases = Array.from({ length: total }, (_, index) => {
    const suffix = String(index + 1).padStart(5, "0");
    return {
      input: `C1O_RNEST_U34_3.1.1.1_INS_RIR_nt-PUMP${suffix}`,
      ld: `C1O_RNEST_U32_3.1.1.1_INS_RIR_PUMP-${suffix}`,
    };
  });
  const index = Core.buildIndex(cases.map((item) => ldDocumentRecord(item.ld)), []);
  cases.forEach((item) => {
    const match = Core.exactDocumentMatch(item.input, index);
    assert.ok(match);
    assert.equal(match.document, item.ld);
    assert.equal(match.matchKind, "report-tag");
  });
});

check("relatório em Worker preserva a evidência NT e a renomeação", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const compact = source.slice(source.indexOf("function compactResultForWorker"), source.indexOf("async function performanceSafeResults"));
  assert.match(compact, /name:\s*item\.name/);
  assert.match(compact, /documentLookup:\s*item\.documentLookup/);
  assert.match(compact, /searchedWithoutNt/);
  assert.match(compact, /searchedWithNt/);
  assert.match(compact, /resultLabel/);
  assert.match(compact, /ntRename:\s*item\.ntRename/);
  assert.match(compact, /matchedByReportTag/);
  assert.match(compact, /searchedTag/);
  assert.match(compact, /searchedReportCode/);
  assert.match(compact, /ldRename:\s*item\.ldRename/);
});

check("Workers externos usam os módulos atuais e exportam um Resumo único e completo", () => {
  const facade = fs.readFileSync(path.join(root, "performance_workers.js"), "utf8");
  const exportWorker = fs.readFileSync(path.join(root, "workers", "export.worker.js"), "utf8");
  assert.doesNotMatch(facade, /const SOURCES=/);
  assert.match(facade, /workers\/ld\.worker\.js/);
  assert.match(facade, /workers\/triage\.worker\.js/);
  assert.match(facade, /workers\/export\.worker\.js/);
  assert.match(exportWorker, /\.\.\/report_summary\.js/);
  // O Resumo tem de vir do construtor compartilhado; montado dentro do Worker,
  // uma melhoria chegava só a quem caísse em um dos dois caminhos de exportação.
  assert.match(exportWorker, /writeExecutiveSummarySheet/);
  assert.doesNotMatch(exportWorker, /DADOS DA ANÁLISE|Arquitetura de desempenho/);
  assert.doesNotMatch(exportWorker, /addWorksheet\("Auditoria detalhada"/);
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(appSource, /writeExecutiveSummarySheet/);
  assert.doesNotMatch(appSource, /workbook\.addWorksheet\("Auditoria detalhada"/);
});

check("histórico remove registro apagado na nuvem", () => {
  const local = storage([
    record("A1", { cloudId: "cloud-a", workspaceId: "ws", syncedAt: "2026-08-03T12:01:00.000Z", syncState: "synced" }),
    record("B2", { cloudId: "cloud-b", workspaceId: "ws", syncedAt: "2026-08-03T12:01:00.000Z", syncState: "synced" }),
  ]);
  const result = History.replaceWorkspaceSnapshot([
    record("A1", { cloudId: "cloud-a", workspaceId: "ws", syncedAt: "2026-08-03T12:02:00.000Z", syncState: "synced" }),
  ], "ws", local);
  assert.equal(result.error, "");
  assert.equal(result.records.some((item) => item.cloudId === "cloud-b"), false);
  assert.equal(result.removed, 1);
});

check("histórico preserva criação local ainda não enviada", () => {
  const local = storage([record("C3", { syncState: "pending" })]);
  const result = History.replaceWorkspaceSnapshot([], "ws", local);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].syncState, "pending");
});

check("edição pendente não é apagada por uma leitura intermediária", () => {
  const pending = record("D4", {
    cloudId: "cloud-d",
    workspaceId: "ws",
    syncedAt: "2026-08-03T12:01:00.000Z",
    cloudUpdatedAt: "2026-08-03T12:01:00.000Z",
    syncState: "pending",
    egrdtNumber: Sequence.baseName(40, 2026),
  });
  const local = storage([pending]);
  const result = History.replaceWorkspaceSnapshot([
    record("D4", { cloudId: "cloud-d", workspaceId: "ws", syncedAt: "2026-08-03T12:02:00.000Z", syncState: "synced", egrdtNumber: Sequence.baseName(41, 2026) }),
  ], "ws", local);
  assert.equal(result.records[0].egrdtNumber, Sequence.baseName(40, 2026));
  assert.equal(result.records[0].syncState, "pending");
});

check("renomeação mantém identificador estável para sincronização", () => {
  const original = record("E5", { cloudId: "cloud-e", workspaceId: "ws", syncedAt: "2026-08-03T12:01:00.000Z", syncState: "synced" });
  const local = storage([original]);
  const updated = History.updateNumber(original.id, "0099", local);
  assert.equal(updated.updated, true);
  assert.equal(updated.record.clientRecordId, "E5");
  assert.equal(updated.record.syncState, "pending");
});

check("histórico preserva a identidade da reserva compartilhada", () => {
  const item = record("F6", {
    reservationRequestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    reservationIds: ["11111111-2222-4333-8444-555555555555"],
  });
  assert.equal(item.reservationRequestId, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.deepEqual(item.reservationIds, ["11111111-2222-4333-8444-555555555555"]);
});

check("prévia informa que a reserva final ocorre no compartilhado", () => {
  assert.match(Sequence.simultaneousUseWarning(), /reservado no histórico compartilhado/i);
});

check("migrações liberam a numeração excluída com autorização e transação", () => {
  const migration514 = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.31.4.sql"), "utf8");
  const migration515 = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.31.5.sql"), "utf8");
  const migration516 = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.31.6.sql"), "utf8");
  const migration532 = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.32.2.sql"), "utf8");
  assert.match(migration514, /grcon_history_workspace_egrdt_number_uidx/i);
  assert.match(migration515, /deleted_at timestamptz/i);
  assert.match(migration515, /target_request_id uuid/i);
  assert.match(migration515, /grcon_egrdt_reservations_request_item_uidx/i);
  assert.match(migration515, /grcon_egrdt_reservations_reserved_by_idx/i);
  assert.match(migration515, /history_id uuid/i);
  assert.match(migration515, /status = 'consumed'/i);
  assert.match(migration515, /revoke all on function public\.grcon_fill_profile_fields\(\) from public, anon, authenticated/i);
  assert.match(migration515, /revoke all on function public\.grcon_sync_auth_user_profile\(\) from public, anon, authenticated/i);
  assert.match(migration516, /grcon_history_storage_retention/i);
  assert.match(migration516, /pg_database_size\(current_database\(\)\)/i);
  assert.match(migration516, /pg_total_relation_size\('public\.grcon_history'::regclass\)/i);
  assert.match(migration516, /newest_position > 100/i);
  assert.match(migration516, /create or replace function public\.grcon_clear_history\(target_workspace uuid\)/i);
  assert.match(migration516, /private\.grcon_has_role\(target_workspace, array\['owner', 'admin'\]\)/i);
  assert.match(migration516, /delete from public\.grcon_history[\s\S]*where workspace_id = target_workspace/i);
  assert.match(migration516, /grant execute on function public\.grcon_clear_history\(uuid\) to authenticated/i);
  assert.match(migration516, /revoke all on function public\.grcon_clear_history\(uuid\) from public, anon/i);
  assert.match(migration532, /create unique index grcon_history_workspace_egrdt_number_uidx[\s\S]*deleted_at is null/i);
  assert.ok((migration532.match(/history_row\.deleted_at is null/gi) || []).length >= 2);
  assert.match(migration532, /create or replace function private\.grcon_delete_history_record/i);
  assert.match(migration532, /create or replace function public\.grcon_delete_history_record/i);
  assert.match(migration532, /private\.grcon_has_role\(target_workspace, array\['owner', 'admin'\]\)/i);
  assert.match(migration532, /delete from private\.grcon_egrdt_reservations[\s\S]*history_row\.deleted_at is not null/i);
  assert.match(migration532, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration532, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration532, /grant execute on function public\.grcon_delete_history_record\(uuid, uuid, text, uuid\[\]\) to authenticated/i);
  const reservationDelete = migration532.lastIndexOf("delete from private.grcon_egrdt_reservations");
  const historyDelete = migration532.lastIndexOf("delete from public.grcon_history");
  assert.ok(reservationDelete >= 0 && historyDelete > reservationDelete);
});

check("aplicativo aguarda reserva antes das três gerações", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.equal((source.match(/officialNumbers\s*=\s*await reserveEgrdtSequences/g) || []).length, 3);
});

check("fluxo acelerado preenche A4 quando a LD não informa o formato", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(source, /rawResults\.forEach\(\(result\)\s*=>\s*\{[\s\S]*?const formatDefaulted = Boolean\(result\.egrdt && !result\.egrdt\.format\);[\s\S]*?if \(formatDefaulted\) result\.egrdt\.format = "A4";[\s\S]*?const logical = logicalMeta\.get\(result\.id\);/);
});

check("central de alocação é compartilhada pelo banco e só o proprietário altera", () => {
  const cloud = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  for (const rpc of ["grcon_get_allocation_center", "grcon_set_allocation_center", "grcon_clear_allocation_center"]) {
    assert.match(cloud, new RegExp(`rpc\\("${rpc}"`));
  }
  // Gravar e remover exigem o papel de proprietário antes de chamar o banco.
  assert.match(cloud, /async function saveAllocationCenter[\s\S]*?if \(!canManageMembers\(\)\)/);
  assert.match(cloud, /async function clearAllocationCenter[\s\S]*?if \(!canManageMembers\(\)\)/);
  // A carga entra junto com o restante da área compartilhada, no login.
  assert.match(cloud, /await loadMembers\(\);\s*await loadAllocationCenter\(\);/);

  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  // Remover só a cópia local deixaria o cadastro voltar na próxima leitura.
  assert.match(app, /Cloud\?\.clearAllocationCenter/);
  assert.match(app, /Cloud\?\.saveAllocationCenter/);
  assert.match(app, /window\.addEventListener\("grcon:allocation-center-updated"/);
});

check("migração da central usa invólucro invoker e confere o papel no schema privado", () => {
  const sql = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.32.6.sql"), "utf8");
  assert.match(sql, /revoke all on table private\.grcon_allocation_center from public, anon, authenticated;/);
  // Escrita e remoção só para owner; leitura para qualquer membro ativo.
  assert.equal((sql.match(/private\.grcon_has_role\(target_workspace, array\['owner'\]\)/g) || []).length, 2);
  assert.match(sql, /private\.grcon_is_member\(target_workspace\)/);
  for (const name of ["grcon_get_allocation_center", "grcon_set_allocation_center", "grcon_clear_allocation_center"]) {
    const wrapper = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`));
    assert.ok(wrapper, `falta o invólucro público de ${name}`);
    assert.match(wrapper[0], /security invoker/);
    assert.doesNotMatch(wrapper[0], /security definer/);
  }
  // Nenhuma política de RLS é criada nesta migração.
  assert.doesNotMatch(sql, /create\s+policy/i);
});

check("sincronização usa RPC de exclusão e evita a segunda leitura quando não há envio", () => {
  const source = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  assert.match(source, /rpc\("grcon_delete_history_record"/);
  assert.match(source, /\.is\("deleted_at", null\)/);
  assert.doesNotMatch(source, /from\("grcon_history"\)\.delete\(\)/);
  assert.match(source, /const pushed = await pushLocalHistory\(History\.read\(\)\);\s*if \(pushed\.pushed \|\| pushed\.conflicts\) await pullCloudHistory\(\);/s);
  assert.match(source, /record\?\.syncState !== "synced"/);
});

check("cliente envia e conclui o identificador idempotente da reserva", () => {
  const source = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  const config = fs.readFileSync(path.join(root, "grcon_cloud_config.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(source, /target_request_id:\s*requestId/);
  assert.match(source, /completeEgrdtReservationRequest/);
  assert.match(config, /reservationRequestStorageKey/);
  assert.match(app, /completeEgrdtReservationRequest\(generated\)/);
});


check("limpeza compartilhada só remove o histórico local após confirmação do Supabase", () => {
  const cloud = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "history_app.js"), "utf8");
  assert.match(cloud, /state\.client\.rpc\("grcon_clear_history", \{ target_workspace: workspaceId \}\)/);
  const rpcPosition = cloud.indexOf('state.client.rpc("grcon_clear_history"');
  const localClearPosition = cloud.indexOf("History?.clear?.()", rpcPosition);
  assert.ok(rpcPosition >= 0 && localClearPosition > rpcPosition);
  assert.match(cloud, /\["owner", "admin"\]\.includes\(state\.membership\?\.role\)/);
  assert.match(ui, /Os registros serão apagados também do Supabase/);
  assert.match(ui, /await window\.GrconCloud\?\.clearHistory\?\.\(\)/);
  assert.match(ui, /numerações consumidas serão liberadas para reutilização/i);
});

check("exclusão individual confirma o Supabase antes de apagar localmente", () => {
  const cloud = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "history_app.js"), "utf8");
  assert.match(cloud, /async function deleteSharedHistoryRecord\(record\)/);
  assert.match(cloud, /target_reservation_ids:\s*reservationIds\.length \? reservationIds : null/);
  const remotePosition = ui.indexOf("await window.GrconCloud.deleteHistoryRecord(record)");
  const localPosition = ui.indexOf("History.deleteOne(record.id)", remotePosition);
  assert.ok(remotePosition >= 0 && localPosition > remotePosition);
  assert.match(ui, /foi liberado para reutilização/i);
});

check("atalho do cabeçalho abre o RECON sem integração de dados", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /href="https:\/\/recon-ivory\.vercel\.app\/"/i);
  assert.match(html, /target="_blank"/i);
  assert.match(html, /rel="noopener noreferrer"/i);
});

check("manifesto declara o tamanho real do ícone", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const png = fs.readFileSync(path.join(root, manifest.icons[0].src));
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, manifest.icons[0].sizes);
});

check("service worker publica o cache isolado da versão atual", () => {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  // A versão vem do package.json: fixá-la aqui fazia o teste quebrar em toda
  // publicação, mesmo quando o Service Worker estava correto.
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.ok(source.includes(`grcon-v${version}`), `sw.js deveria publicar o cache grcon-v${version}`);
  assert.match(source, /networkFirst/);
});

{
  const items = Array.from({ length: 48 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return {
      document: `0130870-C1O-PGV-G-TESTE-${suffix}`,
      revision: "0",
      title: `DOCUMENTO DE VALIDAÇÃO OPERACIONAL ${suffix}`,
      fileName: `0130870-C1O-PGV-G-TESTE-${suffix}_0001.pdf`,
      format: "A4",
      discipline: "GERAL",
      documentType: "DOCUMENTO",
      purpose: "PARA INFORMAÇÃO",
      databook: "",
    };
  });
  const bytes = await Workbook.build(items);
  const verified = await Workbook.verify(bytes, items);
  assert.equal(Workbook.isLegacyXls(bytes), true);
  assert.equal(verified.valid, true);
  assert.equal(verified.checkedRows, 48);
  await assert.rejects(() => Workbook.build([...items, { ...items[0] }]), /no máximo 48/i);
  checks.push("gerador produz e reabre XLS BIFF8 com 48 linhas e bloqueia a 49ª");
}

{
  const index = Core.buildIndex([ldDocumentRecord(ntBaseDocument)], []);
  const result = Core.triageOne({ id: "report-xlsx", name: `${ntDocument}_0001.pdf` }, index, {});
  const rows = ReportSummary.buildRows([result], { ldFileName: "LD_TESTE.xlsx" });
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet("Resumo");
  const summaryLayout = await ReportSummary.writeExecutiveSummarySheet(summarySheet, rows, {
    metadata: "LD_TESTE.xlsx · Versão da LD enviada: TESTE",
    ldName: "LD_TESTE.xlsx",
    ldVersion: "TESTE",
    relationLabel: "Relação de teste",
    allocationCenter: { path: "\\\\servidor\\qualidade\\Central.xlsx", sheet: "Central", keyColumn: "B", commentColumn: "H" },
  });
  const bytes = await workbook.xlsx.writeBuffer();
  const archive = await JSZip.loadAsync(bytes);
  assert.equal(Object.keys(archive.files).some((name) => name.startsWith("xl/externalLinks/") || name === "xl/connections.xml"), false);
  const summaryXml = await archive.file("xl/worksheets/sheet1.xml").async("string");
  assert.doesNotMatch(summaryXml, /<f(?:\s|>)/);
  assert.doesNotMatch(summaryXml, /XLOOKUP|externalReference|externalLink/i);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 1).value, "SITUAÇÃO");
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 3).value, "ENTRA NA EGRDT?");
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 4).value, "O QUE FAZER");
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 7).value, "STATUS INTERNO");
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 8).value, "SERÁ RENOMEADO?");
  assert.match(String(reopened.getWorksheet("Resumo").getCell(summaryLayout.dataStart, 8).value), /De:.*Para:/i);
  // Mesmo com uma central cadastrada, a célula precisa ser texto puro. Uma
  // PROCX externa fazia o Excel reparar o arquivo e avisar sobre fonte não
  // confiável.
  const internal = reopened.getWorksheet("Resumo").getCell(summaryLayout.dataStart, 7);
  assert.equal(internal.formula, undefined);
  assert.equal(internal.value, "Código que consta " + ntBaseDocument);
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 11).value, "CÓDIGO DA LD");
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 12).value, "BUSCA NO APÊNDICE");
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 13).value, "Tagueado sim ou não?");
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 15).value, "RESULTADO DA BUSCA COM/SEM nt- E TAG");
  assert.equal(reopened.getWorksheet("Resumo").columnCount, ReportSummary.SUMMARY_COLUMNS.length);
  assert.equal(reopened.getWorksheet("Auditoria detalhada"), undefined);
  checks.push("Excel do relatório reabre com Resumo único e evidências completas");
}

{
  const literalLdDocument = "c1O_Rnest_u32_3.1.1.1_Ins_Rir_nt-Spe-Ast-320019";
  const informedDocument = literalLdDocument.replace("_nt-", "_").toUpperCase();
  const technical = ldDocumentRecord(literalLdDocument);
  const oldHistorySpelling = { ...ldDocumentRecord(literalLdDocument.toUpperCase()), sheet: "Colar SIGEM" };
  const index = Core.buildIndex([technical], [oldHistorySpelling]);
  const result = Core.triageOne({ id: "literal-ld", name: `${informedDocument}_0001.pdf` }, index, {});

  assert.equal(result.document, literalLdDocument);
  assert.equal(result.documentLookup.ldDocument, literalLdDocument);
  assert.equal(result.finalName, `${literalLdDocument}_0001.pdf`);

  const rows = ReportSummary.buildRows([result], { ldFileName: "LD_LITERAL.xlsx" });
  assert.equal(rows[0].document, literalLdDocument);
  assert.equal(rows[0].ldDocument, literalLdDocument);
  assert.equal(rows[0].finalFile, `${literalLdDocument}_0001.pdf`);

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Resumo");
  const layout = await ReportSummary.writeExecutiveSummarySheet(summary, rows, { ldName: "LD_LITERAL.xlsx" });
  const bytes = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  const reopenedSummary = reopened.getWorksheet("Resumo");
  const documentColumn = ReportSummary.SUMMARY_COLUMNS.findIndex((column) => column.key === "document") + 1;
  const ldDocumentColumn = ReportSummary.SUMMARY_COLUMNS.findIndex((column) => column.key === "ldDocument") + 1;
  const finalFileColumn = ReportSummary.SUMMARY_COLUMNS.findIndex((column) => column.key === "finalFile") + 1;
  assert.equal(reopenedSummary.getCell(layout.dataStart, documentColumn).value, literalLdDocument);
  assert.equal(reopenedSummary.getCell(layout.dataStart, ldDocumentColumn).value, literalLdDocument);
  assert.equal(reopenedSummary.getCell(layout.dataStart, finalFileColumn).value, `${literalLdDocument}_0001.pdf`);
  checks.push("relatório e arquivo final preservam literalmente maiúsculas e minúsculas da LD");
}

check("central de alocação responde status e comentário da fiscal por documento", () => {
  const AC = AllocationCenter;

  // Planilha no formato real: cabeçalho na segunda linha, porque a primeira
  // traz só um total, e NomeDocumento como chave.
  const cabecalho = ["ABA", "VERSÃO \nDA LD", "DATA DO ENVIO\n DA ALOC", "Retorno da Fiscal 01\n (Renata)",
    "Resposta da Fiscal 01\n (Renata)", "Retorno da Fiscal 02\n (Nani)", "STATUS DA ALOCAÇÃO", "ALOCAÇÃO", "FAROL", "NomeDocumento"];
  const doc = "C1O_RNEST_U32_3.8.2.1_TUB_RUFF_U32-AR-05655";
  const planilha = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(planilha, XLSX.utils.aoa_to_sheet([
    ["", "", "", "", "", "", 2],
    cabecalho,
    ["ET_LD_004", "0", new Date(2026, 7, 13), new Date(2026, 4, 5), "Recusado: falta o TAG", "", "FISCAL 01 - RECUSADO", "C1O-ALOC-CM-0058-2026", "0", doc],
    ["ET_LD_004", "0", new Date(2026, 7, 18), "", "Aceita sem comentários", "", "FISCAL 01 - AGUARDANDO RETORNO", "C1O-ALOC-CM-0230-2026", "0", doc],
  ], { cellDates: true }), "Central de alocação");

  const indice = AC.parseAllocationCenter(planilha, { xlsx: XLSX, core: Core });
  assert.equal(indice.ok, true);
  assert.equal(indice.sheetName, "Central de alocação");
  assert.equal(indice.headerRow, 2, "o cabeçalho não está na primeira linha");
  assert.equal(indice.count, 2);
  assert.equal(indice.documents, 1, "o mesmo documento em dois envios é um documento");

  // A aba registra cada ALOC enviada; vale o envio mais recente, porque é ele
  // que descreve a situação de hoje.
  const achado = AC.allocationCenterLookup(doc, indice, Core);
  assert.equal(achado.found, true);
  assert.equal(achado.all.length, 2, "o histórico dos envios é preservado");
  assert.equal(achado.chosen.status, "FISCAL 01 - AGUARDANDO RETORNO");
  assert.equal(achado.chosen.allocation, "C1O-ALOC-CM-0230-2026");
  assert.match(achado.rule, /2 envios/, "a regra aplicada precisa estar escrita");

  const campos = AC.centerFields(achado);
  assert.equal(campos.centerStatus, "FISCAL 01 - AGUARDANDO RETORNO");
  // O texto da fiscal sai exatamente como está na planilha.
  assert.equal(campos.centerFiscalAnswer, "Aceita sem comentários");
  assert.match(campos.centerAllocationCell, /C1O-ALOC-CM-0230-2026\n/);

  // Documento fora da central é "não consta", que não é "não alocado".
  const fora = AC.allocationCenterLookup("C1O_RNEST_U32_9.9.9.9_INS_RIR_INEXISTENTE", indice, Core);
  assert.equal(fora.found, false);
  assert.equal(AC.centerFields(fora).centerStatus, "", "sem registro não se afirma situação");
});

check("empate de data na central desempata pelo número da ALOC", () => {
  const AC = AllocationCenter;
  // Acontece no arquivo real: dois envios na mesma data com status diferentes.
  // O número da ALOC é sequencial e cresce com a data, então serve de critério.
  assert.ok(AC.allocationSequence("C1O-ALOC-CM-0230-2026") > AC.allocationSequence("C1O-ALOC-CM-0058-2026"));
  // O ano pesa mais que o sequencial, para a ordem não inverter na virada.
  assert.ok(AC.allocationSequence("C1O-ALOC-CM-0001-2027") > AC.allocationSequence("C1O-ALOC-CM-9999-2026"));
  assert.equal(AC.allocationSequence(""), 0);
  assert.equal(AC.allocationSequence("sem número"), 0);
});

check("colunas da central chegam à tela e à exportação sem afirmar o que não se apurou", () => {
  const report = fs.readFileSync(path.join(root, "requests_report.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  for (const coluna of ["STATUS DA ALOCAÇÃO (CENTRAL)", "RESPOSTA DA FISCAL 01", "ALOC ENVIADA (CENTRAL)"]) {
    assert.ok(report.includes(coluna), `a exportação precisa da coluna ${coluna}`);
  }
  // Já foram embutidas no cabeçalho e esquecidas na montagem da linha uma vez:
  // a planilha saiu com as colunas vazias.
  for (const campo of ["centerStatus", "centerFiscalAnswer", "centerAllocationCell"]) {
    assert.match(app, new RegExp(`${campo}: linha\\.${campo}`), `a exportação precisa levar ${campo}`);
  }

  assert.match(html, /id="requests-central-input"/);
  assert.match(app, /GrconAllocationCenter/);
  // Três respostas diferentes que não podem virar a mesma.
  assert.match(app, /sem central/);
  assert.match(app, /não consta na central/);
});

check("tabela larga avisa que rola, e a sombra vem do estado real da rolagem", () => {
  const js = fs.readFileSync(path.join(root, "ui-v3.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "grcon-final.css"), "utf8");
  const requests = fs.readFileSync(path.join(root, "requests.css"), "utf8");

  // Os quatro estados medidos no navegador: start acende só a direita, middle
  // acende os dois lados, end só a esquerda, none apaga tudo.
  assert.match(js, /region\.dataset\.scroll = estado/);
  assert.match(js, /sobra <= 1 \? "none"/, "sem transbordo não pode acender sombra");
  for (const estado of ["start", "middle", "end"]) {
    assert.match(css, new RegExp(`\\.ui-v3-table-shell\\[data-scroll="${estado}"\\]`));
  }

  // A sombra fica na casca, que não rola. Dentro do quadro ela some atrás das
  // células, que têm fundo próprio — vale para o gradiente preso ao conteúdo
  // e também para o box-shadow inset.
  assert.match(js, /ui-v3-table-shell/);
  assert.match(css, /\.ui-v3-table-shell \{[^}]*min-width: 0/,
    "sem min-width:0 a casca cresce dentro de grid e o quadro para de rolar");

  // min-width na tabela é o que a faz rolar em vez de espremer as colunas até
  // o cabeçalho nowrap se sobrepor.
  assert.match(requests, /\.requests-table \{[^}]*min-width: \d+rem/);
});

check("faixa Retomar só aparece com histórico real e nunca inventa número", () => {
  const js = fs.readFileSync(path.join(root, "retomar.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

  assert.match(html, /id="grcon-retomar"/);
  assert.match(html, /<script defer="" src="retomar\.js"><\/script>/);
  assert.ok((sw.match(/"retomar\.js"/g) || []).length >= 2, "o script precisa entrar nos dois caches");

  // Tudo sai do histórico gravado; sem registro a faixa fica oculta, sem
  // cartão zerado nem exemplo.
  assert.match(js, /GrconHistory/);
  assert.match(js, /if \(!lista\.length\)/);
  assert.match(js, /els\.secao\.hidden = true/);
  // Nenhum número é escrito no código: os totais vêm de summary().
  assert.match(js, /History\.summary\(lista\)/);
});

check("auditoria de tela: selo de planilha, painel SGPAR no escuro e campo com rótulo", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const legado = fs.readFileSync(path.join(root, "legacy-compat.css"), "utf8");

  // O selo da planilha era a letra "X" solta. Medido no navegador, ela saía
  // rgb(10,82,125) sobre rgb(228,242,248) — o mesmo par do selo de pasta —,
  // porque o token do design-system vence a regra branca sobre verde. Um "X"
  // azul nos dois pontos de entrada do app é lido como erro ou fechar.
  assert.doesNotMatch(html, /class="source-icon excel">X</,
    "o selo de planilha não pode voltar a ser a letra X");
  assert.match(html, /class="source-icon excel">\s*<svg/, "o selo de planilha usa ícone");
  assert.match(legado, /\.source-icon\.excel svg/, "o ícone do selo precisa de tamanho e traço próprios");

  // No modo escuro o cartão do SGPAR ficava com texto claro sobre fundo branco
  // literal: 1,26:1 medido, ou seja, os números somem. O gêmeo
  // .relation-summary > div já estava na lista de escuro; este ficou de fora.
  assert.match(legado, /body\.p2-dark \.sgpar-overview > div:not\(\.sgpar-progress\)/,
    "o cartão do SGPAR precisa de fundo escuro no modo escuro");
  assert.match(legado, /body\.p2-dark \.sgpar-overview strong/,
    "o número do cartão tem cor fixa e precisa da versão escura");

  // Único campo sem rótulo acessível encontrado na varredura das cinco abas.
  assert.match(html, /aria-label="[^"]+"[^>]*id="unified-search-text"/,
    "a busca unificada precisa de rótulo acessível");
});

check("número da eGRDT não vira texto vertical quando o painel fica estreito", () => {
  // O cabeçalho do detalhe punha título e botões na mesma linha sem permitir
  // quebra. Os botões não encolhem, então o título era espremido até zero de
  // largura e, com overflow-wrap: anywhere, o número saía um caractere por
  // linha. Medido na reprodução: a 620px de contêiner o h3 ficava com 19px e
  // 25 linhas; abaixo de 560px, com largura zero.
  //
  // Empilhar por @media não resolve: a consulta olha a janela, e o painel pode
  // estar estreito com a janela larga — que é o caso das duas colunas do
  // histórico. A quebra tem de vir do próprio flex.
  const css = fs.readFileSync(path.join(root, "grcon-ui.css"), "utf8");
  const cabecalho = css.slice(css.indexOf('html[data-app="GRCON"] .history-detail > header {'));
  const bloco = cabecalho.slice(0, cabecalho.indexOf("}") + 1);
  assert.match(bloco, /flex-wrap:\s*wrap/, "o cabeçalho do detalhe precisa poder quebrar em linhas");

  // O chão do título é o que manda os botões para baixo antes de comprimir.
  assert.match(css, /\.history-detail-title \{[^}]*flex:\s*1 1 \d+rem/,
    "o título precisa de base mínima para não ser espremido a zero");
});

check("interface do navegador tem camada responsiva final e cacheada", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "grcon-responsive.css"), "utf8");
  const uiFixPosition = html.indexOf('href="grcon-ui-fix.css"');
  const responsivePosition = html.indexOf('href="grcon-responsive.css"');

  assert.ok(uiFixPosition >= 0 && responsivePosition > uiFixPosition, "CSS responsivo precisa ser a última camada visual");
  assert.ok((serviceWorker.match(/"grcon-responsive\.css"/g) || []).length >= 2, "CSS responsivo precisa estar nos caches geral e crítico");
  for (const breakpoint of ["74rem", "58rem", "44rem", "30rem"]) {
    assert.match(css, new RegExp(`@media \\(max-width: ${breakpoint.replace(".", "\\.")}\\)`));
  }
  assert.match(css, /@media \(max-height: 46rem\)/);
  assert.match(css, /body\s*\{\s*overflow-x:\s*clip;/);
  assert.match(css, /\.grcon-view-tabs[\s\S]*overflow-x:\s*auto;/);
  assert.match(css, /#results-table[\s\S]*position:\s*static\s*!important;/);
  assert.match(css, /inline-size:\s*100vw\s*!important;/);
});

check("LD de comissionamento usa a aba N-1710 vigente e reconhece propósito sem cabeçalho", () => {
  globalThis.XLSX = SheetJS;
  const oldRows = [
    ["", "DOCUMENTO N-1710", "REVISÃO", "TÍTULO", "", "DISCIPLINA/WORKFLOW", "", "PROPÓSITO DE EMISSÃO", "", "DATA EFETIVA DE EMISSÃO", "GRDT", "STATUS"],
    ["", "DE-5290.00-22313-970-C1O-104", "0", "TÍTULO ANTIGO", "", "", "", "PARA CONSTRUÇÃO"],
  ];
  const currentRows = [
    ["LISTA DE DOCUMENTOS"], ["COMISSIONAMENTO"], [""], [""], ["DADOS DOS DOCUMENTOS"],
    ["ITEM", "DOCUMENTO N-1710", "REVISÃO", "TÍTULO", "UNIDADE/ÁREA", "DISCIPLINA", "ESCOPO", "", "DATA PREVISTA DE EMISSÃO", "DATA EFETIVA DE EMISSÃO", "N-1710", "ITEM ISO", "GRDT", "STATUS", "QUEM?", "PRAZO", "STATUS SIGEM", "OBSERVAÇÕES", "ALOCAÇÃO"],
    ["001", "DE-5290.00-22313-970-C1O-104", "0", "FLUXOGRAMA DE COMISSIONAMENTO", "U-32", "RNEST UHDTD U-32 COMISSIONAMENTO", "EMISSÃO", "PARA CONSTRUÇÃO", "", "", "970", "8.1", "", "EM EMISSÃO", "", "", "Não Postado", "", "C1O-ALOC-COM-0002-2025"],
    ["002", "CR-5290.00-22313-970-C1O-001", "0", "CRONOGRAMA DE COMISSIONAMENTO", "U-32", "RNEST UHDTD U-32 COMISSIONAMENTO", "EMISSÃO", "PARA CONSTRUÇÃO", "", "", "970", "8.1", "", "EM EMISSÃO", "", "", "Não Postado", "", "C1O-ALOC-COM-0002-2025"],
  ];
  const historyRows = [["", "", "Documento", "Revisão", "Incluído em", "Título", "Status", "Finalidade da Revisão"]];
  const workbook = {
    SheetNames: ["N-1710", "N-1710 MOD", "Colar SIGEM"],
    Sheets: {
      "N-1710": SheetJS.utils.aoa_to_sheet(oldRows),
      "N-1710 MOD": SheetJS.utils.aoa_to_sheet(currentRows),
      "Colar SIGEM": SheetJS.utils.aoa_to_sheet(historyRows),
    },
    Workbook: { Sheets: [{ name: "N-1710", Hidden: 1 }, { name: "N-1710 MOD", Hidden: 0 }, { name: "Colar SIGEM", Hidden: 0 }] },
  };
  const parsed = Core.parseWorkbook(workbook, "LD_COMISSIONAMENTO.xlsx", 10, null);
  const current = parsed.records.find((item) => item.document === "DE-5290.00-22313-970-C1O-104" && item.sheet === "N-1710 MOD");
  assert.equal(current.purpose, "PARA CONSTRUÇÃO");
  assert.equal(current.sheetHidden, 0);
  assert.ok(parsed.mappedFields.technical.includes("discipline"));
  assert.ok(parsed.mappedFields.technical.includes("purpose"));

  const index = Core.buildIndex(parsed.records, parsed.history);
  const result = Core.triageOne({ id: "commissioning", name: "DE-5290.00-22313-970-C1O-104_0001_0.pdf" }, index, {});
  assert.equal(result.decision, Core.READY);
  assert.equal(result.sheet, "N-1710 MOD");
  assert.equal(result.egrdt.discipline, "COMISSIONAMENTO");
  assert.equal(result.egrdt.purpose, "Para Construção");
});

check("índice consolidado pesquisa documentos em mais de uma LD", () => {
  const first = ldDocumentRecord("MA-5290.00-22000-ABC-C1O-101", "ALOCADO", "N-1710");
  const second = { ...ldDocumentRecord("DE-5290.00-22313-970-C1O-202", "ALOCADO", "N-1710 MOD"), source: "LD_COMISSIONAMENTO.xlsx", discipline: "COMISSIONAMENTO", purpose: "Para Construção", documentType: "DE" };
  const index = Core.buildIndex([first, second], []);
  assert.equal(Core.triageOne({ id: "ld-1", name: `${first.document}_0001_0.pdf` }, index, {}).record.source, "LD_TESTE.xlsx");
  const foundInSecond = Core.triageOne({ id: "ld-2", name: `${second.document}_0001_0.pdf` }, index, {});
  assert.equal(foundInSecond.record.source, "LD_COMISSIONAMENTO.xlsx");
  assert.equal(foundInSecond.egrdt.discipline, "COMISSIONAMENTO");
});

check("eGRDTs são separadas primeiro por disciplina e depois pelo limite do lote", () => {
  const makeEntries = (discipline, amount, prefix) => Array.from({ length: amount }, (_, index) => ({
    rowIndex: index,
    document: `${prefix}-${index + 1}`,
    finalName: `${prefix}-${index + 1}.pdf`,
    item: { discipline, fileName: `${prefix}-${index + 1}.pdf` },
  }));
  const entries = [
    ...makeEntries("ELÉTRICA", 50, "ELE"),
    ...makeEntries("CIVIL", 3, "CIV"),
    ...makeEntries("ELÉTRICA", 2, "ELE-B"),
  ];
  const groups = Emission.splitPlan({ entries, items: entries.map((entry) => entry.item) }, 48);
  assert.deepEqual(groups.map((group) => [group.discipline, group.entries.length]), [["CIVIL", 3], ["ELÉTRICA", 48], ["ELÉTRICA", 4]]);
  assert.deepEqual(groups.map((group) => [group.disciplineBatchNumber, group.disciplineBatchCount]), [[1, 1], [1, 2], [2, 2]]);
  assert.ok(groups.every((group) => new Set(group.items.map((item) => item.discipline)).size === 1));
});

check("painel mostra disciplina por GRDT e mantém cada número editável", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const panel = fs.readFileSync(path.join(root, "p1_ux.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="ld-input"[^>]*multiple/);
  assert.match(app, /disciplineCount/);
  assert.match(panel, /p1-batch-discipline/);
  assert.match(panel, /class="p1-batch-sequence-input"/);
  const audit = OutputAudit.analyze({ detailRows: [{ included: true, batchIndex: 2, discipline: "ELÉTRICA" }] });
  assert.equal(audit.detailRows[0].batchIndex, 2);
  assert.equal(audit.detailRows[0].discipline, "ELÉTRICA");
});

// ---------------------------------------------------------------------------
// Alocação lida da linha inteira e cruzamento com o Apêndice 3
// ---------------------------------------------------------------------------

const Apendice = require(path.join(root, "apendice_tagueados.js"));

function allocationRecord(overrides = {}) {
  return {
    document: ntBaseDocument,
    documentKey: Core.key(ntBaseDocument),
    sheet: "ET",
    row: 12,
    allocationStatus: "",
    allocationStatusColumn: "U",
    allocationStatusHeader: "CONFIRMAÇÃO DE ALOCAÇÃO",
    allocation: "",
    ...overrides,
  };
}

check("coluna ausente na aba e célula vazia são fatos distintos na alocação", () => {
  const semColuna = Core.allocationEvidenceState(allocationRecord({ allocationStatusColumn: "", allocationStatusHeader: "" }));
  const vazia = Core.allocationEvidenceState(allocationRecord());
  assert.equal(semColuna.kind, "not_tracked");
  assert.equal(vazia.kind, "blank");
  assert.notEqual(semColuna.label, vazia.label);
  // Nenhuma das duas afirma alocação nem bloqueia por si.
  assert.equal(semColuna.evidence, "none");
  assert.equal(vazia.evidence, "none");
});

check("número de ALOC conta como evidência de alocação quando o status está vazio", () => {
  const comNumero = Core.allocationEvidenceState(allocationRecord({ allocation: "C1O-ALOC-COM-0002-2025" }));
  assert.equal(comNumero.kind, "allocated");
  assert.equal(comNumero.evidence, "number");
  assert.equal(comNumero.allocationNumber, "C1O-ALOC-COM-0002-2025");
  // Texto livre na mesma coluna não é número de ALOC e não prova alocação.
  const textoLivre = Core.allocationEvidenceState(allocationRecord({ allocation: "Já alocado / Sem rastreio de alocação" }));
  assert.equal(textoLivre.kind, "blank");
  assert.equal(Core.allocationNumberInfo("0").valid, false);
  assert.equal(Core.allocationNumberInfo("C1O-ALOC-CM-0028-2026").valid, true);
});

check("status preenchido continua mandando na alocação e o NÃO ALOCADO segue bloqueando", () => {
  assert.equal(Core.allocationEvidenceState(allocationRecord({ allocationStatus: "ALOCADO" })).kind, "allocated");
  assert.equal(Core.allocationEvidenceState(allocationRecord({ allocationStatus: "NÃO ALOCADO", allocation: "C1O-ALOC-CM-0028-2026" })).kind, "not_allocated");
  const index = Core.buildIndex([ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO")], []);
  const result = Core.triageOne({ id: "bloqueado", name: `${ntBaseDocument}.pdf` }, index, {});
  assert.equal(result.hardBlock, true);
  assert.equal(result.allocationFinding.kind, "not_allocated");
});

check("a triagem escreve no motivo que a aba não rastreia alocação", () => {
  const semColuna = {
    ...ldDocumentRecord(ntBaseDocument, ""),
    allocationStatusColumn: "",
    allocationStatusHeader: "",
    allocation: "",
  };
  const index = Core.buildIndex([semColuna], [{ ...semColuna, sheet: "Colar SIGEM", status: "Não Postado" }]);
  const result = Core.triageOne({ id: "sem-coluna", name: `${ntBaseDocument}.pdf` }, index, {});
  assert.ok(!result.hardBlock);
  assert.equal(result.allocationFinding.kind, "not_tracked");
  assert.match(result.reason, /não possui coluna de confirmação de alocação/);
  const [linha] = ReportSummary.buildRows([result], {});
  assert.match(linha.allocated, /NÃO APURADO/);
  assert.match(linha.allocationReason, /não foi verificada/);
});

check("Apêndice 3 responde se o TAG consta e sugere a forma com nt- quando não consta", () => {
  const workbook = SheetJS.utils.book_new();
  const sheet = SheetJS.utils.aoa_to_sheet([
    ["ANEXO I - APÊNDICE 3", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["UNIDADE DE PROCESSO", "DISCIPLINA", "TAG (NOTA 1)", "DESCRIÇÃO"],
    ["U-32", "Dinâmicos", "SPE-AST-320019", "BOMBA"],
    ["U-32", "Tubulação", "VM-100000", "VÁLVULA"],
  ]);
  SheetJS.utils.book_append_sheet(workbook, sheet, "Apêndice");
  const index = Apendice.parseWorkbook(workbook, SheetJS, { fileName: "apendice.xlsx" });
  assert.equal(index.ok, true);
  assert.equal(index.headerRow, 7);
  assert.equal(index.count, 2);

  const encontrado = Apendice.evaluate({ record: ldDocumentRecord(ntBaseDocument), document: ntBaseDocument }, index);
  assert.equal(encontrado.tagged, "SIM");
  assert.equal(encontrado.tag, "SPE-AST-320019");
  assert.equal(encontrado.tagSource, "código do documento");
  assert.equal(encontrado.suggestion, "");

  const ausenteDocumento = "C1O_RNEST_U32_3.1.1.1_TUB_REP_VM-322710";
  const ausente = Apendice.evaluate({ record: ldDocumentRecord(ausenteDocumento), document: ausenteDocumento }, index);
  assert.equal(ausente.tagged, "NÃO");
  assert.equal(ausente.suggestion, "C1O_RNEST_U32_3.1.1.1_TUB_REP_nt-VM-322710");
  assert.match(ausente.suggestionNote, /não é impedida/);
});

check("a base do Apêndice é embutida: toda análise cruza, sem arquivo a selecionar", () => {
  const base = Apendice.embeddedIndex();
  assert.equal(base.ok, true);
  assert.equal(base.embedded, true);
  assert.equal(base.revision, "B");
  assert.ok(base.count > 5000, `esperado o Apêndice inteiro, veio ${base.count}`);

  // Sem índice informado, o cruzamento usa a base embutida em vez de responder
  // "não carregado" — e um TAG real da lista contratual é encontrado.
  const tagReal = base.tags.values().next().value.tag;
  const documento = `C1O_RNEST_U32_3.1.1.1_INS_RIR_${tagReal}`;
  const info = Apendice.evaluate({ record: ldDocumentRecord(documento), document: documento }, null);
  assert.equal(info.search, "TAG encontrado no Apêndice");
  assert.equal(info.tagged, "SIM");
  assert.equal(info.suggestion, "");

  // A tela não pede mais o arquivo do Apêndice.
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /id="apendice-input"|id="apendice-slot"/);
  assert.match(html, /src="apendice_base\.js"/);
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.doesNotMatch(app, /apendiceIndex|apendiceFile/);
});

check("a coluna de TAG da LD tem preferência sobre o código do documento", () => {
  const comTag = { ...ldDocumentRecord(ntBaseDocument), tag: "VM-100000", tagColumn: "F", tagHeader: "TAG" };
  const origem = Apendice.documentTag(comTag, ntBaseDocument);
  assert.equal(origem.tag, "VM-100000");
  assert.equal(origem.source, "coluna da LD");
  const semTag = Apendice.documentTag(ldDocumentRecord(ntBaseDocument), ntBaseDocument);
  assert.equal(semTag.tag, "SPE-AST-320019");
  assert.equal(semTag.source, "código do documento");
  // O parser da LD reconhece a coluna e ignora TAXONOMIA.
  const parsed = Core.parseWorkbook(SheetJS.read(SheetJS.write(tagWorkbook(), { type: "buffer", bookType: "xlsx" }), { type: "buffer" }), "LD_TAG.xlsx", 1, null);
  assert.equal(parsed.records[0].tag, "VM-100000");
  assert.equal(parsed.records[0].tagHeader, "TAG");
});

function tagWorkbook() {
  const workbook = SheetJS.utils.book_new();
  const technical = SheetJS.utils.aoa_to_sheet([
    ["ITEM", "DOCUMENTO", "REVISÃO", "TÍTULO", "TAG", "TAXONOMIA", "STATUS SIGEM", "CONFIRMAÇÃO DE ALOCAÇÃO"],
    ["1", ntBaseDocument, "0", "DOCUMENTO DE TESTE", "VM-100000", "IRRELEVANTE", "Não Postado", "ALOCADO"],
  ]);
  SheetJS.utils.book_append_sheet(workbook, technical, "ET");
  const history = SheetJS.utils.aoa_to_sheet([
    ["consulta", "Documento", "Revisão", "Status"],
    ["", ntBaseDocument, "0", "Não Postado"],
  ]);
  SheetJS.utils.book_append_sheet(workbook, history, "Colar SIGEM");
  return workbook;
}

check("a tabela da triagem tem uma largura por coluna, na ordem atual", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const cabecalho = html.slice(html.indexOf('<table class="grcon-results-table" id="results-table">'), html.indexOf("</thead>"));
  const colunas = (cabecalho.match(/<th /g) || []).length;

  // Uma lista de larguras só, e com um item para cada coluna. Havia duas — uma
  // em px no legacy-compat.css, outra em rem no grcon-ui.css — e quando as
  // colunas do Apêndice entraram, as medidas passaram a cair na coluna vizinha:
  // o cabeçalho quebrava em quatro linhas e a tabela abria vazia.
  const ui = fs.readFileSync(path.join(root, "grcon-ui.css"), "utf8");
  const larguras = [...ui.matchAll(/\.grcon-results-table th:nth-child\((\d+)\) \{ width:/g)].map((m) => Number(m[1]));
  assert.deepEqual(larguras, Array.from({ length: colunas }, (_, i) => i + 1),
    `a lista de larguras precisa cobrir as ${colunas} colunas, uma vez cada`);

  const legacy = fs.readFileSync(path.join(root, "legacy-compat.css"), "utf8");
  assert.doesNotMatch(legacy, /#results-table th:nth-child\(\d+\) \{ width:/, "a segunda lista de larguras não pode voltar");
  // Regras de coluna não podem valer para toda tabela do aplicativo.
  assert.doesNotMatch(legacy, /^th:nth-child\(\d+\) \{ width:/m, "largura de coluna sem escopo atinge as outras telas");

  // O modo "somente o essencial" esconde colunas por índice: precisa apontar
  // para as colunas informativas, não para as três primeiras nem para as novas.
  const escondidas = [...legacy.matchAll(/p1-essential-columns #results-table>thead>tr>th:nth-child\((\d+)\)/g)].map((m) => Number(m[1]));
  assert.ok(escondidas.length > 0);
  assert.ok(escondidas.every((indice) => indice > 6 && indice <= colunas), `índices fora da tabela: ${escondidas}`);
});

check("o rolamento da tabela não colapsa nem cresce sozinho", () => {
  const ui = fs.readFileSync(path.join(root, "grcon-ui.css"), "utf8");
  // content-visibility num contêiner de rolagem fazia o navegador tratar o
  // conteúdo fora da tela como tamanho zero: a tabela abria com 300 px numa
  // janela de 950, com 40.000 px de linhas por dentro.
  const bloco = ui.slice(ui.indexOf(".virtual-table-scroll {"), ui.indexOf(".virtual-spacer-row"));
  assert.doesNotMatch(bloco, /content-visibility/);
  assert.match(bloco, /block-size: clamp\(/);

  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  // A janela renderizada não pode começar depois do que a lista comporta.
  assert.match(app, /const maiorInicio = Math\.max\(0, indices\.length - janela\)/);
  assert.match(app, /const start = Math\.min\(maiorInicio,/);
  // E a altura de linha é conferida contra o que o navegador desenhou.
  assert.match(app, /function calibrateVirtualRowHeight\(\)/);
});

check("a consulta responde se o documento já foi emitido pelo GRCON, com a data", () => {
  const entradas = [
    { egrdtNumber: "0130870-C1O-PGV-G-1252/2026 - eGRDT", generatedAt: "2026-08-17T13:05:00.000Z", revision: "C" },
    { egrdtNumber: "0130870-C1O-PGV-G-1180/2026 - eGRDT", generatedAt: "2026-07-02T10:00:00.000Z", revision: "B" },
  ];
  const emitido = Requests.issuedHistory(entradas);
  assert.equal(emitido.issued, true);
  assert.equal(emitido.count, 2);
  assert.equal(emitido.egrdt, "0130870-C1O-PGV-G-1252/2026 - eGRDT", "a mais recente encabeça");
  assert.equal(emitido.date, "17/08/2026");
  assert.equal(emitido.revision, "C", "a revisão precisa pertencer à eGRDT mais recente");
  assert.equal(emitido.revisionCell, "C");
  assert.equal(emitido.all[1].revision, "B", "as revisões anteriores permanecem auditáveis");
  // No Excel a data fica na linha de baixo, dentro da mesma célula.
  assert.equal(emitido.cell.split("\n")[0], "0130870-C1O-PGV-G-1252/2026 - eGRDT");
  assert.equal(emitido.cell.split("\n")[1], "17/08/2026");

  // Sem registro a resposta é dita, não omitida.
  const nunca = Requests.issuedHistory([]);
  assert.equal(nunca.issued, false);
  assert.equal(nunca.cell, "Não emitido");
  assert.equal(nunca.egrdt, "");
  assert.equal(nunca.revisionCell, "Não emitido");

  // Os campos que a linha da consulta carrega para a tela e para a planilha.
  const colunas = Requests.issuedColumns(entradas);
  assert.equal(colunas.issued, "SIM");
  assert.equal(colunas.issuedEgrdt, entradas[0].egrdtNumber);
  assert.equal(colunas.issuedAt, "17/08/2026");
  assert.equal(colunas.issuedRevision, "C");
  assert.equal(colunas.issuedRevisionCell, "C");
  assert.equal(colunas.issuedAll.length, 2);

  // A coluna existe na planilha da consulta, ao lado da GRDT que veio da LD.
  const chaves = RequestsReport.COLUMNS.map((coluna) => coluna.key);
  assert.ok(chaves.includes("issuedCell"), "a planilha precisa levar a eGRDT emitida");
  assert.equal(chaves[chaves.indexOf("lastGrdt") + 1], "issuedCell");
  assert.equal(chaves[chaves.indexOf("issuedCell") + 1], "issuedRevisionCell", "a revisão emitida precisa ficar junto da eGRDT");

  // E na tabela da tela, com o mesmo número de colunas do cabeçalho.
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const tabela = html.slice(html.indexOf('<table class="requests-table" id="requests-table">'), html.indexOf("<tbody id=\"requests-tbody\">"));
  assert.match(tabela, /<th>Emitido pelo GRCON<\/th>/);
  assert.match(tabela, /<th>Revisão emitida no SIGEM<\/th>/);
  const app = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  assert.match(app, /issuedColumns\(historicoDoGrcon\(resultado, item\.document\)\)/);
  assert.match(app, /GrconGrdtHistoryIndicator\?\.refresh\?\.\(\)/, "a consulta precisa atualizar o índice após a sincronização compartilhada");
  // Cabeçalho e linha precisam ter a mesma quantidade de células.
  const modelo = app.slice(app.indexOf("<tr data-doc="), app.indexOf("</tr>`;"));
  assert.equal((tabela.match(/<th[ >]/g) || []).length, (modelo.match(/<td[ >]/g) || []).length);
});

check("uma célula com duas linhas não vira duas linhas na cópia", () => {
  const app = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  // A cópia por tabulação precisa manter um documento por linha.
  assert.match(app, /replace\(\/\\s\*\\n\\s\*\/g, " · "\)/);
});

check("existe um só módulo de histórico de eGRDT por documento", () => {
  // Dois arquivos definiam window.GrconGrdtHistoryIndicator; o segundo apagava
  // o primeiro, que ficava carregando sem nunca ser usado.
  assert.ok(!fs.existsSync(path.join(root, "grcon_grdt_history_indicator.js")), "o módulo sombreado não pode voltar");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal((html.match(/grdt_history_indicator\.js/g) || []).length, 1);
  const indicador = fs.readFileSync(path.join(root, "grdt_history_indicator.js"), "utf8");
  assert.match(indicador, /getEntries/);
  assert.match(indicador, /file\.grdtRevision \|\| file\.revision/, "o índice precisa carregar a revisão do mesmo arquivo histórico");
  assert.match(indicador, /addEventListener\("grcon:history-updated", refresh\)/, "o índice precisa acompanhar o histórico sincronizado");
});

check("LD com ALOCADO e NÃO ALOCADO para o mesmo documento é conflito, não é não alocado", () => {
  // Caso real da LD do usuário: a linha 16155 registra ALOCADO com o número da
  // ALOC, e uma linha anterior registra NÃO ALOCADO. O GRCON respondia "Não
  // alocado" e apontava a evidência para a primeira linha negativa que
  // encontrasse — contradizendo a LD que a pessoa tem aberta na frente.
  const antiga = { ...ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO"), row: 15752, allocation: "" };
  const atual = { ...ldDocumentRecord(ntBaseDocument, "ALOCADO"), row: 16155, allocation: "C1O-ALOC-CM-0094-2026" };
  const index = Core.buildIndex([antiga, atual], []);
  const resultado = Core.triageOne({ id: "conflito", name: `${ntBaseDocument}.pdf` }, index, {});

  assert.equal(resultado.blockCode, "not_allocated_conflict");
  assert.equal(resultado.status, "Alocação conflitante na LD");
  assert.match(resultado.allocationStatus, /^CONFLITO/);
  assert.notEqual(resultado.allocationStatus, "NÃO ALOCADO");
  // A evidência aponta para a linha atual da LD, não para a primeira negativa.
  assert.equal(resultado.record.row, 16155);
  // O motivo cita as duas linhas e o número da alocação.
  assert.match(resultado.reason, /linha 15752/);
  assert.match(resultado.reason, /linha 16155/);
  assert.match(resultado.reason, /C1O-ALOC-CM-0094-2026/);
  // Continua fora da eGRDT automática, e a inclusão manual segue disponível.
  assert.equal(resultado.hardBlock, true);

  // A mensagem ao usuário deixa de afirmar que a LD diz "não alocado".
  const mensagem = Core.decisionMessage(resultado);
  assert.equal(mensagem.code, "ALLOCATION_CONFLICT");
  assert.doesNotMatch(mensagem.explanation, /não está alocado/);

  // E o Resumo diz conflito nas duas colunas que respondem alocação.
  const [linha] = ReportSummary.buildRows([resultado], {});
  assert.match(linha.allocated, /^CONFLITO/);
  assert.match(linha.allocationReason, /ALOCADO em uma linha e NÃO ALOCADO em outra/);
});

check("documento só com NÃO ALOCADO continua bloqueado, e pela linha mais recente", () => {
  const antiga = { ...ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO"), row: 10, allocation: "" };
  const atual = { ...ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO"), row: 900, allocation: "C1O-ALOC-CM-0100-2026" };
  const index = Core.buildIndex([antiga, atual], []);
  const resultado = Core.triageOne({ id: "bloqueado", name: `${ntBaseDocument}.pdf` }, index, {});
  assert.equal(resultado.blockCode, "not_allocated");
  assert.equal(resultado.allocationStatus, "NÃO ALOCADO");
  assert.equal(resultado.hardBlock, true);
  assert.equal(resultado.record.row, 900, "a evidência cita a linha atual da LD");
  assert.equal(Core.mostRecentRecord([antiga, atual]).row, 900);
  // A linha atual tem número de ALOC: o bloqueio é o mesmo, e a situação diz
  // que o que falta é o retorno.
  assert.equal(resultado.status, "Aguardando retorno da alocação");
});

check("NÃO ALOCADO com ALOC enviada é dito como aguardando retorno, não como recusa", () => {
  // Caso da ALOC C1O-ALOC-CM-0223-2026 na LD do usuário: a coluna ALOCAÇÃO traz
  // o número (a ALOC foi enviada) e a confirmação ainda diz NÃO ALOCADO. Dizer
  // só "Não alocado" fazia quem olha a LD, com o número preenchido, achar que o
  // GRCON contradizia a planilha.
  const comAloc = { ...ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO"), allocation: "C1O-ALOC-CM-0223-2026" };
  const index = Core.buildIndex([comAloc], []);
  const resultado = Core.triageOne({ id: "aguardando", name: `${ntBaseDocument}.pdf` }, index, {});
  assert.equal(resultado.status, "Aguardando retorno da alocação");
  assert.match(resultado.reason, /C1O-ALOC-CM-0223-2026 está registrada na LD/);
  assert.match(resultado.reason, /a postagem permanece bloqueada/);
  assert.equal(resultado.hardBlock, true, "continua fora da eGRDT");
  assert.equal(resultado.allocationStatus, "NÃO ALOCADO", "o valor da coluna da LD é preservado");
  const [linha] = ReportSummary.buildRows([resultado], {});
  assert.equal(linha.allocated, "NÃO — aguardando retorno da ALOC C1O-ALOC-CM-0223-2026");

  // Sem número de alocação, a resposta continua sendo a de sempre.
  const semAloc = { ...ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO"), allocation: "" };
  const outro = Core.triageOne({ id: "sem", name: `${ntBaseDocument}.pdf` }, Core.buildIndex([semAloc], []), {});
  assert.equal(outro.status, "Não alocado");
  assert.match(outro.reason, /sem número de alocação registrado/);
  const [semLinha] = ReportSummary.buildRows([outro], {});
  assert.equal(semLinha.allocated, "NÃO — Não alocado");
});

check("célula mesclada na LD vale para todas as linhas do intervalo", () => {
  // Numa mescla, o arquivo guarda o valor só na célula do canto superior
  // esquerdo; as demais vêm vazias. Sem replicar, as outras linhas do intervalo
  // ficavam sem confirmação de alocação e caíam na evidência seguinte — o
  // número de ALOC —, que responde "alocado" mesmo quando a mescla, na tela,
  // dizia NÃO ALOCADO. Era o GRCON liberando o que a LD recusava.
  const cabecalho = ["ITEM", "DOCUMENTO", "REVISÃO", "TÍTULO", "STATUS SIGEM", "ALOCAÇÃO", "CONFIRMAÇÃO DE ALOCAÇÃO"];
  const documentos = ["DE-5290.00-22313-950-C1O-201", "DE-5290.00-22313-950-C1O-202", "DE-5290.00-22313-950-C1O-203"];
  const montar = (confirmacao) => {
    const linhas = [cabecalho];
    documentos.forEach((documento, indice) => {
      linhas.push([String(indice + 1), documento, "0", "DOCUMENTO DE TESTE", "Não Postado", "C1O-ALOC-CM-0223-2026", ""]);
    });
    const sheet = SheetJS.utils.aoa_to_sheet(linhas);
    // A mescla cobre as três linhas de dados da coluna G (confirmação).
    sheet.G2 = { t: "s", v: confirmacao };
    sheet["!merges"] = [{ s: { r: 1, c: 6 }, e: { r: 3, c: 6 } }];
    // A aba precisa combinar com a família do código (DE-… é N-1710), senão a
    // triagem para antes por incompatibilidade de aba e não chega à alocação.
    return { SheetNames: ["N-1710"], Sheets: { "N-1710": sheet } };
  };
  const triar = (confirmacao) => {
    const parsed = Core.parseWorkbook(montar(confirmacao), "LD_MESCLADA.xlsx", 10, null);
    const index = Core.buildIndex(parsed.records, []);
    return documentos.map((documento) => Core.triageOne({ document: documento, revision: "0" }, index, {}));
  };

  for (const resultado of triar("NÃO ALOCADO")) {
    assert.equal(resultado.allocationStatus, "NÃO ALOCADO", "a mescla vale para a linha inteira do intervalo");
    assert.equal(resultado.hardBlock, true, "nenhuma linha da mescla escapa do bloqueio");
    assert.equal(resultado.allocationFinding.kind, "not_allocated");
    assert.equal(resultado.allocationFinding.evidence, "status", "o status da mescla manda, não o número de ALOC");
  }
  for (const resultado of triar("ALOCADO")) {
    assert.equal(resultado.allocationStatus, "ALOCADO");
    assert.ok(!resultado.hardBlock);
    assert.equal(resultado.allocationFinding.evidence, "status");
  }
});

check("a evidência da alocação cita a célula exata da LD", () => {
  // "A LD diz uma coisa e o GRCON diz outra" só se resolve abrindo a planilha.
  // Citar a célula transforma a discussão numa conferência de dez segundos.
  assert.equal(Core.allocationCellRef({ allocationStatusColumn: "U", row: 134 }), "U134");
  assert.equal(Core.allocationCellRef({ allocationStatusColumn: "", row: 134 }), "", "sem coluna não se inventa endereço");

  const registro = {
    ...ldDocumentRecord(ntBaseDocument, "NÃO ALOCADO"),
    allocation: "C1O-ALOC-CM-0223-2026",
    allocationStatusColumn: "U",
    allocationStatusHeader: "CONFIRMAÇÃO DE ALOCAÇÃO",
    row: 138,
  };
  const resultado = Core.triageOne({ id: "celula", name: `${ntBaseDocument}.pdf` }, Core.buildIndex([registro], []), {});
  const celula = `${registro.allocationStatusColumn}${registro.row}`;
  assert.equal(resultado.allocationFinding.cell, celula);
  assert.ok(resultado.reason.includes(`célula ${celula}`), "o motivo aponta onde conferir");

  const mensagem = Core.simpleReason(resultado);
  assert.match(mensagem, /foi enviada, mas a confirmação na LD continua/, "o texto curto explica o estado, não só recusa");
  assert.ok(mensagem.includes(`célula ${celula}`), "o texto curto também aponta a célula");
});

check("histórico classifica N-1710, ET e CV pelas regras documentais já usadas no GRCON", () => {
  const etDocument = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019";
  assert.equal(History.documentFamily({ document: n1710Document, sheet: "" }), "N-1710");
  assert.equal(History.documentFamily({ document: "DE-5290.00-22313-142-C1O-076", sheet: "N-1710 MOD" }), "N-1710");
  assert.equal(History.documentFamily({ document: etDocument, sheet: "" }), "ET");
  assert.equal(History.documentFamily({ document: "QUALQUER", sheet: "RIR" }), "ET");
  assert.equal(History.documentFamily({ document: cvDocument4, sheet: "" }), "CV");
});

check("filtro do período recorta eGRDT mista e recalcula os totais da família selecionada", () => {
  const mixed = History.cleanRecord({
    id: "mixed-history",
    egrdtNumber: Sequence.baseName(777, 2026),
    generatedAt: "2026-08-21T12:00:00.000Z",
    outputType: "eGRDT final",
    files: [
      { document: "DE-5290.00-22313-142-C1O-076", sheet: "N-1710", finalName: "DE-5290.00-22313-142-C1O-076_0001_A.dwg", allocation: "ALOC-N" },
      { document: "DE-5290.00-22313-142-C1O-076", sheet: "N-1710", finalName: "DE-5290.00-22313-142-C1O-076_0001_A.pdf", allocation: "ALOC-N" },
      { document: ntBaseDocument, sheet: "ET", finalName: `${ntBaseDocument}.pdf`, allocation: "ALOC-ET" },
      { document: cvDocument4, sheet: "CV", finalName: `${cvDocument4}.pdf`, allocation: "ALOC-CV" },
    ],
  });
  const n1710 = History.filterByDocumentFamily([mixed], "N-1710");
  assert.equal(n1710.length, 1);
  assert.equal(n1710[0].documentCount, 1);
  assert.equal(n1710[0].fileCount, 2);
  assert.deepEqual(n1710[0].allocations, ["ALOC-N"]);
  assert.ok(n1710[0].files.every((file) => History.documentFamily(file) === "N-1710"));

  const cv = HistoryReport.filterRecords([mixed], "", "", "CV");
  assert.equal(cv.length, 1);
  assert.equal(cv[0].documentCount, 1);
  assert.equal(cv[0].fileCount, 1);
  assert.equal(HistoryReport.familyLabel(""), "Todos");
  assert.match(HistoryReport.downloadName(cv, { documentFamily: "CV", startDate: "2026-08-21", endDate: "2026-08-21" }), /Relacao_eGRDTs_CV_20260821_a_20260821/);
});

check("Histórico oferece o filtro Todos, N-1710, ET e CV na relação do período", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(root, "history_app.js"), "utf8");
  const report = fs.readFileSync(path.join(root, "history_report.js"), "utf8");
  assert.match(html, /id="history-period-document-type"[\s\S]*value="N-1710"[\s\S]*value="ET"[\s\S]*value="CV"/);
  assert.match(ui, /filterByDocumentFamily\(state\.filtered, els\.periodDocumentType/);
  assert.match(ui, /documentFamily: els\.periodDocumentType/);
  assert.match(report, /"FAMÍLIA DOCUMENTAL"/);
  assert.match(report, /\["Tipo de documento", selectedFamily\]/);
});

check("nome com código + título usa somente a codificação oficial da LD e segue com alerta", () => {
  const document = "DE-5290.00-22313-142-C1O-076";
  const index = Core.buildIndex([{
    ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
    revision: "A",
    discipline: "CIVIL",
    documentType: "DE",
  }], []);
  const sourceName = `${document} - DESENHO GERAL DE CIVIL.dwg`;
  const result = Core.triageOne({ id: "titulo-no-nome", name: sourceName }, index, {});
  assert.equal(result.document, document);
  assert.equal(result.decision, Core.READY);
  assert.equal(result.finalName, `${document}_0001_A.dwg`);
  assert.match(result.fileNameFormattingWarning, /fora do padrão/i);
  assert.match(result.fileNameFormattingWarning, /reconheceu o documento pela LD/i);
});

check("separadores errados na codificação são normalizados pela LD sem bloquear", () => {
  const document = "DE-5290.00-22313-142-C1O-076";
  const index = Core.buildIndex([{
    ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
    revision: "A",
    discipline: "CIVIL",
    documentType: "DE",
  }], []);
  const sourceName = "DE 5290 00 22313 142 C1O 076 DESENHO GERAL.dwg";
  const matches = Core.matchDocuments(sourceName, index);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].document, document);
  assert.equal(matches[0].matchKind, "code-format-variant");
  const result = Core.triageOne({ id: "formato-incorreto", name: sourceName }, index, {});
  assert.equal(result.document, document);
  assert.equal(result.decision, Core.READY);
  assert.equal(result.finalName, `${document}_0001_A.dwg`);
  assert.match(result.fileNameFormattingWarning, /codificação\/nome fora do padrão/i);
});

check("um erro de transcrição no código é corrigido somente quando a LD é inequívoca", () => {
  const document = "DE-5290.00-22313-142-C1O-076";
  const index = Core.buildIndex([{
    ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
    revision: "A",
    discipline: "CIVIL",
    documentType: "DE",
  }], []);
  const sourceName = "DE-5290.00-22313-142-C1O-07G DESENHO GERAL.dwg";
  const matches = Core.matchDocuments(sourceName, index);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].document, document);
  assert.equal(matches[0].matchKind, "code-transcription-variant");
  const result = Core.triageOne({ id: "transcricao-codigo", name: sourceName }, index, {});
  assert.equal(result.document, document);
  assert.equal(result.decision, Core.READY);
  assert.equal(result.finalName, `${document}_0001_A.dwg`);
  assert.match(result.fileNameFormattingWarning, /fora do padrão/i);
});

check("título no nome desempata códigos vizinhos quando há um erro de transcrição", () => {
  const docs = [
    ["DE-5290.00-22313-142-C1O-075", "PROJETO DE ANDAIME TUBO EQUIPADO BALANÇO 1.5m x 1.5m"],
    ["DE-5290.00-22313-142-C1O-076", "DISPOSITIVO PARA RETIRADA DA BOMBA B-32006A"],
    ["DE-5290.00-22313-142-C1O-077", "CAVALETE METÁLICO"],
  ];
  const records = docs.map(([document, title]) => ({
    ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
    revision: "A",
    discipline: "CIVIL",
    documentType: "DE",
    title,
  }));
  const index = Core.buildIndex(records, []);
  const withTitle = "DE-5290.00-22313-142-C1O-07G DISPOSITIVO PARA RETIRADA DA BOMBA B-32006A.dwg";
  const matches = Core.matchDocuments(withTitle, index);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].document, "DE-5290.00-22313-142-C1O-076");
  assert.equal(matches[0].matchedByEmbeddedTitle, true);

  const withoutTitle = Core.matchDocuments("DE-5290.00-22313-142-C1O-07G.dwg", index);
  assert.ok(withoutTitle.length > 1, "sem título suficiente o GRCON não deve adivinhar");
});

check("arquivo duplicado vira alerta e somente uma cópia entra na eGRDT", () => {
  const document = "DE-5290.00-22313-142-C1O-076";
  const row = {
    document,
    revision: "A",
    sheet: "N-1710",
    decision: Core.READY,
    hardBlock: false,
    record: {
      discipline: "CIVIL",
      documentType: "DE",
      purpose: "Para Informação",
      format: "A4",
      databook: "CIVIL / DESENHOS",
      source: "LD_001.xlsx",
      allocation: "ALOC-001",
    },
    egrdt: Core.buildEgrdtData(document, "A", `${document}_0001_A.dwg`, {
      discipline: "CIVIL", documentType: "DE", purpose: "Para Informação", format: "A4", title: "DESENHO GERAL",
    }, "N-1710", "A4"),
    files: [
      { name: `${document}_0001_A.dwg`, finalName: `${document}_0001_A.dwg`, file: { size: 1 } },
      { name: `${document}_0001_A.pdf`, finalName: `${document}_0001_A.pdf`, file: { size: 2 } },
      { name: `${document}_0001_A - COPIA.pdf`, finalName: `${document}_0001_A.pdf`, file: { size: 3 } },
    ],
  };
  const plan = Emission.createPlan([row], new Set([0]));
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.entries.length, 2, "DWG + um único PDF devem seguir");
  assert.ok(plan.warnings.some((message) => /duplicado.*ignorado/i.test(message)));
});

check("nome final divergente é corrigido na emissão e não bloqueia", () => {
  const document = "DE-5290.00-22313-142-C1O-076";
  const row = {
    document,
    revision: "A",
    sheet: "N-1710",
    decision: Core.READY,
    hardBlock: false,
    record: { discipline: "CIVIL", documentType: "DE", purpose: "Para Informação", format: "A4", databook: "CIVIL", title: "DESENHO GERAL" },
    egrdt: Core.buildEgrdtData(document, "A", `${document}_0001_A.dwg`, { discipline: "CIVIL", documentType: "DE", purpose: "Para Informação", format: "A4", title: "DESENHO GERAL" }, "N-1710", "A4"),
    files: [
      { name: `${document} TITULO.dwg`, finalName: `${document} TITULO.dwg`, file: { size: 1 } },
      { name: `${document} TITULO.pdf`, finalName: `${document} TITULO.pdf`, file: { size: 2 } },
    ],
  };
  const plan = Emission.createPlan([row], new Set([0]));
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.entries.length, 2);
  assert.deepEqual(plan.entries.map((entry) => entry.finalName), [`${document}_0001_A.dwg`, `${document}_0001_A.pdf`]);
  assert.ok(plan.warnings.some((message) => /corrigiu automaticamente/i.test(message)));
});


check("MC N-1710 ignora sufixo _RIR inválido e usa revisão controlada da LD", () => {
  const document = "MC-5290.00-22313-970-C1O-009";
  const record = {
    ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
    revision: "0",
    title: "PROGRESSO QUINZENAL DE INSPEÇÃO DE RECEBIMENTO - AGOSTO DE 2026_1",
    discipline: "RNEST UHDTD U-32 PLANEJAMENTO",
    documentType: "MC",
    purpose: "Para Construção",
    databook: "RHDD-MCA-PLA-EX-GERA-INP-PT-",
    allocation: "C1O-ALOC-CM-0022-2026",
    source: "LD-5290.00-22313-91A-C1O-001_0001_E.xlsx",
  };
  const index = Core.buildIndex([record], []);
  const xlsx = Core.triageOne({ id: "mc-rir-xlsx", name: `${document}_0001_RIR.xlsx`, file: { size: 1 } }, index, {});
  const pdf = Core.triageOne({ id: "mc-rir-pdf", name: `${document}_0001_RIR.pdf`, file: { size: 1 } }, index, {});

  [xlsx, pdf].forEach((result) => {
    assert.equal(result.decision, Core.READY);
    assert.equal(result.revision, "0");
    assert.equal(result.claimedRevision, "", "RIR não pode virar revisão declarada válida");
    assert.match(result.fileNameFormattingWarning, /RIR/);
    assert.match(result.fileNameFormattingWarning, /ignorou/i);
    assert.deepEqual(Core.validateEgrdtData(result.egrdt), []);
  });
  assert.equal(xlsx.finalName, `${document}_0001_0.xlsx`);
  assert.equal(pdf.finalName, `${document}_0001_0.pdf`);

  const row = {
    ...xlsx,
    files: [
      { name: `${document}_0001_RIR.xlsx`, finalName: xlsx.finalName, file: { size: 1 } },
      { name: `${document}_0001_RIR.pdf`, finalName: pdf.finalName, file: { size: 1 } },
    ],
  };
  const plan = Emission.createPlan([row], new Set([0]));
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.entries.map((entry) => entry.finalName), [`${document}_0001_0.xlsx`, `${document}_0001_0.pdf`]);
  assert.deepEqual(plan.items.map((item) => item.revision), ["0", "0"]);
});

check("documentos DE usam sempre formato A3 na eGRDT", () => {
  const document = "DE-5290.00-22313-142-C1O-076";
  const record = {
    discipline: "CIVIL",
    documentType: "DE",
    purpose: "Para Informação",
    format: "A4",
    title: "DESENHO GERAL",
    databook: "CIVIL",
  };
  const egrdt = Core.buildEgrdtData(document, "A", `${document}_0001_A.dwg`, record, "N-1710", "A4");
  assert.equal(egrdt.documentType, "DE");
  assert.equal(egrdt.format, "A3", "DE deve ignorar A4 vindo da LD/PDF");

  const row = {
    document,
    revision: "A",
    sheet: "N-1710",
    decision: Core.READY,
    hardBlock: false,
    record,
    egrdt: { ...egrdt, format: "A4" }, // simula edição manual indevida
    files: [
      { name: `${document}_0001_A.dwg`, finalName: `${document}_0001_A.dwg`, file: { size: 1 } },
      { name: `${document}_0001_A.pdf`, finalName: `${document}_0001_A.pdf`, file: { size: 1 } },
    ],
  };
  const plan = Emission.createPlan([row], new Set([0]));
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.items.map((item) => item.format), ["A3", "A3"], "a emissão deve forçar A3 mesmo após edição manual");
});

check("todos os JavaScripts têm sintaxe válida", () => {
  const scripts = fs.readdirSync(root).filter((name) => /\.(?:m?js)$/.test(name));
  const failures = [];
  for (const name of scripts) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
    if (result.status !== 0) failures.push(`${name}: ${result.stderr.trim()}`);
  }
  assert.deepEqual(failures, []);
});

// 5.33.5 — UI deve mostrar todos os arquivos físicos nominalmente, sem "+N arquivo(s)".
check("Triagem mostra cada arquivo físico e sua extensão, sem resumir como +N arquivo(s)", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(appSource, /function renderRowFileList\(row, finalNames = false\)/, "A UI deve possuir renderização nominal da lista de arquivos.");
  assert.match(appSource, /entries\.map\(\(entry\) =>/, "A UI deve percorrer todos os arquivos associados ao documento.");
  assert.doesNotMatch(appSource, /companionCount[^\n]*arquivo\(s\)/, "A UI não deve voltar a resumir arquivos físicos como +N arquivo(s).");
});

console.log(JSON.stringify({ version: "5.33.14", passed: true, checks: checks.length, names: checks }, null, 2));
