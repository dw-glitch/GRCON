'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=require('../vendor/recon/provenance.json');
function runtime(original=false){
 const sandbox={console,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Buffer,Blob,File,atob,btoa,setTimeout,clearTimeout,setInterval,clearInterval,setImmediate,clearImmediate,crypto:crypto.webcrypto,URL};
 sandbox.self=sandbox;const context=vm.createContext(sandbox);
 function evaluate(file){let source=fs.readFileSync(file,'utf8');if(original&&file.includes('/vendor/recon/'))source=source.replaceAll('root.RECONTriagemCore','root.TriagemCore').replaceAll('root.RECONLDConflictCore','root.LDConflictCore');vm.runInContext(source,context,{filename:file});}
 sandbox.importScripts=(...names)=>names.forEach(name=>evaluate(path.resolve(root,'workers',name)));
 evaluate(path.join(root,'workers/allocation.worker.js'));let id=0;
 const run=(operation,input)=>new Promise((resolve,reject)=>{const current=++id;sandbox.postMessage=data=>{if(data.id===current)data.error?reject(Error(data.error)):resolve(data.result);};sandbox.onmessage({data:{id:current,operation,input}});});
 return {sandbox,run,evaluate};
}
(async()=>{
 for(const [name,info] of Object.entries(manifest.files)){const bytes=fs.readFileSync(path.join(root,'vendor/recon',name));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),info.portedSha256,name);const source=bytes.toString().replaceAll('root.RECONTriagemCore','root.TriagemCore').replaceAll('root.RECONLDConflictCore','root.LDConflictCore');if(!info.adaptation)assert.equal(crypto.createHash('sha256').update(source).digest('hex'),info.sourceSha256,name+' original behavior');}
 const core=require('../allocation_generator_core.js'),N=require('../vendor/recon/allocation_normative_rules.js');
 const worker=runtime(),pathA='UHDT-D|DATA BOOK C&M|TUBULACAO|RELATORIOS DE INSPECAO',pathB='UHDT-D|DATA BOOK C&M|SISTEMAS MECANICOS|TUBULACAO|RELATORIOS DE INSPECAO';
 const doc='C1O_RNEST_U32_10.2.1.2_TUB_RIR_nt-NF-228452-Tubos';
 const bases={databook:[{databook:pathA,description:'RELATORIO DE INSPECAO DE RECEBIMENTO TUBULACAO'}],eap:[{code:'10.2.1',levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS TAG PRAT OU NAO TAG','10.02.01.H.TUBULACAO']}],norms:N.RULES,config:[{unit:'UHDT-D'}]};
 const versions={databook:'db1',eap:'e1',norms:'n1'},record={document:doc,documentKey:doc,looseDocumentKey:doc,revision:'0',title:'RELATORIO DE INSPECAO DE RECEBIMENTO',discipline:'TUB',sheet:'ET',source:'LD_001.xlsx',row:2};
 let rows=core.prepare({documents:[{document:doc,revision:'A'}],records:[record],bases,versions});assert.equal(rows[0].revision,'A');assert.equal(rows[0].ldLocated,true);assert.ok(rows[0].output.levels[3].includes('TUBULACAO'));
 const conflictRecords=[{...record,source:'LD_001.xlsx',row:2,title:'RELATORIO DE INSPECAO DE RECEBIMENTO'},{...record,source:'LD_002.xlsx',row:5,title:'TITULO TECNICAMENTE DIVERGENTE'}];
 const conflicted=core.prepare({documents:[{document:doc,revision:'A'}],records:conflictRecords,bases,versions})[0];
 assert.equal(conflicted.ldConflictBlocked,true,'conflitos técnicos da LD devem permanecer bloqueantes');
 assert.equal(conflicted.suggestedPath,'','conflito não pode selecionar caminho de linha arbitrária');
 assert.equal(conflicted.candidates.length,0);
 assert.match(conflicted.blockers.join(' '),/Conflito na LD/i);
 assert.throws(()=>core.review(conflicted,{title:'TITULO',path:pathA,discipline:'TUB'},bases),/Conflito/);
 assert.throws(()=>core.decisionPayload(conflicted,'Justificativa de confirmação'),/Conflito/);
 const missing=core.prepare({documents:[{document:doc,revision:'A',discipline:'TUB'}],records:[],bases,versions})[0];assert.equal(missing.ldLocated,false);assert.equal(missing.plannedAllocated,false);assert.equal(missing.revision,'A');
 const reviewed=core.review(missing,{title:'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO',path:pathA,discipline:'TUB'},bases);assert.ok(!/[ÓÇÃ]/.test(reviewed.title));
 const id=reviewed.identity,experience={id:'learning-1',document:doc,title:reviewed.title,trusted:true,status:'corrected',family:id.family,discipline:id.discipline,eap:id.eap,confirmed_path:pathA,base_versions:versions};
 const next=doc.replace('228452','999999');const learned=core.prepare({documents:[{document:next,discipline:'TUB'}],bases,versions,decisions:[experience]})[0];assert.equal(learned.output.databook,pathA);assert.equal(learned.origin,'experiencia-validada');
 const other=core.prepare({documents:[{document:next.replace('_TUB_','_ELE_'),discipline:'ELE'}],bases,versions,decisions:[experience]})[0];assert.notEqual(other.origin,'experiencia-validada');
 assert.equal(core.eligibleExperience({...experience,base_versions:{...versions,norms:'old'}},id,versions,new Set([pathA])),false);
 const moved=core.prepare({documents:[{document:doc,discipline:'TUB'}],bases:{...bases,databook:[{databook:pathB,description:'RELATORIO DE INSPECAO DE RECEBIMENTO TUBULACAO'}]},versions:{...versions,databook:'db2'},decisions:[experience]})[0];assert.notEqual(moved.output.databook,pathA);
 const {validateDecision,allocationPrompt,recommendAllocation}=await import('../cloudflare/allocation-ai.mjs');
 const payload=core.decisionPayload(reviewed,'Conferido com a EAP e mapa vigente');const context={complete:true,bases,versions};
 const confirmed=validateDecision(payload,context);assert.equal(confirmed.validated,true);
 assert.throws(()=>validateDecision({...payload,document:doc.replace('_TUB_','_ZZZ_')},context),/normativa/);
 assert.throws(()=>validateDecision({...payload,confirmedPath:'INVENTADO'},context),/Caminho/);
 const civilPath='UHDT-D|DATA BOOK C&M|CIVIL|RELATORIOS DE INSPECAO';
 const mixedBases={...bases,databook:[...bases.databook,{databook:civilPath}]};
 assert.throws(()=>core.review(reviewed,{title:reviewed.title,path:civilPath},mixedBases),/Disciplina do caminho/);
 assert.throws(()=>validateDecision({...payload,confirmedPath:civilPath},{...context,bases:mixedBases}),/Disciplina do caminho/);
 assert.throws(()=>validateDecision({...payload,confirmedPath:pathA},{...context,bases:{...bases,config:[{unit:'UGH'}]}}),/Unidade/);
 const revPath='UHDTD U-32|DATA BOOK C&M|TUBULACAO|RELATORIOS DE INSPECAO';
 const multiUnitBases={...bases,databook:[{databook:revPath}],config:[{unit:'UHDT-D',units:['UHDTD GERAL','UHDTD U-32','UHDTD SE-XX00']}]};
 assert.deepEqual(core.pathErrors(record,revPath,multiUnitBases),[]);
 assert.equal(validateDecision({...payload,confirmedPath:revPath},{...context,bases:multiUnitBases}).validated,true);
 assert.throws(()=>validateDecision({...payload,confirmedPath:revPath},{...context,bases:{...multiUnitBases,config:[{unit:'UGH',units:['UGH U-33']}]}}),/Unidade/);
 assert.throws(()=>validateDecision(payload,{...context,versions:{...versions,norms:'n2'}}),/bases mudaram/);
 // Unit duplicates must be resolved from document group 3, independently of
 // title/TAG and even when the same EAP and folder names occur in both units.
 const routingConfig={unit:'UHDT-D',units:['UHDTD GERAL','UHDTD U-32','UHDTD U-39S'],unitRouting:'document-U32-U39S'};
 const templateRows=[{databook:'UHDTD U-XX|DATA BOOK C&M|TUBULACAO|RIR TUB E STH',description:'RELATORIO DE INSPECAO DE RECEBIMENTO TUBULACAO',rowNumber:11},{databook:'UHDTD SE-XX00|DATA BOOK C&M|TUBULACAO|RIR TUB E STH',description:'RELATORIO DE INSPECAO DE RECEBIMENTO TUBULACAO',rowNumber:12},{databook:'UHDTD SE-XX00|DATA BOOK C&M|TUBULACAO|PASTA EXCLUSIVA',rowNumber:13}];
 const routed=core.resolveDatabookCatalog(templateRows,routingConfig);
 assert.equal(routed[0].documentUnit,'U32');assert.equal(routed[1].documentUnit,'U39S');assert.equal(routed[2].documentUnit,'U32');
 assert.equal(routed[1].sourceDatabook,templateRows[1].databook);assert.ok(routed.every(r=>!/XX00|U-XX/.test(r.databook)));
 assert.deepEqual(core.resolveDatabookCatalog(routed,routingConfig),routed,'routing is reproducible from preserved source paths');
 assert.throws(()=>core.resolveDatabookCatalog([...templateRows,templateRows[1]],routingConfig),/Mais de dois/);
 const routedBases={...bases,databook:routed,config:[routingConfig]},doc39=doc.replace('_U32_','_U39S_');
 assert.equal(core.documentUnit(doc.replace('_U32_','_U39_')),'U39S');
 for(const [code,expected] of [[doc,'U32'],[doc39,'U39S']]){
  const preview=core.prepare({documents:[{document:code}],records:[{...record,document:code,documentKey:code,looseDocumentKey:code}],bases:routedBases,versions})[0];
  const r=preview.output.databook?preview:core.review(preview,{title:preview.title,path:preview.candidates[0].databook},routedBases);
  assert.equal(r.identity.unit,expected);assert.ok(r.output.databook.includes(expected==='U32'?'U-32':'U-39S'));
  assert.ok(r.candidates.every(c=>c.documentUnit===expected));
  assert.ok(r.output.levels[0].includes(expected==='U32'?'U-32':'U-39S'));
  const otherPath=routed.find(c=>c.documentUnit!==expected).databook;
  assert.throws(()=>core.review(r,{title:r.title,path:otherPath},routedBases),/Grupo 3/);
  assert.throws(()=>validateDecision({...core.decisionPayload(r,'Conferido por unidade e EAP'),confirmedPath:otherPath},{complete:true,bases:routedBases,versions}),/Grupo 3/);
  const verified=validateDecision(core.decisionPayload(r,'Conferido por unidade e EAP'),{complete:true,bases:routedBases,versions});
  assert.ok(verified.validated);assert.ok(verified.evidence.some(e=>e.sourcePath===r.sourceDatabook));
 }
 const prompt=allocationPrompt(doc,reviewed.title,context,[],'TUB');
 const fixture={run:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({candidateId:prompt.candidates[0].id,reason:'Caminho da disciplina previsto na base vigente.',citations:[prompt.refs[0].id]})}}]})};
 assert.equal((await recommendAllocation(fixture,prompt)).path,pathA);
 await assert.rejects(recommendAllocation({run:async()=>({response:{candidateId:'inventado',reason:'x',citations:['inventado']}})},prompt),/EVIDENCE/);
 const plan=await worker.run('plan',{results:[reviewed,{...reviewed,document:next,output:{...reviewed.output,discipline:'ELETRICA'}}],mode:'discipline'});assert.equal(plan.groups.length,2);
 assert.equal((await worker.run('plan',{results:[reviewed,reviewed],mode:'single'})).groups.length,1);
 // Confirmation spreadsheets use the original RECON parser and keep their
 // separate source names/outcomes when several files are selected together.
 const X=worker.sandbox.XLSX;
 const confirmationFile=(name,code,status)=>{const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['NOME DOCUMENTO','ALOCAÇÃO','STATUS','RESPOSTA DA FISCAL 01'],[code,'C1O-ALOC-CM-0001-2026',status,'Conferido pela Fiscal']]),'Confirmação');return new File([X.write(book,{type:'array',bookType:'xlsx'})],name);};
 const cf1=await worker.run('parse',{kind:'confirmation',file:confirmationFile('confirmacao-1.xlsx',doc,'RECUSADO')});
 const cf2=await worker.run('parse',{kind:'confirmation',file:confirmationFile('confirmacao-2.xlsx',next,'ACEITO')});
 assert.equal(cf1[0].outcome.kind,'rejected');assert.equal(cf2[0].outcome.kind,'accepted');
 assert.equal(cf1[0].source,'confirmacao-1.xlsx');assert.equal(cf2[0].source,'confirmacao-2.xlsx');
 const withConfirmation=core.prepare({documents:[{document:doc}],records:[record],confirmations:cf1,bases,versions})[0];
 assert.equal(withConfirmation.confirmationAllocation,'C1O-ALOC-CM-0001-2026');assert.match(withConfirmation.confirmationOutcome,/RECUSADO/);
 const Registry=require('../allocation_registry_core.js'),levelBook=X.utils.book_new();
 X.utils.book_append_sheet(levelBook,X.utils.aoa_to_sheet([['Exportação'],['Nivel 1','Nivel 2','Nivel 3','Nivel 4'],['UHDTD U-32','10.SUPRIMENTO','10.02.BENS','10.02.01.H.TUBULACAO']]),'Base - Caminho das Pastas');
 const parsedLevels=Registry.parseProjectLevels(levelBook,X).entries;
 assert.deepEqual(JSON.parse(JSON.stringify(parsedLevels)),JSON.parse(JSON.stringify(worker.sandbox.AllocationCore.parseProjectLevelBase(levelBook,X))));
 assert.equal(core.levelsFor(record,pathA,{...bases,eap:parsedLevels}).levels[3],'10.02.01.H.TUBULACAO');
 const eap=await worker.run('bundled',{kind:'eap'});assert.ok(eap.length>300);const paths=await worker.run('bundled',{kind:'databook'});assert.ok(paths.length>150);
 const template=(await worker.run('bundled',{kind:'template'}))[0];
 const meta={allocationCode:'C1O-ALOC-CM-0001-2026',allocationDate:'2026-10-21',status:'PENDENTE ENVIO DE LD'};
 const exported=await worker.run('export',{results:[{...reviewed,confirmed:true}],meta,template});assert.equal(exported.length,3);
 const zip=await worker.run('zip',{files:exported});const Zip=require('../jszip.min.js'),ExcelJS=require('../exceljs.min.js');
 const archive=await Zip.loadAsync(zip);assert.equal(Object.keys(archive.files).length,3);
 for(const file of exported){const bytes=Buffer.from(file.base64,'base64');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);assert.ok(book.worksheets.length);}
 // Compare the preserved exporter with the source version in a separate realm.
 const source=runtime(true);source.sandbox.RECONAllocationTemplate=template;
 const expected=await source.sandbox.AllocationWorkbook.buildAllocation([reviewed],source.sandbox.ExcelJS,meta);
 const actual=Buffer.from(exported.find(x=>x.kind==='allocation').base64,'base64'),expectedZip=await Zip.loadAsync(expected),actualZip=await Zip.loadAsync(actual);
 for(const name of Object.keys(expectedZip.files).filter(x=>!x.endsWith('/')&&x!=='docProps/core.xml'))assert.equal(await actualZip.file(name).async('string'),await expectedZip.file(name).async('string'),'official template part '+name);
 const expectedControl=await source.sandbox.AllocationWorkbook.buildControlLines([reviewed],meta,source.sandbox.ExcelJS),expectedBook=new ExcelJS.Workbook(),actualBook=new ExcelJS.Workbook();await expectedBook.xlsx.load(expectedControl);await actualBook.xlsx.load(Buffer.from(exported.find(x=>x.kind==='control').base64,'base64'));
 assert.deepEqual(actualBook.worksheets[0].getSheetValues(),expectedBook.worksheets[0].getSheetValues());
 console.log('Allocation engines: RECON source hashes, normative/EAP precedence, missing-LD classification, supervised correction/no cross-family learning, source invalidation, official OOXML parity, titles/control/official Excel reopening and ZIP passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
