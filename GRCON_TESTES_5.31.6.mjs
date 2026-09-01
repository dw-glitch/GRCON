import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const History = require(path.join(root, "history_core.js"));
const HistoryReport = require(path.join(root, "history_report.js"));
const EmailReply = require(path.join(root, "egrdt_email_reply.js"));
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
const PdfMergeCore = require(path.join(root, "pdf_merge_core.js"));
const PdfMergeEngine = require(path.join(root, "pdf_merge_engine.js"));
const PDFLib = require(path.join(root, "pdf-lib.min.js"));
const SheetJS = require(path.join(root, "xlsx.full.min.js"));
const checks = [];

function check(name, fn) {
  fn();
  checks.push(name);
}

async function checkAsync(name, fn) {
  await fn();
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

check("combinador de PDFs organiza a fila e normaliza o nome de saída", () => {
  const files = [
    { name: "Primeiro.pdf", size: 1024, lastModified: 1, type: "application/pdf" },
    { name: "Segundo.PDF", size: 2048, lastModified: 2, type: "application/pdf" },
  ];
  assert.equal(PdfMergeCore.isPdfFile(files[0]), true);
  assert.equal(PdfMergeCore.isPdfFile({ name: "vazio.pdf", size: 0, type: "application/pdf" }), false);
  assert.equal(PdfMergeCore.isPdfFile({ name: "texto.txt", size: 10, type: "text/plain" }), false);
  assert.equal(PdfMergeCore.outputFileName(' GRCON: pacote/final?.pdf '), "GRCON- pacote-final-.pdf");
  assert.deepEqual(PdfMergeCore.reorder(files, 1, 0).map((file) => file.name), ["Segundo.PDF", "Primeiro.pdf"]);
  assert.deepEqual(PdfMergeCore.summarize(files), { count: 2, bytes: 3072 });
  assert.equal(PdfMergeCore.fileSignature(files[0]), "primeiro.pdf::1024::1");
});

await checkAsync("combinador preserva todas as páginas, a ordem e os tamanhos originais", async () => {
  const first = await PDFLib.PDFDocument.create();
  first.addPage([300, 400]);
  first.addPage([500, 200]);
  const second = await PDFLib.PDFDocument.create();
  second.addPage([612, 792]);
  const progress = [];
  const merged = await PdfMergeEngine.mergePdfSources([
    { name: "primeiro.pdf", bytes: await first.save() },
    { name: "segundo.pdf", bytes: await second.save() },
  ], {
    pdfLib: PDFLib,
    title: "Teste GRCON",
    onProgress: (entry) => progress.push(entry.stage),
  });
  const result = await PDFLib.PDFDocument.load(merged.bytes);
  assert.equal(merged.fileCount, 2);
  assert.equal(merged.pageCount, 3);
  assert.equal(result.getPageCount(), 3);
  assert.deepEqual(result.getPages().map((page) => [page.getWidth(), page.getHeight()]), [[300, 400], [500, 200], [612, 792]]);
  assert.deepEqual(progress, ["reading", "copied", "reading", "copied", "saving"]);
});

await checkAsync("combinador recusa fila insuficiente e PDF inválido com mensagem segura", async () => {
  await assert.rejects(
    () => PdfMergeEngine.mergePdfSources([{ name: "um.pdf", bytes: new Uint8Array() }], { pdfLib: PDFLib }),
    /pelo menos dois PDFs/i,
  );
  await assert.rejects(
    () => PdfMergeEngine.mergePdfSources([
      { name: "invalido.pdf", bytes: new TextEncoder().encode("não é pdf") },
      { name: "outro.pdf", bytes: new TextEncoder().encode("também não") },
    ], { pdfLib: PDFLib }),
    (error) => error.code === "INVALID_PDF" && /invalido\.pdf/.test(error.message),
  );
});

check("combinador é um módulo local, isolado do Supabase e carregado sob demanda", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const loader = fs.readFileSync(path.join(root, "grcon_module_loader.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "pdf_merge_app.js"), "utf8");
  const worker = fs.readFileSync(path.join(root, "workers", "pdf-merge.worker.js"), "utf8");
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(html, /data-grcon-view="pdf-tools"/);
  assert.match(html, /id="pdf-tools-module"/);
  assert.match(html, /nenhum PDF é enviado, armazenado ou registrado no banco/i);
  assert.match(loader, /"pdf-tools": \["pdf_merge_core\.js", "pdf_merge_app\.js"\]/);
  assert.match(app, /new Worker\("workers\/pdf-merge\.worker\.js"\)/);
  assert.doesNotMatch(app, /localStorage|GrconCloud|supabase|fetch\s*\(/i);
  assert.match(worker, /importScripts\("\.\.\/pdf-lib\.min\.js", "\.\.\/pdf_merge_engine\.js"\)/);
  assert.doesNotMatch(worker, /localStorage|GrconCloud|supabase|fetch\s*\(/i);
  ["pdf-merge.css", "pdf_merge_core.js", "pdf_merge_engine.js", "pdf_merge_app.js", "pdf-lib.min.js", "workers/pdf-merge.worker.js"].forEach((asset) => {
    assert.ok(sw.includes(`"${asset}"`), `${asset} precisa estar no cache offline`);
  });
});

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

check("Em Workflow na revisão 0 libera a revisão A sem repetir a postagem da 0", () => {
  const technical = {
    ...ldDocumentRecord(ntDocument),
    revision: "0",
    grdt: "C1O-GRDT-CM-0001-2026",
    effectiveDate: "2026-08-30",
  };
  const workflow = {
    ...technical,
    sheet: "Colar SIGEM",
    row: 3,
    status: "Em Workflow",
    sigemStatus: "Em Workflow",
  };
  const index = Core.buildIndex([technical], [workflow]);
  const result = Core.triageOne({ id: "workflow-next-revision", name: `${ntDocument}.pdf` }, index, {
    now: new Date("2026-08-31T12:00:00.000Z"),
  });

  assert.equal(result.decision, Core.READY);
  assert.equal(result.revision, "A");
  assert.equal(result.status, "Não Postado");
  assert.match(result.reason, /0 \(Em Workflow\).*primeira combinação DOCUMENTO-REVISÃO ausente.*A/i);
  assert.equal(Core.decisionMessage(result).code, Core.DECISION_CODES.READY);
});

check("Em Workflow avança por todas as revisões já registradas", () => {
  const technical = ldDocumentRecord(ntDocument);
  const history = ["0", "A"].map((revision, index) => ({
    ...technical,
    revision,
    sheet: "Colar SIGEM",
    row: index + 3,
    status: "Em Workflow",
    sigemStatus: "Em Workflow",
  }));
  const result = Core.triageOne(
    { id: "workflow-sequence", name: `${ntDocument}.pdf` },
    Core.buildIndex([technical], history),
    {},
  );

  assert.equal(result.decision, Core.READY);
  assert.equal(result.revision, "B");
});

check("Conforme Construído libera a próxima revisão sem repetir a revisão atual", () => {
  const technical = {
    ...ldDocumentRecord(ntDocument),
    revision: "0",
    grdt: "C1O-GRDT-CM-0002-2026",
    effectiveDate: "2026-08-31",
  };
  const history = ["0", "A"].map((revision, index) => ({
    ...technical,
    revision,
    sheet: "Colar SIGEM",
    row: index + 3,
    status: "Conforme Construído",
    sigemStatus: "Conforme Construído",
  }));
  const result = Core.triageOne(
    { id: "as-built-next-revision", name: `${ntDocument}.pdf` },
    Core.buildIndex([technical], history),
    {},
  );

  assert.equal(result.decision, Core.READY);
  assert.equal(result.revision, "B");
  assert.equal(result.status, "Não Postado");
  assert.match(result.reason, /A \(Conforme Construído\).*B/i);
  assert.equal(Core.decisionMessage(result).code, Core.DECISION_CODES.READY);
});

check("qualquer status diferente de Não Postado e de Em Análise avança da revisão 0 para A", () => {
  const statuses = [
    "Em Workflow",
    "Com Comentários",
    "Sem Comentários",
    "Aceito Sem Comentários",
    "Recusado",
    "Para Construção",
    "Conforme Construído",
    "Para Compra",
    "Pendente Certificação",
    "Cancelado",
    "Outro status oficial",
  ];
  const technical = ldDocumentRecord(ntDocument);

  statuses.forEach((status, index) => {
    const history = {
      ...technical,
      sheet: "Colar SIGEM",
      row: index + 3,
      status,
      sigemStatus: status,
    };
    const result = Core.triageOne(
      { id: `all-statuses-${index}`, name: `${ntDocument}.pdf` },
      Core.buildIndex([technical], [history]),
      {},
    );
    assert.equal(result.decision, Core.READY, status);
    assert.equal(result.revision, "A", status);
    assert.equal(result.status, "Não Postado", status);
  });
});

check("Em Análise nunca avança sozinho: para na própria revisão e cai no balde Em análise", () => {
  // Diferente dos demais retornos (Em Workflow, Recusado, Conforme
  // Construído...), o documento já está sob análise em andamento no SIGEM.
  // O GRCON não pode preparar uma revisão nova por cima de uma análise em
  // aberto — precisa parar e pedir conferência manual.
  const technical = ldDocumentRecord(ntDocument);
  const history = {
    ...technical,
    sheet: "Colar SIGEM",
    row: 3,
    status: "Em Análise",
    sigemStatus: "Em Análise",
  };
  const result = Core.triageOne(
    { id: "em-analise-nao-avanca", name: `${ntDocument}.pdf` },
    Core.buildIndex([technical], [history]),
    {},
  );
  assert.equal(result.decision, Core.DISCARD);
  assert.equal(result.revision, "0", "não pode avançar para a revisão A sozinho");
  assert.equal(result.status, "Em Análise");
  assert.match(result.reason, /Em Análise.*n[ãa]o avan[çc]a/i);
  const message = Core.decisionMessage(result);
  assert.equal(message.code, Core.DECISION_CODES.IN_ANALYSIS_RECENT);
  assert.match(message.title, /não será enviado/i);

  // Mesmo depois de outras revisões já postadas/comentadas, uma análise em
  // aberto mais adiante continua interrompendo o avanço automático.
  const encadeado = [
    { ...technical, sheet: "Colar SIGEM", row: 3, revision: "0", status: "Recusado", sigemStatus: "Recusado" },
    { ...technical, sheet: "Colar SIGEM", row: 4, revision: "A", status: "Em Análise", sigemStatus: "Em Análise" },
  ];
  const resultadoEncadeado = Core.triageOne(
    { id: "em-analise-apos-avanco", name: `${ntDocument}.pdf` },
    Core.buildIndex([technical], encadeado),
    {},
  );
  assert.equal(resultadoEncadeado.decision, Core.DISCARD);
  assert.equal(resultadoEncadeado.revision, "A");
  assert.equal(resultadoEncadeado.status, "Em Análise");
});

check("Em Análise adota GRDT e data efetiva da revisão realmente analisada, não da revisão inicial", () => {
  // A linha técnica de partida (revisão 0) e a revisão parada pela análise
  // (revisão A) podem ter GRDT/data diferentes. O resultado precisa refletir
  // a evidência da revisão em análise, não arrastar os dados da revisão 0.
  const technical = { ...ldDocumentRecord(ntDocument), grdt: "GRDT-0000", effectiveDate: "01/01/2026" };
  const encadeado = [
    { ...technical, sheet: "Colar SIGEM", row: 3, revision: "0", status: "Recusado", sigemStatus: "Recusado", grdt: "GRDT-0000", effectiveDate: "01/01/2026" },
    { ...technical, sheet: "Colar SIGEM", row: 4, revision: "A", status: "Em Análise", sigemStatus: "Em Análise", grdt: "GRDT-000A", effectiveDate: "15/03/2026" },
  ];
  const result = Core.triageOne(
    { id: "em-analise-evidencia", name: `${ntDocument}.pdf` },
    Core.buildIndex([technical], encadeado),
    {},
  );
  assert.equal(result.decision, Core.DISCARD);
  assert.equal(result.revision, "A");
  assert.equal(result.grdt, "GRDT-000A", "GRDT deve ser o da revisão A em análise, não o da revisão 0 de partida");
  assert.equal(result.effectiveDate, "15/03/2026", "data efetiva deve ser a da revisão A em análise");
  assert.ok(result.analysisEvidence, "analysisEvidence precisa ser preenchida quando o documento cai em Em análise");
  assert.equal(result.analysisEvidence.sourceKind, "history");
  assert.ok(result.analysisEvidence.statusSource, "precisa apontar a origem do status na Colar SIGEM");
  assert.equal(result.analysisEvidence.statusSource.row, 4);
});

check("status Não Postado mantém a própria revisão 0 para postagem", () => {
  const technical = ldDocumentRecord(ntDocument);
  const history = {
    ...technical,
    sheet: "Colar SIGEM",
    row: 3,
    status: "Não Postado",
    sigemStatus: "Não Postado",
  };
  const result = Core.triageOne(
    { id: "not-posted-keeps-zero", name: `${ntDocument}.pdf` },
    Core.buildIndex([technical], [history]),
    {},
  );

  assert.equal(result.decision, Core.READY);
  assert.equal(result.revision, "0");
  assert.equal(result.status, "Não Postado");
  assert.match(result.reason, /status oficial.*Não Postado.*mesma revisão/i);
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

check("consulta pesquisa com e sem nt- na LD e informa o código localizado, como a triagem", () => {
  // LD só tem a forma com nt-; o operador consulta sem nt-. A mesma regra
  // com/sem nt- da triagem (README) vale aqui: a consulta pesquisa as duas
  // formas e diz qual delas está na LD, em vez de só dizer "localizado".
  const index = Core.buildIndex([consultaRecord(ntDocument, "LD_A.xlsx")], []);
  const linha = Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, index));
  assert.equal(linha.ldDocument, ntDocument);
  assert.equal(linha.ldForm, "Com nt-");
  assert.equal(linha.codeAdjusted, true);
  assert.match(linha.codeAdjustmentNote, /nt-/);
  assert.equal(linha.searchedWithoutNt, ntBaseDocument);
  assert.equal(linha.searchedWithNt, ntDocument);
  assert.match(linha.ntSearchMessage, /com e sem nt-/i);

  // E no sentido contrário: LD só tem a forma sem nt-, consulta com nt-.
  const indexInverso = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_B.xlsx")], []);
  const linhaInversa = Requests.consultationRow(Requests.lookupDocument(ntDocument, indexInverso));
  assert.equal(linhaInversa.ldDocument, ntBaseDocument);
  assert.equal(linhaInversa.ldForm, "Sem nt-");
  assert.equal(linhaInversa.codeAdjusted, true);
});

check("consulta corrige um erro de transcrição no código sem inventar ou alterar o TAG", () => {
  // Mesma fixture da triagem: uma única confusão comum (O por 0) dentro do
  // TAG, com a LD inequívoca. O TAG não é adivinhado nem trocado — só
  // reconhecido apesar da confusão, exatamente como a triagem já faz.
  const ld = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019";
  const informado = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-32O019";
  const index = Core.buildIndex([ldDocumentRecord(ld)], []);
  const resultado = Requests.lookupDocument(informado, index);
  const linha = Requests.consultationRow(resultado);
  assert.equal(linha.ldDocument, ld);
  assert.equal(linha.matchKind, "tag-transcription-variant");
  assert.equal(linha.codeAdjusted, true);
  assert.match(linha.codeAdjustmentNote, /320019/);
  assert.match(linha.codeAdjustmentNote, /32O019/);

  // Ambíguo continua sem correção automática: duas linhas possíveis não
  // recebem um TAG escolhido a dedo pelo GRCON.
  const prefix = "C1O_RNEST_U32_3.1.1.1_INS_RIR_";
  const indexAmbiguo = Core.buildIndex([
    ldDocumentRecord(`${prefix}P-101-A`),
    ldDocumentRecord(`${prefix}P1-01A`),
  ], []);
  const ambiguo = Requests.consultationRow(Requests.lookupDocument(`${prefix}P.101A`, indexAmbiguo));
  assert.equal(ambiguo.ldDocument, "");
  assert.equal(ambiguo.codeAdjusted, false);
});

check("Consultas expõe o código localizado na LD na tela e na planilha exportada (verificação estática)", () => {
  const app = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  assert.match(app, /function celulaCodigoLocalizado/);
  assert.match(app, /celulaCodigoLocalizado\(linha\)/);

  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const tabela = indexSource.slice(indexSource.indexOf('<table class="requests-table" id="requests-table">'), indexSource.indexOf('<tbody id="requests-tbody">'));
  assert.match(tabela, />Código localizado na LD</);

  const chaves = RequestsReport.COLUMNS.map((coluna) => coluna.key);
  assert.ok(chaves.includes("ldDocument"), "a planilha da consulta precisa levar o código localizado na LD");
  assert.ok(chaves.includes("ldForm"), "a planilha da consulta precisa dizer se a forma localizada tem nt- ou não");
  assert.ok(chaves.includes("ntSearchMessage"), "a planilha da consulta precisa registrar a pesquisa com/sem nt- e tipo+TAG");
});

check("toda coluna da planilha da consulta é preenchida pela linha exportada, sem coluna muda", () => {
  // A coluna existia na planilha e a linha exportada não levava o campo: o
  // código localizado e a pesquisa com/sem nt- apareciam na tela e saíam
  // vazios no Excel e na cópia. O laço abaixo vale para qualquer coluna nova.
  const app = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  const inicio = app.indexOf("function linhasParaSaida()");
  assert.ok(inicio > -1, "a consulta precisa ter um construtor de linhas para a saída");
  const corpo = app.slice(inicio, app.indexOf("\n  }", inicio));
  RequestsReport.COLUMNS.forEach((coluna) => {
    assert.ok(
      new RegExp(`(^|[\\s{,])${coluna.key}\\s*:`).test(corpo),
      `a coluna “${coluna.header}” (${coluna.key}) sairia vazia: o campo não é levado por linhasParaSaida()`,
    );
  });
});

check("consulta mostra a situação de cada forma quando o código consta na LD com e sem nt-", () => {
  // O mesmo código ET em duas linhas da LD, uma em cada grafia e com situações
  // diferentes. A consulta responde pela forma que casou, mas a outra não pode
  // sumir: cada uma sai com a sua revisão, alocação e LD.
  const index = Core.buildIndex([
    consultaRecord(ntBaseDocument, "LD_A.xlsx", { revision: "0" }),
    consultaRecord(ntDocument, "LD_B.xlsx", { revision: "B", allocationStatus: "NÃO ALOCADO", allocation: "", grdt: "GRDT-123", row: 3 }),
  ], []);

  const comNt = Requests.consultationRow(Requests.lookupDocument(ntDocument, index));
  assert.equal(comNt.ldDocument, ntDocument);
  assert.equal(comNt.ldForm, "Com nt-");
  assert.equal(comNt.bothNtFormsInLd, true);
  assert.equal(comNt.ntFormsFound, 2);
  assert.match(comNt.ntFormsDetail, /Com nt-:.*forma usada nesta consulta/);
  assert.match(comNt.ntFormsDetail, /Sem nt-:.*também consta na LD/);
  // A situação de cada forma é a dela, não a da forma consultada.
  assert.match(comNt.ntFormsDetail, /Sem nt-:.*Rev\. 0 na LD.*SIM — Alocado.*LD: LD_A\.xlsx/);
  assert.match(comNt.ntFormsDetail, /Com nt-:.*Rev\. B na LD.*NÃO — Não alocado.*LD: LD_B\.xlsx/);

  // Consultando a outra grafia, a resposta troca de lado sem perder nenhuma.
  const semNt = Requests.consultationRow(Requests.lookupDocument(ntBaseDocument, index));
  assert.equal(semNt.ldDocument, ntBaseDocument);
  assert.equal(semNt.bothNtFormsInLd, true);
  assert.match(semNt.ntFormsDetail, /Sem nt-:.*forma usada nesta consulta/);
  assert.match(semNt.ntFormsDetail, /Com nt-:.*também consta na LD/);
});

check("forma que não consta na LD é dita como ausente, e não deixada em branco", () => {
  const index = Core.buildIndex([consultaRecord(ntBaseDocument, "LD_A.xlsx")], []);
  const linha = Requests.consultationRow(Requests.lookupDocument(ntDocument, index));
  assert.equal(linha.bothNtFormsInLd, false);
  assert.equal(linha.ntFormsFound, 1);
  assert.match(linha.ntFormsDetail, /Sem nt-:.*forma usada nesta consulta/);
  assert.match(linha.ntFormsDetail, /Com nt-: não consta na LD/);

  // Documento de outra família: a regra com/sem nt- não se aplica e a consulta
  // não inventa uma segunda grafia para ele.
  const n1710 = Core.buildIndex([consultaRecord(n1710Document, "LD_A.xlsx", { sheet: "N-1710" })], []);
  const outraFamilia = Requests.consultationRow(Requests.lookupDocument(n1710Document, n1710));
  assert.equal(outraFamilia.ntFormsDetail, "");
  assert.equal(outraFamilia.ntFormsFound, 0);
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
  checks.push("N-1710 grava o nativo antes do PDF na eGRDT, com _0001_revisão nos dois arquivos, mesmo quando o seletor entrega o PDF primeiro");

  // A política vigente da N-1710 não impõe quantidade nem extensão: um único
  // arquivo físico já compõe o pacote. O que continua obrigatório é existir um
  // arquivo real associado ao documento.
  const onlyPdf = { ...row, files: [row.files[0]] };
  const single = Emission.createPlan([onlyPdf], new Set([0]));
  assert.deepEqual(single.errors, []);
  assert.deepEqual(single.items.map((item) => item.fileName), [pdfName]);

  const virtualOnly = { ...row, files: [{ name: pdfName, finalName: pdfName, file: null, virtual: true }] };
  const withoutFile = Emission.createPlan([virtualOnly], new Set([0]));
  assert.ok(withoutFile.errors.some((message) => /ao menos um arquivo físico/i.test(message)));
  checks.push("N-1710 aceita qualquer quantidade/extensão de arquivo, mas exige ao menos um arquivo físico real");
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
  assert.equal(liPair.flexibleFiles, true);
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

  // Outro nativo além do Excel deixou de ser rejeitado em LI/MC; a ordem
  // nativo → PDF continua sendo aplicada.
  const liOtherNative = Emission.validateN1710Pair(liRow, [
    { name: `${liDocument}_0001_A.pdf`, finalName: `${liDocument}_0001_A.pdf`, file: { size: 10 } },
    { name: `${liDocument}_0001_A.dwg`, finalName: `${liDocument}_0001_A.dwg`, file: { size: 20 } },
  ]);
  assert.equal(liOtherNative.valid, true);
  assert.deepEqual(liOtherNative.sources.map((entry) => entry.name), [
    `${liDocument}_0001_A.dwg`,
    `${liDocument}_0001_A.pdf`,
  ]);

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
  assert.equal(mcPair.flexibleFiles, true);
  assert.equal(mcPair.documentType, "MC");
  assert.deepEqual(mcPair.sources.map((entry) => entry.name), [
    `${mcDocument}_0001_0.xlsm`,
    `${mcDocument}_0001_0.pdf`,
  ]);
  // CR historicamente compõe nativo + PDF + TXT; a ordem continua garantida
  // mesmo quando os arquivos chegam embaralhados do seletor de pasta.
  const crDocument = "CR-5290.00-22313-940-C1O-002";
  const crPair = Emission.validateN1710Pair(
    { document: crDocument, revision: "0", sheet: "N-1710" },
    [
      { name: `${crDocument}_0001_0.txt`, finalName: `${crDocument}_0001_0.txt`, file: { size: 5 } },
      { name: `${crDocument}_0001_0.pdf`, finalName: `${crDocument}_0001_0.pdf`, file: { size: 10 } },
      { name: `${crDocument}_0001_0.dwg`, finalName: `${crDocument}_0001_0.dwg`, file: { size: 20 } },
    ]
  );
  assert.equal(crPair.valid, true);
  assert.deepEqual(crPair.sources.map((entry) => entry.name), [
    `${crDocument}_0001_0.dwg`,
    `${crDocument}_0001_0.pdf`,
    `${crDocument}_0001_0.txt`,
  ]);
  assert.equal(Core.proposedFileName(`${mcDocument}.xlsb`, mcDocument, "0", "N-1710"), `${mcDocument}_0001_0.xlsb`);
  checks.push("N-1710 ordena nativo → PDF → TXT de forma determinística em LI, MC e CR, aceitando qualquer extensão");
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

check("workflow PROJETO dos PR 040 e 041 reproduz MECÂNICA/SEGURANCA da eGRDT histórica", () => {
  const workflow = "RNEST UHDTD U-32 PROJETO";
  ["040", "041"].forEach((sequence) => {
    const document = `PR-5290.00-22313-175-C1O-${sequence}`;
    const record = {
      ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
      revision: "A",
      title: `PROCEDIMENTO ${sequence}`,
      format: "A4",
      discipline: workflow,
      documentType: "PR",
      purpose: "Para Construção",
      databook: "PROJETO",
    };
    const egrdt = Core.buildEgrdtData(document, "A", `${document}_0001_A.pdf`, record, "N-1710", "A4");
    assert.equal(egrdt.discipline, "MECÂNICA/SEGURANCA");

    const row = {
      document,
      revision: "A",
      sheet: "N-1710",
      record,
      decision: Core.READY,
      hardBlock: false,
      // Simula análise antiga ou edição que ainda carregava o workflow longo.
      egrdt: { ...egrdt, discipline: workflow },
      files: [
        { name: `${document}_0001_A.docx`, finalName: `${document}_0001_A.docx`, file: { size: 1 } },
        { name: `${document}_0001_A.pdf`, finalName: `${document}_0001_A.pdf`, file: { size: 1 } },
      ],
    };
    const plan = Emission.createPlan([row], new Set([0]));
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.entries.length, 2);
    assert.ok(plan.items.every((item) => item.discipline === "MECÂNICA/SEGURANCA"));
    assert.ok(plan.warnings.some((message) => /adaptada para “MECÂNICA\/SEGURANCA”/i.test(message)));
  });
});

check("disciplina fora do combo histórico gera alerta e nunca impede a GRDT", () => {
  const document = "PR-5290.00-22313-175-C1O-042";
  const discipline = "RNEST UHDTD U-32 DISCIPLINA NOVA";
  const record = {
    ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
    revision: "A",
    title: "PROCEDIMENTO 042",
    format: "A4",
    discipline,
    documentType: "PR",
    purpose: "Para Construção",
  };
  const row = {
    document,
    revision: "A",
    sheet: "N-1710",
    record,
    decision: Core.READY,
    hardBlock: false,
    egrdt: Core.buildEgrdtData(document, "A", `${document}_0001_A.pdf`, record, "N-1710", "A4"),
    files: [{ name: `${document}_0001_A.pdf`, finalName: `${document}_0001_A.pdf`, file: { size: 1 } }],
  };
  assert.doesNotMatch(Core.validateEgrdtData({ ...row.egrdt, discipline }).join("; "), /DISCIPLINA/i);
  const plan = Emission.createPlan([row], new Set([0]));
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.items[0].discipline, discipline);
  assert.ok(plan.warnings.some((message) => /não correspondeu ao combo histórico.*não bloqueou/i.test(message)));
});

await checkAsync("eGRDT dos PR 040 e 041 é gerada e reaberta com quatro arquivos", async () => {
  const workflow = "RNEST UHDTD U-32 PROJETO";
  const rows = ["040", "041"].map((sequence) => {
    const document = `PR-5290.00-22313-175-C1O-${sequence}`;
    const record = {
      ...ldDocumentRecord(document, "ALOCADO", "N-1710"),
      revision: "A",
      title: `PROCEDIMENTO ${sequence}`,
      format: "A4",
      discipline: workflow,
      documentType: "PR",
      purpose: "Para Construção",
      databook: "PROJETO",
    };
    return {
      document,
      revision: "A",
      sheet: "N-1710",
      record,
      decision: Core.READY,
      hardBlock: false,
      egrdt: Core.buildEgrdtData(document, "A", `${document}_0001_A.pdf`, record, "N-1710", "A4"),
      files: [
        { name: `${document}_0001_A.docx`, finalName: `${document}_0001_A.docx`, file: { size: 1 } },
        { name: `${document}_0001_A.pdf`, finalName: `${document}_0001_A.pdf`, file: { size: 1 } },
      ],
    };
  });
  const plan = Emission.createPlan(rows, new Set([0, 1]));
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.items.length, 4);
  const bytes = await Workbook.build(plan.items);
  const verified = await Workbook.verify(bytes, plan.items);
  assert.equal(verified.checkedRows, 4);
  assert.ok(verified.rows.every((row) => row.discipline === "MECÂNICA/SEGURANCA"));
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

check("cabeçalho da consulta não se sobrepõe e a Colar SIGEM não fica na frente", () => {
  const css = fs.readFileSync(path.join(root, "requests.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  // Medido no navegador com 12 colunas: cada coluna ficava com 96px enquanto
  // "Status da alocação (central)" precisava de 203px. Com nowrap o texto
  // transbordava a célula e um cabeçalho passava por cima do outro.
  assert.doesNotMatch(css, /\.requests-table thead th \{[^}]*white-space: nowrap/,
    "o cabeçalho precisa poder quebrar em duas linhas");
  assert.match(css, /\.requests-table thead th \{[^}]*min-width: \d/,
    "cada coluna precisa de um piso para não ficar menor que o próprio rótulo");
  assert.match(css, /\.requests-table \{[^}]*min-width: 88rem/);

  // A Colar SIGEM saiu da quarta posição e foi para junto das outras colunas
  // de SIGEM, que é onde ela faz sentido ser lida.
  const cabecalho = html.slice(html.indexOf("<th>Situação</th>"));
  const ordem = [...cabecalho.slice(0, cabecalho.indexOf("</tr>")).matchAll(/<th>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.equal(ordem[0], "Situação");
  assert.ok(ordem.indexOf("Revisão na Colar SIGEM") > ordem.indexOf("Alocado?"),
    "a Colar SIGEM não pode voltar para a frente da tabela");
  assert.equal(ordem[ordem.indexOf("Revisão na Colar SIGEM") + 1], "Status SIGEM",
    "as colunas de SIGEM ficam juntas");

  // A ordem da tela e a da exportação são a mesma leitura.
  const report = fs.readFileSync(path.join(root, "requests_report.js"), "utf8");
  const iColar = report.indexOf("REVISÃO NA COLAR SIGEM");
  const iAlocado = report.indexOf('"ALOCADO?"');
  const iStatus = report.indexOf("STATUS NO SIGEM");
  assert.ok(iAlocado < iColar && iColar < iStatus, "a exportação segue a mesma ordem da tela");
});

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

check("Histórico filtra também a lista de eGRDTs por N-1710, ET e CV", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(root, "history_app.js"), "utf8");
  const report = fs.readFileSync(path.join(root, "history_report.js"), "utf8");
  assert.match(html, /id="history-period-document-type"[\s\S]*value="N-1710"[\s\S]*value="ET"[\s\S]*value="CV"/);
  assert.match(ui, /filtered = History\.filterByDocumentFamily\(filtered, els\.periodDocumentType/);
  assert.match(ui, /state\.filtered = sortRecords\(filtered\)/);
  assert.match(ui, /els\.list\.innerHTML = state\.filtered\.map/);
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
  assert.ok(plan.warnings.some((message) => /fora do padrão controlado/i.test(message) && /será gravado como/i.test(message)));
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


/**
 * retomar.js é um módulo de navegador (IIFE sobre `window`) e não pode ser
 * carregado por require. Um contexto mínimo — com document.readyState em
 * "loading", para que o módulo apenas registre o DOMContentLoaded em vez de
 * inicializar — basta para alcançar a superfície exportada e conferir a
 * matemática pura dos indicadores do Dashboard.
 */
function loadBrowserModule(fileName) {
  const noop = () => {};
  const documentStub = {
    readyState: "loading", addEventListener: noop, documentElement: { dataset: {} },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, dataset: {}, setAttribute: noop, appendChild: noop, classList: { add: noop, remove: noop, toggle: noop } }),
    body: { classList: { add: noop, remove: noop } },
  };
  const windowStub = { document: documentStub, setTimeout, clearTimeout, console, localStorage: { getItem: () => null, setItem: noop, removeItem: noop } };
  windowStub.window = windowStub;
  const context = vm.createContext(windowStub);
  context.document = documentStub;
  vm.runInContext(fs.readFileSync(path.join(root, fileName), "utf8"), context);
  return context;
}

check("Dashboard compara cada indicador com o período anterior de mesmo tamanho", () => {
  const { kpiTrend, previousPeriodOf, daysInPeriod } = loadBrowserModule("retomar.js").GrconHistoryDashboard._debug;

  assert.equal(daysInPeriod("2026-08-01", "2026-08-30"), 30);
  // Objetos criados dentro do contexto vm têm outro Object.prototype, então a
  // comparação é feita campo a campo em vez de deepEqual entre realms.
  const monthWindow = previousPeriodOf("2026-08-01", "2026-08-30");
  assert.equal(monthWindow.start, "2026-07-02");
  assert.equal(monthWindow.end, "2026-07-31");
  const dayWindow = previousPeriodOf("2026-08-28", "2026-08-28");
  assert.equal(dayWindow.start, "2026-08-27");
  assert.equal(dayWindow.end, "2026-08-27");
  // "Todo o histórico" começa antes do primeiro registro: sem período anterior
  // comparável, nenhuma variação é exibida.
  assert.equal(previousPeriodOf("", "2026-08-28"), null);

  assert.equal(kpiTrend(120, 100).direction, "up");
  assert.equal(kpiTrend(120, 100).text, "+20%");
  assert.equal(kpiTrend(80, 100).direction, "down");
  assert.equal(kpiTrend(80, 100).text, "-20%");
  assert.equal(kpiTrend(100, 100).text, "estável");
  // Dividir por zero viraria infinito: o período sem emissão anterior é dito.
  assert.equal(kpiTrend(5, 0).text, "novo no período");
  assert.equal(kpiTrend(0, 0).direction, "flat");
  assert.equal(kpiTrend(10, null), null);

  // A frase completa é o que o leitor de tela anuncia: uma seta e um número
  // solto não dizem contra o quê a comparação foi feita.
  assert.match(kpiTrend(120, 100).label, /acima do período anterior \(100\)/);
});

check("resposta de e-mail monta as sete colunas da relação e cola como tabela", () => {
  // A relação copiada do Histórico chegava ao Outlook desmontada, uma célula
  // por linha. A resposta é montada com as mesmas colunas do relatório e com
  // estilo embutido, que é o que o cliente de e-mail preserva.
  const postado = History.cleanRecord({
    id: "email-1",
    egrdtNumber: "0130870-C1O-PGV-G-1407-2026 - eGRDT",
    generatedAt: new Date(2026, 7, 31, 10, 59).toISOString(),
    outputType: "eGRDT final",
    files: [
      { document: "PR-5290.00-22313-974-C1O-158", title: "CALIBRAÇÃO DE TERMOPAR TERMORRESISTENCIA", discipline: "COMISSIONAMENTO", finalName: "PR-5290.00-22313-974-C1O-158_0001_0.docx", sheet: "N-1710" },
      { document: "PR-5290.00-22313-974-C1O-158", title: "CALIBRAÇÃO DE TERMOPAR TERMORRESISTENCIA", discipline: "COMISSIONAMENTO", finalName: "PR-5290.00-22313-974-C1O-158_0001_0.pdf", sheet: "N-1710" },
      { document: "PR-5290.00-22313-974-C1O-159", title: "CALIBRAÇÃO DE DETECTORES DE CHAMA", discipline: "COMISSIONAMENTO", finalName: "PR-5290.00-22313-974-C1O-159_0001_0.pdf", sheet: "N-1710" },
    ],
  });

  const reply = EmailReply.build([postado]);

  assert.deepEqual(reply.columns, [
    "DATA DA GERAÇÃO / POSTAGEM",
    "EGRDT",
    "FAMÍLIA DOCUMENTAL",
    "DOCUMENTO",
    "TÍTULO",
    "DISCIPLINA",
    "ARQUIVO POSTADO",
  ]);

  // Uma linha por arquivo físico: o DOCX e o PDF do mesmo documento continuam
  // sendo duas linhas, como na eGRDT gerada.
  assert.equal(reply.rows.length, 3);
  assert.equal(reply.summary.documents, 2);
  assert.equal(reply.summary.files, 3);
  assert.equal(reply.rows[0]["EGRDT"], "0130870-C1O-PGV-G-1407-2026 - eGRDT");
  assert.equal(reply.rows[0]["FAMÍLIA DOCUMENTAL"], "N-1710");
  assert.equal(reply.rows[0]["DATA DA GERAÇÃO / POSTAGEM"], "31/08/2026, 10:59");
  assert.equal(reply.rows[0]["ARQUIVO POSTADO"], "PR-5290.00-22313-974-C1O-158_0001_0.docx");
  assert.equal(reply.rows[2]["TÍTULO"], "CALIBRAÇÃO DE DETECTORES DE CHAMA");

  // Texto tabulado: cabeçalho e uma linha por arquivo, para e-mail em texto
  // puro e para colar em colunas no Excel.
  const linhas = reply.tableText.split("\n");
  assert.equal(linhas.length, 4);
  assert.equal(linhas[0].split("\t").length, 7);
  assert.equal(linhas[1].split("\t")[3], "PR-5290.00-22313-974-C1O-158");

  // HTML com estilo embutido: sem isso o Outlook descarta a formatação e a
  // tabela chega como uma célula por linha.
  assert.equal((reply.tableHtml.match(/<th /g) || []).length, 7);
  assert.equal((reply.tableHtml.match(/<tr>/g) || []).length, 4);
  assert.match(reply.tableHtml, /border-collapse:collapse/);
  assert.equal((reply.tableHtml.match(/font-size:9pt/g) || []).length, 29, "table, sete cabeçalhos e 21 células usam fonte 9 pt");
  assert.match(reply.html, /<p style=/);

  // A tabela ficava enorme na resposta porque nada limitava a largura: um
  // título ou nome de arquivo compridos esticavam a linha inteira. Agora a
  // tabela tem largura fixa e o texto que não cabe quebra na própria célula.
  assert.match(reply.tableHtml, /table-layout:fixed/);
  assert.match(reply.tableHtml, /width:695px/);
  assert.match(reply.tableHtml, /padding:3px 6px/);
  assert.doesNotMatch(reply.tableHtml, /padding:6px 10px/, "o preenchimento antigo, mais largo, não pode voltar");
  assert.equal((reply.tableHtml.match(/word-break:break-word/g) || []).length, 21, "as 21 células precisam quebrar texto comprido em vez de alargar a tabela");
  assert.match(reply.tableHtml, /width="140"/, "a coluna TÍTULO precisa de uma largura fixa em px, não só em CSS");

  // A mensagem padrão nomeia a eGRDT e a data, e é o texto que abre o painel.
  assert.match(reply.message, /0130870-C1O-PGV-G-1407-2026 - eGRDT/);
  assert.match(reply.message, /31\/08\/2026, às 10:59/);
  assert.doesNotMatch(reply.message, /Seguem\s+\d+\s+documento/i);
  assert.doesNotMatch(reply.message, /\d+\s+arquivos?/i);
  assert.equal(reply.subject, "Documentos postados — 0130870-C1O-PGV-G-1407-2026 - eGRDT");

  // Só a tabela: quem já escreveu o próprio texto cola apenas a relação.
  const somenteTabela = EmailReply.build([postado], { message: "" });
  assert.equal(somenteTabela.text, somenteTabela.tableText);
  assert.equal(somenteTabela.html.includes("<p style="), false);

  // Campo em branco vira travessão, e não uma célula vazia que desalinha a
  // leitura da tabela no e-mail.
  const semTitulo = EmailReply.rowsFromRecords([History.cleanRecord({
    id: "email-2",
    egrdtNumber: "0130870-C1O-PGV-G-0001-2026 - eGRDT",
    generatedAt: new Date(2026, 7, 31, 8, 0).toISOString(),
    files: [{ document: "PR-5290.00-22313-974-C1O-900", finalName: "PR-5290.00-22313-974-C1O-900_0001_0.pdf", sheet: "N-1710" }],
  })]);
  assert.equal(semTitulo[0]["TÍTULO"], "—");
  assert.equal(semTitulo[0]["DISCIPLINA"], "—");

  // mailto: tem limite de tamanho. Com relação grande o link leva só a
  // mensagem — a tabela vai pela área de transferência.
  const curto = EmailReply.mailtoUrl(reply);
  assert.equal(curto.truncated, false);
  assert.match(curto.url, /^mailto:\?subject=/);
  const grande = EmailReply.build([History.cleanRecord({
    id: "email-3",
    egrdtNumber: "0130870-C1O-PGV-G-0002-2026 - eGRDT",
    generatedAt: new Date(2026, 7, 31, 9, 0).toISOString(),
    files: Array.from({ length: 60 }, (_, index) => ({
      document: `PR-5290.00-22313-974-C1O-${String(index + 1).padStart(3, "0")}`,
      title: "DOCUMENTO DE TESTE DA RESPOSTA DE E-MAIL",
      discipline: "COMISSIONAMENTO",
      finalName: `PR-5290.00-22313-974-C1O-${String(index + 1).padStart(3, "0")}_0001_0.pdf`,
      sheet: "N-1710",
    })),
  })]);
  assert.equal(EmailReply.mailtoUrl(grande).truncated, true);
});

// ---------------------------------------------------------------------------
// Escolha e alteração manual da revisão na geração de GRDT
// ---------------------------------------------------------------------------

check("triagem grava a revisão sugerida junto da revisão efetiva, sem marcar alteração manual (Cenário 1)", () => {
  const technical = ldDocumentRecord(ntBaseDocument);
  const result = Core.triageOne({ id: "revisao-sugestao-1", name: `${ntBaseDocument}.pdf` }, Core.buildIndex([technical], []), {});
  assert.equal(result.decision, Core.READY);
  assert.equal(result.revision, "0");
  assert.equal(result.revisionSuggested, "0");
  assert.equal(result.revisionManual, false);
});

check("escolha manual da revisão da GRDT preserva a sugestão original na linha (Cenário 2)", () => {
  const technical = ldDocumentRecord(ntBaseDocument);
  const row = Core.triageOne({ id: "revisao-sugestao-2", name: `${ntBaseDocument}.pdf` }, Core.buildIndex([technical], []), {});
  assert.equal(row.revisionSuggested, "0");
  // Simula a escolha manual feita na triagem (app.js: applyRevisionOverride).
  // O operador sabe que a revisão sugerida será recusada e já prepara a
  // próxima, sem que o GRCON precise reconhecê-la na LD ou no arquivo.
  row.revision = "A";
  row.revisionManual = true;
  assert.equal(row.revisionSuggested, "0", "a sugestão original precisa continuar disponível para restaurar");
  assert.equal(row.revision, "A");
});

check("GRDT gerada usa a revisão escolhida manualmente, não a sugestão automática (Cenário 2 e 9)", async () => {
  const document = "ET-5290.00-22000-912-1LV-901";
  const record = { ...ldDocumentRecord(document), revision: "A" };
  const fileName = `${document}_0001_A.pdf`;
  const row = {
    document, revision: "A", revisionSuggested: "A", revisionManual: false,
    sheet: "ET", record, decision: Core.READY, hardBlock: false,
    egrdt: Core.buildEgrdtData(document, "A", fileName, record, "ET", "A4"),
    files: [{ name: fileName, finalName: fileName, file: { size: 12 } }],
  };
  // Operador sabe que a revisão A será recusada e já emite com B — o mesmo
  // recálculo de nome final e egrdt que applyRevisionOverride faz em app.js.
  const overriddenFileName = Core.proposedFileName(fileName, document, "B", "ET");
  row.revision = "B";
  row.revisionManual = true;
  row.files = [{ name: fileName, finalName: overriddenFileName, file: { size: 12 } }];
  row.egrdt = { ...row.egrdt, revision: "B", fileName: overriddenFileName };

  const plan = Emission.createPlan([row], new Set([0]));
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.items[0].revision, "B");
  assert.equal(plan.entries[0].revision, "B");
  assert.match(plan.items[0].fileName, /_B\.pdf$/);

  const bytes = await Workbook.build(plan.items);
  const verified = await Workbook.verify(bytes, plan.items);
  assert.equal(verified.rows[0].revision, "B", "o arquivo .xls reaberto precisa confirmar a revisão B, não a sugestão A");
});

check("cada documento mantém sua própria revisão da GRDT, sem contaminar os demais (Cenário 3)", () => {
  const doc1 = "ET-5290.00-22000-912-1LV-902";
  const doc2 = "ET-5290.00-22000-912-1LV-903";
  const record1 = { ...ldDocumentRecord(doc1), revision: "A" };
  const record2 = { ...ldDocumentRecord(doc2), revision: "C" };
  const file1 = `${doc1}_0001_A.pdf`;
  const file2 = `${doc2}_0001_C.pdf`;
  const row1 = {
    document: doc1, revision: "A", revisionSuggested: "A", revisionManual: false,
    sheet: "ET", record: record1, decision: Core.READY, hardBlock: false,
    egrdt: Core.buildEgrdtData(doc1, "A", file1, record1, "ET", "A4"),
    files: [{ name: file1, finalName: file1, file: { size: 5 } }],
  };
  const row2 = {
    document: doc2, revision: "C", revisionSuggested: "C", revisionManual: false,
    sheet: "ET", record: record2, decision: Core.READY, hardBlock: false,
    egrdt: Core.buildEgrdtData(doc2, "C", file2, record2, "ET", "A4"),
    files: [{ name: file2, finalName: file2, file: { size: 5 } }],
  };
  // Só o primeiro documento recebe alteração manual.
  const overriddenFile1 = Core.proposedFileName(file1, doc1, "B", "ET");
  row1.revision = "B";
  row1.revisionManual = true;
  row1.files = [{ name: file1, finalName: overriddenFile1, file: { size: 5 } }];
  row1.egrdt = { ...row1.egrdt, revision: "B", fileName: overriddenFile1 };

  const plan = Emission.createPlan([row1, row2], new Set([0, 1]));
  assert.deepEqual(plan.errors, []);
  const byDocument = Object.fromEntries(plan.items.map((item) => [item.document, item.revision]));
  assert.equal(byDocument[doc1], "B");
  assert.equal(byDocument[doc2], "C", "a revisão do segundo documento não pode ser afetada pela alteração do primeiro");
});

check("dividir a eGRDT por disciplina preserva a revisão escolhida manualmente por documento (Cenário 7)", () => {
  const docA = "ET-5290.00-22000-912-1LV-904";
  const docB = "ET-5290.00-22000-912-1LV-905";
  const recordA = { ...ldDocumentRecord(docA), revision: "0", discipline: "MECÂNICA" };
  const recordB = { ...ldDocumentRecord(docB), revision: "A", discipline: "ELÉTRICA" };
  const fileA = `${docA}_0001_0.pdf`;
  const fileB = `${docB}_0001_A.pdf`;
  const rowA = {
    document: docA, revision: "0", revisionSuggested: "0", revisionManual: false,
    sheet: "ET", record: recordA, decision: Core.READY, hardBlock: false,
    egrdt: { ...Core.buildEgrdtData(docA, "0", fileA, recordA, "ET", "A4"), discipline: "MECÂNICA" },
    files: [{ name: fileA, finalName: fileA, file: { size: 4 } }],
  };
  const rowB = {
    document: docB, revision: "A", revisionSuggested: "A", revisionManual: false,
    sheet: "ET", record: recordB, decision: Core.READY, hardBlock: false,
    egrdt: { ...Core.buildEgrdtData(docB, "A", fileB, recordB, "ET", "A4"), discipline: "ELÉTRICA" },
    files: [{ name: fileB, finalName: fileB, file: { size: 4 } }],
  };
  // Move a revisão de A para B antes de dividir por disciplina.
  const overriddenFileB = Core.proposedFileName(fileB, docB, "B", "ET");
  rowB.revision = "B";
  rowB.revisionManual = true;
  rowB.files = [{ name: fileB, finalName: overriddenFileB, file: { size: 4 } }];
  rowB.egrdt = { ...rowB.egrdt, revision: "B", fileName: overriddenFileB };

  const plan = Emission.createPlan([rowA, rowB], new Set([0, 1]));
  assert.deepEqual(plan.errors, []);
  const groups = Emission.splitPlan(plan, 48);
  assert.equal(groups.length, 2);
  const groupB = groups.find((group) => group.discipline === "ELÉTRICA");
  assert.ok(groupB, "a disciplina do documento com revisão alterada precisa continuar existindo após a divisão");
  assert.equal(groupB.items[0].revision, "B");
  assert.equal(groupB.entries[0].revision, "B", "mover o documento entre eGRDTs não pode resetar a revisão escolhida");
});

check("histórico preserva a revisão enviada e a sugestão original ao reabrir, sem recalcular (Cenário 8)", () => {
  const built = History.cleanRecord({
    id: "hist-revisao-manual-1",
    egrdtNumber: Sequence.baseName(9001, 2026),
    generatedAt: "2026-08-31T09:00:00.000Z",
    outputType: "eGRDT final",
    files: [{
      document: "PR-5290.00-22313-975-C1O-777",
      finalName: "PR-5290.00-22313-975-C1O-777_0001_B.pdf",
      revision: "B",
      grdtRevision: "B",
      revisionSuggested: "A",
      revisionManual: true,
    }],
  });
  assert.equal(built.files[0].revision, "B");
  assert.equal(built.files[0].grdtRevision, "B");
  assert.equal(built.files[0].revisionSuggested, "A");
  assert.equal(built.files[0].revisionManual, true);

  // Reabrir pelo histórico não recalcula: persiste, relê do storage e confere
  // que a revisão enviada continua B, e não a sugestão A da época.
  const store = storage([built]);
  const reopened = History.read(store);
  assert.equal(reopened[0].files[0].revision, "B");
  assert.equal(reopened[0].files[0].revisionSuggested, "A");
  assert.equal(reopened[0].files[0].revisionManual, true);
});

check("histórico antigo sem os campos novos cai para a revisão registrada, sem quebrar (compatibilidade retroativa)", () => {
  const legacy = History.cleanRecord({
    id: "hist-revisao-legado-1",
    egrdtNumber: Sequence.baseName(9002, 2026),
    generatedAt: "2026-08-01T09:00:00.000Z",
    outputType: "eGRDT final",
    files: [{ document: "PR-5290.00-22313-975-C1O-778", finalName: "PR-5290.00-22313-975-C1O-778_0001_A.pdf", revision: "A" }],
  });
  assert.equal(legacy.files[0].revision, "A");
  assert.equal(legacy.files[0].revisionSuggested, "A");
  assert.equal(legacy.files[0].revisionManual, false);
});

check("Resumo da triagem mostra a revisão sugerida e sinaliza a alteração manual sem bloquear a geração (Cenário 21)", () => {
  const document = "ET-5290.00-22000-912-1LV-906";
  const record = { ...ldDocumentRecord(document), revision: "A" };
  const finalName = `${document}_0001_B.pdf`;
  const row = {
    document, revision: "B", revisionSuggested: "A", revisionManual: true,
    sheet: "ET", record, decision: Core.READY, hardBlock: false,
    egrdt: Core.buildEgrdtData(document, "B", finalName, record, "ET", "A4"),
    files: [{ name: finalName, finalName, file: { size: 3 } }],
  };
  const [summary] = ReportSummary.buildRows([row], {});
  assert.equal(summary.ldRevision, "A");
  assert.equal(summary.targetRevision, "B");
  assert.equal(summary.revisionSuggested, "A");
  assert.equal(summary.revisionManual, "SIM");
});

check("validação de revisão continua usando as regras já existentes: incomum e legítima passa, formato inválido continua barrado", () => {
  // Revisão "de campo" (letra+número) já era aceita pelo GRCON antes desta
  // melhoria — não é uma restrição nova, então a edição manual não bloqueia.
  assert.equal(Core.revisionInfo("A1").valid, true);
  assert.equal(Core.revisionInfo("AB").valid, true);
  // Formato claramente inválido continua barrado — regra herdada, não nova.
  assert.equal(Core.revisionInfo("1A").valid, false);
  assert.equal(Core.revisionInfo("O").valid, false);

  const document = "ET-5290.00-22000-912-1LV-907";
  const record = { ...ldDocumentRecord(document), revision: "A" };
  const finalName = `${document}_0001_1A.pdf`;
  const row = {
    document, revision: "1A", revisionSuggested: "A", revisionManual: true,
    sheet: "ET", record, decision: Core.READY, hardBlock: false,
    egrdt: Core.buildEgrdtData(document, "1A", finalName, record, "ET", "A4"),
    files: [{ name: finalName, finalName, file: { size: 3 } }],
  };
  const plan = Emission.createPlan([row], new Set([0]));
  assert.ok(plan.errors.some((message) => /revis[aã]o inválida/i.test(message)), "um formato de revisão evidentemente inválido continua barrando a geração, como já acontecia antes");
});

check("triagem oferece edição inline da revisão de cada documento com restauração da sugestão (verificação estática)", () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(appSource, /function applyRevisionOverride/);
  assert.match(appSource, /function restoreSuggestedRevision/);
  assert.match(appSource, /data-revision-input/);
  assert.match(appSource, /data-action="restore-revision"/);
  assert.match(appSource, /#drawer-revision/);
  // row.revision só pode ser escrito dentro de applyRevisionOverride — do
  // contrário, algum outro trecho do app poderia sobrescrever silenciosamente
  // a escolha manual do operador ao filtrar, pesquisar ou dividir eGRDTs
  // (Cenários 6, 7 e 19).
  const assignments = appSource.match(/row\.revision\s*=[^=]/g) || [];
  assert.equal(assignments.length, 1, "row.revision deve ser escrito só dentro de applyRevisionOverride");

  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  // O rótulo precisa deixar claro que é a revisão de CADA documento, não um
  // valor único compartilhado pela GRDT inteira (que pode reunir documentos
  // em revisões diferentes).
  assert.match(indexSource, /REVISÃO DO DOCUMENTO/);
  assert.doesNotMatch(indexSource, /REVISÃO DA GRDT/);
  assert.match(indexSource, /id="drawer-revision"/);

  const exportWorker = fs.readFileSync(path.join(root, "workers", "export.worker.js"), "utf8");
  assert.match(exportWorker, /REVISÃO SUGERIDA PELO SISTEMA/);
  assert.match(exportWorker, /REVISÃO ALTERADA MANUALMENTE/);
});

check("resposta de e-mail fica disponível somente no Histórico", () => {
  const interfaceSource = fs.readFileSync(path.join(root, "egrdt_email_reply_ui.js"), "utf8");
  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const historySource = fs.readFileSync(path.join(root, "history_app.js"), "utf8");

  assert.doesNotMatch(interfaceSource, /grcon-egrdt-email-auto/);
  assert.doesNotMatch(interfaceSource, /grcon:history-updated/);
  assert.doesNotMatch(interfaceSource, /openLastGenerated|autoOpenEnabled/);
  assert.doesNotMatch(indexSource, /id=["']egrdt-email-reply["']/);
  assert.match(historySource, /data-history-action=["']email-reply["']/);
  assert.match(historySource, /GrconEgrdtEmailReplyUi\.open\(\[record\]\)/);
});

// ---------------------------------------------------------------------------
// Consulta ponta a ponta, a partir de um arquivo de LD
//
// Os demais testes da consulta montam as linhas técnicas na mão. Este parte de
// uma LD no formato real — cabeçalho institucional antes da linha de títulos,
// abas ET/N-1710/Colar SIGEM, cabeçalhos reais e célula de alocação mesclada —
// e vai até o .xlsx gerado, relido do início. É a única cobertura da cadeia
// inteira: parseWorkbook → índice → consulta → linha exportada (a função real
// do requests_app.js) → construtor da planilha. Uma ponta que se solte das
// outras aparece aqui, e não na tela de quem usa.
// ---------------------------------------------------------------------------
function ldRealWorkbook() {
  const P = "C1O_RNEST_U32_3.1.1.1_INS_RIR_";
  const cabecalho = Array(24).fill("");
  cabecalho[0] = "ITEM"; cabecalho[1] = "DOCUMENTO"; cabecalho[2] = "REVISÃO"; cabecalho[3] = "TÍTULO";
  cabecalho[4] = "UNIDADE/ÁREA"; cabecalho[5] = "DISCIPLINA"; cabecalho[6] = "TIPO DE DOCUMENTO";
  cabecalho[7] = "PROPÓSITO DE EMISSÃO"; cabecalho[8] = "FORMATO"; cabecalho[9] = "TAG";
  cabecalho[12] = "GRDT"; cabecalho[13] = "DATA EFETIVA DE EMISSÃO"; cabecalho[14] = "STATUS";
  cabecalho[16] = "STATUS SIGEM"; cabecalho[18] = "ALOCAÇÃO"; cabecalho[20] = "COMENTÁRIO DA FISCAL";
  cabecalho[21] = "CAMINHO DATABOOK"; cabecalho[23] = "CONFIRMAÇÃO DE ALOCAÇÃO";

  const linha = (item, documento, revisao, tag, over = {}) => {
    const dados = Array(24).fill("");
    dados[0] = String(item); dados[1] = documento; dados[2] = revisao;
    dados[3] = `RELATÓRIO DE INSPEÇÃO — ${tag}`; dados[4] = "U-32";
    dados[5] = "RNEST UHDT-D U32 INSPEÇÃO"; dados[6] = "RELATÓRIO";
    dados[7] = "Para Informação"; dados[8] = "A4"; dados[9] = tag;
    dados[14] = "EM EMISSÃO"; dados[18] = over.aloc === undefined ? "C1O-ALOC-CM-0062-2026" : over.aloc;
    dados[21] = "DATA BOOK C&M UHDTD U-32";
    if (over.grdt) dados[12] = over.grdt;
    if (over.data) dados[13] = over.data;
    if (over.confirmacao !== undefined) dados[23] = over.confirmacao;
    return dados;
  };

  const et = SheetJS.utils.aoa_to_sheet([
    ["LISTA DE DOCUMENTOS — RNEST UHDT-D U-32"], [""], ["CONSAG ENGENHARIA"], [""],
    ["DADOS DOS DOCUMENTOS"], cabecalho,
    // O mesmo código nas duas grafias, com situações diferentes.
    linha(2551, `${P}SPE-AST-320019`, "0", "SPE-AST-320019", { confirmacao: "ALOCADO" }),
    linha(2552, `${P}nt-SPE-AST-320019`, "B", "SPE-AST-320019", {
      aloc: "", confirmacao: "NÃO ALOCADO", grdt: "GRDT-2026-0087", data: "12/03/2026",
    }),
    // Só existe com nt-; a confirmação vem de uma célula mesclada.
    linha(2553, `${P}nt-SPE-AST-320020`, "0", "SPE-AST-320020", { confirmacao: "" }),
    linha(2554, `${P}nt-SPE-AST-320021`, "0", "SPE-AST-320021", { confirmacao: "" }),
    ["FIM"],
  ]);
  // Mescla real de confirmação de alocação cobrindo as duas últimas linhas:
  // no arquivo só a primeira célula do intervalo guarda o valor.
  et["!merges"] = [{ s: { r: 8, c: 23 }, e: { r: 9, c: 23 } }];
  et.X9 = { t: "s", v: "ALOCADO" };

  const historico = Array(6).fill("");
  historico[0] = "DOCUMENTO"; historico[1] = "REVISÃO"; historico[2] = "STATUS SIGEM";
  historico[3] = "GRDT"; historico[4] = "DATA EFETIVA DE EMISSÃO";
  const hist = (documento, revisao, status, grdt, data) => {
    const dados = Array(6).fill("");
    dados[0] = documento; dados[1] = revisao; dados[2] = status;
    dados[3] = grdt || ""; dados[4] = data || "";
    return dados;
  };

  const n1710Cabecalho = Array(24).fill("");
  n1710Cabecalho[0] = "ITEM"; n1710Cabecalho[1] = "DOCUMENTO"; n1710Cabecalho[2] = "REVISÃO";
  n1710Cabecalho[3] = "TÍTULO"; n1710Cabecalho[5] = "DISCIPLINA";
  n1710Cabecalho[7] = "PROPÓSITO DE EMISSÃO"; n1710Cabecalho[16] = "STATUS SIGEM";
  n1710Cabecalho[23] = "CONFIRMAÇÃO DE ALOCAÇÃO";
  const n1710Dados = Array(24).fill("");
  n1710Dados[0] = "1"; n1710Dados[1] = n1710Document; n1710Dados[2] = "0";
  n1710Dados[3] = "MANUAL DE OPERAÇÃO DA UNIDADE"; n1710Dados[5] = "RNEST UHDT-D U32 MECÂNICA";
  n1710Dados[7] = "Para Informação"; n1710Dados[16] = "Não Postado"; n1710Dados[23] = "ALOCADO";

  const workbook = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(workbook, et, "ET");
  SheetJS.utils.book_append_sheet(workbook, SheetJS.utils.aoa_to_sheet([
    ["LISTA DE DOCUMENTOS"], [""], [""], [""], ["DADOS DOS DOCUMENTOS"], n1710Cabecalho, n1710Dados,
  ]), "N-1710");
  SheetJS.utils.book_append_sheet(workbook, SheetJS.utils.aoa_to_sheet([
    ["COLAR AQUI O RELATÓRIO DO SIGEM"], [""], historico,
    hist(`${P}SPE-AST-320019`, "0", "Não Postado"),
    hist(`${P}nt-SPE-AST-320019`, "A", "Com Comentários", "GRDT-2026-0051", "02/02/2026"),
    hist(`${P}nt-SPE-AST-320019`, "B", "Em Análise", "GRDT-2026-0087", "12/03/2026"),
    hist(`${P}nt-SPE-AST-320021`, "0", "Recusado", "GRDT-2026-0033", "10/01/2026"),
    hist(`${P}nt-SPE-AST-320021`, "A", "Em Análise", "GRDT-2026-0091", "20/03/2026"),
  ]), "Colar SIGEM");
  return workbook;
}

await (async () => {
  const nome = "Consulta ponta a ponta: LD em arquivo chega preenchida à planilha gerada";
  globalThis.XLSX = SheetJS;
  const P = "C1O_RNEST_U32_3.1.1.1_INS_RIR_";
  // Arquivo de verdade: gravado e lido de volta, como o navegador faz.
  const arquivo = SheetJS.read(SheetJS.write(ldRealWorkbook(), { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const parsed = Core.parseWorkbook(arquivo, "LD-5290.00-22313-91A-C1O-001_0001_F.xlsx", 1, null);
  assert.equal(parsed.records.length, 5, "as quatro linhas de ET e a de N-1710 precisam ser lidas");
  assert.equal(parsed.history.length, 5, "a Colar SIGEM precisa ser lida como histórico");
  assert.equal(parsed.records[0].ldVersion, "F", "a versão da LD sai do nome do arquivo");
  // A mescla vale para todas as linhas do intervalo, não só para a primeira.
  const mesclada = parsed.records.find((item) => item.document === `${P}nt-SPE-AST-320021`);
  assert.equal(mesclada.allocationStatus, "ALOCADO");
  assert.equal(mesclada.allocationStatusHeader, "CONFIRMAÇÃO DE ALOCAÇÃO");

  const index = Core.buildIndex(parsed.records, parsed.history);
  // A lista chega como o operador digita: com nt-, sem nt- e com erro de
  // transcrição no TAG (letra O no lugar do zero).
  const documentos = Requests.parseDocumentList([
    `${P}SPE-AST-320019`,
    `${P}SPE-AST-320020`,
    `${P}nt-SPE-AST-32O021`,
    n1710Document,
    `${P}nt-SPE-AST-999999`,
  ].join("\n")).map((item, indice) => ({ ...item, id: `consulta-${indice}`, selected: true }));
  const resultados = new Map(documentos.map((item) => [
    item.id,
    Requests.consultationRow(Requests.lookupDocument(item.document, index, {})),
  ]));

  // A linha exportada é montada pela função real da tela, não por uma cópia.
  const appSource = fs.readFileSync(path.join(root, "requests_app.js"), "utf8");
  const inicio = appSource.indexOf("function linhasParaSaida()");
  const corpo = appSource.slice(inicio, appSource.indexOf("\n  }", inicio) + 4);
  const linhas = new Function("state", `${corpo}; return linhasParaSaida();`)({ documents: documentos, results: resultados });
  assert.equal(linhas.length, documentos.length);

  const workbook = new ExcelJS.Workbook();
  const aba = workbook.addWorksheet("Consulta");
  RequestsReport.writeConsultationSheet(aba, linhas, {
    columns: RequestsReport.BUILTIN_EXPORT_TEMPLATES.find((modelo) => modelo.base === "consulta").columns,
    title: "GRCON · CONSULTA DE DOCUMENTOS",
    metadata: "teste ponta a ponta",
    ldNames: "LD-5290.00-22313-91A-C1O-001_0001_F.xlsx",
  });

  // Planilha relida do zero: é o que a pessoa abre, não o objeto em memória.
  const gerada = SheetJS.read(await workbook.xlsx.writeBuffer(), { type: "buffer" });
  const matriz = SheetJS.utils.sheet_to_json(gerada.Sheets[gerada.SheetNames[0]], { header: 1, defval: "" });
  const cabecalhoIndice = matriz.findIndex((linha) => String(linha[0] || "").toUpperCase() === "SITUAÇÃO");
  assert.ok(cabecalhoIndice > -1, "a planilha gerada precisa ter a linha de cabeçalho");
  const colunas = matriz[cabecalhoIndice];
  const dados = matriz.slice(cabecalhoIndice + 1).filter((linha) => String(linha[0] || "").trim());
  assert.equal(dados.length, documentos.length);
  const celula = (documento, coluna) => {
    const linha = dados.find((item) => String(item[colunas.indexOf("DOCUMENTO")]) === documento);
    return String(linha[colunas.indexOf(coluna)] || "");
  };

  // Código informado exatamente como está na LD: as duas grafias existem e a
  // planilha traz a situação de cada uma, não só a da forma consultada.
  assert.equal(celula(`${P}SPE-AST-320019`, "CÓDIGO LOCALIZADO NA LD"), `${P}SPE-AST-320019`);
  assert.equal(celula(`${P}SPE-AST-320019`, "FORMA LOCALIZADA NA LD"), "Sem nt-");
  const duasFormas = celula(`${P}SPE-AST-320019`, "SITUAÇÃO DE CADA FORMA (com/sem nt-)");
  assert.match(duasFormas, /Sem nt-:.*forma usada nesta consulta.*Rev\. 0 na LD.*SIM — Alocado/);
  assert.match(duasFormas, /Com nt-:.*também consta na LD.*Rev\. B na LD.*Em Análise.*NÃO — Não alocado/);

  // Consultado sem nt-, existe só com nt-: o código sai corrigido na planilha.
  assert.equal(celula(`${P}SPE-AST-320020`, "CÓDIGO LOCALIZADO NA LD"), `${P}nt-SPE-AST-320020`);
  assert.match(celula(`${P}SPE-AST-320020`, "SITUAÇÃO DE CADA FORMA (com/sem nt-)"), /Sem nt-: não consta na LD/);
  assert.match(celula(`${P}SPE-AST-320020`, "PESQUISA COM/SEM nt- E TAG NA LD"), /com e sem nt-/i);

  // Erro de transcrição no TAG: localizado pela combinação tipo + TAG, com o
  // código da LD na planilha — sem alterar o TAG informado.
  assert.equal(celula(`${P}nt-SPE-AST-32O021`, "CÓDIGO LOCALIZADO NA LD"), `${P}nt-SPE-AST-320021`);

  // Outra família documental não ganha uma segunda grafia inventada.
  assert.equal(celula(n1710Document, "SITUAÇÃO DE CADA FORMA (com/sem nt-)"), "");
  assert.match(celula(n1710Document, "FORMA LOCALIZADA NA LD"), /Não se aplica/);

  // Não localizado continua dizendo o que foi pesquisado, sem célula muda.
  assert.equal(celula(`${P}nt-SPE-AST-999999`, "SITUAÇÃO"), "Não localizado");
  assert.match(celula(`${P}nt-SPE-AST-999999`, "SITUAÇÃO DE CADA FORMA (com/sem nt-)"), /Sem nt-: não consta na LD/);

  // A mesma LD passando pela triagem: Em Análise para na própria revisão e
  // leva a GRDT e a data da revisão analisada, não a da linha técnica.
  const emAnalise = Core.triageOne({ id: "ld-em-analise", name: `${P}nt-SPE-AST-320021.pdf` }, index, {});
  assert.equal(emAnalise.decision, Core.DISCARD);
  assert.equal(emAnalise.revision, "A");
  assert.equal(emAnalise.status, "Em Análise");
  assert.equal(emAnalise.grdt, "GRDT-2026-0091");
  assert.ok(emAnalise.analysisEvidence, "a evidência da revisão em análise precisa ser preenchida");
  assert.equal(emAnalise.analysisEvidence.statusSource.sheet, "Colar SIGEM");
  checks.push(nome);
})();

console.log(JSON.stringify({ version: "5.38.5", passed: true, checks: checks.length, names: checks }, null, 2));
