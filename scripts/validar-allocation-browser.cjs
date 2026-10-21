'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/cloudflare-browser');fs.mkdirSync(out,{recursive:true});
const N=require('../vendor/recon/allocation_normative_rules.js'),unit='UHDT-D',documentCode='C1O_RNEST_U32_10.2.1.2_TUB_RIR_nt-NF-228452-Tubos';
const pathValue='UHDT-D|DATA BOOK C&M|TUBULACAO|RELATORIOS DE INSPECAO';
const bases={databook:[{databook:pathValue,description:'RELATORIO DE INSPECAO DE RECEBIMENTO TUBULACAO'}],eap:[{code:'10.2.1',levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS TAG PRAT OU NAO TAG','10.02.01.H.TUBULACAO']}],norms:N.RULES,config:[{prefix:'C1O-ALOC-CM',unit}]};
let history=[],decisions=[],requests=0;
const versions=Object.fromEntries(Object.keys(bases).map(k=>[k,k+'-v1']));
const catalog=Object.entries(bases).map(([kind,rows],i)=>({id:kind+'-v1',kind,record_count:rows.length,status:'active',revision:'Referência RECON',version:i+1,file_name:kind+'.xlsx'}));
const bootstrap=`window.GrconCloud={state:{session:{user:{id:'operator'},access_token:'synthetic'},membership:{workspace_id:'qa-contract',role:'operator'},online:true,client:{rpc:async(name,args)=>{const r=await fetch('/qa/rpc',{method:'POST',body:JSON.stringify(args)});return {data:await r.json()};}}}};window.GrconTriageUiApi={allocationSources:()=>({records:[{document:${JSON.stringify(documentCode)},documentKey:${JSON.stringify(documentCode)},looseDocumentKey:${JSON.stringify(documentCode)},sheet:'ET',revision:'0',title:'RELATORIO DE INSPECAO DE RECEBIMENTO',discipline:'TUB',source:'LD_001.xlsx',row:2}]})};window.GrconAllocationRegistry={refresh:async()=>{},current:()=>({records:[]})};`;
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>GRCON — Alocação QA</title><link rel="stylesheet" href="/design-system.css"><link rel="stylesheet" href="/legacy-compat.css"><link rel="stylesheet" href="/grcon-ui.css"><link rel="stylesheet" href="/grcon-final.css"><link rel="stylesheet" href="/grcon_cloud.css"><link rel="stylesheet" href="/grcon-responsive.css"><link rel="stylesheet" href="/grcon-version-c.css"><link rel="stylesheet" href="/grcon-version-c-phase2.css"><link rel="stylesheet" href="/grcon-ui-fix.css"><link rel="stylesheet" href="/allocation-generator.css"><style>body{margin:0;background:#f4f7f9;font-family:Arial,sans-serif}</style><div id="grcon-allocation-root"></div><script>${bootstrap}</script><script src="/react-dist/allocation-app.js"></script></html>`;
async function body(req){const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
(async()=>{
 const {validateDecision}=await import('../cloudflare/allocation-ai.mjs');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('content-type','text/html');return res.end(html);}
  if(url.pathname==='/qa/rpc'){
   const {operation,input}=await body(req);let result={};
   if(operation==='catalog')result={bases:catalog,versions,canManage:false};
   if(operation==='history')result={runs:history};
   if(operation==='experiences')result={decisions};
   if(operation==='page'){const kind=input.id.replace('-v1','');result={rows:bases[kind].map((payload,i)=>({row_number:i+1,payload}))};}
   if(operation==='generate'){result={runs:input.groups.map((g,i)=>({id:'run-'+i,allocation_code:'C1O-ALOC-CM-0001-2026',status:'generated',documents:g.documents,files:[],base_versions:versions,created_at:new Date().toISOString()}))};history=result.runs;requests++;}
   if(operation==='run-files'){history.find(r=>r.id===input.id).files=input.files;result={ok:true};}
   if(operation==='run-detail')result=history.find(r=>r.id===input.id);
   res.setHeader('content-type','application/json');return res.end(JSON.stringify(result));
  }
  if(url.pathname==='/api/document-vault/allocation-confirm'){
   const data=await body(req);validateDecision(data,{complete:true,bases,versions});decisions.push({...data,id:'decision-1',trusted:true,current_sources:true});res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok:true,id:'decision-1',trusted:true}));
  }
  if(url.pathname==='/api/document-vault/allocation-ai'){res.statusCode=503;res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok:false,message:'IA indisponível. Use a revisão por regras.'}));}
  const relative=decodeURIComponent(url.pathname).slice(1);if(relative.includes('..')||!/^((vendor\/recon|workers|react-dist)\/[^.][^]*\.(js|json)|[a-z0-9_.-]+\.(css|js))$/i.test(relative)){res.statusCode=404;return res.end();}
  const file=path.join(root,relative);if(!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/javascript');res.end(fs.readFileSync(file));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({ok:false,message:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.GRCON_CHROMIUM_PATH?{executablePath:process.env.GRCON_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  // These files contain multiple dots and must be served to the real Worker.
  for(const asset of ['xlsx.full.min.js','exceljs.min.js','jszip.min.js'])assert.equal((await page.request.get(base+'/'+asset)).status(),200,asset);
  await page.getByLabel('Códigos para alocação').fill(documentCode);await page.getByRole('button',{name:'Analisar alocação',exact:true}).click();await page.getByRole('button',{name:'Revisar sugestão',exact:true}).click();await page.getByRole('dialog').waitFor();
  assert.ok(await page.getByRole('dialog').getByText('Níveis N1 a N10').isVisible());
  await page.getByLabel('Título revisável').fill('RELATORIO DE INSPECAO DE RECEBIMENTO — CORRIGIDO');
  await page.getByRole('button',{name:'Aplicar revisão à prévia'}).click();await page.getByLabel('Justificativa e evidência técnica').fill('Caminho e título conferidos com a base vigente.');
  await page.getByRole('button',{name:'Confirmar decisão revisada'}).click();await page.getByRole('button',{name:'Registrar nova revisão'}).waitFor();
  await page.screenshot({path:path.join(out,'allocation-review-1440.png'),fullPage:true});await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'Conferir pacote',exact:true}).click();await page.getByRole('button',{name:'Baixar pacote de alocação',exact:true}).waitFor();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar pacote de alocação',exact:true}).click();const file=await download;await file.saveAs(path.join(out,'allocation-qa.zip'));assert.equal(requests,1);
  const Zip=require('../jszip.min.js');const zip=await Zip.loadAsync(fs.readFileSync(path.join(out,'allocation-qa.zip')));assert.equal(Object.keys(zip.files).length,3);
  await page.screenshot({path:path.join(out,'allocation-generate-1440.png'),fullPage:true});
  await page.getByRole('button',{name:'Bases de referência',exact:true}).click();assert.equal(await page.getByText('Publicar versão conferida',{exact:true}).count(),0);await page.screenshot({path:path.join(out,'allocation-bases-1440.png'),fullPage:true});
  await page.getByRole('button',{name:'Histórico',exact:true}).click();assert.ok(await page.getByText('Gerada',{exact:true}).isVisible());
  await page.setViewportSize({width:1280,height:800});await page.getByRole('button',{name:'Gerar alocação',exact:true}).click();await page.screenshot({path:path.join(out,'allocation-generate-1280.png'),fullPage:true});
  const layout=await page.evaluate(()=>({table:document.querySelector('.ag-virtual').getBoundingClientRect().bottom,output:document.querySelector('.ag-output').getBoundingClientRect().top}));assert.ok(layout.output>=layout.table,'package actions must not cover document rows');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.evaluate(()=>{window.GrconCloud.state.membership.workspace_id='other';window.dispatchEvent(new CustomEvent('grcon:contract-context-changed'));});assert.equal(await page.getByRole('button',{name:'Revisado',exact:true}).count(),0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'allocation-metrics.json'),JSON.stringify({ok:true,viewports:[1440,1280],downloadFiles:3,serverConfirmed:decisions.length,requests,pageErrors:errors},null,2));console.log('Allocation browser: native UI, actual Worker, manual title correction, server validation, official ZIP, operator permissions, history, desktop widths and contract reset passed.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
