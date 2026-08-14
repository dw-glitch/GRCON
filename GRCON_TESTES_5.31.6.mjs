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
  assert.equal(result.documentLookup.resultLabel, "NÃO LOCALIZADO COM/SEM nt- NEM PELO TAG");
  assert.match(result.documentLookup.message, /nenhuma correspondência única foi localizada na LD/i);
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

check("busca final pelo TAG localiza o ET correto mesmo quando os grupos anteriores diferem", () => {
  const ld = "C1O_RNEST_U32_3.1.1.1_INS_RIR_P-101-A";
  const wrongPrefix = "C1O_RNEST_U34_3.1.1.1_INS_RIR_nt-P101A";
  const index = Core.buildIndex([ldDocumentRecord(ld)], []);
  const match = Core.exactDocumentMatch(wrongPrefix, index);
  assert.ok(match);
  assert.equal(match.matchKind, "tag-only");
  const result = Core.triageOne({ id: "tag-only", name: `${wrongPrefix}_0001.pdf` }, index, {});
  assert.equal(result.document, ld);
  assert.equal(result.finalName, `${ld}_0001.pdf`);
  assert.equal(result.decision, Core.READY);
  assert.equal(result.documentLookup.matchedByTagOnly, true);
  assert.equal(result.documentLookup.searchedTag, "P101A");
  assert.equal(result.documentLookup.resultLabel, "LOCALIZADO PELO TAG — USAR O CÓDIGO DA LD");
  assert.match(result.documentLookup.message, /pesquisou o TAG.*P101A.*única correspondência/i);
  assert.ok(result.ldRename);
  const summary = ReportSummary.buildRows([result], {})[0];
  assert.match(summary.renameForEgrdt, /SIM — RENOMEADO.*De:.*Para:/i);
});

check("busca pelo TAG não escolhe automaticamente quando a LD possui mais de um código", () => {
  const tag = "P-101-A";
  const index = Core.buildIndex([
    ldDocumentRecord(`C1O_RNEST_U32_3.1.1.1_INS_RIR_${tag}`),
    ldDocumentRecord(`C1O_RNEST_U34_3.1.1.1_INS_RIR_${tag}`),
  ], []);
  const input = `C1O_RNEST_U35_3.1.1.1_INS_RIR_${tag}`;
  assert.equal(Core.exactDocumentMatch(input, index), null);
  const result = Core.triageOne({ id: "tag-only-ambiguous", name: `${input}.pdf` }, index, {});
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

check("índice pesquisa 15.000 códigos ET pelo TAG independente dos grupos anteriores", () => {
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
    assert.equal(match.matchKind, "tag-only");
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
  assert.match(compact, /matchedByTagOnly/);
  assert.match(compact, /searchedTag/);
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

check("todos os JavaScripts têm sintaxe válida", () => {
  const scripts = fs.readdirSync(root).filter((name) => /\.(?:m?js)$/.test(name));
  const failures = [];
  for (const name of scripts) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
    if (result.status !== 0) failures.push(`${name}: ${result.stderr.trim()}`);
  }
  assert.deepEqual(failures, []);
});

console.log(JSON.stringify({ version: "5.32.8", passed: true, checks: checks.length, names: checks }, null, 2));
