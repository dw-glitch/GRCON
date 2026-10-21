'use strict';
importScripts('../xlsx.full.min.js','../exceljs.min.js','../jszip.min.js',
 '../vendor/recon/recon_contracts.js','../vendor/recon/core.js','../vendor/recon/ld_conflicts.js',
 '../vendor/recon/allocation_confirmation_sources.js','../vendor/recon/non_tagged_title_rules.js',
 '../vendor/recon/allocation_core.js','../vendor/recon/allocation_batches.js','../vendor/recon/bases_core.js',
 '../vendor/recon/databook_allocation_sources.js','../vendor/recon/document_title_standard.js','../vendor/recon/document_title_standard_r.js',
 '../vendor/recon/global_tag_title_core.js','../vendor/recon/audit_core.js','../vendor/recon/allocation_normative_catalogs.js','../vendor/recon/allocation_normative_rules.js',
 '../vendor/recon/allocation_title_quality.js','../vendor/recon/allocation_workbook.js',
 '../vendor/recon/ld_preservation.js','../vendor/recon/ld_title_writer.js','../vendor/recon/ld_databook_writer.js','../vendor/recon/title_codes_csv.js',
 '../vendor/recon/offline_resources.js','../vendor/recon/offline_recon_databook_c.js','../vendor/recon/offline_recon_eap_paths.js',
 '../vendor/recon/offline_recon_allocation_template.js','../vendor/recon/offline_recon_audit_bases.js','../vendor/recon/databook_catalog.js',
 '../vendor/recon/allocation_databook_finder.js','../allocation_generator_core.js');
