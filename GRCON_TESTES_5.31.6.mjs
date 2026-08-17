import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const History = require(path.join(root, "history_core.js"));
const Sequence = require(path.join(root, "egrdt_sequence.js"));
const Workbook = require(path.join(root, "grdt_workbook.js"));
const ExcelJS = require(path.join(root, "exceljs.min.js"));
const JSZip = require(path.join(root, "jszip.min.js"));
const Core = require(path.join(root, "core.js"));
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
  assert.match(htmlSource, /Selecionar todos · Situação/);
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

// ── Consultas e Solicitações ────────────────────────────────────────────────
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

check("protocolo é o número do ITEM da planilha oficial, um sequencial simples", () => {
  // A planilha de Controle de Solicitações usa ITEM contínuo: 1, 2, 3 …
  assert.equal(Requests.protocolFor(1), "1");
  assert.equal(Requests.protocolFor(557), "557");
  assert.equal(Requests.protocolFor(0), "");
  assert.equal(Requests.protocolFor("abc"), "");
  // A sequência continua de onde a planilha parou; nunca reaproveita número.
  assert.equal(Requests.nextItemNumber([{ itemNumber: 556 }, { itemNumber: 12 }]), 557);
  assert.equal(Requests.nextItemNumber([{ protocol: "556" }]), 557);
  assert.equal(Requests.nextItemNumber([]), 1);
  const numerados = Requests.assignItemNumbers(
    [{ document: "A" }, { document: "B" }, { document: "C" }],
    [{ protocol: "556" }],
  );
  assert.deepEqual(numerados.map((item) => item.protocol), ["557", "558", "559"]);
  assert.deepEqual(Requests.duplicatedProtocols([{ protocol: "5" }, { protocol: "5" }]), ["5"]);
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

check("empate entre LDs divergentes devolve a decisão sem preencher campo algum", () => {
  const index = Core.buildIndex([
    consultaRecord(ntBaseDocument, "LD_A.xlsx", { allocationStatus: "NÃO ALOCADO", allocation: "", sourceTimestamp: 500 }),
    consultaRecord(ntBaseDocument, "LD_B.xlsx", { allocationStatus: "ALOCADO", sourceTimestamp: 500 }),
  ], []);
  const linha = Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, index));
  assert.equal(linha.title, "");
  assert.equal(linha.allocated, "");
  assert.equal(linha.allLds, "LD_A.xlsx | LD_B.xlsx");
  assert.match(linha.rule, /Escolha qual vale/);
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

check("tipos de solicitação são configuráveis, ordenados e não ficam fixos no código", () => {
  const padrao = Requests.requestTypeList(null);
  assert.ok(padrao.length >= 10);
  // Rótulos iguais aos da coluna "Descrição da Solicitação" do controle oficial.
  assert.equal(padrao[0].label, "POSTAGEM NO SIGEM");
  const meus = Requests.requestTypeList([
    { label: "Tipo da casa", order: 2 },
    { label: "Urgência", code: "URG", defaultPriority: "urgente", defaultDeadlineDays: 1, order: 1 },
  ]);
  assert.equal(meus[0].code, "URG");
  assert.equal(meus[1].code, "TIPO_DA_CASA");
  assert.equal(Requests.normalizeRequestType({ label: "" }), null);
  assert.equal(Requests.normalizeRequestType({ label: "X", defaultPriority: "inventada" }).defaultPriority, "normal");
});

// ── Triagem das solicitações: as regras da seção 8 ──────────────────────────

function triagemDe(documentoInformado, registros, extras = {}) {
  const index = Core.buildIndex(registros, []);
  const lookup = Requests.lookupDocument(documentoInformado, index, { requestedTitle: extras.requestedTitle });
  return Requests.classifyRequestItem({ lookup, ...extras });
}

check("8.1 documento não localizado é classificado como novo e pede inclusão na LD", () => {
  const t = triagemDe("C1O_RNEST_U32_9.9.9.9_INS_RIR_NAO-EXISTE", [consultaRecord(ntBaseDocument, "LD_A.xlsx")]);
  assert.equal(t.classification, Requests.CLASSIFICATIONS.NOVO);
  assert.equal(t.isNewDocument, true);
  assert.equal(t.needsManualValidation, true);
  assert.match(t.recommendedAction, /inclusão na LD/i);
  assert.match(t.recommendedAction, /aloca/i);
});

check("8.2 previsto e não postado recomenda a postagem e não trata como novo", () => {
  const t = triagemDe(ntBaseDocument, [consultaRecord(ntBaseDocument, "LD_A.xlsx", { sigemStatus: "Não Postado" })]);
  assert.equal(t.classification, Requests.CLASSIFICATIONS.PREVISTO_NAO_POSTADO);
  assert.equal(t.isNewDocument, false);
  assert.match(t.recommendedAction, /Postar no SIGEM/i);
  // A 8.2 exige dizer que NÃO é documento novo e que NÃO cabe nova inclusão.
  assert.match(t.recommendedAction, /não é documento novo/i);
  assert.match(t.recommendedAction, /não precisa de nova inclusão/i);
  assert.match(t.reason, /Já previsto na LD LD_A\.xlsx/);
});

check("8.2 previsto porém não alocado manda regularizar a alocação antes de postar", () => {
  const t = triagemDe(ntBaseDocument, [consultaRecord(ntBaseDocument, "LD_A.xlsx", { allocationStatus: "NÃO ALOCADO", allocation: "" })]);
  assert.equal(t.classification, Requests.CLASSIFICATIONS.PREVISTO_NAO_POSTADO);
  assert.equal(t.allocated, false);
  assert.match(t.recommendedAction, /Regularizar a alocação/i);
});

check("8.3 postado com revisão nova recomenda a atualização citando as duas revisões", () => {
  const t = triagemDe(ntBaseDocument, [consultaRecord(ntBaseDocument, "LD_A.xlsx", { sigemStatus: "Postado", revision: "0" })], { requestedRevision: "A" });
  assert.equal(t.classification, Requests.CLASSIFICATIONS.PREVISTO_NOVA_REVISAO);
  assert.equal(t.revisionInLd, "0");
  assert.equal(t.requestedRevision, "A");
  assert.match(t.recommendedAction, /revisão 0 para A/);
});

check("8.4 título divergente mostra os dois lados e nunca altera sozinho", () => {
  const t = triagemDe(ntBaseDocument, [consultaRecord(ntBaseDocument, "LD_A.xlsx", { title: "Relatório de inspeção dimensional" })],
    { requestedTitle: "Relatório de inspeção dimensional e visual" });
  assert.equal(t.classification, Requests.CLASSIFICATIONS.TITULO_DIVERGENTE);
  assert.equal(t.needsManualValidation, true);
  assert.equal(t.titleComparison.official, "Relatório de inspeção dimensional");
  assert.equal(t.titleComparison.requested, "Relatório de inspeção dimensional e visual");
  assert.deepEqual(t.titleComparison.addedWords, ["E", "VISUAL"]);
  assert.match(t.recommendedAction, /não altera nada sozinho/i);
});

check("8.4 diferença só de caixa e acento não é considerada divergência de título", () => {
  const t = triagemDe(ntBaseDocument, [consultaRecord(ntBaseDocument, "LD_A.xlsx", { title: "Relatório de Inspeção" })],
    { requestedTitle: "RELATORIO DE INSPECAO" });
  assert.equal(t.titleComparison.differs, false);
  assert.notEqual(t.classification, Requests.CLASSIFICATIONS.TITULO_DIVERGENTE);
});

check("8.5 LDs divergentes empatadas travam a triagem até alguém escolher", () => {
  const t = triagemDe(ntBaseDocument, [
    consultaRecord(ntBaseDocument, "LD_A.xlsx", { allocationStatus: "NÃO ALOCADO", allocation: "", sourceTimestamp: 500 }),
    consultaRecord(ntBaseDocument, "LD_B.xlsx", { allocationStatus: "ALOCADO", sourceTimestamp: 500 }),
  ]);
  assert.equal(t.classification, Requests.CLASSIFICATIONS.VALIDAR);
  assert.equal(t.needsManualValidation, true);
  assert.match(t.recommendedAction, /Escolher qual LD vale/i);
});

check("documento já postado e sem revisão nova não inventa tarefa", () => {
  const t = triagemDe(ntBaseDocument, [consultaRecord(ntBaseDocument, "LD_A.xlsx", { sigemStatus: "Postado" })]);
  assert.match(t.recommendedAction, /Nenhuma ação necessária/i);
});

check("correspondência por variação de código mantém a conferência mesmo com classificação clara", () => {
  const t = triagemDe(ntDocument, [consultaRecord(ntBaseDocument, "LD_A.xlsx", { sigemStatus: "Não Postado" })]);
  assert.equal(t.classification, Requests.CLASSIFICATIONS.PREVISTO_NAO_POSTADO);
  assert.equal(t.needsManualValidation, true);
});

check("consulta vira linha do controle sem redigitar o que o GRCON já achou", () => {
  const index = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_ALFA.xlsx", {
    grdt: "GRDT-0042", allocation: "C1O-ALOC-CM-0095-2026", ldVersion: "Rev. C",
  })], []);
  const entradas = [
    { document: ntBaseDocument, lookup: Requests.lookupDocument(ntBaseDocument, index) },
    { document: "C1O_RNEST_U32_9.9.9.9_INS_RIR_NOVO-1", lookup: Requests.lookupDocument("C1O_RNEST_U32_9.9.9.9_INS_RIR_NOVO-1", index) },
  ];
  const cabecalho = { owner: "Laís", receivedAt: "16/08/2026", requester: "Gabriela Borges", requestType: "POSTAGEM NO SIGEM", origin: "E-MAIL" };
  const linhas = Requests.buildControlRows(entradas, cabecalho, [{ protocol: "556" }]);

  // Numeração continua a sequência da planilha.
  assert.deepEqual(linhas.map((l) => l.item), ["557", "558"]);
  // O cabeçalho da solicitação é repetido em cada item, como na planilha.
  assert.equal(linhas[0].owner, "Laís");
  assert.equal(linhas[0].requester, "Gabriela Borges");
  // O que veio da LD entra sozinho.
  assert.equal(linhas[0].documentFamily, "ET");
  assert.equal(linhas[0].allocation, "C1O-ALOC-CM-0095-2026");
  assert.equal(linhas[0].sigemStatus, "Não Postado");
  assert.equal(linhas[0].reference, "LD_ALFA.xlsx");
  // A classificação decide se precisa de inclusão na LD.
  assert.equal(linhas[0].needsLdInclusion, "não");
  assert.equal(linhas[1].needsLdInclusion, "sim");
  assert.equal(linhas[1]._classification, Requests.CLASSIFICATIONS.NOVO);
  // Documento novo não recebe dado nenhum da LD.
  assert.equal(linhas[1].allocation, "");
  assert.equal(linhas[1].sigemStatus, "");

  // Etapas futuras ficam em branco e saem como "na" na planilha.
  const saida = RequestsReport.controlRows(linhas)[0];
  assert.equal(saida.length, 26);
  assert.equal(saida[16], "na");
  assert.equal(saida[0], "557");
});

