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
   res.setHeader('content-type',/\.m?js$/.test(file)?'application/javascript':'text/css');
   res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
   browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],
     ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
   const page=await browser.newPage({acceptDownloads:true,viewport:{width:1366,height:800}});
   const errors=[],uploads=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',req=>{if(req.method()!=='GET')uploads.push(req.url());});
   await page.goto('http://127.0.0.1:'+server.address().port);
   for(const name of ['jszip.min.js','pdf-lib.min.js','docx_pdf_core.js','docx_pdf_app.js'])await page.addScriptTag({path:path.join(root,name)});
   await page.evaluate(()=>window.GrconDocxPdfUi.activate());
   assert.equal(await page.getByRole('heading',{name:'Converter PDF para DOCX'}).count(),1);
   assert.equal(await page.locator('#docx-pdf-input').getAttribute('accept'),'.pdf,application/pdf');
   assert.equal(await page.locator('#docx-pdf-convert').isDisabled(),true);

   const fixtures=await page.evaluate(async()=>{
     const build=async(value)=>{
       const pdf=await PDFLib.PDFDocument.create();
       const font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
       const sheet=pdf.addPage([595,842]);
       sheet.drawText('Documento PDF '+value,{x:50,y:760,size:14,font});
       sheet.drawText('Linha editavel 123',{x:50,y:730,size:11,font});
       return Array.from(await pdf.save());
     };
     const imageOnly=await PDFLib.PDFDocument.create();
     imageOnly.addPage([595,842]);
     const multipage=await PDFLib.PDFDocument.create();
     const font=await multipage.embedFont(PDFLib.StandardFonts.Helvetica);
     for(const idx of [1,2]){
       const pg=multipage.addPage([595,842]);
       pg.drawText('Pagina '+idx,{x:50,y:760,font,size:14});
       pg.drawRectangle({x:50,y:650,width:450,height:65,borderColor:PDFLib.rgb(0,0,0),borderWidth:1});
     }
     return {a:await build('A'),b:await build('B'),empty:Array.from(await imageOnly.save()),multipage:Array.from(await multipage.save())};
   });
   // Modo visual (padrao): duas paginas, duas imagens e nenhum texto falso "editavel".
   assert.equal(await page.locator('input[name="docx-pdf-mode"]:checked').inputValue(),'visual');
   await page.locator('#docx-pdf-input').setInputFiles({
     name:'duas-paginas.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixtures.multipage)
   });
   await page.locator('#docx-pdf-confirm').check();
   const visualDownload=page.waitForEvent('download',{timeout:60000});
   await page.locator('#docx-pdf-convert').click();
   const visual=await visualDownload;
   assert.equal(visual.suggestedFilename(),'duas-paginas.docx');
   const visualPackage=await page.evaluate(async bytes=>{
     const zip=await JSZip.loadAsync(new Uint8Array(bytes));
     return {files:Object.keys(zip.files),xml:await zip.file('word/document.xml').async('string'),
       rels:await zip.file('word/_rels/document.xml.rels').async('string')};
   },Array.from(fs.readFileSync(await visual.path())));
   assert.equal(visualPackage.files.filter(name=>/^word\/media\/pagina-\d{4}\.jpg$/.test(name)).length,2);
   assert.equal((visualPackage.xml.match(/<wp:anchor\b/g)||[]).length,2);
   assert.equal((visualPackage.xml.match(/<w:pageBreakBefore\s*\/>/g)||[]).length,1);
   assert.doesNotMatch(visualPackage.xml,/<w:t(?:\s|>)/,'modo visual nao oferece texto editavel');
   assert.match(visualPackage.rels,/media\/pagina-0002\.jpg/);
   await page.locator('#docx-pdf-clear').click();
   await page.locator('input[value="editable-basic"]').check();
   await page.locator('#docx-pdf-confirm').uncheck();
   const pdfInput={name:'qualidade.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixtures.a)};
   await page.locator('#docx-pdf-input').setInputFiles(pdfInput);
   assert.equal(await page.locator('#docx-pdf-convert').isDisabled(),true,'exigir conferência para documento oficial');
   await page.locator('#docx-pdf-confirm').check();
   const first=page.waitForEvent('download',{timeout:45000});
   await page.locator('#docx-pdf-convert').click();
   const downloaded=await first;
   assert.equal(downloaded.suggestedFilename(),'qualidade.docx');
   const original=fs.readFileSync(await downloaded.path());
   const extracted=await page.evaluate(async bytes=>{
     const zip=await JSZip.loadAsync(new Uint8Array(bytes));
     return {names:Object.keys(zip.files),xml:await zip.file('word/document.xml').async('string')};
   },Array.from(original));
   assert.ok(extracted.names.includes('[Content_Types].xml'));
   assert.match(extracted.xml,/Documento PDF A/);
   assert.match(extracted.xml,/Linha editavel 123/);
   assert.match(extracted.xml,/<w:t xml:space="preserve">/);
   assert.equal(await page.locator('.docx-pdf-file [data-docx-action="download"]').count(),1);

   await page.locator('#docx-pdf-input').setInputFiles({name:'segundo.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixtures.b)});
   const grouped=page.waitForEvent('download',{timeout:45000});
   await page.locator('#docx-pdf-convert').click();
   const result=await grouped;
   assert.equal(result.suggestedFilename(),'GRCON_PDF_convertidos.zip');
   const names=await page.evaluate(async bytes=>Object.keys((await JSZip.loadAsync(new Uint8Array(bytes))).files).sort(),
      Array.from(fs.readFileSync(await result.path())));
   assert.deepEqual(names,['qualidade.docx','segundo.docx']);

   await page.locator('#docx-pdf-clear').click();
   await page.locator('#docx-pdf-input').setInputFiles({name:'digitalizado.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixtures.empty)});
   await page.locator('#docx-pdf-convert').click();
   await page.waitForFunction(()=>document.querySelector('.docx-pdf-file-info small.docx-pdf-warning')?.textContent.includes('OCR'));
   assert.equal(await page.locator('#docx-pdf-list [data-docx-action="download"]').count(),0);

   await page.locator('#docx-pdf-clear').click();
   await page.locator('#docx-pdf-input').setInputFiles({name:'falso.pdf',mimeType:'application/pdf',buffer:Buffer.from('not pdf')});
   await page.locator('#docx-pdf-convert').click();
   await page.waitForFunction(()=>document.querySelector('.docx-pdf-file-info small.docx-pdf-warning')?.textContent.includes('assinatura PDF'));
   assert.equal(await page.locator('#docx-pdf-list [data-docx-action="download"]').count(),0);
   assert.deepEqual(uploads,[],'PDFs não podem ser enviados ao servidor');
   assert.deepEqual(errors,[],'não permitir erros JavaScript não tratados');
   console.log('PDF -> DOCX Chromium: fidelidade visual 2 paginas, texto simplificado, ZIP, OCR avisado e zero uploads: OK');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
