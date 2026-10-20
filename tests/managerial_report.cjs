'use strict';
const assert=require('node:assert/strict'),Report=require('../managerial_report.js'),XLSX=require('../xlsx.full.min.js');
const row={document:'DOC-001',latestSend:{revisionSent:'0',egrdtNumber:'GRDT-20'},newestPending:{statusLabel:'Não encontrado'}};
const data=Report.build([row],{columns:['responsible','note','priority'],contract:'UHDT-D',sourceFile:'Consulta.xlsx',sourceDate:'2026-10-20',taskFor:()=>({responsible:'Qualidade',note:'=HYPERLINK("https://example.test")',priority:'urgente'})});
assert.equal(data.rows.length,1);assert.ok(Report.required.every(k=>data.columns.includes(k)));assert.ok(!data.columns.includes('revision'));
const parsed=XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(Report.csv(data)),{type:'buffer',raw:true}).Sheets.Sheet1,{defval:''});
assert.equal(parsed[0].DOCUMENTO,'DOC-001');assert.equal(parsed[0].CONTRATO,'UHDT-D');assert.equal(parsed[0].RESPONSÁVEL,'Qualidade');assert.ok(parsed[0].OBSERVAÇÃO.startsWith("'="));assert.equal(parsed[0]['BASE CONSULTA GERAL'],'Consulta.xlsx');assert.equal(row.latestSend.revisionSent,'0');
console.log('Relatório gerencial: seleção de colunas, origem obrigatória, filtros recebidos, CSV real e neutralização de fórmulas aprovados.');
