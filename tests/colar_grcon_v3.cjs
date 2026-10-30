"use strict";
const assert = require("node:assert/strict");
const Conference = require("../posting_conference_core.js");
const Report = require("../history_report.js");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ExcelJS = require("../exceljs.min.js");

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
  assert.equal(rows[0][9].toISOString(), "2026-10-29T00:00:00.000Z");
  assert.equal(rows[0][10], "unit-test");

  const missing = await Report.colarGrconRowsV3(source, {conferenceCore:Conference,conferenceBase:{meta:{},records:[]}});
  assert(missing.every(row => row[6] === "NÃO VERIFICADO" && row[7] === "INDETERMINADO"));

  const stale = await Report.colarGrconRowsV3(source, {conferenceCore:Conference,conferenceBase:base,conferenceBaseStale:true});
  assert(stale.every(row => row[6].includes("BASE DESATUALIZADA") && row[7] === "INDETERMINADO"));
  // O fluxo operacional nunca deve entregar uma planilha inteira como
  // NÃO VERIFICADO se a fonte de conferência não foi carregada.
  await assert.rejects(
    Report.colarGrconRowsV3(source,{conferenceCore:Conference,conferenceBase:{meta:{},records:[]},requireConferenceEvidence:true}),
    /Sem Consulta Geral ativa/,
  );
  await assert.rejects(
    Report.colarGrconRowsV3(source,{conferenceCore:Conference,conferenceBase:base,conferenceBaseStale:true,requireConferenceEvidence:true}),
    /Consulta Geral desatualizada/,
  );
  await assert.rejects(
    Report.colarGrconRowsV3(source,{conferenceCore:Conference,conferenceBase:{meta:{},records:base.records},requireConferenceEvidence:true}),
    /Consulta Geral sem identificador/,
  );
  const conflicted = await Report.colarGrconRowsV3([history(document,"0")],{
    conferenceCore:Conference,
    conferenceBase:{meta:{snapshotId:"conflito",referenceDate:"2026-10-29"},records:[
      {document,revision:"0",status:"Em análise",modifiedAt:"2026-10-29T10:00:00Z"},
      {document,revision:"0",status:"Recusado",modifiedAt:"2026-10-29T10:00:00Z"},
    ]},
    requireConferenceEvidence:true,
  });
  assert.equal(conflicted[0][6],"POSTADO — STATUS SIGEM CONFLITANTE");
  assert.equal(conflicted[0][7],"SIM","Status em conflito não apaga a presença documental");

  const latest = await Report.colarGrconRowsV3(
    [history(document,"A","2026-10-29T10:00:00")],
    {conferenceCore:Conference,conferenceBase:base,now:"2026-10-29T11:00:00Z"},
  );
  assert.equal(latest[0][7],"INDETERMINADO","Histórico da revisão anterior não confirma revisão nova");
  const repost = await Report.colarGrconRowsV3([
    history(document,"0","2026-10-28T09:00:00Z"),
    history(document,"A","2026-10-29T09:00:00Z"),
  ], {conferenceCore:Conference,conferenceBase:base});
  assert.deepEqual(repost.map(row=>row[7]),["SIM","INDETERMINADO"]);
  for (const status of ["Em análise","Em workflow","Recusado"]) {
    const rows=await Report.colarGrconRowsV3([history(document,"0")],{
      conferenceBase:{...base,records:[{document,revision:"0",status}]},
    });
    assert.equal(rows[0][6],`POSTADO — ${status.toUpperCase()}`);
    assert.equal(rows[0][7],"SIM","Presença não significa aprovação");
  }
  const volume=Array.from({length:12000},(_,i)=>history(`${document}-${i}`,"0","2026-10-29T09:00:00Z"));
  const bulk=await Report.colarGrconRowsV3(volume,{conferenceBase:{...base,records:volume.map(r=>({document:r.files[0].document,revision:"0"}))}});
  assert.equal(bulk.length,12000);
  assert(bulk.every(row=>row[7]==="SIM"));

  // Execute the actual browser-worker entry point and every importScripts load.
  // No CommonJS require/global Conference shortcuts are exposed in its realm.
  const scope={console,Date,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,Buffer,setTimeout,clearTimeout,setImmediate};
  scope.self=scope;
  let handler,response;
  scope.addEventListener=(type,fn)=>{if(type==="message")handler=fn;};
  scope.postMessage=message=>{if(message.type==="history-report-result")response=message;};
  const context=vm.createContext(scope);
  scope.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),context,{filename:file}));
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../history_report_worker.js"),"utf8"),context);
  await handler({data:{type:"history-report-build",requestId:"test",records:[history(document,"0")],options:{conferenceBase:base,brandAssets:{}}}});
  assert.equal(response?.ok,true,response?.error);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(response.buffer);
  const paste=workbook.getWorksheet("Colar GRCON v3");
  assert.equal(paste.getCell("G3").value,"POSTADO");
  assert.equal(paste.getCell("H3").value,"SIM");
  assert.equal(paste.getCell("J1").value,1);
  assert.equal(paste.getCell("K1").value,"GRCON_V3");
  assert(paste.getCell("J3").value instanceof Date);
  assert.equal(paste.getCell("J3").numFmt,"dd/mm/yyyy");
  console.log("Colar GRCON v3: 11 colunas, contratos legados e evidências SIGEM OK");
}
main().catch(error => {console.error(error);process.exitCode = 1;});
