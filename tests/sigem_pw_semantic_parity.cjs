"use strict";
const assert=require("node:assert/strict");
const XLSX=require("../xlsx.full.min.js");
const {check}=require("../scripts/sigem-pw-semantic-parity.cjs");
function make({pwColumnSwap=false,actionLabel="Conferir PW",removePw=false,removeDocument=false,extraTab=false}={}){
  const book=XLSX.utils.book_new();
  const heads=Array(32).fill("");
  heads[0]="DOCUMENTO";heads[1]="REVISÃO";heads[2]="TÍTULO";heads[9]="AÇÃO";
  const row=Array(32).fill("");
  row[0]="DOC-SINTETICO-001";row[1]="0";row[2]="Título";row[9]=actionLabel;
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
    Array(32).fill(""),Array(32).fill(""),heads,...(removeDocument?[]:[row])
  ]),"N-1710");
  const pwHeader=Array.from({length:70},(_,i)=>"Atributo-"+i);
  pwHeader[2]="SiglaEmpresa";pwHeader[21]="NumeroDocumentoCliente";pwHeader[23]="RevisaoCompleta";
  const pwRow=Array.from({length:70},(_,i)=>"Valor-"+i);
  pwRow[2]="CSG";pwRow[21]="DOC-SINTETICO-001";pwRow[23]="0";
  if(pwColumnSwap)for(const arr of [pwHeader,pwRow]){const temp=arr[10];arr[10]=arr[11];arr[11]=temp;}
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([pwHeader,...(removePw?[]:[pwRow])]),"REL. PW");
  if(extraTab)XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([["GRCON"],["ATIVOS",1]]),"Resumo");
  return book;
}
const model=make(),adapted=make({pwColumnSwap:true,actionLabel:"Analisar revisão e status",extraTab:true});
let result=check(model,adapted);
assert.equal(result.readyForReview,true,result.blockers.join(" | "));
assert.equal(result.approvedForProduction,false);
assert.equal(result.documentDetail?.missing,0);
assert.equal(result.pwDetail?.missingRows,0);
assert.equal(result.pwDetail?.unexpectedRows,0);
const errors=[
  [make({removePw:true}),/fonte PW original/],
  [make({removeDocument:true}),/universo documento/],
  [make({actionLabel:""}),/sem indicação de providência/]
];
for(const [candidate,pattern] of errors){
  result=check(model,candidate);
  assert.equal(result.readyForReview,false);
  assert.match(result.blockers.join(" | "),pattern);
}
console.log("SIGEM × PW: comparador funcional independente de ordem, ações e abas OK");
