'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),XLSX=require('../xlsx.full.min.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/grdt-identity');fs.mkdirSync(out,{recursive:true});
const doc=n=>'C1O_RNEST_U32_3.1.1.1_INS_RIR_VM-'+n;
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
 ['DOCUMENTO','REVISÃO','TÍTULO','FORMATO','DISCIPLINA','TIPO DE DOCUMENTO','PROPÓSITO','CONFIRMAÇÃO DE ALOCAÇÃO','GRDT','DATA EFETIVA DE EMISSÃO'],
 ...['121','123','124','125'].map(n=>[doc(n),'A','Mesmo título','A4','INSTRUMENTAÇÃO','RIR','Para Informação',n==='125'?'NÃO ALOCADO':'ALOCADO','',''])]),'ET');
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['DOCUMENTO','REVISÃO','STATUS SIGEM'],[doc('121'),'A','Em Workflow'],[doc('124'),'A','Não localizado'],[doc('125'),'A','Não localizado']]),'Colar SIGEM');
const ld=path.join(out,'LD_001.xlsx');fs.writeFileSync(ld,XLSX.write(book,{type:'buffer',bookType:'xlsx'}));const bundle=path.join(out,'pasta-documental');fs.mkdirSync(bundle,{recursive:true});const files=['121','122','123','124','125'].map(n=>{const f=path.join(bundle,doc(n)+'_A.pdf');fs.writeFileSync(f,'%PDF-1.4\n%%EOF');return f;});
const server=http.createServer((req,res)=>{const p=path.join(root,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');try{res.setHeader('content-type',p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.GRCON_CHROMIUM_PATH?{executablePath:process.env.GRCON_CHROMIUM_PATH}:{})});
for(const worker of [true,false]){const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});if(!worker)await context.addInitScript(()=>{window.Worker=undefined;});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.GrconTriageUiApi&&window.GRCONModuleLoader);
 await page.addStyleTag({content:'#grcon-cloud-auth{display:none!important}html.grcon-cloud-pending body > :not(script){visibility:visible!important}'});
 await page.locator('#ld-input').setInputFiles(ld);await page.locator('#pdf-input').setInputFiles(bundle);await page.locator('#analyze').click();
 await page.waitForFunction(()=>document.getElementById('ld-compatibility-drawer').getAttribute('aria-hidden')==='false'||window.GrconTriageUiApi.snapshot().total===5);
 if(await page.locator('#ld-compatibility-drawer').getAttribute('aria-hidden')==='false'){await page.locator('#ld-compatibility-confirm').click();await page.locator('#analyze').click();}
 await page.waitForFunction(()=>window.GrconTriageUiApi.snapshot().total===5&&!window.GrconPerformanceDiagnostics.state().busy).catch(async e=>{console.error(await page.evaluate(()=>({state:window.GrconTriageUiApi.snapshot(),toast:document.getElementById('toast')?.innerText,errors:document.body.innerText.slice(-3000)})),errors);throw e;});
 const rows=await page.evaluate(()=>window.GrconTriageUiApi.filteredIndices().map(i=>{const r=window.GrconTriageUiApi.getResult(i);return {name:r.name,document:r.document,status:r.status,decision:r.decision,record:r.record,selected:window.GrconGrdtTriageQuery.selectionPolicy(r).autoEligible};}));
 const missing=rows.find(r=>r.name.includes('-122_'));assert.notEqual(missing.document,doc('121'));assert.equal(missing.selected,false);assert.equal(Object.keys(missing.record).length,0);
 const unknown=rows.find(r=>r.document===doc('124'));assert.equal(unknown.selected,false);assert.equal(unknown.decision,'revisar');
 assert.equal(await page.locator('#count-unresolved').innerText(),'2');
 assert.equal(await page.locator('#count-blocked').innerText(),'1','não alocado com SIGEM não localizado pertence a NÃO INCLUIR');
 assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.snapshot().groupByStatus),true);assert.equal(await page.locator('#count-ready').innerText(),'1');
 await page.locator('[data-filter=pronto]').click();let visible=await page.locator('#results-body').innerText();assert.match(visible,/-123/);assert.doesNotMatch(visible,/-122|-124/);
 await page.locator('[data-filter=nao_localizado]').click();visible=await page.locator('#results-body').innerText();assert.match(visible,/-122/);assert.match(visible,/-124/);assert.doesNotMatch(visible,/-123|-125/);
 await page.locator('[data-filter=bloqueado]').click();visible=await page.locator('#results-body').innerText();
 assert.match(visible,/-125/);assert.match(visible,/Não incluir/);assert.match(visible,/Não alocado/i);
 assert.doesNotMatch(visible,/-121|-122|-123|-124/);
 const badge=page.locator('#results-body tr.result-row .status-chip').first();
 assert.equal(await badge.innerText(),'Não incluir');
 assert.equal(await badge.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(249, 236, 238)');
 await page.screenshot({path:path.join(out,worker?'worker-not-allocated.png':'legacy-not-allocated.png'),fullPage:true});
 assert.equal(await page.locator('#results-body tr.result-row.ready').count(),0,'unresolved rows never use ready styling');
 await page.screenshot({path:path.join(out,worker?'worker-unresolved.png':'legacy-unresolved.png'),fullPage:true});
 assert.deepEqual(errors,[]);await context.close();}
console.log('GRDT browser worker+legacy: códigos exatos, não alocados em NÃO INCLUIR, cores suaves e filtros consistentes.');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
