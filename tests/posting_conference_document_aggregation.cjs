const assert = require("node:assert/strict");
const R = require("../posting_conference_refinement.js");

const STATUSES = {
  CONFIRMED: "CONFIRMADO",
  AWAITING: "AGUARDANDO",
  REVISION_DIVERGENT: "REVISAO_DIVERGENTE",
  NOT_FOUND: "NAO_ENCONTRADO",
  REVIEW: "REQUER_ANALISE",
  NOT_VERIFIED: "NAO_VERIFICADO",
};

const C = {
  STATUSES,
  norm: (value) => String(value || "").trim().toUpperCase(),
  documentIdentity: (value) => String(value || "").trim().toUpperCase().replace(/_NT-/g, "_"),
  documentKeys(value) { return [this.documentIdentity(value)]; },
  normalizeRevision: (value) => String(value || "").trim().toUpperCase(),
  revisionRank(value) {
    const revision = this.normalizeRevision(value);
    if (revision === "0") return 0;
    if (/^[A-Z]+$/.test(revision)) return [...revision].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) * 1000;
    return -1;
  },
  statusLabel(status) { return status; },
};

const original = {
  ...C,
  filterRows(rows, filters) {
    const f = filters || {};
    return (rows || []).filter((row) => !f.grdt || C.norm(row.egrdtNumber).includes(C.norm(f.grdt)));
  },
  pendingRows(rows) { return (rows || []).filter((row) => row.status !== STATUSES.CONFIRMED); },
  summarize(rows) {
    const source = rows || [];
    return { total: source.length, confirmed: source.filter((row) => row.status === STATUSES.CONFIRMED).length };
  },
};

const W = R.wrapConference(original);

function event(document, revision, egrdtNumber, generatedAt, status = STATUSES.CONFIRMED, extra = {}) {
  return {
    key: extra.key || `${egrdtNumber}-${document}-${revision}-${generatedAt}`,
    document,
    documentIdentity: C.documentIdentity(document),
    searchKeys: C.documentKeys(document),
    revisionSent: revision,
    egrdtNumber,
    generatedAt,
    status,
    statusLabel: C.statusLabel(status),
    conferenceLabel: status === STATUSES.CONFIRMED ? "Postado" : status,
    documentFamily: extra.documentFamily || "ET",
    discipline: extra.discipline || "TUB",
    sigemStatus: extra.sigemStatus || "Em Análise",
    revisionFound: extra.revisionFound || revision,
    note: extra.note || "",
  };
}

// Mesmo documento, três eGRDTs/datas: uma entidade, três envios e duas repostagens.
let events = [
  event("ABC", "B", "0130870-C1O-PGV-G-0100-2026", "2026-08-31T10:00:00Z"),
  event("ABC", "B", "0130870-C1O-PGV-G-0120-2026", "2026-09-03T10:00:00Z"),
  event("ABC", "B", "0130870-C1O-PGV-G-0140-2026", "2026-09-04T10:00:00Z"),
];
let docs = R.buildDocumentAggregates(events, C);
assert.equal(docs.length, 1);
assert.equal(docs[0].sendCount, 3);
assert.equal(docs[0].repostCount, 2);
assert.equal(docs[0].currentRevision, "B");
assert.equal(docs[0].latestEgrdtNumber, "0130870-C1O-PGV-G-0140-2026");
assert.equal(docs[0].latestSendAt, "2026-09-04T10:00:00Z");
assert.deepEqual(docs[0].sends.map((row) => row.egrdtNumber), [
  "0130870-C1O-PGV-G-0140-2026",
  "0130870-C1O-PGV-G-0120-2026",
  "0130870-C1O-PGV-G-0100-2026",
]);
let summary = R.summarizeDocuments(docs, C);
assert.equal(summary.total, 1);
assert.equal(summary.sendCount, 3);
assert.equal(summary.repostCount, 2);
assert.equal(summary.egrdtCount, 3);
assert.equal(summary.confirmed, 1);

// A mesma eGRDT na mesma revisão é duplicidade exata, não repostagem.
events = [
  event("DUP", "A", "G-0200-2026", "2026-09-01T10:00:00Z", STATUSES.AWAITING, { key: "persist-1" }),
  event("DUP", "A", "G-0200-2026", "2026-09-01T10:00:01Z", STATUSES.CONFIRMED, { key: "persist-2" }),
];
docs = R.buildDocumentAggregates(events, C);
assert.equal(docs.length, 1);
assert.equal(docs[0].sendCount, 1);
assert.equal(docs[0].repostCount, 0);
assert.equal(docs[0].exactDuplicateCount, 1);
assert.equal(docs[0].status, STATUSES.CONFIRMED, "a evidência mais forte da duplicata exata deve ser preservada");