check("solicitação é gravada pelo banco, com o protocolo e a transação do lado do servidor", () => {
  const cloud = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  for (const rpc of ["grcon_save_request", "grcon_list_request_items", "grcon_update_request_items", "grcon_request_item_history"]) {
    assert.match(cloud, new RegExp(`rpc\\("${rpc}"`));
  }
  // O protocolo enviado é o número do ITEM, não um identificador do cliente.
  assert.match(cloud, /protocol: String\(item\.item \|\| ""\)/);

  const app = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  // Sem número da solicitação o app nem chega ao banco: é ele que agrupa os itens.
  assert.match(app, /Informe o número da solicitação antes de salvar/);
  // Grava apenas o que está selecionado na tabela.
  assert.match(app, /state\.requestRows\.filter\(\(linha\) => linha\._selected !== false\)/);

  const sql = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.32.9.sql"), "utf8");
  // Protocolo repetido em outra solicitação derruba a gravação inteira.
  assert.match(sql, /O protocolo % já existe na solicitação %/);
  // Unicidade é do banco, não do aplicativo.
  assert.match(sql, /unique \(workspace_id, protocol\)/);
  // Histórico só recebe inserção: nenhuma função atualiza ou apaga eventos.
  assert.doesNotMatch(sql, /update private\.grcon_request_item_events/i);
  assert.doesNotMatch(sql, /delete from private\.grcon_request_item_events/i);
});

