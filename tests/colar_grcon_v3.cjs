"use strict";
const assert = require("node:assert/strict");
const Conference = require("../posting_conference_core.js");
const Report = require("../history_report.js");

const history = (document, revision, at = "2026-10-29T09:00:00") => ({
  egrdtNumber: "0130870-C1O-PGV-G-1900",
  generatedAt: at,
  files: [{document, grdtRevision: revision, ldPrazo: "A1", allocation: "C1O-ALOC-001"}],
});

async function main() {
  const document = "IS-5290.00-22313-955-C1O-001";
  const v2 = Report.colarGrconRowsV2([history(document, "0")]);
  assert.equal(v2[0].length, 6, "Layout legado A:F deve continuar intacto");
  assert.equal(Report.COLAR_GRCON_HEADERS_V3.length, 11);
  assert.deepEqual(Report.COLAR_GRCON_HEADERS_V3.slice(0, 6), Report.COLAR_GRCON_HEADERS_V2);

  const base = {meta:{referenceDate:"2026-10-29",snapshotId:"unit-test"},records:[
    {document,revision:"0",status:"Emitido"},
    {document:"IS-5290.00-22313-955-C1O-003",revision:"B",status:"Emitido"},
  ]};
  const source = [
    history(document, "0"),
    history("IS-5290.00-22313-955-C1O-002", "A"),
    history("IS-5290.00-22313-955-C1O-003", "C"),
  ];
  const rows = await Report.colarGrconRowsV3(source, {conferenceCore: Conference, conferenceBase:base, now:"2026-10-29T09:30:00Z"});
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row[7]), ["SIM", "INDETERMINADO", "INDETERMINADO"]);
  assert.deepEqual(rows.map(row => row[6]), ["POSTADO", "AGUARDANDO CONFIRMAÇÃO", "REVISÃO DIVERGENTE"]);
  assert.equal(rows[2][8], "B", "Não atribuir presença de outra revisão à atual");
  assert.equal(rows[0][9], "2026-10-29");
  assert.equal(rows[0][10], "unit-test");

  const missing = await Report.colarGrconRowsV3(source, {conferenceCore:Conference,conferenceBase:{meta:{},records:[]}});
  assert(missing.every(row => row[6] === "NÃO VERIFICADO" && row[7] === "INDETERMINADO"));

  const stale = await Report.colarGrconRowsV3(source, {conferenceCore:Conference,conferenceBase:base,conferenceBaseStale:true});
  assert(stale.every(row => row[6].includes("BASE DESATUALIZADA") && row[7] === "INDETERMINADO"));

  const latest = await Report.colarGrconRowsV3(
    [history(document,"A","2026-10-29T10:00:00")],
    {conferenceCore:Conference,conferenceBase:base,now:"2026-10-29T11:00:00Z"},
  );
  assert.equal(latest[0][7],"INDETERMINADO","Histórico da revisão anterior não confirma revisão nova");
  console.log("Colar GRCON v3: 11 colunas, contratos legados e evidências SIGEM OK");
}
main().catch(error => {console.error(error);process.exitCode = 1;});