// Nova revisão continua sendo o mesmo documento; somente repetição dentro da revisão é repostagem.
events = [
  event("REV", "A", "G-0300-2026", "2026-08-20T10:00:00Z", STATUSES.CONFIRMED),
  event("REV", "B", "G-0350-2026", "2026-09-02T10:00:00Z", STATUSES.REVISION_DIVERGENT),
  event("REV", "B", "G-0370-2026", "2026-09-04T10:00:00Z", STATUSES.AWAITING),
];
docs = R.buildDocumentAggregates(events, C);
assert.equal(docs.length, 1);
assert.equal(docs[0].revisionCount, 2);
assert.equal(docs[0].sendCount, 3);
assert.equal(docs[0].repostCount, 1);
assert.equal(docs[0].currentRevision, "B");
assert.notEqual(docs[0].status, STATUSES.CONFIRMED, "confirmação antiga da revisão A não pode concluir a revisão B atual");

// Confirmação real da revisão atual elimina pendências fantasmas das tentativas anteriores.
events = [
  event("CONF", "B", "G-0400-2026", "2026-08-31T10:00:00Z", STATUSES.NOT_FOUND),
  event("CONF", "B", "G-0420-2026", "2026-09-03T10:00:00Z", STATUSES.NOT_FOUND),
  event("CONF", "B", "G-0440-2026", "2026-09-04T10:00:00Z", STATUSES.CONFIRMED),
];
docs = R.buildDocumentAggregates(events, C);
assert.equal(docs[0].status, STATUSES.CONFIRMED);
assert.equal(W.pendingRows(docs).length, 0);

// Mesmo TAG, EAP diferente continua sendo documento diferente.
const tag = "VM-123456";
events = [
  event(`C1O_RNEST_U32_1.1.1.1_TUB_REP_${tag}`, "A", "G-0500-2026", "2026-09-01T10:00:00Z"),
  event(`C1O_RNEST_U32_1.1.1.2_TUB_REP_${tag}`, "A", "G-0501-2026", "2026-09-01T10:01:00Z"),
];
docs = R.buildDocumentAggregates(events, C);
assert.equal(docs.length, 2);

// Filtro por uma eGRDT histórica encontra a entidade uma única vez.
events = [
  event("FILTER", "A", "G-0600-2026", "2026-09-01T10:00:00Z"),
  event("FILTER", "A", "G-0620-2026", "2026-09-02T10:00:00Z"),
  event("OTHER", "A", "G-0620-2026", "2026-09-02T10:00:00Z"),
];
docs = R.buildDocumentAggregates(events, C);
let filtered = W.filterRows(docs, { grdt: "G-0600" });
assert.equal(filtered.length, 1);
assert.equal(filtered[0].document, "FILTER");
filtered = W.filterRows(docs, { documentList: "FILTER" });
assert.equal(filtered.length, 1);

// A visão Por eGRDT continua operando sobre eventos, não sobre documentos consolidados.
assert.equal(events.length, 3);
assert.equal(new Set(events.map((row) => row.egrdtNumber)).size, 2);

// Volume: consolidação é O(n), baseada em Map por identidade e Map por evento.
const volume = [];
for (let i = 0; i < 5000; i += 1) {
  const document = `DOC-${String(i).padStart(5, "0")}`;
  volume.push(event(document, "A", `G-${i}-1`, "2026-09-01T10:00:00Z"));
  volume.push(event(document, "A", `G-${i}-2`, "2026-09-02T10:00:00Z"));
  volume.push(event(document, "B", `G-${i}-3`, "2026-09-03T10:00:00Z"));
}
const started = Date.now();
docs = R.buildDocumentAggregates(volume, C);
assert.equal(docs.length, 5000);
assert.equal(R.summarizeDocuments(docs, C).sendCount, 15000);
assert.ok(Date.now() - started < 5000, `consolidação 15k eventos excedeu 5s: ${Date.now() - started}ms`);

console.log("posting_conference_document_aggregation: ok");
