"use strict";
const assert=require("node:assert/strict");
const XLSX=require("../xlsx.full.min.js");
const {compareBooks,inspectWorkbook}=require("../scripts/sigem-pw-release-parity.cjs");
const ACTIONS=Array.from({length:12},(_,i)=>"Procedimento "+String(i+1).padStart(2,"0"));
function workbook({headerDifference=false,pwDifference=false,invalidAction=false,missingFormula=false,extraSheet=false}={}){
  const b=XLSX.utils.book_new();
  const row1=Array(32).fill("");row1[0]="CONTROLE";
  const row2=Array(32).fill("");row2[0]="LD";
  const head=Array.from({length:32},(_,i)=>"Coluna "+i);
  if(headerDifference)head[2]="Outra coluna";
  const main=XLSX.utils.aoa_to_sheet([row1,row2,head,
    ...ACTIONS.map((action,i)=>{
      const row=Array(32).fill("");
      row[0]="DOC SINTETICO "+i;row[1]="A";row[9]=invalidAction&&i===1?"Ação indevida":action;
      row[31]="x";return row;
    })]);
  for(let i=0;i<ACTIONS.length;i++){
    const r=i+4;
    for(const col of ["F","G","H","I"]) {
      if(missingFormula&&i===1&&col==="G")continue;
      main[col+r]={t:"s",v:col==="G"?"VERDADEIRO":"A",f:"IFERROR('REL. PW'!$A$2,\"\")"};
    }
  }
  XLSX.utils.book_append_sheet(b,main,"N-1710");
  const ph=Array.from({length:70},(_,i)=>"Campo PW "+i);
  if(pwDifference)ph[2]="Sigla diferente";
  const prow=Array(70).fill("");prow[0]="DOCUMENTO DE TESTE";prow[69]="ATRIBUTO FINAL";
  XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([ph,prow]),"REL. PW");
  XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([]),"SIGEM");
  if(extraSheet)XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([["indevido"]]),"Resumo");
  return b;
}
const model=workbook();
let report=compareBooks(model,workbook());
assert.equal(report.readyForWorkbookReview,true,report.blockers.join(" | "));
assert.equal(report.approvedForProduction,false,"a comparação não autoriza publicar");
assert.equal(report.model.actionCount,12);
assert.deepEqual(report.grcon.formulaCounts,{F:12,G:12,H:12,I:12});
assert.equal(report.grcon.dimensions["N-1710"].cols,32);
assert.equal(report.grcon.dimensions["REL. PW"].cols,70);
for(const [options,expected] of [
  [{headerDifference:true},/Cabeçalhos N-1710/],
  [{pwDifference:true},/Cabeçalhos REL. PW/],
  [{invalidAction:true},/textos de AÇÃO/],
  [{missingFormula:true},/linhas sem fórmulas F:I/],
  [{extraSheet:true},/exatamente as abas/],
]){
  const current=compareBooks(model,workbook(options));
  assert.equal(current.readyForWorkbookReview,false);
  assert.match(current.blockers.join("\n"),expected);
}
const unexpectedActions=compareBooks(workbook({invalidAction:true}),workbook());
assert.equal(unexpectedActions.readyForWorkbookReview,false);
assert.ok(unexpectedActions.blockers.some(b=>/12 providências/.test(b)));
const sum=inspectWorkbook(workbook(),"GRCON");
assert.equal(sum.recordCount,12);
assert.ok(!JSON.stringify(report).includes("DOC SINTETICO"),"auditoria só pode publicar resumos, nunca linhas documentais");
console.log("SIGEM × PW Fase 8: comparação offline F:I, cabeçalhos A:AF/A:BR, 12 ações, 3 abas, bloqueios e aprovação independente OK");