check("exportação reproduz as 26 colunas do Controle de Solicitações", () => {
  // Grafia e ordem vieram da planilha oficial da rede. Qualquer diferença
  // obriga a rearrumar colunas na hora de colar — o retrabalho que esta saída
  // existe para evitar. O hífen de "N‑1710" é o curto (U+2011), não o comum.
  const cabecalhos = RequestsReport.CONTROL_COLUMNS.map((coluna) => coluna.header);
  assert.equal(cabecalhos.length, 26);
  assert.equal(cabecalhos[0], "ITEM");
  assert.equal(cabecalhos[1], "Responsavel pela atividade");
  assert.equal(cabecalhos[5], "Descrição da Solicitação");
  assert.equal(cabecalhos[23], "Disponibilizado no PW – N‑1710");
  assert.equal(cabecalhos[25], "Data de inclusão do status");

  const linhas = RequestsReport.controlRows([
    { item: "557", owner: "Laís", document: "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-1", requestType: "POSTAGEM NO SIGEM" },
  ]);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].length, 26);
  assert.equal(linhas[0][0], "557");
  // Campo não preenchido vira "na", que é a convenção da própria planilha:
  // célula vazia deixa dúvida entre pendência e não se aplica.
  assert.equal(linhas[0][2], "na");

  const semCabecalho = RequestsReport.controlClipboardText([{ item: "557" }], false);
  assert.equal(semCabecalho.split("\t").length, 26);
  assert.doesNotMatch(semCabecalho, /ITEM/);
  const comCabecalho = RequestsReport.controlClipboardText([{ item: "557" }], true);
  assert.equal(comCabecalho.split("\n").length, 2);
  assert.match(comCabecalho, /^ITEM\t/);
});

