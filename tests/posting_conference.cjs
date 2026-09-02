const assert = require("node:assert/strict");

function text(v) { return String(v == null ? "" : v).trim(); }
function key(v) { return text(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").toUpperCase().replace(/\s*([_.-])\s*/g, "$1").replace(/\s+/g, " ").trim(); }
function etParts(v) { const k = key(v); const m = k.match(/^([A-Z0-9]{3}_RNEST_[A-Z0-9]+_\d+(?:\.\d+){3}_[A-Z0-9]+_[A-Z0-9][A-Z0-9.-]*_)(.+)$/); return m ? { prefix: m[1], identifier: m[2] } : null; }
function documentSearchKeys(v) { const p = etParts(v); if (!p) return key(v) ? [key(v)] : []; const without = p.identifier.replace(/^NT-/, ""); return [`${p.prefix}${without}`, `${p.prefix}NT-${without}`]; }
function normalizeRevision(v) { return key(v).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, ""); }
function revisionRank(v) { const r = normalizeRevision(v); if (r === "0") return 0; if (/^[A-Z]+$/.test(r)) { let n = 0; for (const c of r) n = n * 26 + c.charCodeAt(0) - 64; return n * 1000; } return -1; }

globalThis.TriagemCore = { key, documentSearchKeys, normalizeRevision, revisionRank, displayDocumentCode: (v) => text(v).replace(/_NT-/i, "_nt-") };
globalThis.GrconHistory = {
  text,
  norm: key,
  cleanRecord: (r) => r,
  generatedRevision: (f) => text(f.grdtRevision || f.revision),
  documentFamily: (f) => { const s = key(f.sheet); if (["ET", "RIR", "C&M"].includes(s)) return "ET"; if (s === "CV") return "CV"; return "N-1710"; },
};
const C = require("../posting_conference_core.js");

function hist(doc, rev, generatedAt = "2026-09-01T12:00:00Z", extra = {}) {
  return [{ id: "r1", clientRecordId: "stable-r1", egrdtNumber: "0130870-C1O-PGV-G-0001-2026 - eGRDT", generatedAt, files: [{ document: doc, revision: rev, grdtRevision: rev, sheet: extra.sheet || "N-1710", discipline: "MEC", finalName: extra.finalName || `${doc}_0001_${rev}.pdf` }] }];
}
function base(doc, rev) { const d = C.displayDocument(doc); return [{ id: `${C.documentIdentity(d)}|${rev}`, document: d, documentIdentity: C.documentIdentity(d), searchKeys: C.documentKeys(d), revision: C.normalizeRevision(rev) }]; }
const NOW = "2026-09-02T12:00:00Z";

let r = C.reconcile(hist("MC-5290.00-22313-970-C1O-009", "B"), base("MC-5290.00-22313-970-C1O-009", "B"), null, { now: NOW });
assert.equal(r.rows[0].status, C.STATUSES.CONFIRMED);
assert.ok(r.rows[0].firstConfirmedAt);

r = C.reconcile(hist("MC-5290.00-22313-970-C1O-009", "B"), base("MC-5290.00-22313-970-C1O-009", "A"), null, { now: NOW });
assert.equal(r.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(r.rows[0].revisionFound, "A");

r = C.reconcile(hist("MC-5290.00-22313-970-C1O-099", "A", "2026-09-02T00:00:00Z"), base("MC-5290.00-22313-970-C1O-009", "A"), null, { now: NOW, waitHours: 48 });
assert.equal(r.rows[0].status, C.STATUSES.AWAITING);
r = C.reconcile(hist("MC-5290.00-22313-970-C1O-099", "A", "2026-08-20T00:00:00Z"), base("MC-5290.00-22313-970-C1O-009", "A"), null, { now: NOW, waitHours: 48 });
assert.equal(r.rows[0].status, C.STATUSES.NOT_FOUND);
assert.match(r.rows[0].note, /não prova/i);

const etWithout = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019";
const etWith = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-SPE-AST-320019";
r = C.reconcile(hist(etWithout, "A", "2026-09-01T00:00:00Z", { sheet: "ET" }), base(etWith, "A"), null, { now: NOW });
assert.equal(r.rows[0].status, C.STATUSES.CONFIRMED);
assert.deepEqual(C.documentKeys("MC-5290.00-22313-970-C1O-009"), ["MC-5290.00-22313-970-C1O-009"]);

r = C.reconcile(hist("MC-5290.00-22313-970-C1O-009", "B", NOW, { finalName: "MC-5290.00-22313-970-C1O-009_0001_RIR.pdf" }), base("MC-5290.00-22313-970-C1O-009", "B"), null, { now: NOW });
assert.equal(r.rows[0].status, C.STATUSES.CONFIRMED);

let matrix = [["Relatório SIGEM"], [], [], [], ["Documento", "Revisão", "Status"], ["DOC-1", "A", "OK"], ["DOC-1", "A", "OK"], ["DOC-1", "B", "OK"]];
let parsed = C.parseMatrix(matrix);
assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 2);
assert.equal(parsed.meta.duplicateCount, 1);

let first = C.reconcile(hist("DOC-2", "A", "2026-09-02T10:00:00Z"), base("OTHER", "A"), null, { now: NOW });
assert.equal(first.rows[0].status, C.STATUSES.AWAITING);
let second = C.reconcile(hist("DOC-2", "A", "2026-09-02T10:00:00Z"), base("DOC-2", "A"), first.state, { now: "2026-09-03T12:00:00Z" });
assert.equal(second.rows[0].status, C.STATUSES.CONFIRMED);
const confirmedAt = second.rows[0].firstConfirmedAt;
let third = C.reconcile(hist("DOC-2", "A", "2026-09-02T10:00:00Z"), base("DOC-2", "A"), second.state, { now: "2026-09-04T12:00:00Z" });
assert.equal(third.rows[0].firstConfirmedAt, confirmedAt);

const multi = [{ id: "r8", clientRecordId: "stable8", egrdtNumber: "0183/2026", generatedAt: "2026-08-20T00:00:00Z", files: [
  { document: "DOC-A", revision: "A", sheet: "N-1710" }, { document: "DOC-B", revision: "B", sheet: "N-1710" }, { document: "DOC-C", revision: "A", sheet: "N-1710" },
] }];
let baseMulti = [...base("DOC-A", "A"), ...base("DOC-B", "A"), ...base("DOC-C", "A")];
r = C.reconcile(multi, baseMulti, null, { now: NOW, waitHours: 48 });
assert.equal(r.groups[0].total, 3);
assert.equal(r.groups[0].confirmed, 2);
assert.equal(r.groups[0].divergent, 1);
assert.equal(r.groups[0].status, C.AGGREGATE_STATUSES.REVIEW);

matrix = [["Consulta Geral"], [], [], [], ["Documento", "Revisão"]];
for (let i = 0; i < 20050; i += 1) matrix.push([`MC-5290.00-22313-970-C1O-${String(i).padStart(5, "0")}`, "A"]);
const start = Date.now();
parsed = C.parseMatrix(matrix);
assert.equal(parsed.records.length, 20050);
const bigHist = [];
for (let i = 0; i < 500; i += 1) bigHist.push({ id: `h${i}`, clientRecordId: `s${i}`, egrdtNumber: `G${i}`, generatedAt: "2026-09-01T00:00:00Z", files: [{ document: `MC-5290.00-22313-970-C1O-${String(i).padStart(5, "0")}`, revision: "A", sheet: "N-1710" }] });
r = C.reconcile(bigHist, parsed.records, null, { now: NOW });
assert.equal(r.summary.confirmed, 500);
assert.ok(Date.now() - start < 8000, `processamento 20k excedeu 8s: ${Date.now() - start}ms`);

const conf = C.reconcile(hist("DOC-H", "A", "2026-08-20T00:00:00Z"), base("DOC-H", "A"), null, { now: "2026-09-01T12:00:00Z" });
const missing = C.reconcile(hist("DOC-H", "A", "2026-08-20T00:00:00Z"), base("OTHER", "A"), conf.state, { now: "2026-09-02T12:00:00Z" });
assert.equal(missing.rows[0].status, C.STATUSES.CONFIRMED);
assert.equal(missing.rows[0].historicalPreserved, true);
assert.equal(missing.rows[0].firstConfirmedAt, conf.rows[0].firstConfirmedAt);

console.log(`posting_conference: 10 cenários OK · 20k em ${Date.now() - start}ms`);
