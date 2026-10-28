'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd(),versions=[],payloads=new Map();let sequence=0;
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/__rpc'){
   let body='';for await(const part of req)body+=part;
   const {target_workspace,operation,input}=JSON.parse(body);let data;
   if(target_workspace!=='A')data={versions:[],snapshot:null};
   else if(operation==='list')data={versions:versions.filter(v=>v.status!=='pending')};
   else if(operation==='current')data={snapshot:versions.find(v=>v.status==='active')||null};
   else if(operation==='begin'){
    const id='pw-'+(++sequence);versions.push({snapshot_id:id,version:sequence,file_name:input.fileName,
      record_count:input.count,status:'pending',metadata:input.metadata,published_at:new Date().toISOString()});payloads.set(id,[]);data={id};
   }else if(operation==='chunk'){
    input.rows.forEach((row,i)=>payloads.get(input.id)[input.first+i-1]=row);data={ok:true};
   }else if(operation==='publish'){
    versions.forEach(v=>{if(v.status==='active')v.status='archived';if(v.snapshot_id===input.id)v.status='active';});data={id:input.id};
   }else if(operation==='page')data={rows:(payloads.get(input.id)||[]).slice(input.after,input.after+1000).map((payload,i)=>({row_number:input.after+i+1,payload}))};
   else throw Error('RPC de teste inesperada');
   res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({data}));return;
  }
  if(req.url==='/__qa'){res.writeHead(200,{'content-type':'text/html'}).end('<!doctype html><html><body><main></main></body></html>');return;}
  const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'}).end(await fs.promises.readFile(file));
 }catch(error){res.writeHead(500).end(error.message);}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const url='http://127.0.0.1:'+server.address().port,errors=[];
  async function client(role){
   const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url+'/__qa');
   await page.evaluate(role=>{
    window.GrconCloud={state:{online:true,membership:{workspace_id:'A',role},session:{user:{id:role}},
      client:{rpc:async(name,args)=>fetch('/__rpc',{method:'POST',body:JSON.stringify(args)}).then(r=>r.json())}}};
   },role);
   for(const name of ['grcon_utils.js','discipline_resolver.js','core.js','sigem_pw_dashboard_core.js','shared_pw_query_app.js'])await page.addScriptTag({url:url+'/'+name});
   return page;
  }
  const a=await client('owner'),b=await client('operator');
  await a.evaluate(async()=>{
   const records=Array.from({length:2001},(_,i)=>({document:'C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-'+String(i).padStart(6,'0'),revision:'0',state:'Liberado',lastEmission:i%2?'Sim':'Previsto',company:'CSG'}));
   const base=await GrconSigemPwDashboard.savePwBase({meta:{companyColumn:'C',fileName:'PW-1.csv',importedAt:'2026-10-20T10:00:00Z'},records});
   await GrconSharedPwQuery.publish(base);
  });
  const first=await b.evaluate(async()=>{const data=await GrconSigemPwDashboard.loadBases();return {id:data.pw.meta.snapshotId,records:data.pw.records.length,original:data.pw.sourceRecords.length,source:data.pw.meta.source,canPublish:GrconSharedPwQuery.canPublish()};});
  assert.deepEqual(first,{id:'pw-1',records:2001,original:2001,source:'shared-projectwise',canPublish:true});
  assert.equal(await b.evaluate(()=>GrconSharedPwQuery.canEditDate()),false);
  await b.evaluate(async()=>{
   const previous=await GrconSigemPwDashboard.loadPwBase();
   const records=previous.sourceRecords.slice(0,3).map(r=>({...r,revision:'A'}));
   await GrconSharedPwQuery.publish({meta:{companyColumn:'C',fileName:'PW-2.csv',importedAt:'2026-10-21T10:00:00Z'},records});
  });
  const second=await b.evaluate(async()=>{const data=await GrconSigemPwDashboard.loadBases();const historical=await GrconSharedPwQuery.loadSnapshot('pw-1');return {id:data.pw.meta.snapshotId,records:data.pw.records.length,versions:GrconSharedPwQuery.state.versions.length,historical:historical.records.length};});
  assert.deepEqual(second,{id:'pw-2',records:3,versions:2,historical:2001});
  await b.evaluate(()=>{GrconCloud.state.online=false;});
  assert.equal(await b.evaluate(async()=>(await GrconSigemPwDashboard.loadBases()).pw.meta.snapshotId),'pw-2');
  assert.deepEqual(errors,[]);
  console.log('Chromium PW: duas sessões/IndexedDB independentes, publicação, 2.001 linhas, troca de versão, histórico e cache offline aprovados.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
