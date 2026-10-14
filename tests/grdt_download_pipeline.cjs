"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync(require.resolve("../performance_workers.js"),"utf8");
const start=source.indexOf("  async function preparePackageFiles("),end=source.indexOf("  async function buildPackage(",start);
const prepare=new Function("root",`return (${source.slice(start,end)});`);
(async()=>{
  let running=0,max=0,reads=0;
  const files=Array.from({length:12},(_,id)=>({id}));
  const root={GrconFileAccess:{async read(file){reads++;max=Math.max(max,++running);await new Promise(r=>setTimeout(r,4));running--;return Uint8Array.of(file.id).buffer}}};
  const progress=[];
  const result=await prepare(root)({includeFiles:true,groups:[{entries:[...files,files[0]].map(file=>({file}))}]},p=>progress.push(p));
  assert.equal(reads,12);assert.equal(max,4);assert.equal(result.transfer.length,12);
  assert.equal(result.payload.groups[0].entries[0].file.buffer,result.payload.groups[0].entries[12].file.buffer);
  assert.equal(progress.at(-1).completed,13);
  await assert.rejects(prepare(root)({includeFiles:true,groups:[{entries:[{file:files[0]}]}]},null,{cancelled:()=>true}),/cancelada/);
  assert.equal(reads,12,"cancelamento antes da leitura não inicia trabalho");

  let clock=0;const label={textContent:""},bar={value:0,removeAttribute(){delete this.value},setAttribute(){}},cancel={hidden:true};
  const host={hidden:true,dataset:{},querySelector(selector){return selector==="progress"?bar:selector==="[data-download-cancel]"?cancel:label}};
  const scope={window:{addEventListener(){}},document:{getElementById:()=>host,addEventListener(){}},performance:{now:()=>clock},setInterval:()=>1,clearInterval(){}};
  vm.runInNewContext(fs.readFileSync(require.resolve("../grdt_download_progress.js"),"utf8"),scope);
  const P=scope.window.GrconGrdtDownloadProgress;P.start("Conferindo");assert.equal(host.hidden,false);assert.equal(bar.value,undefined);
  clock=500;P.phase("Arquivos",.5);assert.equal(bar.value,50);clock=1500;P.finish();
  assert.equal(bar.value,100);assert.equal(cancel.hidden,true);clock=4000;assert.equal(P.metrics().elapsedMs,1500,"tempo congelado ao terminar");
  assert.equal(P.metrics().stages.length,2);P.start("Nova tentativa");P.finish("Falha",true);assert.equal(bar.value,0,"falha não deixa animação de carregamento ativa");
  const Layout=require("../package_layout.js");assert.equal(Layout.compressionOptions("D.PDF").compression,"STORE");assert.deepEqual(Layout.compressionOptions("GRDT.xls"),{});
  console.log("Download: 4 leituras, deduplicação, bytes transferidos, cancelamento e progresso real aprovados.");
})().catch(error=>{console.error(error);process.exitCode=1});
