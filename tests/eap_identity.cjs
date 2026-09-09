const assert = require("node:assert/strict");

// grcon_utils é carregado antes do core no navegador. O teste reproduz essa
// ordem para validar o guard central de identidade documental.
require("../grcon_utils.js");
require("../core.js");
const Core = globalThis.TriagemCore;

assert.equal(Boolean(Core && Core.__eapIdentityGuarded), true, "guard central de EAP não foi instalado");

const EAP_A = "1.1.1.1";
const EAP_B = "1.1.1.2";
const TAG = "VM-123456";
const SAME_EAP = `C1O_RNEST_U32_${EAP_A}_TUB_REP_${TAG}`;
const OTHER_EAP = `C1O_RNEST_U32_${EAP_B}_TUB_REP_${TAG}`;
const SEARCH_SAME_EAP = `C1O_RNEST_U99_${EAP_A}_TUB_REP_${TAG}`;
const SEARCH_OTHER_EAP = `C1O_RNEST_U99_${EAP_A}_TUB_REP_${TAG}`;
const OTHER_TYPE = `C1O_RNEST_U32_${EAP_A}_TUB_RUFF_${TAG}`;
const N1710 = "MC-5290.00-22313-970-C1O-009";
const CV = "5900.1.1.1-C1O-CV-MEC-001";

function record(document, extra = {}) {
  return {
    document,
    documentKey: Core.key(document),
    revision: "A",
    status: "Não Postado",
    sigemStatus: "Não Postado",
    title: `Título ${document}`,
    grdt: "",
    effectiveDate: "",
    format: "A4",
    discipline: "TUB",
    documentType: "RL",
    purpose: "Para Informação",
    databook: "RNEST|U32|TUB",
    allocationStatus: "ALOCADO",
    allocation: "C1O-ALOC-CM-0001-2026",
    fiscalComment: "",
    sheet: "ET",
    row: 10,
    source: "LD_003.xlsx",
    sourceTimestamp: 100,
    sourceOrder: 0,
    ldVersion: "A",
    ldColumns: [{ header: "TAXONOMIA INTERNA", value: "TAX-EAP-A" }],
    ...extra,
  };
}

// Parser central e validade normativa.
let identity = Core.parseDocumentIdentity(SAME_EAP);
assert.equal(identity.family, "ET");
assert.equal(identity.eap, EAP_A);
assert.equal(identity.eapValid, true);
assert.equal(identity.documentType, "REP");
assert.equal(identity.tagComparable, "VM123456");

for (const invalid of [
  `C1O_RNEST_U32_1.1.1_TUB_REP_${TAG}`,
  `C1O_RNEST_U32_1.1.1.1.1_TUB_REP_${TAG}`,
  `C1O_RNEST_U32_1.1.A.1_TUB_REP_${TAG}`,
  `C1O_RNEST_U32_1111_TUB_REP_${TAG}`,
]) {
  const parsed = Core.parseDocumentIdentity(invalid);
  assert.equal(parsed.family, "ET");
  assert.equal(parsed.eapValid, false, `${invalid} não pode ser normalizado silenciosamente`);
  const validation = Core.validateDocumentCode(invalid, "ET");
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((message) => /EAP/i.test(message)));
}
assert.equal(Core.parseDocumentIdentity(N1710, { sheetName: "N-1710" }).eapApplicable, false, "N-1710 não usa o EAP dos relatórios ET");
assert.equal(Core.parseDocumentIdentity(CV, { sheetName: "CV" }).eapApplicable, false, "CV preserva sua estrutura própria");

// Mesmo código continua válido.
let index = Core.buildIndex([record(SAME_EAP)], []);
let matches = Core.matchDocuments(SAME_EAP, index, "ET");
assert.equal(matches.length, 1);
assert.equal(matches[0].document, SAME_EAP);

// Fallback por tipo+TAG só pode continuar se o EAP for o mesmo.
index = Core.buildIndex([
  record(SAME_EAP, { row: 10 }),
  record(OTHER_EAP, { row: 20, ldColumns: [{ header: "TAXONOMIA INTERNA", value: "TAX-EAP-B" }] }),
], []);
matches = Core.matchDocuments(SEARCH_SAME_EAP, index, "ET");
assert.equal(matches.length, 1, "candidato do outro EAP deve ser descartado antes do desempate");
assert.equal(matches[0].document, SAME_EAP);
assert.equal(Core.parseDocumentIdentity(matches[0].document).eap, EAP_A);

// Mesma TAG + mesmo tipo + outro EAP: não correspondente.
index = Core.buildIndex([record(OTHER_EAP)], []);
matches = Core.matchDocuments(SEARCH_OTHER_EAP, index, "ET");
assert.equal(matches.length, 0);
assert.ok(matches.eapDiagnostics);
assert.equal(matches.eapDiagnostics.rejectedByEap.length, 1);
const lookupMismatch = Core.documentLookup(SEARCH_OTHER_EAP, null, matches);
assert.equal(lookupMismatch.searchResult, "eap-mismatch");
assert.match(lookupMismatch.message, /TAG localizada em outro EAP/i);
assert.match(lookupMismatch.message, new RegExp(EAP_A.replace(/\./g, "\\.")));
assert.match(lookupMismatch.message, new RegExp(EAP_B.replace(/\./g, "\\.")));

