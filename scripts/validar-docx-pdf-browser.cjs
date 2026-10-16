'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd();
(async()=>{
  const server=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/'){
      res.setHeader('content-type','text/html;charset=utf-8');
      return res.end('<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><link rel="stylesheet" href="/docx-pdf.css"></head><body><section id="docx-to-pdf-module"><div id="grcon-docx-pdf-root"></div></section></body></html>');
    }
    const file=path.resolve(root,'.'+u.pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end('404');}
    res.setHeader('content-type',file.endsWith('.js')?'application/javascript':'text/css');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
    const page=await browser.newPage({acceptDownloads:true,viewport:{width:1366,height:800}});
    const errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()!=='GET')requests.push(request.url());});
    await page.goto('http://127.0.0.1:'+server.address().port);
    for(const name of ['jszip.min.js','pdf-lib.min.js','docx_pdf_core.js','docx_pdf_app.js'])await page.addScriptTag({path:path.join(root,name)});
    await page.evaluate(()=>window.GrconDocxPdfUi.activate());
    assert.equal(await page.getByRole('heading',{name:'Converter DOCX para PDF'}).count(),1);
    assert.equal(await page.locator('#docx-pdf-convert').isDisabled(),true);
    const fixtures=await page.evaluate(async()=>{
      const create=async(text)=>{
        const doc='<?xml version="1.0" encoding="utf-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Relatório de Qualidade</w:t></w:r></w:p><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Documento</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Revisão A</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1260" w:bottom="1260" w:left="1260" w:right="1260"/></w:sectPr></w:body></w:document>';
        const z=new window.JSZip();
        z.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        z.file('word/document.xml',doc);
        return Array.from(await z.generateAsync({type:'uint8array'}));
      };
      return {a:await create('Conferência SIGEM - emissão 0'),b:await create('Água, revisão C')};
    });
    await page.locator('#docx-pdf-input').setInputFiles({name:'qualidade.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(fixtures.a)});
    assert.equal(await page.locator('#docx-pdf-file').count(),0);
    assert.equal(await page.locator('#docx-pdf-convert').isDisabled(),true,'exige ciência da limitação');
    await page.locator('#docx-pdf-confirm').check();
    const first=page.waitForEvent('download',{timeout:30000});
    await page.locator('#docx-pdf-convert').click();
    const pdfDownload=await first;assert.equal(pdfDownload.suggestedFilename(),'qualidade.pdf');
    const pdfPath=await pdfDownload.path();assert.ok(fs.readFileSync(pdfPath).subarray(0,5).equals(Buffer.from('%PDF-')));
    assert.match(await page.locator('#docx-pdf-feedback').textContent(),/1 PDF/);
    assert.equal(await page.locator('.docx-pdf-file [data-docx-action="download"]').count(),1);
    const loaded=await page.evaluate(async data=>{
      const pdf=await PDFLib.PDFDocument.load(new Uint8Array(data));
      return {pages:pdf.getPageCount(),width:pdf.getPage(0).getWidth()};
    },Array.from(fs.readFileSync(pdfPath)));
    assert.equal(loaded.pages,1);
    assert.ok(loaded.width>590&&loaded.width<600);
    await page.locator('#docx-pdf-input').setInputFiles({name:'segundo.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(fixtures.b)});
    const batch=page.waitForEvent('download',{timeout:30000});
    await page.locator('#docx-pdf-convert').click();
    const archive=await batch;assert.equal(archive.suggestedFilename(),'GRCON_DOCX_convertidos.zip');
    const archiveBytes=fs.readFileSync(await archive.path());
    const names=await page.evaluate(async data=>{
      const zip=await JSZip.loadAsync(new Uint8Array(data));
      return Object.keys(zip.files).sort();
    },Array.from(archiveBytes));
    assert.deepEqual(names,['qualidade.pdf','segundo.pdf']);
    await page.locator('#docx-pdf-clear').click();
    assert.equal(await page.locator('#docx-pdf-convert').isDisabled(),true);
    await page.locator('#docx-pdf-input').setInputFiles({name:'corrompido.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('nao e zip')});
    await page.locator('#docx-pdf-convert').click();
    await page.getByText('Falha',{exact:false}).first().waitFor();
    assert.equal(await page.locator('#docx-pdf-list [data-docx-action="download"]').count(),0);
    assert.deepEqual(requests,[],'nenhum documento enviado ao servidor');
    assert.deepEqual(errors,[],'nenhum erro de JavaScript');
    console.log('DOCX → PDF Chromium: validação, 1 PDF real A4, lote ZIP, preservação de origem, erro controlado e nenhum upload: OK.');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