const A=self.AllocationCore,C=self.RECONTriagemCore,W=self.AllocationWorkbook,Engine=self.GrconAllocationGeneratorCore;
const bytesToBase64=bytes=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
function read(bytes){return XLSX.read(bytes,{type:'array',cellDates:true,cellFormula:true});}
function parse(kind,book,name){
 if(kind==='databook'){
  let parsed=A.parseDatabookWorkbook(book,XLSX).entries;
  if(!parsed.length){for(const sheet of book.SheetNames){const candidate={...book,SheetNames:['CAMINHO DB_SIGEM'],Sheets:{CAMINHO_DB_SIGEM:book.Sheets[sheet],'CAMINHO DB_SIGEM':book.Sheets[sheet]}};parsed=A.parseDatabookWorkbook(candidate,XLSX).entries;if(parsed.length)break;}}
  return parsed;
 }
 if(kind==='eap')return A.parseProjectLevelBase(book,XLSX);
 if(kind==='ld')return C.parseWorkbook(book,name,Date.now());
 if(kind==='history')return A.parseHistoricalAllocationWorkbook(book,XLSX,name).rows;
 if(kind==='central')return A.parseControlWorkbook(book,XLSX).rows;
 if(kind==='titles')return C.parseWorkbook(book,name,Date.now()).records.map(r=>({document:r.document,title:r.title,source:name})).filter(r=>r.title);
 // Catalog descriptors preserve RECON aliases and header validation.
 const descriptors={scon:'scon-tag-sgp',appendix:'tag-appendix',li:'instrument-list'};
 const descriptor=self.RECONBasesCore.descriptor?.(descriptors[kind]);
 if(descriptor){const sheet=book.SheetNames[0],built=self.RECONBasesCore.buildCatalog(descriptor,XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,defval:''}),{source:name,sheet});return built.entries||built.rows.map(row=>Object.fromEntries(built.columns.map((c,i)=>[c,row[i]])));}
 const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:''});
 if(kind==='norms')return rows.map(r=>({id:String(r.id||r.ID||''),source:String(r.source||r.FONTE||''),requirement:String(r.requirement||r.REQUISITO||''),revision:String(r.revision||r.REVISAO||'')}));
 return rows;
}
async function parseFile(kind,file){
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>30*1024*1024)throw Error('Planilha excede 30 MB.');
 if(/\.json$/i.test(file.name)){const data=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(data)||!data.length||data.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('Use uma lista estruturada de registros.');return data;}
 if(kind==='template'){
  const previous=self.RECONAllocationTemplate;self.RECONAllocationTemplate={base64:bytesToBase64(bytes)};try{await W.buildAllocation([],ExcelJS,{});}finally{self.RECONAllocationTemplate=previous;}
  return [{base64:bytesToBase64(bytes),sha256:await hash(bytes)}];
 }
 const parsed=parse(kind,read(bytes),file.name);
 if(!parsed||(Array.isArray(parsed)&&!parsed.length))throw Error('Nenhum registro reconhecido. Confira os cabeçalhos e abas.');
 return parsed;
}
async function bundled(kind){
 if(kind==='databook')return self.RECON_DATABOOK_CATALOG;
 if(kind==='eap')return parse('eap',read(RECONOfflineResources.arrayBuffer('Caminho das Pastas UHDTD.xlsx')),'RECON EAP');
 if(kind==='norms')return self.RECONAllocationNorms.RULES.map(x=>({...x,revision:x.source}));
 if(kind==='template'){const base64=RECONAllocationTemplate.base64;const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));return [{base64,sha256:await hash(bytes)}];}
 if(kind==='config')return [{prefix:'C1O-ALOC-CM',unit:'UHDT-D'}];
 if(kind==='appendix'){importScripts('../vendor/recon/tag_reference_catalog.js');return RECONTagReferenceCatalog.entries;}
 if(kind==='li'){importScripts('../vendor/recon/valve_list_catalog.js');const catalog=RECONValveListCatalog;return catalog.rows.map(row=>Object.fromEntries(catalog.columns.map((k,i)=>[k,row[i]])));}
 if(kind==='scon'){importScripts('../vendor/recon/scon_escopo_title_catalog.js');const catalog=self.RECONSconEscopoTitleCatalog;return catalog.rows.map(row=>Object.fromEntries(catalog.columns.map((k,i)=>[k,row[i]])));}
 throw Error('Carregue a planilha vigente para esta base.');
}
async function exportGroup({results,meta,template}){
 if(template)self.RECONAllocationTemplate=template;
 const allocation=await W.buildAllocation(results,ExcelJS,meta),control=await W.buildControlLines(results,meta,ExcelJS);
 await W.verify({allocation,control},results,meta.allocationCode,ExcelJS);
 const titlesBook=new ExcelJS.Workbook();titlesBook.creator='GRCON';const sheet=titlesBook.addWorksheet('Títulos revisados');
 sheet.addRow(['Código do Documento','Título anterior','Título recomendado','Fonte consultada','Situação de validação','Revisão','Caminho Databook']);
 results.forEach(r=>sheet.addRow([r.document,r.originalTitle||'',r.title,r.titleSource,r.confirmed?'Revisado pelo operador':'Revisão necessária',r.revision,r.output.databook]));
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:'G'+(results.length+1)};
 sheet.columns.forEach((c,i)=>{c.width=i===0?48:i<4?65:30;});sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E78'}};
 const titles=new Uint8Array(await titlesBook.xlsx.writeBuffer());
 const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(titles);if(reopened.worksheets[0].getCell('A2').value!==results[0].document)throw Error('Falha na verificação dos títulos.');
 const files=[];for(const [kind,bytes,name] of [['allocation',allocation,meta.allocationCode+'.xlsx'],['control',control,'Linhas_Central_de_Alocacao_'+meta.allocationCode+'.xlsx'],['titles',titles,'Titulos_'+meta.allocationCode+'.xlsx']])files.push({kind,name,base64:bytesToBase64(new Uint8Array(bytes)),sha256:await hash(bytes)});
 return files;
}
self.onmessage=async({data})=>{const {id,operation,input}=data;try{
 let result;
 if(operation==='parse')result=await parseFile(input.kind,input.file);
 else if(operation==='bundled')result=await bundled(input.kind);
 else if(operation==='analyze')result=Engine.prepare(input);
 else if(operation==='review')result=Engine.review(input.row,input.changes,input.bases);
 else if(operation==='decision')result=Engine.decisionPayload(input.row,input.justification,input.status);
 else if(operation==='plan')result=RECONAllocationBatches.build(input.results,'C1O-ALOC-CM-0001-'+new Date().getFullYear(),{mode:input.mode});
 else if(operation==='export')result=await exportGroup(input);
 else if(operation==='zip'){
  const zip=new JSZip();for(const f of input.files)zip.file(f.name,f.base64,{base64:true});result=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }else throw Error('Operação desconhecida.');
 self.postMessage({id,result});
}catch(error){self.postMessage({id,error:error.message||String(error)});}};