check("solicitação se preenche sem consulta e sem inventar classificação", () => {
  // Um pedido que chega por e-mail não tem LD anexada. A linha precisa sair
  // completa mesmo assim, com o que a pessoa informou — e sem que o GRCON
  // atribua situação nenhuma ao documento, porque não conferiu nada.
  const linhas = Requests.buildManualControlRows(
    [{ document: "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-1", requestedTitle: "Relatório de inspeção" }],
    { owner: "Laís", receivedAt: "17/08/2026", requester: "Gabriela Borges", requestType: "POSTAGEM NO SIGEM",
      origin: "E-MAIL", documentFamily: "ET", emailBody: "Favor postar no SIGEM", documentPath: "Arquivo > Ago" },
    [{ protocol: "556" }],
  );
  assert.equal(linhas.length, 1);
  const linha = linhas[0];
  assert.equal(linha.item, "557", "continua a numeração da planilha");
  assert.equal(linha.owner, "Laís");
  assert.equal(linha.documentFamily, "ET", "o tipo documental vem do cabeçalho quando não há LD");
  assert.equal(linha.emailBody, "Favor postar no SIGEM");
  assert.equal(linha.overallStatus, "Recebida");
  // Sem LD não há classificação: nada de "não localizado" para quem nunca foi
  // procurado, e nada de observação automática.
  assert.equal(linha._classification, "");
  assert.equal(linha._needsManualValidation, false);
  assert.equal(linha.observations, "");
  assert.equal(linha.needsLdInclusion, "", "sem LD, quem responde se precisa incluir é a pessoa");
  // O título informado não vira título oficial: ninguém conferiu na LD.
  assert.equal(linha._requestedTitle, "Relatório de inspeção");

  // E a linha colável continua com as 26 colunas da planilha oficial.
  assert.equal(RequestsReport.controlRows(linhas)[0].length, 26);
});

