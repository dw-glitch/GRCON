// Regressões da conferência por emissão e diagnóstico operacional.
const assert = require("node:assert/strict");
const C = require("../posting_conference_core.js");

const NOW = "2026-10-08T18:00:00Z";
const code = (n) => "RL-5290.00-22313-970-C1O-" + String(n).padStart(3, "0");
const emission = (n, files, date = "2026-09-30T12:00:00Z") => ({
  id: "emission-" + n, clientRecordId: "emission-" + n, egrdtNumber: "GRDT-" + n,
  generatedAt: date,
  files: files.map(([document, revision, purpose]) => ({
    document, revision, grdtRevision: revision, sheet: "ET", discipline: "TUB",
    purpose: purpose || "Para Construção",
  })),
});
const sigem = (document, revision, status = "Em Análise") => ({
  document: C.displayDocument(document),
  documentIdentity: C.documentIdentity(document),
  searchKeys: C.documentKeys(document),
  revision: C.normalizeRevision(revision),
  status, sourceRow: 7, modifiedAt: "08/10/2026 13:00:00",
});
const run = (history, base, extras = {}) => C.reconcile(history, base, null, {
  now: NOW, waitHours: 48, baseReferenceDate: "2026-10-08", ...extras,
});
const d = [code(1), code(2), code(3), code(4)];

// A: todos os códigos/revisões encontrados; eGRDT efetivamente confirmada na base.
let result = run([emission("100", [[d[0], "A"], [d[1], "A"]])], [sigem(d[0], "A"), sigem(d[1], "A")]);
assert.equal(result.groups[0].classification, "TOTALMENTE_CONFIRMADA");
assert.equal(result.groups[0].confirmed, 2);
assert.equal(result.groups[0].riskOfDuplicateResend, false);

// B: quatro/localizados vs uma revisão ausente, todos os documentos da emissão retidos.
result = run([emission("101", [[d[0], "A"], [d[1], "A"], [d[2], "A"]])],
  [sigem(d[0], "A"), sigem(d[1], "A")]);
assert.equal(result.groups[0].classification, "PARCIALMENTE_CONFIRMADA");
assert.equal(result.groups[0].confirmed, 2);
assert.equal(result.groups[0].notFound, 1);
assert.equal(result.groups[0].rows.length, 3);
assert.equal(result.groups[0].riskOfDuplicateResend, true);
assert.equal(C.diagnoseRow(result.rows[0], { kind: "allocated" }).action, "NÃO REENVIAR");

// C: ausência em Documentos Previstos é indício, não erro confirmado.
let pending = result.rows.find((item) => item.document === C.displayDocument(d[2]));
let diagnosis = C.diagnoseRow(pending, { kind: "not_allocated", allocations: [], plannedSnapshotId: "p1" });
assert.equal(diagnosis.action, "VERIFICAR ALOCAÇÃO");
assert.equal(diagnosis.evidenceLevel, "INDÍCIO DE POSSÍVEL CAUSA");
assert.match(diagnosis.reason, /não é prova/i);

