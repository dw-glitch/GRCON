const assert=require('node:assert/strict');
const XLSX=require('../xlsx.full.min.js');
const ExcelJS=require('../exceljs.min.js');
const C=require('../posting_conference_core.js');
global.GrconPostingConference=C;global.ExcelJS=ExcelJS;global.GRCONBrandAssets={reportLogoBase64:require("node:fs").readFileSync(require("node:path").join(__dirname,"../grcon-logo-report.png")).toString("base64")};
const Report=require('../posting_conference_report.js');
const Requests=require('../requests_control_core.js');
(async()=>{
 const rows=['100','100','100','101','102','102'].map((id,i)=>({document:'DOC-00'+(i+1),revisionSent:'0',egrdtNumber:'GRDT-'+id,discipline:i<4?'X':'Y',status:'AGUARDANDO'}));
 const summary=C.pendingGrdts(rows);assert.equal(summary.documentCount,6);assert.equal(summary.grdtCount,3);assert.deepEqual(summary.grdts.map(x=>x.grdt),['GRDT-100','GRDT-101','GRDT-102']);
 const missing=C.pendingGrdts([...rows,{document:'DOC-007',egrdtNumber:'',status:'AGUARDANDO'}]);assert.equal(missing.missing,1);assert.equal(missing.grdtCount,3);
 assert.equal(C.pendingGrdts([{egrdtNumber:'sem GRDT'},{egrdtNumber:'não informada'}]).missing,2);
 assert.deepEqual(C.pendingGrdts([{egrdtNumber:'GRDT-100',latestEgrdtNumber:'GRDT-102'}]).grdts.map(x=>x.grdt),['GRDT-102']);
 assert.deepEqual(C.pendingGrdts([{egrdtNumber:'GRDT-10'},{egrdtNumber:'GRDT-2'},{egrdtNumber:'grdt-2'}]).grdts.map(x=>x.grdt),['GRDT-2','GRDT-10']);
 for(const subset of [rows,C.filterRows(rows,{discipline:'X'})]) {
   const buffer=await Report.buildWorkbook(subset,{mode:'documents',pending:true,groups:C.aggregateByGrdt(rows)});
   const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
   assert.deepEqual(book.worksheets.map(x=>x.name),['Detalhamento']);
   assert.equal(book.getWorksheet('Detalhamento').rowCount-10,subset.length);
   assert.equal(book.getWorksheet('Detalhamento').getCell('N11').value,'GRDT inteira pendente');
 }
 const repeats=[
  {document:'DOC-002',revisionSent:'0',generatedAt:'2026-10-01T12:00:00Z',egrdtNumber:'GRDT-100',status:'NAO_ENCONTRADO',key:'rr1'},
  {document:'DOC-002',revisionSent:'A',generatedAt:'2026-10-02T12:00:00Z',egrdtNumber:'GRDT-101',status:'AGUARDANDO',key:'rr2'},
  {document:'DOC-002',revisionSent:'B',generatedAt:'2026-10-03T12:00:00Z',egrdtNumber:'GRDT-102',status:'REVISAO_DIVERGENTE',key:'rr3'},
 ];
 const repeatWorkbook=new ExcelJS.Workbook();
 await repeatWorkbook.xlsx.load(await Report.buildWorkbook(repeats,{pending:true,groups:C.aggregateByGrdt(repeats)}));
 const pendingSheet=repeatWorkbook.getWorksheet('Detalhamento');
 assert.equal(pendingSheet.rowCount-10,1,'mesmo código só ocupa uma linha no relatório de pendências');
 assert.equal(pendingSheet.getCell('P11').value,'GRDT-102');
 assert.match(pendingSheet.getCell('Q11').value,/GRDT-100/);
 assert.match(pendingSheet.getCell('Q11').value,/GRDT-101/);
 assert.match(pendingSheet.getCell('Q11').value,/GRDT-102/);
 assert.equal(pendingSheet.getCell('R11').value,'B · A · 0');
 assert.equal(pendingSheet.getCell('N11').value,'Múltiplas GRDTs com pendências');
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['CONTROLE DE SOLICITAÇÕES'],['Documento','Título','Responsável'],['DOC-001','Ação nº 1','Vinício'],['DOC-001','Outra solicitação','Beatriz'],['','','']]),'Solicitações');
 const records=Requests.parseWorkbook(wb,XLSX);assert.equal(records.length,2);assert.equal(Requests.buildIndex(records).get('DOC-001').length,2);assert.equal(records[0].data.Responsável,'Vinício');assert.equal(records[0].sourceRow,3);
 const prefix='C1O_RNEST_U32_3.8.9.1_TUB_REP_';const ntIndex=Requests.buildIndex([{document:prefix+'nt-VM-320236'},{document:'C1O_RNEST_U32_3.8.9.2_TUB_REP_nt-VM-320236'}]);assert.equal(Requests.find(ntIndex,prefix+'VM-320236').length,1,'same engine NT variants preserve EAP identity');
 console.log('Pending GRDTs + real XLSX round-trip: 6 detail rows/3 unique GRDTs, combined filters, missing identifiers, natural sort, request parsing and accents passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
