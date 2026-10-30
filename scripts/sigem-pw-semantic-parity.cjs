"use strict";
/**
 * Homologação funcional do SIGEM × PW.
 * O modelo LD x PW 2.xlsx é referência de INFORMAÇÕES, não de layout.
 * Não exige nomes, posições nem quantidade de abas idênticos e não obriga
 * que a coluna AÇÃO repita literalmente o vocabulário do coordenador.
 * Verifica universo documental, atributos originais PW e ações preenchidas.
 * Nenhum código, título ou dado corporativo entra na saída.
 *
 * Uso: node scripts/sigem-pw-semantic-parity.cjs modelo.xlsx exportacao.xlsx
 */
const fs=require("node:fs");
const crypto=require("node:crypto");
const XLSX=require("../xlsx.full.min.js");
const norm=v=>String(v??"").trim().replace(/\s+/g," ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
const plain=v=>v==null?"":String(v);
function read(path){
  if(!path||!fs.existsSync(path))throw Error("Informe modelo original e exportação XLSX gerada a partir das mesmas fontes.");
  return XLSX.read(fs.readFileSync(path),{type:"buffer",raw:true,cellFormula:true});
}
function matrix(book,name){
  const sheet=book.Sheets[name];
  return sheet?XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true,blankrows:false}):[];
}
function widths(row){return Array.isArray(row)?row.length:0;}
function findHeader(book,required,expectedWidth){
  const targets=required.map(norm);
  for(const name of book.SheetNames){
    const sheet=book.Sheets[name];if(!sheet?.["!ref"])continue;
    const range=XLSX.utils.decode_range(sheet["!ref"]);
    const end=Math.min(range.e.r,8);
    for(let r=0;r<=end;r++){
      const headers=Array.from({length:Math.max(expectedWidth,range.e.c+1)},(_,col)=>{
        const cell=sheet[XLSX.utils.encode_cell({r,c:col})];
        return plain(cell?.v);
      });
      const normalized=headers.map(norm);
      if(targets.every(label=>normalized.includes(label)))return {name,row:r,headers};
    }
  }
  return null;
}
function indexHeaders(headers){
  // Duplicate source column names are legitimate: distinguish occurrence.
  const occurrences=new Map();
  return headers.map((value,index)=>{
    const key=norm(value),next=(occurrences.get(key)||0)+1;
    occurrences.set(key,next);
    return {key:key+"#"+next,index};
  });
}
function rowHashes(rows,order){
  const counts=new Map();
  for(const row of rows){
    const values=order.map(col=>plain(row[col]??""));
    const fingerprint=crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
    counts.set(fingerprint,(counts.get(fingerprint)||0)+1);
  }
  return counts;
}
function compareHashes(a,b){
  let missing=0,unexpected=0;
  for(const [k,v] of a)missing+=Math.max(0,v-(b.get(k)||0));
  for(const [k,v] of b)unexpected+=Math.max(0,v-(a.get(k)||0));
  return {missing,unexpected};
}
function documentRows(book,meta){
  const rows=matrix(book,meta.name);
  const headers=rows[meta.row]||[];
  const positions=headers.map(norm);
  const code=positions.indexOf("DOCUMENTO");
  const rev=positions.indexOf("REVISAO");
  const title=positions.indexOf("TITULO");
  const action=positions.indexOf("ACAO");
  const keyed=new Map();let duplicates=0,blankActions=0;
  for(const row of rows.slice(meta.row+1)){
    const doc=norm(row[code]);if(!doc)continue;
    const key=doc+"|"+norm(row[rev]);
    if(keyed.has(key))duplicates++;
    else keyed.set(key,{title:title>=0?norm(row[title]):"",action:action>=0?norm(row[action]):""});
    if(action>=0&&!norm(row[action]))blankActions++;
  }
  return {records:keyed,duplicates,blankActions,hasAction:action>=0};
}
function check(model,candidate){
  const blockers=[],warnings=[];
  const mMain=findHeader(model,["DOCUMENTO","REVISÃO","AÇÃO"],11);
  const cMain=findHeader(candidate,["DOCUMENTO","REVISÃO","AÇÃO"],11);
  if(!mMain||!cMain)blockers.push("Cabeçalhos documentais essenciais ausentes (documento, revisão, ação).");
  let documentDetail=null;
  if(mMain&&cMain){
    const m=documentRows(model,mMain),c=documentRows(candidate,cMain);
    let missing=0,unexpected=0,titleDifferences=0;
    for(const [key,item] of m.records){
      if(!c.records.has(key)){missing++;continue;}
      if(item.title&&c.records.get(key).title&&item.title!==c.records.get(key).title)titleDifferences++;
    }
    for(const key of c.records.keys())if(!m.records.has(key))unexpected++;
    documentDetail={reference:m.records.size,exported:c.records.size,missing,unexpected,
      duplicateKeysReference:m.duplicates,duplicateKeysExported:c.duplicates,blankActions:c.blankActions,titleDifferences};
    if(missing||unexpected)blockers.push("Diferenças no universo documento + revisão. Compare usando as mesmas fontes ativas.");
    if(c.duplicates)warnings.push("Existem códigos e revisões repetidos no controle exportado.");
    if(c.blankActions)blockers.push("Há documentos sem indicação de providência.");
    if(titleDifferences)warnings.push("Existem títulos diferentes; confira alterações recentes na fonte.");
  }
  const mPw=findHeader(model,["NumeroDocumentoCliente","SiglaEmpresa","RevisaoCompleta"],70);
  const cPw=findHeader(candidate,["NumeroDocumentoCliente","SiglaEmpresa","RevisaoCompleta"],70);
  let pwDetail=null;
  if(!mPw||!cPw)blockers.push("A fonte PW com os campos essenciais não foi localizada.");
  else{
    const originalHeaders=indexHeaders(mPw.headers.slice(0,70));
    const outputHeaders=indexHeaders(cPw.headers.slice(0,70));
    const target=new Map(outputHeaders.map(x=>[x.key,x.index]));
    const missingHeaders=originalHeaders.filter(x=>!target.has(x.key)).length;
    const extraHeaders=outputHeaders.filter(x=>!originalHeaders.some(v=>v.key===x.key)).length;
    if(missingHeaders||extraHeaders)blockers.push("Atributos da fonte PW alterados ou omitidos.");
    const a=matrix(model,mPw.name).slice(mPw.row+1).filter(row=>row.some(x=>plain(x).trim()));
    const b=matrix(candidate,cPw.name).slice(cPw.row+1).filter(row=>row.some(x=>plain(x).trim()));
    let diff={missing:0,unexpected:0};
    if(!missingHeaders&&!extraHeaders){
      const originalOrder=originalHeaders.map(x=>x.index);
      const outputOrder=originalHeaders.map(x=>target.get(x.key));
      diff=compareHashes(rowHashes(a,originalOrder),rowHashes(b,outputOrder));
      if(diff.missing||diff.unexpected)blockers.push("Diferenças nos valores ou linhas da fonte PW original.");
    }
    pwDetail={columnsOriginal:originalHeaders.length,columnsExported:outputHeaders.length,
      rowsOriginal:a.length,rowsExported:b.length,missingAttributes:missingHeaders,
      unexpectedAttributes:extraHeaders,missingRows:diff.missing,unexpectedRows:diff.unexpected};
    if(originalHeaders.length!==70||outputHeaders.length!==70)blockers.push("A fonte original PW possui 70 atributos; nenhum deve ser omitido.");
  }
  return {readyForReview:blockers.length===0,approvedForProduction:false,
    reviewScope:"conteúdo funcional; ordem visual, fórmulas e textos de ação podem diferir",
    documentDetail,pwDetail,blockers,warnings};
}
if(require.main===module){
  try{const result=check(read(process.argv[2]),read(process.argv[3]));
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if(!result.readyForReview)process.exitCode=1;
  }catch(e){console.error("Validação não concluída: "+e.message);process.exitCode=2;}
}
module.exports={check,findHeader,indexHeaders};