check("consulta e solicitação são abas independentes", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  // Cada uma na sua área, com botão próprio na subnavegação.
  assert.match(html, /data-requests-area="consulta"/);
  assert.match(html, /data-requests-area="solicitacao"/);
  assert.match(html, /id="requests-area-solicitacao"/);

  // O painel da solicitação não mora dentro da área da consulta: se morasse,
  // registrar um pedido exigiria passar pela busca na LD.
  const areaConsulta = html.slice(html.indexOf('<div id="requests-area-consulta">'), html.indexOf('<div hidden id="requests-area-solicitacao">'));
  assert.doesNotMatch(areaConsulta, /id="requests-request-panel"/);

  const app = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  // Abrir a aba prepara o formulário; não exige documento consultado.
  assert.match(app, /if \(area === "solicitacao"\) prepararFormularioDaSolicitacao\(\);/);
  // Itens digitados à mão alimentam a solicitação por conta própria.
  assert.match(app, /buildManualControlRows/);
  // As 26 colunas ficam editáveis quando a pessoa precisa preencher tudo.
  assert.match(app, /renderTabelaCompleta/);
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
  // Cabeçalho real do Controle de Solicitações, com uma coluna que só existe na
  // planilha da equipe.
  const resultado = RequestsReport.importExportTemplate("Painel da equipe", [
    "ITEM",
    "responsavel pela atividade",      // caixa diferente: mesmo rótulo
    "Disponibilizado no PW - N-1710",  // hífen comum no lugar do curto
    "Coluna que só existe na rede",
    "",
  ], "controle");

  const modelo = resultado.template;
  assert.equal(modelo.columns.length, 4, "a linha vazia não vira coluna");
  // A grafia do arquivo do usuário é preservada: o modelo é a planilha dele.
  assert.equal(modelo.columns[1].header, "responsavel pela atividade");
  assert.equal(modelo.columns[1].key, "owner");
  assert.equal(modelo.columns[2].key, "pwN1710");
  // O que o GRCON não reconhece fica sem chave, sai em branco e é informado.
  assert.equal(modelo.columns[3].key, "");
  assert.deepEqual(resultado.unmatched, ["Coluna que só existe na rede"]);
  assert.equal(resultado.matched, 3);

  const saida = RequestsReport.applyExportTemplate(modelo, [{ item: "557", owner: "Laís", pwN1710: "sim" }]);
  assert.deepEqual(saida.rows, [["557", "Laís", "sim", ""]]);
});

check("importação de modelo casa por nome idêntico, nunca por semelhança", () => {
  // "Documento" e "Caminho do Documento" são colunas diferentes da planilha
  // oficial. Casar por aproximação encheria uma com o conteúdo da outra.
  const resultado = RequestsReport.importExportTemplate("Aproximado", [
    "Documento",
    "Documentos",
    "Caminho",
  ], "controle");
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
  assert.equal(reopened.getWorksheet("Resumo").getCell(summaryLayout.headerRow, 11).value, "RESULTADO DA BUSCA COM/SEM nt- E TAG");
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

check("todos os JavaScripts têm sintaxe válida", () => {
  const scripts = fs.readdirSync(root).filter((name) => /\.(?:m?js)$/.test(name));
  const failures = [];
  for (const name of scripts) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
    if (result.status !== 0) failures.push(`${name}: ${result.stderr.trim()}`);
  }
  assert.deepEqual(failures, []);
});

console.log(JSON.stringify({ version: "5.32.12", passed: true, checks: checks.length, names: checks }, null, 2));