// D: revisão anterior em análise não confirma a nova revisão.
result = run([emission("102", [[d[3], "C"]])], [sigem(d[3], "B", "Em Análise")]);
diagnosis = C.diagnoseRow(result.rows[0], { kind: "allocated" });
assert.equal(result.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(diagnosis.action, "INVESTIGAR REVISÃO");
assert.match(diagnosis.reason, /revisão B/i);
assert.ok(!diagnosis.canPreselectResend);

// E: mesma revisão em workflow implica presença documental, não nova postagem.
result = run([emission("103", [[d[0], "A"]])], [sigem(d[0], "A", "Em Workflow")]);
diagnosis = C.diagnoseRow(result.rows[0], { kind: "allocated" });
assert.equal(result.rows[0].status, C.STATUSES.CONFIRMED);
assert.equal(diagnosis.action, "NÃO REENVIAR");
assert.equal(diagnosis.statusSigem, "Em Workflow");

// F: Consulta Geral com data anterior à emissão não prova ausência.
result = run([emission("104", [[d[2], "A"]], "2026-10-07T14:00:00Z")],
  [sigem(d[0], "A")], { baseReferenceDate: "2026-10-01" });
assert.equal(result.rows[0].status, C.STATUSES.NOT_VERIFIED);
assert.equal(result.groups[0].classification, "NAO_VERIFICADA");
assert.equal(C.diagnoseRow(result.rows[0], {}).action, "AGUARDAR BASE ATUALIZADA");

// G: duas GRDTs com o mesmo documento/revisão são dois eventos, mas sem inferir
// qual GRDT originou a presença no SIGEM.
result = run([emission("105", [[d[1], "B"]]), emission("106", [[d[1], "B"]])], [sigem(d[1], "B")]);
assert.equal(result.groups.length, 2);
assert.equal(result.groups[0].total, 1);
assert.equal(result.groups[1].total, 1);
assert.equal(new Set(result.rows.map((row) => row.documentIdentity)).size, 1);

// H: múltiplas alocações nunca se reduzem à primeira.
result = run([emission("107", [[d[0], "A"]])], [sigem(d[0], "A")]);
diagnosis = C.diagnoseRow(result.rows[0], {
  kind: "allocated", allocations: ["ALOC-027", "ALOC-028"],
  references: [{ allocation: "ALOC-027" }, { allocation: "ALOC-028" }],
});
assert.deepEqual(diagnosis.allocations, ["ALOC-027", "ALOC-028"]);
assert.equal(diagnosis.action, "NÃO REENVIAR");

// I: nenhuma base válida => não verificada; nenhum candidato automático.
result = run([emission("108", [[d[0], "A"]])], []);
assert.equal(result.groups[0].classification, "NAO_VERIFICADA");
assert.equal(C.diagnoseRow(result.rows[0], {}).canPreselectResend, false);

// J: nenhum documento confirmado; não comprova não-postagem.
result = run([emission("109", [[d[0], "A"], [d[1], "A"]])], [sigem(d[2], "B")]);
assert.equal(result.groups[0].classification, "NENHUM_DOCUMENTO_CONFIRMADO");
assert.equal(result.groups[0].notFound, 2);

// Duplicata exata na mesma GRDT não altera a quantidade de eventos.
result = run([emission("110", [[d[0], "A"], [d[0], "A"], [d[1], "A"]])], [sigem(d[0], "A")]);
assert.equal(result.groups[0].total, 2);
assert.equal(result.groups[0].distinctDocuments, 2);

// Base anterior com confirmação histórica: preserve evidência antiga e atual.
const prev = run([emission("111", [[d[0], "A"]])], [sigem(d[0], "A")]);
result = C.reconcile([emission("111", [[d[0], "A"]])], [sigem(d[1], "A")], prev.state, {
  now: NOW, waitHours: 48, baseReferenceDate: "2026-10-08",
});
assert.equal(result.rows[0].historicalPreserved, true);
assert.equal(result.groups[0].classification, "REQUER_INVESTIGACAO",
  "confirmação histórica não é presença garantida na Consulta Geral atual");
assert.equal(result.groups[0].confirmed, 0);
assert.equal(result.groups[0].preservedOnly, 1);
assert.equal(C.diagnoseRow(result.rows[0], {}).action, "NÃO REENVIAR");

// Confirmação histórica também pode tornar perigoso reenviar um pacote parcial.
const historicalMixed = run([emission("111b", [[d[0], "A"], [d[1], "A"]])], [sigem(d[0], "A", "Em Workflow")]);
const historicalMissing = C.reconcile([emission("111b", [[d[0], "A"], [d[1], "A"]])], [sigem(d[2], "A")], historicalMixed.state, { now: NOW, waitHours: 48, baseReferenceDate: "2026-10-08" });
assert.equal(historicalMissing.groups[0].riskOfDuplicateResend, true);
assert.equal(historicalMissing.groups[0].inTransit, 0, "workflow histórico não é evidência da base atual");

// Propósito de emissão vinculado ao evento original da GRDT.
result = run([emission("112", [[d[0], "A", "Para Cancelamento"]])], [sigem(d[0], "A")]);
assert.equal(result.rows[0].purpose, "Para Cancelamento");

console.log("posting_conference_intelligent_grdt: OK");

// A decisão é manual, por ocorrência/revisão; presença histórica também exclui reenvio.
const selection = run([emission('selective', [[d[0], 'A'], [d[1], 'C'], [d[2], '0']])], [sigem(d[0], 'A', 'Em Workflow'), sigem(d[1], 'B')]);
assert.equal(C.repostEligibility(selection.rows.find(row => row.document === C.displayDocument(d[0]))).eligible, false);
assert.equal(C.repostEligibility(selection.rows.find(row => row.document === C.displayDocument(d[1]))).eligible, true);
assert.equal(C.repostEligibility(selection.rows.find(row => row.document === C.displayDocument(d[2]))).eligible, true);
assert.equal(C.repostEligibility({ ...selection.rows[2], historicalPreserved: true }).eligible, false);
assert.equal(C.repostEligibility({ ...selection.rows[2], ambiguity: true }).eligible, false);
assert.equal(C.repostEligibility({ ...selection.rows[2], status: C.STATUSES.NOT_VERIFIED }).eligible, false);
assert.equal(C.repostEligibility({ ...selection.rows[2], revisionSent: '' }).eligible, false);

// Arquivo XLSX real: uma única aba, somente pendentes e contexto da GRDT completa.
(async () => {
  global.ExcelJS = require('../exceljs.min.js');
  global.GRCONBrandAssets = { reportLogoBase64: 'data:image/png;base64,' + require('node:fs').readFileSync(require('node:path').join(__dirname, '../grcon-logo-report.png')).toString('base64') };
  const Report = require('../posting_conference_report.js');
  const mixed = run([emission('113', [[d[0], 'A', 'Para Cancelamento'], [d[1], 'B'], [d[2], 'C']])], [sigem(d[0], 'A', 'Emitido'), sigem(d[2], 'B', 'Em Workflow')]);
  const rows = mixed.rows.map(row => ({ ...row, allocation: { kind: 'allocated', label: 'Alocado' }, diagnosis: C.diagnoseRow(row, { kind: 'allocated', allocations: ['ALOC-027'] }) }));
  const groups = C.aggregateByGrdt(rows);
  const bytes = await Report.buildWorkbook(rows, { mode: 'events', pending: true, groups });
  const book = new global.ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['Detalhamento']);
  const sheet = book.getWorksheet('Detalhamento');
  assert.equal(sheet.rowCount - 10, 2);
  assert.equal(sheet.getCell('A11').value, C.displayDocument(d[1]));
  assert.equal(sheet.getCell('N11').value, 'Parte da GRDT pendente');
  assert.match(sheet.getCell('O11').value, /2 de 3.*1 confirmado/);
  assert.equal(sheet.getCell('H12').value, 'B');
  assert.equal(sheet.getCell('J12').value, 'Em Workflow');
  assert.equal(sheet.getCell('G11').value, 'Para Construção');
  assert.equal(sheet.getCell('E11').value, '30/09/2026', 'preservar a data original de envio');
  assert.equal(sheet.getRow(10).getCell(5).value, 'Data eGRDT');
  assert.equal(sheet.getRow(10).getCell(13).value, 'Observação');
  assert.equal(sheet.getRow(10).getCell(15).value, 'Detalhamento da pendência');
  assert.equal(sheet.columnCount, 18, '13 colunas originais + 2 de pendência + 3 de rastreabilidade');
  assert.equal(sheet.getRow(10).getCell(16).value, 'Última eGRDT enviada');
  assert.equal(sheet.getRow(10).getCell(17).value, 'Histórico de eGRDTs');
  assert.equal(sheet.getRow(10).getCell(18).value, 'Revisões pendentes');
  assert.equal(sheet.getCell('P11').value, 'GRDT-113');
  const single = new global.ExcelJS.Workbook();
  await single.xlsx.load(await Report.buildWorkbook([rows[1]], { pending: true, groups }));
  assert.match(single.worksheets[0].getCell('O11').value, /2 de 3/, 'filtrar um documento não altera o contexto da GRDT');
  assert.equal(C.pendingScope(C.aggregateByGrdt(rows.slice(1))[0]).label, 'GRDT inteira pendente');
  const onePending = C.aggregateByGrdt([rows[0], rows[1]])[0];
  assert.equal(C.pendingScope(onePending).label, 'Somente este documento pendente');
  assert.equal(C.pendingScope(historicalMissing.groups[0]).label, 'Conferência atual pendente');
  assert.equal(C.pendingScope(null).label, 'GRDT a verificar');
  // Um código reenviado em revisão A e B não pode gerar três linhas.
  const repeated = [
    { ...rows[1], key: 'send-r0', document: d[1], revisionSent: '0', egrdtNumber: 'GRDT-201', generatedAt: '2026-10-01T12:00:00Z', status: C.STATUSES.NOT_FOUND },
    { ...rows[1], key: 'send-ra', document: d[1], revisionSent: 'A', egrdtNumber: 'GRDT-202', generatedAt: '2026-10-02T12:00:00Z', status: C.STATUSES.AWAITING },
    { ...rows[1], key: 'send-rb', document: d[1], revisionSent: 'B', egrdtNumber: 'GRDT-203', generatedAt: '2026-10-03T12:00:00Z', status: C.STATUSES.REVISION_DIVERGENT },
  ];
  const scopes = repeated.map((event) => ({
    ...event, pendingScope: { label: 'GRDT inteira pendente', detail: '1 de 1 documentos/revisões sem confirmação.' },
  }));
  const aggregated = [{
    ...repeated[2], documentIdentity: C.documentIdentity(d[1]), latestEgrdtNumber: 'GRDT-203',
    latestSend: repeated[2], sends: [...repeated].reverse(),
    pendingEvents: scopes.slice().reverse(), status: C.STATUSES.REVISION_DIVERGENT,
  }];
  assert.equal(Report.consolidatePendingDocuments(repeated).length, 1);
  assert.equal(Report.consolidatePendingDocuments(aggregated).length, 1);
  const repeatedFile = new global.ExcelJS.Workbook();
  await repeatedFile.xlsx.load(await Report.buildWorkbook(aggregated, { pending: true, groups: [] }));
  const repeatedSheet = repeatedFile.getWorksheet('Detalhamento');
  assert.equal(repeatedSheet.rowCount - 10, 1, 'pendências repetidas consolidam somente uma linha');
  assert.equal(repeatedSheet.getCell('A11').value, d[1]);
  assert.equal(repeatedSheet.getCell('P11').value, 'GRDT-203');
  assert.match(repeatedSheet.getCell('Q11').value, /GRDT-201/);
  assert.match(repeatedSheet.getCell('Q11').value, /GRDT-202/);
  assert.match(repeatedSheet.getCell('Q11').value, /GRDT-203/);
  assert.equal(repeatedSheet.getCell('R11').value, 'B · A · 0');
  assert.equal(repeatedSheet.getCell('N11').value, 'Múltiplas GRDTs com pendências');
  assert.match(repeatedSheet.getCell('O11').value, /GRDT-201/);
  assert.equal(repeatedSheet.getCell('E11').value, '03/10/2026');
  const full = new global.ExcelJS.Workbook();
  await full.xlsx.load(await Report.buildWorkbook(rows, { mode: 'events', groups }));
  assert.deepEqual(full.worksheets.map(sheet => sheet.name), ['RESUMO', 'RESUMO GRDT', 'DOCUMENTOS POR GRDT', 'PENDENCIAS CONFIRMACAO', 'ALOCACOES A VERIFICAR', 'DOCUMENTOS TRAMITACAO', 'AVALIAR REENVIO']);
  assert.equal(full.worksheets[0].getCell('G11').value, 'Para Cancelamento');
  console.log('posting_conference_intelligent_grdt: XLSX real, propósito e pendências seletivas OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
