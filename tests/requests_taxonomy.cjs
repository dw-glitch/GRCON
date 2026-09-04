const assert = require("node:assert/strict");

const Triagem = require("../core.js");
globalThis.TriagemCore = Triagem;
const RequestsOriginal = require("../requests_core.js");
const ReportOriginal = require("../requests_report.js");
globalThis.GrconRequestsCore = RequestsOriginal;
globalThis.GrconRequestsReport = ReportOriginal;
const Taxonomy = require("../requests_taxonomy_core.js");

const Requests = Taxonomy.wrapRequestsCore(RequestsOriginal, Triagem);
const Report = Taxonomy.wrapReport(ReportOriginal);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function technicalRecord({
  document,
  revision = "A",
  taxonomy = "",
  taxonomyHeader = "Taxonomia Interna",
  includeTaxonomy = true,
  source = "LD_003.xlsx",
  sourceTimestamp = 1000,
  sheet = "ET",
  row = 10,
  title = "TÍTULO CONTROLADO",
  status = "Não Postado",
}) {
  const ldColumns = [
    { header: "Documento", value: document },
    { header: "Título", value: title },
  ];
  if (includeTaxonomy) ldColumns.push({ header: taxonomyHeader, value: taxonomy });
  ldColumns.push({ header: "Revisão", value: revision });
  return {
    document,
    documentKey: Triagem.key(document),
    revision,
    title,
    status,
    sigemStatus: status,
    source,
    sourceTimestamp,
    sheet,
    row,
    allocationStatus: "ALOCADO",
    allocation: "ALOC-0001",
    grdt: "GRDT-TESTE",
    ldColumns,
  };
}

function lookup(records, document) {
  const index = Triagem.buildIndex(records, []);
  const result = Requests.lookupDocument(document, index);
  return { index, result, row: Requests.consultationRow(result) };
}

test("documento normal retorna Taxonomia Interna da linha escolhida", () => {
  const document = "C1O_RNEST_U32_3.1.1.1_TUB_REP_VM-0001";
  const { result, row } = lookup([technicalRecord({ document, taxonomy: "ABC123" })], document);
  assert.equal(result.chosen.row, 10);
  assert.equal(row.internalTaxonomy, "ABC123");
});

test("célula vazia permanece vazia para a UI apresentar travessão", () => {
  const document = "MC-5290.00-22313-970-C1O-009";
  const { row } = lookup([technicalRecord({ document, taxonomy: "", sheet: "N-1710" })], document);
  assert.equal(row.internalTaxonomy, "");
});

test("cabeçalho TAXONOMIA INTERNA em maiúsculas é reconhecido", () => {
  const record = technicalRecord({ document: "MC-5290.00-22313-970-C1O-010", taxonomy: "TX-MAIUSCULA", taxonomyHeader: "TAXONOMIA INTERNA", sheet: "N-1710" });
  assert.equal(Taxonomy.internalTaxonomyFromRecord(record, Triagem), "TX-MAIUSCULA");
});

test("espaços extras e caixa do cabeçalho não alteram a leitura", () => {
  const record = technicalRecord({ document: "MC-5290.00-22313-970-C1O-011", taxonomy: "Tx Exata / 01", taxonomyHeader: "  taxonomia    interna  ", sheet: "N-1710" });
  assert.equal(Taxonomy.internalTaxonomyFromRecord(record, Triagem), "Tx Exata / 01");
});

test("posição da coluna é irrelevante", () => {
  const record = technicalRecord({ document: "MC-5290.00-22313-970-C1O-012", taxonomy: "POS-27", sheet: "N-1710" });
  const taxonomy = record.ldColumns.splice(2, 1)[0];
  record.ldColumns.unshift({ header: "Campo auxiliar", value: "x" });
  record.ldColumns.push(taxonomy);
  assert.equal(Taxonomy.internalTaxonomyFromRecord(record, Triagem), "POS-27");
});

test("LD sem a coluna não gera valor inventado", () => {
  const document = "MC-5290.00-22313-970-C1O-013";
  const { row } = lookup([technicalRecord({ document, includeTaxonomy: false, sheet: "N-1710" })], document);
  assert.equal(row.internalTaxonomy, "");
});

test("duas revisões: Taxonomia acompanha exatamente a ocorrência já eleita", () => {
  const document = "MC-5290.00-22313-970-C1O-014";
  const oldRecord = technicalRecord({ document, revision: "A", taxonomy: "TAX-REV-A", source: "LD_ANTIGA.xlsx", sourceTimestamp: 1000, sheet: "N-1710", row: 20 });
  const newRecord = technicalRecord({ document, revision: "B", taxonomy: "TAX-REV-B", source: "LD_ATUAL.xlsx", sourceTimestamp: 2000, sheet: "N-1710", row: 30 });
  const { result, row } = lookup([oldRecord, newRecord], document);
  assert.equal(result.chosen.ld, "LD_ATUAL.xlsx");
  assert.equal(result.chosen.row, 30);
  assert.equal(row.internalTaxonomy, "TAX-REV-B");
  assert.notEqual(row.internalTaxonomy, "TAX-REV-A");
});

