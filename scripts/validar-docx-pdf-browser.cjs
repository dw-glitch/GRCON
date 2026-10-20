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
   for(const name of ['jszip.min.js','pdf-lib.min.js','docx_pdf_layout.js','docx_pdf_core.js','docx_pdf_app.js'])await page.addScriptTag({path:path.join(root,name)});
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
       pg.drawRectangle({x:65,y:605,width:40,height:20,color:PDFLib.rgb(0,0,0)});
     }
     const mixed=await PDFLib.PDFDocument.create();
     for(const [i,dims] of [[595,842],[842,595],[595,842]].entries()){
       const pg=mixed.addPage(dims);
       pg.drawText('Pagina mista '+(i+1),{x:50,y:480,font,size:11});
     }
     const volume=await PDFLib.PDFDocument.create();
     for(let idx=1;idx<=233;idx++){
       const pg=volume.addPage([595,842]);pg.drawText('Volume pagina '+idx,{x:50,y:740,font,size:11});
     }
     return {volume:Array.from(await volume.save()),a:await build('A'),b:await build('B'),empty:Array.from(await imageOnly.save()),
       multipage:Array.from(await multipage.save()),mixed:Array.from(await mixed.save())};
   });
   // Padrão novo: reconstrução com texto editável em OOXML, sem fotografar páginas.
   assert.equal(await page.locator('input[name="docx-pdf-mode"]').count(),0);
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
   assert.equal(visualPackage.files.filter(name=>/^word\/media\/pagina-\d{4}\.jpg$/.test(name)).length,0);
   assert.equal((visualPackage.xml.match(/<w:pageBreakBefore\s*\/>/g)||[]).length,1);
   assert.match(visualPackage.xml,/<w:txbxContent>/,'texto deve ser objeto do Word');
   assert.match(visualPackage.xml,/Pagina 1/);
   assert.match(visualPackage.xml,/Pagina 2/);
   assert.match(visualPackage.xml,/<v:line\b/,'bordas devem ser vetores Word');
   assert.match(visualPackage.xml,/<v:(?:rect\b|shape\b[^>]*filled="t")/,'retangulos preenchidos devem ser formas Word editáveis');
   assert.doesNotMatch(visualPackage.xml,/<wp:anchor\b/,'não rasterizar páginas');
   // Conserva A4 retrato / paisagem / A4 retrato sem distorção nem recusa.
   await page.locator('#docx-pdf-clear').click();
   await page.locator('#docx-pdf-input').setInputFiles({
     name:'paginas-mistas.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixtures.mixed)
   });
   const mixedDownload=page.waitForEvent('download',{timeout:60000});
   await page.locator('#docx-pdf-convert').click();
   const mixedWord=await mixedDownload;
   const mixedXml=await page.evaluate(async bytes=>{
     const zip=await JSZip.loadAsync(new Uint8Array(bytes));
     return zip.file('word/document.xml').async('string');
   },Array.from(fs.readFileSync(await mixedWord.path())));
   assert.match(mixedXml,/Pagina mista 1/);
   assert.match(mixedXml,/Pagina mista 2/);
   assert.match(mixedXml,/Pagina mista 3/);
   assert.equal((mixedXml.match(/<w:sectPr>/g)||[]).length,3,'retrato, paisagem e retrato em seções independentes');
   assert.match(mixedXml,/<w:pgSz w:w="16840" w:h="11900" w:orient="landscape"\/>/);
   assert.equal((mixedXml.match(/<w:pageBreakBefore\/>/g)||[]).length,0,'mudança de seção faz a quebra de página');
   // A volumetria real inclui um procedimento com 233 paginas.
   await page.locator('#docx-pdf-clear').click();
   await page.locator('#docx-pdf-input').setInputFiles({
     name:'volume-233.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixtures.volume)
   });
   const volumeDownload=page.waitForEvent('download',{timeout:120000});
   await page.locator('#docx-pdf-convert').click();
   const volumeWord=await volumeDownload;
   const volumeXml=await page.evaluate(async bytes=>{
     const zip=await JSZip.loadAsync(new Uint8Array(bytes));
     return zip.file('word/document.xml').async('string');
   },Array.from(fs.readFileSync(await volumeWord.path())));
   assert.match(volumeXml,/Volume pagina 1</);
   assert.match(volumeXml,/Volume pagina 233</);
   assert.equal((volumeXml.match(/<w:pageBreakBefore\/>/g)||[]).length,232);


   await page.locator('#docx-pdf-clear').click();
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
   console.log('PDF -> DOCX Chromium: OOXML editavel, vetores, 2 paginas, ZIP, OCR avisado e zero uploads: OK');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
