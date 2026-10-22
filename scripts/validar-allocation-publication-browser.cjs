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
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>GRCON QA</title><link rel="stylesheet" href="/allocation-generator.css"><section><h2>Tabela legada</h2><div class="table-wrap"><table id="legacy-qa"><thead><tr><th>Controle</th></tr></thead><tbody><tr><td>Preservado</td></tr></tbody></table></div></section><div id="grcon-allocation-root"></div><script>${bootstrap}</script><script src="/operation_progress.js"></script><script src="/ui-v3.js"></script><script src="/react-dist/allocation-app.js"></script></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/')return res.end(html);
 if(url.pathname==='/qa/rpc'){
  const {operation,input={}}=await load(req);
  if(operation==='catalog'){const active=storage.filter(b=>b.status==='active');return json(res,200,{bases:storage.filter(b=>b.status!=='pending').map(({rows,...b})=>b),versions:Object.fromEntries(active.map(b=>[b.kind,b.id])),canManage:true});}
  if(operation==='history')return json(res,200,{runs:[]});
  if(operation==='sequence-preview')return json(res,200,{prefix:'',year:2026,nextSequence:null});
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
  const bytes=Buffer.from(XLSX.write(book,{bookType:'xlsx',type:'buffer'}));
  await page.locator('.ag-toolbar input[type=file]').setInputFiles({name:'caminhos-novos.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
  await page.getByText('503 caminhos lidos',{exact:false}).waitFor();
  await page.locator('.ui-v3-table-shell #legacy-qa').waitFor();
  assert.equal(await page.locator('#grcon-allocation-root .ui-v3-table-shell').count(),0,'legacy enhancements must not reparent React tables');
  assert.ok(await page.getByText('0 inconsistências').isVisible());
  await page.getByLabel('Revisão autorizada').fill('B');
  await page.getByRole('button',{name:'Publicar versão conferida'}).click();
  await page.locator('.ag-base-table tbody tr').filter({hasText:'caminhos-novos.xlsx'}).getByText('Ativa',{exact:true}).waitFor({timeout:60000});
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

  // Regression derived from the user's Rev.E workbook structure (synthetic data):
  // first sheet CAPA contains two revision notes with pipes; the actual map is
  // CAMINHO DB_SIGEM_REV.E, column G, with 312 complete folder paths.
  const revE=XLSX.utils.book_new();
  const cover=Array.from({length:19},()=>Array(7).fill(''));
  cover[16][6]='Ver marcação — ALTERAÇÃO (UHDT-X|DATA BOOK C&M|EQUIPAMENTOS|PASTA ANTIGA)';
  cover[17][6]='Incluído Caminho Data Book UHDT-X|DATA BOOK C&M|GERAL|ARQUIVOS';
  XLSX.utils.book_append_sheet(revE,XLSX.utils.aoa_to_sheet(cover),'CAPA');
  XLSX.utils.book_append_sheet(revE,XLSX.utils.aoa_to_sheet([['Orientações para a alocação']]),'ORIENTAÇÕES');
  const official=Array.from({length:354},()=>Array(9).fill(''));
  official[8][6]='CAMINHO NOVO';
  official[9][6]='CAMINHO DATA BOOK (PRÉ-ALOCAÇÃO)';
  const revEPaths=Array.from({length:312},(_,i)=>{
   const unit=i<83?'UHDTD GERAL':i<199?'UHDTD U-32':'UHDTD SE-XX00';
   return unit+'|DATA BOOK C&M|SISTEMA DE QUALIDADE|PASTA '+String(i).padStart(4,'0');
  });
  revEPaths.forEach((p,i)=>{
   const row=i===311?353:10+i;
   official[row][0]=i<83?'GERAL':'U-32';
   official[row][2]='DESCRIÇÃO '+i;
   official[row][4]='SEÇÃO';
   official[row][5]='1.'+(i+1);
   official[row][6]=p;
   official[row][7]='* DOCUMENTOS DO ITEM '+i;
  });
  XLSX.utils.book_append_sheet(revE,XLSX.utils.aoa_to_sheet(official),'CAMINHO DB_SIGEM_REV.E');
  XLSX.utils.book_append_sheet(revE,XLSX.utils.aoa_to_sheet([['ANÁLISE DOCUMENTAL','UHDT-X|DATA BOOK C&M|ANÁLISE|NÃO IMPORTAR']]),'ANÁLISE ET x SIGEM');
  const privateFixture=process.env.GRCON_DATABOOK_FIXTURE_PATH;
  const revEBytes=privateFixture?fs.readFileSync(privateFixture):Buffer.from(XLSX.write(revE,{bookType:'xlsx',type:'buffer'}));
  const supplied=privateFixture?XLSX.read(revEBytes,{type:'buffer'}):null;
  const suppliedRows=supplied?XLSX.utils.sheet_to_json(supplied.Sheets['CAMINHO DB_SIGEM_REV.E'],{header:1,defval:'',raw:false}):null;
  const expectedPaths=suppliedRows?suppliedRows.map(r=>String(r[6]||'').trim()).filter(p=>p.split('|').length>=3):revEPaths;
  await page.locator('.ag-toolbar input[type=file]').setInputFiles({name:'Caminho Data book_Rev.E.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:revEBytes});
  await page.getByText('312 caminhos lidos',{exact:false}).waitFor({timeout:60000});
  assert.ok(await page.getByText('0 inconsistências').isVisible());
  assert.ok(await page.getByText('UHDTD SE-XX00',{exact:false}).first().isVisible(),'keep separate unit paths intact');
  await page.getByLabel('Revisão autorizada').fill('E');
  await page.getByRole('button',{name:'Publicar versão conferida'}).click();
  await page.locator('.ag-base-table tbody tr').filter({hasText:'Caminho Data book_Rev.E.xlsx'}).getByText('Ativa',{exact:true}).waitFor({timeout:60000});
  const activeE=storage.find(x=>x.status==='active');
  assert.equal(activeE.rows.length,312,'do not truncate the official map to the two notes in CAPA');
  assert.deepEqual(activeE.rows.map(r=>r.databook),expectedPaths,'preserve all official folder paths and their exact order');
  assert.equal(activeE.rows[0].rowNumber,11);
  assert.equal(activeE.rows.at(-1).rowNumber,354);
  assert.equal(activeE.rows[0].sourceSheet,'CAMINHO DB_SIGEM_REV.E');
  assert.equal(activeE.rows[0].description,suppliedRows?String(suppliedRows[10][2]).trim():'DESCRIÇÃO 0','use C/D description rather than SEÇÃO label');
  assert.equal(activeE.rows[0].notes,suppliedRows?String(suppliedRows[10][7]).trim():'* DOCUMENTOS DO ITEM 0','preserve documents from column H');
  assert.equal(storage.find(x=>x.id==='upload-1').status,'archived');
  assert.equal(serial,2);
  await page.reload();await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByRole('button',{name:'Bases de referência',exact:true}).click();
  assert.equal(await page.locator('.ag-base-table tbody tr').filter({hasText:'Caminho Data book_Rev.E.xlsx'}).getByText('Ativa',{exact:true}).count(),1);
  assert.deepEqual(errors,[]);
  // Once the contract rule is published, importing a map resolves its
  // templates before preview/publication and retains the original source path.
  storage.push({id:'config-routing',kind:'config',file_name:'Unidades do contrato',revision:'U32 / U39S',status:'active',record_count:1,version:10,rows:[{prefix:'C1O-ALOC-CM',unit:'UHDT-D',units:['UHDTD GERAL','UHDTD U-32','UHDTD U-39S'],unitRouting:'document-U32-U39S'}]});
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await page.locator('.ag-heading button:not(:disabled)').waitFor();
  const routing=XLSX.utils.book_new();XLSX.utils.book_append_sheet(routing,XLSX.utils.aoa_to_sheet([['Descrição','Caminho Databook'],['RIR TUBULAÇÃO','UHDTD U-XX|DATA BOOK C&M|TUBULACAO|RIR TUB E STH'],['RIR TUBULAÇÃO','UHDTD SE-XX00|DATA BOOK C&M|TUBULACAO|RIR TUB E STH'],['PASTA EXCLUSIVA','UHDTD SE-XX00|DATA BOOK C&M|TUBULACAO|PASTA EXCLUSIVA']]),'Caminhos');
  await page.locator('.ag-toolbar input[type=file]').setInputFiles({name:'mapa-unidades.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(routing,{bookType:'xlsx',type:'buffer'}))});
  await page.getByText('3 caminhos lidos',{exact:false}).waitFor();assert.ok(await page.getByText('0 inconsistências').isVisible());
  await page.getByLabel('Revisão autorizada').fill('E · U32/U39S');await page.getByRole('button',{name:'Publicar versão conferida'}).click();
  await page.locator('.ag-base-table tbody tr').filter({hasText:'mapa-unidades.xlsx'}).getByText('Ativa',{exact:true}).waitFor();
  const resolved=storage.find(x=>x.kind==='databook'&&x.status==='active').rows;
  assert.deepEqual(resolved.map(r=>r.documentUnit),['U32','U39S','U32']);assert.ok(resolved.every(r=>!/XX00|U-XX/.test(r.databook)));
  assert.equal(resolved[1].sourceDatabook,'UHDTD SE-XX00|DATA BOOK C&M|TUBULACAO|RIR TUB E STH');assert.ok(resolved[1].databook.startsWith('UHDTD U-39S|'));
  console.log('Allocation publication Chromium: 503-row generic upload and 312-path revisioned Rev.E map (CAPA decoy), source rows, notes, descriptions, integrity, archive and reload passed.');

 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