test("ambiguidade real não puxa Taxonomia de nenhuma linha", () => {
  const document = "MC-5290.00-22313-970-C1O-015";
  const first = technicalRecord({ document, revision: "A", taxonomy: "TAX-A", source: "LD.xlsx", sourceTimestamp: 1000, sheet: "N-1710", row: 40, title: "TÍTULO A" });
  const second = technicalRecord({ document, revision: "B", taxonomy: "TAX-B", source: "LD.xlsx", sourceTimestamp: 1000, sheet: "N-1710", row: 41, title: "TÍTULO B" });
  const { result, row } = lookup([first, second], document);
  assert.equal(result.chosen, null);
  assert.equal(row.internalTaxonomy, "");
  assert.equal(row.situation, "Requer validação manual");
});

test("ET localizado pela variante com nt- usa a linha controlada encontrada", () => {
  const ldDocument = "C1O_RNEST_U32_3.1.1.1_TUB_REP_VM-1234";
  const query = "C1O_RNEST_U32_3.1.1.1_TUB_REP_nt-VM-1234";
  const { result, row } = lookup([technicalRecord({ document: ldDocument, taxonomy: "ET-TAX-1234", sheet: "ET" })], query);
  assert.equal(result.ldDocument, ldDocument);
  assert.equal(row.internalTaxonomy, "ET-TAX-1234");
});

test("N-1710 não recebe regra indevida de nt-", () => {
  const document = "DE-5290.00-22313-970-C1O-016";
  const { result, row } = lookup([technicalRecord({ document, taxonomy: "N1710-TAX", sheet: "N-1710" })], document);
  assert.equal(result.lookup.appliesToNtRule, false);
  assert.equal(row.internalTaxonomy, "N1710-TAX");
});

test("consulta em lote mantém uma Taxonomia por documento sem cruzamento", () => {
  const docs = [
    ["MC-5290.00-22313-970-C1O-021", "TX-21"],
    ["MC-5290.00-22313-970-C1O-022", "TX-22"],
    ["MC-5290.00-22313-970-C1O-023", "TX-23"],
  ];
  const records = docs.map(([document, taxonomy], index) => technicalRecord({ document, taxonomy, sheet: "N-1710", row: 100 + index }));
  const index = Triagem.buildIndex(records, []);
  const results = Requests.lookupDocuments(docs.map(([document]) => document), index).map((result) => Requests.consultationRow(result));
  assert.deepEqual(results.map((row) => row.internalTaxonomy), docs.map(([, taxonomy]) => taxonomy));
});

test("valor da Taxonomia não é interpretado ou reconstruído", () => {
  const record = technicalRecord({ document: "MC-5290.00-22313-970-C1O-024", taxonomy: "PW / RIR-3.1.1.1 · Código XyZ", sheet: "N-1710" });
  assert.equal(Taxonomy.internalTaxonomyFromRecord(record, Triagem), "PW / RIR-3.1.1.1 · Código XyZ");
});

test("cabeçalhos duplicados conflitantes não escolhem valor silenciosamente", () => {
  const record = technicalRecord({ document: "MC-5290.00-22313-970-C1O-025", taxonomy: "TX-A", sheet: "N-1710" });
  record.ldColumns.push({ header: "TAXONOMIA INTERNA", value: "TX-B" });
  assert.equal(Taxonomy.internalTaxonomyFromRecord(record, Triagem), "");
});

test("catálogo padrão de cópia/Excel inclui Taxonomia Interna", () => {
  const column = Report.COLUMNS.find((item) => item.key === "internalTaxonomy");
  assert.ok(column);
  assert.equal(column.header, "TAXONOMIA INTERNA");
  const model = Report.BUILTIN_EXPORT_TEMPLATES.find((item) => item.base === "consulta");
  assert.ok(model.columns.some((item) => item.key === "internalTaxonomy"));
});

test("importação de modelo reconhece Taxonomia Interna por caixa e espaços", () => {
  const imported = Report.importExportTemplate("Painel", ["Documento", "  taxonomia   interna "], "consulta");
  assert.ok(imported.template.columns.some((item) => item.key === "internalTaxonomy"));
});

console.log(`\n${passed} testes de Taxonomia Interna passaram.`);
