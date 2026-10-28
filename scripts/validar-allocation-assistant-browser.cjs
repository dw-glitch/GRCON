'use strict';
// Real browser, React, Workers, XLSX and mascot runtime. RPC/identity are fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),X=require('../xlsx.full.min.js'),root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','allocation-assistant');
const code=n=>'C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-NF-123-BOBINA-'+n;
const contract='00000000-0000-4000-8000-000000000003';
const headers=['NomeDocumento','Data Prevista','Workflow','Documento Ativo','Ação','Data da Linha Base','Propósito de Emissão Original','Documento Crítico','Observação','Caminho Data Book','N1','N2','N3','N4','N5','N6'];
function fixture(n){const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([headers,[code(n),46322,'OLD WORKFLOW','','INCLUSÃO','','PARA CONSTRUÇÃO','','','UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR','UHDTD U-32','10.SUPRIMENTO','','','','']]),'GERAL');return Buffer.from(X.write(b,{type:'array',bookType:'xlsx'}));}
const context={bases:{databook:[{databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR'}]},versions:{databook:'E'},ldRecords:['121','122'].map((n,i)=>({document:code(n),revision:'0',title:'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE CABO',discipline:'ELE',workflow:'RNEST UHDTD U-32 C&M/ELETRICA',source:'LD.xlsx',sheet:'ELE',row:i+2}))};
const bootstrap=`window.GrconCloud={state:{session:{user:{id:'qa-actor'},access_token:'qa'},membership:{contract_id:'${contract}',workspace_id:'qa-workspace',role:'operator'},client:{rpc:async(name,args)=>({data:await fetch('/rpc',{method:'POST',body:JSON.stringify({name,...args})}).then(r=>r.json())})}}};window.GRCONModuleLoader={ensure:async()=>{}};window.GrconAllocationGeneratorUi={auditContext:async()=>(${JSON.stringify(context)})};`;
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>GRCON Assistente QA</title><link rel="stylesheet" href="/allocation-generator.css"><link rel="stylesheet" href="/allocation-auditor.css"><style>body{font-family:Arial;background:#edf2f5}.topbar{display:flex;height:90px}.primary-button{background:#15546e;color:white;padding:10px 16px;border:0;border-radius:8px}</style><div class="topbar"></div><section hidden><div id="grcon-allocation-auditor-root"></div></section><script>${bootstrap}</script><script src="/allocation_auditor_core.js"></script><script src="/allocation_auditor_assistant.js"></script><script src="/grcon_mascot_controller_v4.js"></script><script src="/react-dist/allocation-auditor-app.js"></script></html>`;
let saved=null,session=null;const events=[];
function rpc(b){const op=b.operation,i=b.input;
 if(b.name==='grcon_allocation_assistant'){
  if(op==='sessions')return {sessions:session?[{id:session.id,revision:session.revision,updated_at:new Date().toISOString(),run_id:saved?.id}]:[]};
  if(op==='session-write'){session={id:i.id,revision:(session?.revision||0)+1,payload:i.payload};return session;}
  if(op==='session-read')return session;
  if(op==='authorize')return {events:[]};
  throw Error('Unexpected assistant op '+op);
 }
 if(op==='history')return {runs:saved?[saved]:[]};
 if(op==='begin'){saved={id:'00000000-0000-4000-8000-000000000099',expected_count:i.count,metadata:i.metadata,created_at:new Date().toISOString()};return {id:saved.id};}
 if(op==='chunk'){saved.rows=saved.rows||[];i.rows.forEach((payload,n)=>saved.rows[i.first+n-1]={payload,row_number:i.first+n});return {ok:true};}
 if(op==='finish'){saved.completed_at=new Date().toISOString();return {ok:true};}
 if(op==='event'){events.push(i.event);return {ok:true};}
 if(op==='detail')return {run:saved,rows:saved.rows.slice(i.after,i.after+200),events};
 throw Error('Unexpected op '+op);
}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}if(url.pathname==='/rpc'){let body='';for await(const chunk of req)body+=chunk;res.setHeader('content-type','application/json');res.end(JSON.stringify(rpc(JSON.parse(body))));return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webm')?'video/webm':file.endsWith('.png')?'image/png':'application/octet-stream');fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.GRCON_CHROMIUM_PATH?{executablePath:process.env.GRCON_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.GrconAllocationAuditorUi);await page.evaluate(()=>window.GrconAllocationAuditorUi.showAssistant());
 const dialog=page.getByRole('dialog',{name:'Assistente de Auditoria'});await dialog.waitFor();
 await dialog.locator('input[type=file]').first().setInputFiles([{name:'C1O-ALOC-CM-0001-2026.xlsx',buffer:fixture('121'),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},{name:'C1O-ALOC-CM-0002-2026.xlsx',buffer:fixture('122'),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}]);
 await dialog.getByText(/Recebi 2 alocação/).waitFor();await dialog.getByLabel('Mensagem para o Assistente de Auditoria').fill('Confira essas alocações com as LDs.');await dialog.getByRole('button',{name:'Enviar',exact:true}).click();await dialog.getByText(/Analisei 2 documentos/).waitFor().catch(async e=>{console.error(await dialog.innerText());console.error(errors);throw e;});
 assert.equal(await dialog.locator('.aac-result strong').innerText(),'2 de 2 documentos analisados');assert.equal(await page.locator('#grcon-context-mascot').count(),1);assert.equal(await dialog.locator('#grcon-context-mascot').count(),1);
 const downloadEvent=page.waitForEvent('download');await dialog.getByRole('button',{name:'Baixar pacote completo',exact:true}).click();const download=await downloadEvent;await download.saveAs(path.join(out,'assistant-synthetic.zip'));
 const zip=await require('../jszip.min.js').loadAsync(fs.readFileSync(path.join(out,'assistant-synthetic.zip')),{checkCRC32:true});const wb=X.read(await zip.file('01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});assert.deepEqual(wb.SheetNames,['RESUMO','DETALHAMENTO']);
 await page.screenshot({path:path.join(out,'assistant-1440.png')});await dialog.getByRole('button',{name:'Fechar conversa'}).click();assert.equal(await page.locator('#grcon-mascot-header-slot #grcon-context-mascot').count(),1);
 await page.evaluate(()=>window.GrconAllocationAuditorUi.showAssistant());await dialog.getByText(/Analisei 2 documentos/).waitFor().catch(async e=>{console.error(await dialog.innerText());console.error(errors);throw e;});
 await page.setViewportSize({width:1280,height:800});await page.screenshot({path:path.join(out,'assistant-1280.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.GrconMascot.show('analyzing',{force:true}));assert.equal(await page.locator('#grcon-context-mascot').getAttribute('data-media'),'png');
 await page.evaluate(()=>window.dispatchEvent(new Event('grcon:contract-context-changed')));await dialog.waitFor({state:'detached'});await page.evaluate(()=>window.GrconAllocationAuditorUi.showAssistant());await dialog.waitFor();assert.equal(await dialog.locator('.aac-result').count(),0);
 const large=X.utils.book_new();const largeRows=Array.from({length:2500},(_,i)=>[code(String(i+1000)),46322,'OLD WORKFLOW','','INCLUSÃO','','PARA CONSTRUÇÃO','','','UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR','UHDTD U-32','10.SUPRIMENTO','','','','']);
 X.utils.book_append_sheet(large,X.utils.aoa_to_sheet([headers,...largeRows]),'GERAL');const largeBytes=Buffer.from(X.write(large,{type:'array',bookType:'xlsx'}));const largeInput={name:'C1O-ALOC-CM-0003-2026.xlsx',buffer:largeBytes,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
 await dialog.locator('input[type=file]').first().setInputFiles(largeInput);await dialog.getByText(/Recebi 1 alocação/).waitFor();await dialog.getByLabel('Mensagem para o Assistente de Auditoria').fill('Auditar');await dialog.getByRole('button',{name:'Enviar',exact:true}).click();
 await page.waitForFunction(()=>{const v=document.querySelector('.aac-progress progress');return v&&v.value>0&&v.value<v.max;});await dialog.getByRole('button',{name:'Pausar análise',exact:true}).click();await dialog.getByText(/Análise pausada em/).waitFor();assert.ok(saved.rows.length>0&&saved.rows.length<2500);const checkpointCount=saved.rows.length;
 await page.reload();await page.waitForFunction(()=>window.GrconAllocationAuditorUi);await page.evaluate(()=>window.GrconAllocationAuditorUi.showAssistant());await dialog.waitFor();await dialog.getByText('Conversas salvas',{exact:true}).click();await dialog.getByRole('button',{name:/^\d{2}\/\d{2}\/\d{4}/}).click();await dialog.getByText(/Conversa recuperada/).waitFor();
 await dialog.locator('.aac-attachments input[type=file]').first().setInputFiles(largeInput);await dialog.getByText(/Recebi 1 alocação/).last().waitFor();await dialog.getByLabel('Mensagem para o Assistente de Auditoria').fill('Retomar análise');await dialog.getByRole('button',{name:'Enviar',exact:true}).click();await dialog.getByText(/Analisei 2500 documentos/).waitFor({timeout:60000});assert.equal(saved.rows.length,2500);assert.ok(saved.completed_at);
 assert.deepEqual(errors,[]);const metrics={browser:await browser.version(),realWorkers:true,realMascotRuntime:true,multiAllocation:true,documents:2,reportSheets:wb.SheetNames,closeReopen:true,checkpointCount,checkpointResume:true,contextReset:true,reducedMotion:true,widths:[1280,1440],pageErrors:errors};fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
