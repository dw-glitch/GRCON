'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),XLSX=require('../xlsx.full.min.js');
const root=path.resolve(__dirname,'..');
const original='UHDT-D|DATA BOOK C&M|TUBULACAO|ANTIGO';
const paths=Array.from({length:503},(_,i)=>'UHDT-D|DATA BOOK C&M|TUBULACAO|PASTA '+String(i).padStart(4,'0'));
let serial=0,failChunkOnce=true;
const storage=[{id:'original',kind:'databook',file_name:'anterior.xlsx',revision:'A',status:'active',record_count:1,version:1,rows:[{databook:original}]}];
const json=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
const load=async req=>{const b=[];for await(const c of req)b.push(c);return JSON.parse(Buffer.concat(b).toString()||'{}');};
const bootstrap=`window.GrconCloud={state:{session:{user:{id:'admin-qa'},access_token:'synthetic'},membership:{workspace_id:'contract-qa',role:'admin'},online:true,client:{rpc:async(name,args)=>{const r=await fetch('/qa/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args)});const data=await r.json();return r.ok?{data}:{error:{message:data.message}};}}}};`;
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>GRCON QA</title><link rel="stylesheet" href="/allocation-generator.css"><div id="grcon-allocation-root"></div><script>${bootstrap}</script><script src="/operation_progress.js"></script><script src="/react-dist/allocation-app.js"></script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/')return res.end(html);
 if(url.pathname==='/qa/rpc'){
  const {operation,input={}}=await load(req);
  if(operation==='catalog'){const active=storage.filter(b=>b.status==='active');return json(res,200,{bases:storage.filter(b=>b.status!=='pending').map(({rows,...b})=>b),versions:Object.fromEntries(active.map(b=>[b.kind,b.id])),canManage:true});}
  if(operation==='history')return json(res,200,{runs:[]});
  if(operation==='experiences')return json(res,200,{decisions:[]});
  if(operation==='page'){const b=storage.find(b=>b.id===input.id);return json(res,200,{rows:(b?.rows||[]).slice(input.after||0,(input.after||0)+1000).map((payload,i)=>({row_number:(input.after||0)+i+1,payload}))});}
  if(operation==='base-begin'){if(input.expectedActive!==storage.find(b=>b.kind===input.kind&&b.status==='active')?.id)return json(res,409,{message:'Outra versão está ativa'});const id='upload-'+(++serial);storage.push({id,kind:input.kind,file_name:input.fileName,revision:input.revision,status:'pending',record_count:input.count,version:serial+1,rows:[]});return json(res,200,{id});}
  if(operation==='base-chunk'){
   if(failChunkOnce){failChunkOnce=false;return json(res,503,{message:'Failed to fetch (simulated intermittent connection)'});}
   const b=storage.find(x=>x.id===input.id&&x.status==='pending');if(!b)return json(res,409,{message:'Lote inválido'});
   input.rows.forEach((row,i)=>{const n=input.first+i-1;if(b.rows[n]&&JSON.stringify(b.rows[n])!==JSON.stringify(row))throw Error('Repeated row with divergent content');b.rows[n]=row;});
   return json(res,200,{ok:true});
  }
  if(operation==='base-publish'){
   const b=storage.find(x=>x.id===input.id&&x.status==='pending');if(!b||b.rows.length!==b.record_count||b.rows.some(x=>!x))return json(res,409,{message:'Base incompleta'});
   storage.filter(x=>x.kind===b.kind&&x.status==='active').forEach(x=>x.status='archived');b.status='active';return json(res,200,{ok:true,id:b.id});
  }
  return json(res,400,{message:'Operação não suportada no cenário de teste'});
 }
 const relative=decodeURIComponent(url.pathname).slice(1);
 if(relative.includes('..')||!/^((vendor\/recon|workers|react-dist)\/[^.][^]*\.(js|json)|[a-z0-9_.-]+\.(css|js))$/i.test(relative)){res.statusCode=404;return res.end();}
 const file=path.join(root,relative);if(!fs.existsSync(file)){res.statusCode=404;return res.end(relative);}res.setHeader('content-type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 }catch(error){return json(res,500,{message:error.message});}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.GRCON_CHROMIUM_PATH?{executablePath:process.env.GRCON_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await page.getByRole('button',{name:'Bases de referência',exact:true}).click();
  assert.equal(await page.getByText('anterior.xlsx').count(),1);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Descrição','Caminho Databook'],...paths.map((p,i)=>['Descrição '+i,p])]),'Caminhos atualizados');
  const bytes=XLSX.write(book,{bookType:'xlsx',type:'buffer'});
  await page.locator('.ag-toolbar input[type=file]').setInputFiles({name:'caminhos-novos.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
  await page.getByText('503 caminhos lidos',{exact:false}).waitFor();
  assert.ok(await page.getByText('0 inconsistências').isVisible());
  await page.getByLabel('Revisão autorizada').fill('B');
  await page.getByRole('button',{name:'Publicar versão conferida'}).click();
  await page.getByText('caminhos-novos.xlsx').waitFor({timeout:60000});
  await page.getByText('Ativa',{exact:true}).waitFor();
  assert.equal(storage.find(x=>x.status==='active').rows.length,503);
  assert.equal(storage.find(x=>x.id==='original').status,'archived');
  assert.equal(serial,1,'transient chunk failure must not create duplicate upload');
  // A legacy progress operation targeting a React-owned button cannot rewrite its children.
  await page.evaluate(()=>{const button=document.querySelector('.ag-heading button');const op=window.GrconOperations.begin('test-react-dom','Operação QA',{button,silent:true});op.finish();});
  for(let i=0;i<6;i++){await page.getByRole('button',{name:'Gerar alocação',exact:true}).click();await page.getByRole('button',{name:'Bases de referência',exact:true}).click();}
  assert.deepEqual(errors,[],'React must not throw removeChild/NotFoundError');
  await page.reload();await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByRole('button',{name:'Bases de referência',exact:true}).click();
  assert.equal(await page.getByText('caminhos-novos.xlsx').count(),1,'new base survives page refresh');
  assert.equal(await page.getByText('anterior.xlsx').count(),1,'old version is archived, not removed');
  console.log('Allocation publication Chromium: 503-row Excel import, preview, resumable chunk retry, activation, archive, reload, navigation and React DOM integrity passed.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
