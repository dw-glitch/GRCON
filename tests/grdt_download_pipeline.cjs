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


// Regression: download coordination must work with the intentionally hidden vault UI.
(async () => {
  const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
  assert.doesNotMatch(html, /id="grdt-save-to-vault"/);
  const start = app.indexOf("  function lockDownloadControls(locked) {");
  const end = app.indexOf('  els.exportFinalPackage.addEventListener("click", exportFinalPackage);', start);
  assert.ok(start >= 0 && end > start, "Download coordinator not found");
  function scenario(options = {}) {
    let click;
    let attempt = 0, errors = 0, renders = 0;
    const element = (disabled = false) => ({ disabled, dataset: {} });
    const first = element(), disabled = element(true);
    const rows = Array.from({ length: options.rows || 2 }, () => element());
    const button = { ...element(), textContent: "Baixar PDFs + eGRDT",
      addEventListener(type, callback) { if (type === "click") click = callback; },
      setAttribute(key, value) { this[key] = value; },
      removeAttribute(key) { delete this[key]; } };
    const status = options.noStatus ? null : { textContent: "Pronto" };
    const els = { selectAllReady: first, exportEgrdt: disabled,
      exportFinalPackage: element(), batchEgrdt: element(),
      egrdtBatchLimit: element(), egrdtBatchMode: element(),
      egrdtBatchSave: element(), saveGrdtToVault: null,
      tbody: options.noTable ? null : { querySelectorAll() { return rows; } },
      exportZip: button };
    const state = { busy: false, cancelled: false, downloadPreparing: false };
    vm.runInNewContext(app.slice(start, end), {
      els, state, document: { getElementById() { return status; } },
      window: { GrconGrdtDownloadProgress: {
        start() { if (options.failProgress) throw Error("progress UI failed"); },
        finish() {} } },
      exportZip: async () => { attempt++; if (options.failExport && attempt === 1) throw Error("export failed"); },
      handleWorkerTaskError() { errors++; },
      renderAll() { renders++; },
      console
    });
    return { els, rows, button, first, disabled, status, state, click: () => click(), get attempt() { return attempt; }, get errors() { return errors; }, get renders() { return renders; } };
  }
  const normal = scenario();
  await normal.click();
  assert.equal(normal.attempt, 1);
  assert.equal(normal.errors, 0);
  assert.equal(normal.first.disabled, false);
  assert.equal(normal.disabled.disabled, true);
  assert.equal(normal.first.dataset.downloadWasDisabled, undefined);
  assert.equal(normal.button["aria-busy"], undefined);
  assert.equal(normal.state.downloadPreparing, false);
  assert.equal(normal.status.textContent, "Pronto");
  const optional = scenario({ noTable: true, noStatus: true });
  await optional.click();
  assert.equal(optional.errors, 0);
  const failed = scenario({ failExport: true });
  await failed.click();
  assert.equal(failed.errors, 1);
  assert.equal(failed.state.downloadPreparing, false);
  assert.equal(failed.first.disabled, false);
  await failed.click();
  assert.equal(failed.attempt, 2, "failed download must allow retry");
  const progress = scenario({ failProgress: true });
  await progress.click();
  assert.equal(progress.errors, 1);
  assert.equal(progress.state.downloadPreparing, false);
  const large = scenario({ rows: 1201 });
  await large.click();
  assert.equal(large.attempt, 1);
  assert.ok(large.rows.every(row => row.disabled === false && row.dataset.downloadWasDisabled === undefined));
  console.log("Download controls: missing vault, recoverable errors, retry, 1201 rows — OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
