const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","sigem_general_query_app.js"),"utf8");
const sandbox={module:{exports:{}},Intl,Map,Set,Date,String,Number,Array,Object,RegExp};
sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox,{filename:"sigem_general_query_app.js"});
const Query=sandbox.module.exports;
const a="PR-5290.00-22313-955-C1O-121";
const b="PR-5290.00-22313-955-C1O-122";
const rows=[
 {document:a,revision:"0",status:"Emitido",title:"Projeto A",discipline:"TUB",sourceRow:2,modifiedAt:"01/10/2026"},
 {document:a,revision:"A",status:"Emitido",title:"Projeto A",discipline:"TUB",sourceRow:3,modifiedAt:"02/10/2026"},
 {document:a,revision:"B",status:"Em análise",title:"Projeto A",discipline:"TUB",sourceRow:4,modifiedAt:"03/10/2026"},
 {document:a,revision:"C",status:"Previsto",title:"Projeto A",discipline:"TUB",sourceRow:5,modifiedAt:"04/10/2026"},
 {document:b,revision:"0",status:"Emitido",title:"Projeto B",discipline:"ELE",sourceRow:6,modifiedAt:"01/10/2026"},
 {document:b,revision:"A",status:"Emitido",title:"Projeto B",discipline:"ELE",sourceRow:7,modifiedAt:"02/10/2026"}
];
const lookup=Query.buildIndex(rows);
function query(extra={}){return Query.run(rows,lookup,{batch:"",code:"",mode:"exact",title:"",revision:"",status:"",discipline:"",search:"",sort:"document",direction:1,view:"all",...extra});}
assert.equal(Query.parseCodes(a+"\n"+b+"\t"+a+";"+b+".pdf").codes.length,2);
assert.equal(Query.parseCodes(a+"\n"+a).duplicates.length,1);
assert.equal(query({batch:b}).rows.length,2,"121 jamais é resultado de 122");
assert.equal(query({batch:b}).rows.every(r=>r.document===b),true);
assert.equal(query({batch:a}).rows.length,4,"todas as revisões devem constar");
assert.equal(query({batch:a}).rows.map(r=>r.revision).join(","),"0,A,B,C");
assert.equal(query({batch:"INEXISTENTE\n"+b}).missing.join(","),"INEXISTENTE");
assert.equal(query({batch:"INEXISTENTE\n"+b}).rows.length,2);
assert.equal(query({batch:a,view:"latest"}).rows[0].revision,"C");
assert.equal(query({batch:a,revision:"A"}).rows.length,1);
assert.equal(query({batch:a,status:"Em análise"}).rows[0].revision,"B");
assert.equal(query({batch:a,title:"Projeto",discipline:"TUB",from:"2026-10-03"}).rows.length,2);
assert.equal(query({batch:a,title:"Projeto",discipline:"TUB",to:"2026-10-02"}).rows.length,2);
assert.equal(query({code:"122",mode:"contains"}).rows.length,2);
assert.equal(query({code:"122",mode:"exact"}).rows.length,0,"correspondência exata por padrão");
assert.equal(query({batch:b,search:"ELE"}).rows.length,2);
assert.equal(query({batch:b,direction:-1,sort:"revision"}).rows[0].revision,"A");
const filtered=query({batch:a+"\n"+b,status:"Emitido",sort:"revision",direction:-1}).rows;
const columns=["revision","document","status"];
const matrix=Query.exportMatrix(filtered,columns);
assert.equal(matrix.length,filtered.length+1);
assert.equal(matrix[0].join("|"),"Revisão|Documento|Status SIGEM");
assert.equal(matrix[1][0],"A");
assert.equal(matrix[1].length,3,"colunas ocultas não podem ser exportadas");
assert.equal(Query.asCsv(matrix).split("\r\n").length,matrix.length);
const duplicated=rows.concat({...rows[0],sourceRow:88});
const duplicateQuery=Query.run(duplicated,Query.buildIndex(duplicated),{batch:a,onlyDuplicate:true,sort:"sourceRow"});
assert.equal(duplicateQuery.rows.length,2,"duplicidades da fonte preservadas");
const malicious=Query.exportMatrix([{document:"=IMPORTXML()",title:"@CMD",revision:"-1"}],["document","title","revision"]);
assert.equal(malicious[1][0],"'=IMPORTXML()");
assert.equal(malicious[1][1],"'@CMD");
assert.equal(malicious[1][2],"'-1");
assert.equal(Query.sourceDate("31/02/2026"),"");
assert.equal(Query.sourceDate("02/10/2026"),"2026-10-02");
const giant=Array.from({length:2000},(_,i)=>({document:"DOC-"+String(i).padStart(5,"0"),revision:"0",status:"Emitido"}));
const full=Query.run(giant,Query.buildIndex(giant),{batch:"",sort:"document"});
assert.equal(full.rows.length,2000,"a exportação deve usar o resultado integral, não a janela virtual");
assert.equal(Query.exportMatrix(full.rows,["document"]).length,2001);
console.log("Consulta Geral: 23 grupos de verificações aprovados.");