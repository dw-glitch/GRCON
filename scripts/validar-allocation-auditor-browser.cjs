'use strict';
// Real compiled React + browser Worker + XLSX/ZIP, with synthetic contract/RPC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts', 'cloudflare-browser');
const code = n => 'C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-NF-123-BOBINA-' + n;
const fixture = {
  bases: {databook: [{databook: 'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR'}]},
  versions: {databook: 'E'},
  ldRecords: ['121','122'].map((n,i) => ({document:code(n),revision:'0',
    title:'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE CABO',workflow:'WF',source:'LD.xlsx',sheet:'ELE',row:i+2}))
};
const bootstrap = `window.GrconCloud={state:{session:{user:{id:'synthetic-actor'},access_token:'synthetic'},membership:{contract_id:'00000000-0000-4000-8000-000000000003',workspace_id:'synthetic-workspace',role:'operator'},client:{rpc:async()=>({data:{runs:[]}})}}};window.GRCONModuleLoader={ensure:async name=>{if(name!=='react-dist/allocation-app.js')throw Error('Unexpected module');}};window.GrconAllocationGeneratorUi={auditContext:async()=>(${JSON.stringify(fixture)})};`;
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Auditor QA</title><link rel="stylesheet" href="/design-system.css"><link rel="stylesheet" href="/allocation-generator.css"><link rel="stylesheet" href="/allocation-auditor.css"><section id="allocation-auditor-module"><div id="grcon-allocation-auditor-root"></div></section><script>${bootstrap}</script><script src="/allocation_auditor_core.js"></script><script src="/react-dist/allocation-auditor-app.js"></script></html>`;
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (pathname === '/') {res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  fs.mkdirSync(out,{recursive:true});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,...(process.env.GRCON_CHROMIUM_PATH?{executablePath:process.env.GRCON_CHROMIUM_PATH}: {})});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByRole('heading',{name:'Auditor de Alocações',exact:true}).waitFor();
    await page.evaluate(()=>window.GrconAllocationAuditorUi.activate());
    await page.getByRole('button',{name:'Selecionar documentos da LD',exact:true}).click();
    await page.getByText(/2 documentos ·/).waitFor();
    await page.getByRole('button',{name:'Auditar alocação',exact:true}).click();
    await page.locator('tbody tr').nth(1).waitFor();
    assert.equal(await page.locator('tbody tr').count(),2);
    assert.match(await page.locator('body').innerText(),/Verificações inconclusivas/);
    const all=page.getByRole('checkbox',{name:'Selecionar todos os resultados filtrados',exact:true});
    assert.ok(await all.isChecked());await all.uncheck();assert.equal(await all.isChecked(),false);await all.check();
    await page.getByLabel('Código exato',{exact:true}).check();
    await page.getByLabel('Buscar código ou título',{exact:true}).fill(code('122'));
    await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===1);
    assert.match(await page.locator('tbody tr').innerText(),/122/);
    assert.doesNotMatch(await page.locator('tbody tr').innerText(),/121/);
    await page.getByRole('button',{name:'Revisar',exact:true}).click();
    await page.getByRole('region',{name:'Detalhes da auditoria',exact:true}).waitFor();
    await page.getByLabel('Valor proposto',{exact:true}).fill('RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE CABO — CONFERIR BOBINA 122');
    await page.getByLabel('Justificativa',{exact:true}).fill('Sugestão sintética para conferência humana.');
    await page.getByRole('button',{name:'Registrar decisão',exact:true}).click();
    await page.getByText(/Decisão registrada/).waitFor();
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Baixar auditoria e correções (ZIP)',exact:true}).click();
    const download=await downloadPromise;
    const file=path.join(out,'allocation-auditor-synthetic.zip');await download.saveAs(file);
    const zip=await require('../jszip.min.js').loadAsync(fs.readFileSync(file));
    assert.ok(Object.keys(zip.files).some(name=>name.endsWith('.xlsx')));
    assert.ok(Object.keys(zip.files).some(name=>name.endsWith('.json')));
    await page.screenshot({path:path.join(out,'allocation-auditor-1440.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'No horizontal page overflow');
    await page.getByLabel('Buscar código ou título',{exact:true}).fill('');
    await page.getByLabel('Código exato',{exact:true}).uncheck();
    // Modelo oficial de 16 colunas: upload deve acionar importação e análise sem clique extra.
    const XLSX = require('../xlsx.full.min.js');
    const workbook = XLSX.utils.book_new();
    const columns=['NomeDocumento','Data Prevista','Workflow','Documento Ativo','Ação','Data da Linha Base','Propósito de Emissão Original','Documento Crítico','Observação','Caminho Data Book','N1','N2','N3','N4','N5','N6'];
    const officialRows=['121','122'].map(n=>[code(n),46322,'RNEST UHDTD U-32 C&M/ELETRICA','','INCLUSÃO','','PARA CONSTRUÇÃO','','','UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR','UHDTD U-32','10.SUPRIMENTO','','','','']);
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([columns,...officialRows]),'GERAL');
    const officialBytes=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
    await page.locator('input[type=file][accept=".xlsx"]').first().setInputFiles({name:'C1O-ALOC-CM-0375-2026.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(officialBytes)});
    await page.waitForFunction(()=>document.querySelector('.aa-import-details')?.textContent?.includes('2 documentos ·')&&document.querySelectorAll('.aa-table tbody tr').length===2,{},{timeout:30000});
    assert.match(await page.locator('.aa-import-details').innerText(),/modelo oficial de 16 colunas reconhecido/i);
    await page.evaluate(()=>window.dispatchEvent(new Event('grcon:contract-context-changed')));
    await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===0);
    assert.deepEqual(errors,[]);
    const metrics={ok:true,react:true,realBrowserWorker:true,syntheticContract:true,documents:2,exact121122:true,selection:true,review:true,zip:true,contextReset:true,pageErrors:errors.length};
    fs.writeFileSync(path.join(out,'allocation-auditor-metrics.json'),JSON.stringify(metrics,null,2));
    console.log(JSON.stringify(metrics));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
