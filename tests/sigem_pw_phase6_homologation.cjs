"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { performance } = require("node:perf_hooks");
const cache = new Map();
function moduleTs(file) {
  const full = path.resolve(__dirname, "..", file);
  if (cache.has(full)) return cache.get(full).exports;
  const module = {exports:{}};
  cache.set(full,module);
  const transpiled=ts.transpileModule(fs.readFileSync(full,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const localRequire=name=>name.startsWith(".")
    ? moduleTs(path.join(path.dirname(file),name+".ts")):require(name);
  new Function("module","exports","require",transpiled)(module,module.exports,localRequire);
  return module.exports;
}
const {reconcileManagerial}=moduleTs("src/react/sigem-pw/services/sigemPwManagerial.ts");
const {coordinatorPlan}=moduleTs("src/react/sigem-pw/services/sigemPwCoordinatorWorkbook.ts");
const DOCUMENTS=6041, PW_ROWS=29421;
const codeAt=i=>"RL-5290.00-22313-955-C1O-"+String(i).padStart(5,"0");
const refs=Array.from({length:DOCUMENTS},(_,i)=>{
  const code=codeAt(i);
  return {document:code,canonicalDocument:code,documentKey:code,revision:"B",
    documentClass:"N-1710",title:"Documento técnico de homologação",status:i<50?"CANCELADO":"EMITIDO"};
});
const headers=Array.from({length:70},(_,i)=>"Campo "+(i+1));
headers[0]="NumeroDocumentoCliente";headers[1]="o_statename";
headers[2]="Sigla da Empresa";headers[3]="Revisao";headers[4]="Última emissão";
const originals=[],normalizedPw=[];
const emissionByDoc=new Set(),registeredByDoc=new Set();
for(let i=0;i<PW_ROWS;i++){
  const index=i%DOCUMENTS, doc=codeAt(index);
  const rev=["0","A","B","C","D"][Math.floor(i/DOCUMENTS)%5];
  const company=i%11===0?"ABC":i%2?"QTM":"CSG";
  const emitted=i%3===0?"Sim":"Previsto";
  const state=emitted==="Sim"?"Liberado":"Cadastrado";
  const cells=Array(70).fill("");
  cells[0]=doc;cells[1]=state;cells[2]=company;cells[3]=rev;cells[4]=emitted;
  cells[69]="Trace-"+i;
  originals.push({document:doc,documentKey:doc,revision:rev,
    state,lastEmission:emitted,company,sourceRow:i+2,pwRawCells:cells});
  if(company==="ABC")continue;
  normalizedPw.push({document:doc,documentKey:doc,revision:rev,
    state,lastEmission:emitted,company,sourceRow:i+2});
  registeredByDoc.add(doc);
  if(emitted==="Sim")emissionByDoc.add(doc);
}
const normalizedSigem=refs.slice(0,3000).map((ref,i)=>({
  document:ref.document,documentKey:ref.documentKey,revision:"B",
  status:i%7===0?"Com Comentários":i%7===1?"Em análise":"Sem Comentários"
}));
const sigemByDoc=new Set(normalizedSigem.map(x=>x.documentKey));
const state={
  ld:{meta:{fileName:"LD de homologação.xlsx"},records:refs},
  pw:{meta:{fileName:"PW sintético.csv",companyColumn:"C",pwRawHeaders:headers,
    pwRawColumnCount:70,sourceRecordCount:PW_ROWS,
    columns:{document:"NumeroDocumentoCliente",state:"o_statename",
      company:"Sigla da Empresa",revision:"Revisao",lastEmission:"Última emissão"}},
      records:normalizedPw,sourceRecords:originals},
  sigem:{meta:{fileName:"Consulta Geral sintética.xlsx"},records:normalizedSigem},
  model:{normalizedPw,normalizedSigem},
  result:{lists:{sigemN1710OutsideLd:[],pwN1710OutsideLd:[]}},
};
const started=performance.now();
const report=reconcileManagerial(state);
assert.equal(report.ready,true);
assert.equal(report.rows.length,DOCUMENTS);
assert.equal(report.summary.active,DOCUMENTS-50,"documentos únicos em referência");
assert.equal(report.summary.registered,refs.slice(50).filter(x=>registeredByDoc.has(x.documentKey)).length);
assert.equal(report.summary.emitted,refs.slice(50).filter(x=>emissionByDoc.has(x.documentKey)).length);
assert.equal(report.summary.posted,refs.slice(50).filter(x=>sigemByDoc.has(x.documentKey)).length);
assert.ok(report.summary.compliant<=report.summary.posted);
assert.ok(report.summary.pending<=report.summary.active);
const plan=coordinatorPlan(state);
assert.deepEqual(Object.keys(plan.sheets),["Resumo","N-1710","REL. PW"]);
assert.equal(plan.sheets["N-1710"].length,DOCUMENTS+3);
assert.equal(plan.sheets["N-1710"][2].length,32);
assert.equal(plan.sheets["REL. PW"].length,PW_ROWS+1);
assert.equal(plan.sheets["REL. PW"][0].length,70);
assert.equal(plan.sheets["REL. PW"][PW_ROWS].length,70);
assert.ok(plan.sheets.Resumo.length >= 16, "o painel da planilha deve trazer indicadores e proveniência");
assert.equal(plan.formulas.length,DOCUMENTS);
for(const name of ["active","registered","emitted","posted","compliant","pending"]){
  assert.equal(plan.summary[name],report.summary[name],name+" deve ser idêntico ao cartão");
}
for(const index of [0,51,200,1350,3000,6040]){
  const row=plan.sheets["N-1710"][index+3],f=plan.formulas[index];
  assert.equal(row[0],refs[index].document);
  assert.equal(row[9],report.rows[index].action);
  assert.equal(row[5],f.results[0]);
  assert.equal(row[6],f.results[1]);
  assert.ok(!/\b#REF!|\b#VALUE!/.test(f.f+f.g+f.h+f.i));
  if(report.rows[index].pwRegistered){
    const match=f.f.match(/'REL\. PW'!\$[A-Z]+\$(\d+)/);
    assert.ok(match,"fórmula deve citar a linha de origem PW para "+row[0]);
    const source=plan.sheets["REL. PW"][Number(match[1])-1];
    assert.equal(source[0],row[0],"sem cruzar documento de outra revisão ou empresa");
    assert.notEqual(source[2],"ABC","empresa fora do escopo não pode ser evidência");
    assert.equal(source[3],row[5],"a revisão da fórmula deve corresponder à revisão exibida");
    assert.equal(source[1],row[7],"o status da fórmula deve ser da mesma ocorrência");
    assert.equal(source[4],row[8],"a emissão deve pertencer à mesma ocorrência");
  }
}
assert.equal(plan.sheets["REL. PW"][1][69],"Trace-0");
assert.equal(plan.sheets["REL. PW"][PW_ROWS][69],"Trace-"+(PW_ROWS-1));
assert.equal(plan.sheets["REL. PW"][1][2],"ABC","outras empresas permanecem na fonte, nunca nos cartões");
const elapsed=Math.round(performance.now()-started);
const memory=Math.round(process.memoryUsage().heapUsed/1024/1024);
assert.ok(elapsed<120000,"planejador não pode exceder 2 minutos na amostra sintética");
// Bases antigas podem conter documento + revisão sem documentKey persistida.
// A contagem e o vínculo do Excel precisam usar a identidade integral do core.
const legacyCode="RL-5290.00-22313-955-C1O-99999";
const legacyCells=Array(70).fill("");
legacyCells[0]=legacyCode;legacyCells[1]="Liberado";
legacyCells[2]="CSG";legacyCells[3]="B";legacyCells[4]="Sim";
const legacy={
  ld:{meta:{fileName:"Referência histórica"},records:[{
    document:legacyCode,revision:"B",status:"EMITIDO",title:"Fonte antiga"
  }]},
  pw:{meta:{fileName:"PW histórico",companyColumn:"C",pwRawHeaders:headers,pwRawColumnCount:70,
    columns:{state:"o_statename",revision:"Revisao",lastEmission:"Última emissão"}},
    records:[{document:legacyCode,revision:"B",state:"Liberado",lastEmission:"Sim",sourceRow:2}],
    sourceRecords:[{document:legacyCode,revision:"B",sourceRow:2,pwRawCells:legacyCells}]},
  sigem:{meta:{fileName:"SIGEM histórico"},records:[{document:legacyCode,revision:"B",status:"Sem Comentários"}]},
  model:{normalizedPw:[{document:legacyCode,revision:"B",state:"Liberado",lastEmission:"Sim",sourceRow:2}],
    normalizedSigem:[{document:legacyCode,revision:"B",status:"Sem Comentários"}]},
  result:{lists:{sigemN1710OutsideLd:[],pwN1710OutsideLd:[]}},
};
const legacyReport=reconcileManagerial(legacy);
assert.equal(legacyReport.rows.length,1,"historical LD without documentKey is not an empty universe");
assert.equal(legacyReport.summary.active,1);
assert.equal(legacyReport.summary.registered,1);
assert.equal(legacyReport.summary.emitted,1);
assert.equal(legacyReport.summary.posted,1);
assert.equal(legacyReport.summary.compliant,1);
const legacyPlan=coordinatorPlan(legacy);
assert.equal(legacyPlan.formulas.length,1);
assert.match(legacyPlan.formulas[0].f,/'REL\. PW'!\$D\$2/);
assert.equal(legacyPlan.sheets["N-1710"][3][9],"Sem ação necessária");

console.log(JSON.stringify({suite:"sigem-pw-phase6-volume",passed:true,
  referenceDocuments:DOCUMENTS,pwRawRows:PW_ROWS,pwColumns:70,
  dashboardRows:report.rows.length,wbMainRows:plan.sheets["N-1710"].length,
  wbPwRows:plan.sheets["REL. PW"].length,kpis:report.summary,
  elapsedMs:elapsed,heapUsedMiB:memory}));
