const assert = require('node:assert/strict');
const XLSX = require('../xlsx.full.min.js');
const R = require('../allocation_registry_core.js');
const C = require('../document_allocation_context.js');
const H = require('../history_core.js');
const Core = require('../core.js');
const headers = ['ABA','VERSÃO \nDA LD','DATA DO ENVIO\n DA ALOC','STATUS DA ALOCAÇÃO','ALOCAÇÃO','NomeDocumento','Workflow','Documento Ativo','Caminho Data Book'];
const rows = [[],[],[],[],[],[],headers,
 ['N-1710','E30','01/10/2026','CONCLUÍDA','C1O-ALOC-CM-0001-2026','DOC-0001','Não','Sim','DB'],
 ['N-1710','E31','02/10/2026','FISCAL 01 - AGUARDANDO RETORNO','C1O-ALOC-CM-0002-2026','DOC-0001','Sim','Sim','DB'],
 ['N-1710','','','ALOCAÇÃO RECUSADA','C1O-ALOC-CM-0003-2026','DOC-0002','','Sim','DB'],
 ['','','','','','','','',''],['','','','','','FIM','','','']];
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows),'Central de alocação');
const parsed = R.parseWorkbook(workbook,XLSX);
assert.equal(parsed.count,3);assert.equal(parsed.metadata.headerRow,7);assert.equal(parsed.records[0].sourceRow,8);
const central = {id:'central-1',fileName:'Controle.xlsx',updatedAt:'2026-10-01',index:R.buildIndex(parsed.records)};
const planned = {id:'planned-1',keys:new Set(['DOC-0001'])};
const allocated=C.resolve('DOC-0001',planned,central);
assert.equal(allocated.kind,'allocated');assert.equal(allocated.allocations.length,2);assert.equal(allocated.references.length,2);assert.match(allocated.warnings.join(' '),/mais de uma/);
const missing=C.resolve('DOC-0002',planned,central);assert.equal(missing.kind,'not_allocated');assert.match(missing.warnings.join(' '),/não consta/);
assert.equal(C.resolve('DOC-0003',planned,central).kind,'not_allocated');
assert.equal(C.resolve('',planned,central).kind,'unconfirmed','unidentified vault files cannot be declared not allocated');
assert.equal(C.resolve('DOC-0001',null,central).kind,'unconfirmed','Central alone does not prove allocated');
assert.equal(C.resolve('NT-DOC-0001',planned,central).references.length,2,'identity fallback preserves all occurrences');
const triageRows=[{document:'DOC-0001',allocation:'LD-ALOC'},{document:'DOC-0002',allocation:'LD-ALOC'}];
const projected=C.applyRecords(triageRows,planned,central);
assert.equal(projected[0].allocation,'LD-ALOC','multiple references never choose an arbitrary allocation');
assert.equal(projected[1].allocation,'C1O-ALOC-CM-0003-2026');
assert.equal(C.applyRecords(triageRows,planned,{...central,stale:true})[1].allocation,'LD-ALOC');
assert.equal(C.applyRecords(triageRows,null,central)[1].allocation,'LD-ALOC');
assert.equal(Core.allocationEvidenceState({...projected[1],plannedDocumentsSnapshot:planned.id,allocationStatus:'NÃO ALOCADO'}).kind,'not_allocated');
assert.equal(C.filter(triageRows,'allocated',planned,central).length,1);assert.equal(C.filter(triageRows,'not_allocated',planned,central).length,1);
assert.equal(C.filter(triageRows,'unconfirmed',null,central).length,2);
assert.equal(C.filter(triageRows,'all',planned,central).length,2);
const cleaned=H.cleanRecord({id:'history-1',egrdtNumber:'GRDT-1',files:[{document:'DOC-0001',revision:'0',sharedAllocationContext:allocated}]});
assert.deepEqual(H.cleanRecord(JSON.parse(JSON.stringify(cleaned))).files[0].sharedAllocationContext,cleaned.files[0].sharedAllocationContext);
assert.equal(H.cleanRecord({files:[{document:'DOC-0001'}]}).files[0].sharedAllocationContext,null);
const mergeBook=XLSX.utils.book_new();const merged=XLSX.utils.aoa_to_sheet([headers,rows[7],['','','','','','DOC-0004','','','']]);
merged['!merges']=[{s:{r:1,c:3},e:{r:2,c:3}},{s:{r:1,c:4},e:{r:2,c:4}}];XLSX.utils.book_append_sheet(mergeBook,merged,'Central de alocação');
const mergeResult=R.parseWorkbook(mergeBook,XLSX);assert.equal(mergeResult.records[1].allocation,rows[7][4]);assert.equal(mergeResult.records[1].allocationStatus,rows[7][3]);
assert.throws(()=>R.parseWorkbook({SheetNames:['Solicitações'],Sheets:{}},XLSX),/aba Central/);
const duplicated=XLSX.utils.book_new();XLSX.utils.book_append_sheet(duplicated,XLSX.utils.aoa_to_sheet([[...headers,'Documento'],[...rows[7],'DOC-0001']]),'Central de alocação');
assert.throws(()=>R.parseWorkbook(duplicated,XLSX),/Cabeçalho duplicado/);
if(process.env.GRCON_ALLOCATION_SAMPLE){
 const fs=require('node:fs');const original=XLSX.read(fs.readFileSync(process.env.GRCON_ALLOCATION_SAMPLE),{type:'buffer'});const real=R.parseWorkbook(original,XLSX);
 assert.equal(real.metadata.headerRow,7);assert.equal(real.count,3546);console.log(`Real workbook structure validated: ${real.count} relationships; original file unchanged.`);
}
console.log('Shared allocation: parsing, merged cells, membership, multiple references, vault filters and historical snapshots passed.');
