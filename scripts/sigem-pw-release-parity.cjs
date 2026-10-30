"use strict";
/**
 * SIGEM × PW Phase 8 — offline, read-only workbook parity audit.
 *
 * NO network, upload, document content logging, publication, or automatic signoff.
 * Usage: node scripts/sigem-pw-release-parity.cjs <official-model.xlsx> <grcon-export.xlsx>
 */
const fs = require("node:fs");
const XLSX = require("../xlsx.full.min.js");

const REQUIRED_SHEETS = Object.freeze(["N-1710", "REL. PW", "SIGEM"]);
const REQUIRED_WIDTHS = Object.freeze({"N-1710":32,"REL. PW":70});
const formulaColumns = Object.freeze(["F","G","H","I"]);
function text(value) {return value == null?"":String(value);}
function normalize(value) {
  return text(value).replace(/\s+/g," ").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toUpperCase();
}
function getValue(sheet,address) {
  const cell = sheet?.[address];
  return cell && cell.v !== undefined ? text(cell.v) : "";
}
function sheetExtent(sheet) {
  const ref = sheet?.["!ref"];
  if(!ref)return {rows:0,cols:0};
  const range=XLSX.utils.decode_range(ref);
  return {rows:range.e.r+1,cols:range.e.c+1};
}
function readWorkbook(path) {
  if(!path || !fs.existsSync(path))throw new Error("Arquivo não encontrado. Forneça o modelo oficial e o Excel exportado pelo GRCON.");
  const stat=fs.statSync(path);
  if(!stat.isFile() || stat.size===0)throw new Error("Arquivo XLSX ausente ou vazio.");
  return XLSX.read(fs.readFileSync(path),{type:"buffer",cellFormula:true,raw:true,cellDates:false});
}
function firstSheetData(sheet,firstRow=4) {
  const extent=sheetExtent(sheet), data=[];
  for(let n=firstRow;n<=extent.rows;n++){
    if(!getValue(sheet,"A"+n).trim())continue;
    data.push(n);
  }
  return data;
}
function getHeader(sheet,row,width) {
  return Array.from({length:width},(_,j)=>getValue(sheet,XLSX.utils.encode_cell({r:row-1,c:j})));
}
function actionLabels(sheet,rows) {
  return [...new Set(rows.map(n=>getValue(sheet,"J"+n)).filter(Boolean).map(normalize))].sort();
}
function inspectWorkbook(book,role) {
  const findings=[];
  const names=book.SheetNames;
  if(JSON.stringify(names)!==JSON.stringify(REQUIRED_SHEETS))
    findings.push(role+": exige exatamente as abas, na ordem N-1710, REL. PW e SIGEM.");
  const main=book.Sheets["N-1710"],pw=book.Sheets["REL. PW"],sigem=book.Sheets["SIGEM"];
  const dimensions={};
  for(const [name,width] of Object.entries(REQUIRED_WIDTHS)){
    const sheet=book.Sheets[name];const d=sheetExtent(sheet);dimensions[name]=d;
    if(!sheet || d.cols!==width)findings.push(role+": aba "+name+" deve ter "+width+" colunas (recebidas "+d.cols+").");
  }
  const sigemData=sigem?XLSX.utils.sheet_to_json(sigem,{header:1,blankrows:false,defval:""}):[];
  if(sigemData.some(row=>row.some(value=>text(value).trim())))
    findings.push(role+": aba SIGEM do modelo não pode ser preenchida artificialmente.");
  const rows=main?firstSheetData(main):[];
  const formulaCounts={F:0,G:0,H:0,I:0},missingFormulas=[];
  // Check every row, but log only aggregate results (no corporate codes).
  for(const row of rows){
    for(const col of formulaColumns){
      if(text(main[col+row]?.f))formulaCounts[col]++;
      else if(missingFormulas.length<5)missingFormulas.push(col+row);
    }
  }
  if(rows.length===0)findings.push(role+": aba N-1710 não contém linhas documentais.");
  if(rows.length && formulaColumns.some(col=>formulaCounts[col]!==rows.length))
    findings.push(role+": há linhas sem fórmulas F:I ("+missingFormulas.length+" primeiros exemplos omitidos por privacidade).");
  const actions=main?actionLabels(main,rows):[];
  return {
    findings,dimensions,recordCount:rows.length,
    formulaCounts,headers:main?getHeader(main,3,32):[],
    pwHeaders:pw?getHeader(pw,1,70):[],
    actions,actionCount:actions.length,
  };
}
function compareBooks(original,candidate) {
  const model=inspectWorkbook(original,"Modelo oficial");
  const grcon=inspectWorkbook(candidate,"Exportação GRCON");
  const blockers=[...model.findings,...grcon.findings];
  if(model.headers.length===32 && grcon.headers.length===32){
    const differences=model.headers.flatMap((h,i)=>normalize(h)!==normalize(grcon.headers[i])?[i+1]:[]);
    if(differences.length)blockers.push("Cabeçalhos N-1710 diferentes nas colunas: "+differences.join(", ")+".");
  }
  if(model.pwHeaders.length===70 && grcon.pwHeaders.length===70){
    const differences=model.pwHeaders.flatMap((h,i)=>text(h)!==text(grcon.pwHeaders[i])?[i+1]:[]);
    if(differences.length)blockers.push("Cabeçalhos REL. PW diferentes nas colunas: "+differences.join(", ")+".");
  }
  const unknownActions=grcon.actions.filter(a=>!model.actions.includes(a));
  if(unknownActions.length)blockers.push("A exportação utiliza "+unknownActions.length+" textos de AÇÃO que não aparecem no modelo.");
  // The original reference contains 12 decision phrases. Preserve the
  // expected cardinality; a different catalogue requires a documented review.
  if(model.actionCount!==12)
    blockers.push("Modelo oficial: esperadas 12 providências distintas na coluna J; encontradas "+model.actionCount+".");
  return {
    readyForWorkbookReview:!blockers.length,
    // Technical equivalence is NOT operational approval or permission to publish.
    approvedForProduction:false,
    model:{dimensions:model.dimensions,recordCount:model.recordCount,actionCount:model.actionCount,formulaCounts:model.formulaCounts},
    grcon:{dimensions:grcon.dimensions,recordCount:grcon.recordCount,actionCount:grcon.actionCount,formulaCounts:grcon.formulaCounts},
    blockers,
    remainingApprovals:[
      "Permissão corporativa explícita para armazenamento/compartilhamento dos 70 campos PW",
      "Validação em Excel corporativo com volume de produção e conferência das fórmulas originais",
      "Revisão visual e funcional final com o coordenador",
      "Todas as verificações CI verdes no commit final de main",
      "Plano de rollback e janela de publicação aprovados"
    ]
  };
}
if(require.main===module){
  const [reference,candidate]=process.argv.slice(2);
  if(!reference||!candidate){
    console.error("USO: node scripts/sigem-pw-release-parity.cjs <LD x PW 2.xlsx> <GRCON_Controle.xlsx>");
    console.error("BLOQUEADO: sem os dois arquivos não é possível autorizar a comparação.");
    process.exitCode=2;
  }else{
    try{
      const report=compareBooks(readWorkbook(reference),readWorkbook(candidate));
      console.log(JSON.stringify(report,null,2));
      if(!report.readyForWorkbookReview)process.exitCode=1;
    }catch(error){console.error("BLOQUEADO: "+error.message);process.exitCode=2;}
  }
}
module.exports={readWorkbook,inspectWorkbook,compareBooks};