// Mesmo EAP + tipo diferente continua não correspondente.
index = Core.buildIndex([record(OTHER_TYPE)], []);
matches = Core.matchDocuments(SEARCH_SAME_EAP, index, "ET");
assert.equal(matches.length, 0, "REP nunca pode casar com RUFF");

// A busca fuzzy não pode transformar uma troca de dígito do EAP em correção.
index = Core.buildIndex([record(OTHER_EAP)], []);
const fuzzy = Core.fuzzyDocumentCandidates(SAME_EAP, index);
assert.equal(fuzzy.length, 0, "uma diferença dentro do EAP não é erro de transcrição aceitável");

// Índices compostos são montados uma vez.
index = Core.buildIndex([record(SAME_EAP), record(OTHER_EAP)], []);
assert.ok(index.byEap instanceof Map);
assert.equal(index.byEap.get(EAP_A).length, 1);
assert.equal(index.byEap.get(EAP_B).length, 1);
assert.ok(index.byEapTypeTag.get(`${EAP_A}::REP::VM123456`));

// Consultas: outro EAP não pode fornecer título/status/linha da LD.
require("../requests_core.js");
const Requests = globalThis.GrconRequestsCore;
index = Core.buildIndex([record(OTHER_EAP, {
  sigemStatus: "Em Workflow",
  title: "TÍTULO QUE NÃO PODE VAZAR",
  ldColumns: [{ header: "TAXONOMIA INTERNA", value: "TAX-ERRADA" }],
})], []);
let requestResult = Requests.lookupDocument(SEARCH_OTHER_EAP, index, { hintedSheet: "ET" });
assert.equal(requestResult.found, false);
assert.match(requestResult.message, /outro EAP/i);
let requestRow = Requests.consultationRow(requestResult);
assert.equal(requestRow.title, "");
assert.equal(requestRow.sigemStatus, "");

// Taxonomia Interna: só a mesma linha escolhida do EAP correto pode alimentar a saída.
const Taxonomy = require("../requests_taxonomy_core.js");
requestResult = Taxonomy.enrichLookupResult(requestResult, index, Core);
assert.equal(requestResult.internalTaxonomy, "");

index = Core.buildIndex([record(SAME_EAP, {
  title: "TÍTULO CORRETO",
  ldColumns: [{ header: "TAXONOMIA INTERNA", value: "TAX-CORRETA" }],
})], []);
requestResult = Requests.lookupDocument(SAME_EAP, index, { hintedSheet: "ET" });
requestResult = Taxonomy.enrichLookupResult(requestResult, index, Core);
assert.equal(requestResult.internalTaxonomy, "TAX-CORRETA");

// triageOne usa uma visão do índice restrita ao EAP e não deixa o fallback
// interno por tipo+TAG reintroduzir o candidato incorreto.
index = Core.buildIndex([record(OTHER_EAP)], []);
const triage = Core.triageOne({
  id: "eap-test",
  document: SEARCH_OTHER_EAP,
  name: `${SEARCH_OTHER_EAP}.pdf`,
  hintedSheet: "ET",
  pdfText: "",
}, index, { now: new Date("2026-09-09T12:00:00Z") });
assert.notEqual(triage.document, OTHER_EAP);
assert.match(triage.reason, /outro EAP/i);

// Conferência Histórico × Consulta Geral: mesmo TAG em outro EAP não confirma
// postagem nem fornece o status SIGEM desse outro documento.
const Conference = require("../posting_conference_core.js");
const parsed = Conference.parseMatrix([
  ["Documento", "Revisão", "Status"],
  [OTHER_EAP, "A", "Em Workflow"],
]);
assert.equal(parsed.ok, true);
const history = [{
  id: "hist-eap",
  clientRecordId: "hist-eap-stable",
  egrdtNumber: "0130870-C1O-PGV-G-0001-2026 - eGRDT",
  generatedAt: "2026-08-01T00:00:00Z",
  files: [{
    document: SAME_EAP,
    revision: "A",
    grdtRevision: "A",
    sheet: "ET",
    discipline: "TUB",
    finalName: `${SAME_EAP}_0001_A.pdf`,
  }],
}];
const conference = Conference.reconcile(history, parsed.records, null, {
  now: "2026-09-09T12:00:00Z",
  waitHours: 48,
});
assert.equal(conference.rows.length, 1);
assert.equal(conference.rows[0].matchedCount, 0);
assert.equal(conference.rows[0].status, Conference.STATUSES.NOT_FOUND);
assert.deepEqual(conference.rows[0].matchedDocuments, []);

// Volume: o índice de identidade é O(n) na montagem e a consulta usa Maps.
const volumeRecords = [];
for (let i = 0; i < 20000; i += 1) {
  volumeRecords.push(record(`C1O_RNEST_U32_1.1.1.1_TUB_REP_VM-${String(i).padStart(6, "0")}`, { row: i + 1 }));
}
const started = Date.now();
index = Core.buildIndex(volumeRecords, []);
matches = Core.matchDocuments("C1O_RNEST_U32_1.1.1.1_TUB_REP_VM-019999", index, "ET");
assert.equal(matches.length, 1);
assert.ok(Date.now() - started < 8000, `índice/consulta EAP 20k excedeu 8s: ${Date.now() - started}ms`);

console.log("eap_identity: ok");
