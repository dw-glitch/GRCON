'use strict';
// Fase 7 — relatório, cópias corrigidas, manifesto e pacote ZIP (Worker real).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'workers'),out=[];
const box={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:crypto.webcrypto,setTimeout,clearTimeout,postMessage:r=>out.push(r)};
box.self=box;box.globalThis=box;const ctx=vm.createContext(box);
box.importScripts=(...ps)=>{for(const p of ps)vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx,{filename:p});};
vm.runInContext(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8'),ctx);
const X=box.XLSX,C=box.GrconAllocationAuditorCore,P=box.GrconAllocationAuditPackage;
let id=0;async function call(operation,input){out.length=0;await box.onmessage({data:{id:++id,operation,input}});assert.equal(out.length,1);if(out[0].error)throw Error(out[0].error);return out[0].result;}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const file=(name,bytes)=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const ROOT='GRCON_Auditoria_Preventiva/';
const HEAD=['NOMEDOCUMENTO','DATA PREVISTA','WORKFLOW','DOCUMENTO ATIVO','ACAO','DATA DA LINHA BASE','PROPOSITO DE EMISSAO ORIGINAL','DOCUMENTO CRITICO','OBSERVACAO','CAMINHO DATA BOOK','N1','N2','N3','N4','N5','N6'];
const DOC='RL-5290.00-22313-91A-C1O-121';
function alloc(){const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([HEAD,[DOC,'','WF ANTIGO','SIM','INCLUIR','','EMISSÃO','NÃO','','DB|ANTIGO','N1','','','','','']]),'GERAL');return new Uint8Array(X.write(b,{type:'array',bookType:'xlsx'}));}
const mkRow=(i,findings=[],extra={})=>({contract:'qa',document:i===0?DOC:'DOC-'+i,revision:'0',allocation:'C1O-ALOC-CM-0372-2026',sourceFile:'ALOC.xlsx',sourceSheet:'GERAL',sourceRow:i+2,lineage:'L'+i,ruleVersion:C.VERSION,versions:{databook:'v1'},officialAllocation:true,levels:[],findings,recommendations:[],...extra});
const finding=(id,severity,field='title',category='title')=>({id,category,field,severity,message:'Mensagem '+id,evidence:[{file:'LD.xlsx',row:3,version:'v1'}],source:'Fonte '+id,ruleVersion:C.VERSION,humanReview:true});

(async()=>{
 const original=alloc(),originalHash=sha(original);
 const first=mkRow(0,[finding('DATABOOK-NOT-FOUND','error','databook','databook')],{workflow:'WF ANTIGO',databook:'DB|ANTIGO',recommendations:[]});
 const rows=[first,mkRow(1,[finding('TAG-NOT-PROVEN','pending','tag','tag')]),mkRow(2,[finding('FISCAL-FAMILY-title','suggestion','fiscalComment','history')]),mkRow(3,[]),mkRow(4,[])];
 const base={contract:'qa',rows,progress:5,total:5,versions:{databook:'v1',eap:'v7'},sources:[{name:'ALOC.xlsx',sha256:originalHash,kind:'allocation'},{name:'LD.xlsx',sha256:'b'.repeat(64),kind:'ld'}],sessionId:'sess-1',runId:'run-1',exceptions:[],events:[],files:[]};

 // Pacote sem cópias: apenas relatório + manifesto; nada fictício; omissões justificadas.
 const empty=await call('assistant-package',base);
 const zip=await box.JSZip.loadAsync(empty.bytes,{checkCRC32:true});
 const files=Object.keys(zip.files).filter(n=>!zip.files[n].dir).sort();
 assert.deepEqual(files,[ROOT+'01_Relatorio_Auditoria.xlsx',ROOT+'05_Manifesto.json'],'somente arquivos realmente produzidos');
 assert.ok(!Object.keys(zip.files).some(n=>/02_LDs|03_Aloc|04_Linhas/.test(n)),'sem pastas vazias nem arquivos fictícios');
 const manifest=JSON.parse(await zip.file(ROOT+'05_Manifesto.json').async('string'));
 assert.deepEqual(manifest.omitted.map(o=>o.path),['02_LDs_Corrigidas/','03_Alocacoes_Corrigidas/','04_Linhas_Central.xlsx']);
 assert.ok(manifest.omitted.every(o=>o.reason.length>10));
 assert.equal(manifest.numbering.consumed,false);assert.equal(manifest.normativeApproval,false);

 // Hashes de saída conferem com os bytes reais.
 for(const o of manifest.outputs)assert.equal(sha(await zip.file(o.path).async('uint8array')),o.sha256,o.path);
 // Manifesto: contagens, identificação e ausência de segredos.
 assert.equal(manifest.auditId,'run-1');assert.equal(manifest.contract,'qa');assert.equal(manifest.engine,C.VERSION);
 assert.deepEqual(manifest.counts,{documents:5,allocations:1,withoutProblems:2,confirmedErrors:1,pendingVerifications:1,preventiveSuggestions:1});
 assert.equal(manifest.sources.length,2);assert.equal(manifest.sources[1].sha256,'b'.repeat(64));assert.deepEqual(manifest.referenceVersions,{databook:'v1',eap:'v7'});
 assert.ok(!/access_token|refresh_token|password|Bearer|apikey|secret/i.test(JSON.stringify(manifest)),'sem segredos');

 // Relatório: duas abas, dados reais, separação entre erro, pendência e sugestão.
 const wb=X.read(await zip.file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array',cellDates:true});
 assert.deepEqual([...wb.SheetNames],['RESUMO','DETALHAMENTO']);
 const resumo=Object.fromEntries(X.utils.sheet_to_json(wb.Sheets.RESUMO,{header:1,defval:''}).filter(r=>r[0]&&r[1]!=='').map(r=>[r[0],r[1]]));
 assert.equal(resumo['Documentos analisados'],5);assert.equal(resumo['Documentos sem problemas detectados'],2);
 assert.equal(resumo['Não conformidades confirmadas sem correção'],1);assert.equal(resumo['Verificações inconclusivas'],1);
 assert.equal(resumo['Correções executadas (verificadas em cópia)'],0);assert.equal(resumo['Estado final'],P.STATES.fix);
 assert.equal(resumo['Contrato'],'qa');assert.equal(resumo['Identificação da auditoria'],'run-1');
 assert.match(resumo['Fontes utilizadas'],/ALOC\.xlsx.*\n.*LD\.xlsx/);assert.match(resumo['Versões das referências'],/databook: v1/);
 const detail=X.utils.sheet_to_json(wb.Sheets.DETALHAMENTO,{defval:''});
 assert.equal(detail.length,5);
 assert.deepEqual(Object.keys(detail[0]),['Alocação','Documento','Revisão','Categoria','Regra','Severidade','Problema','Campo','Valor original','Valor proposto','Valor efetivamente corrigido','Fonte da evidência','Arquivo','Aba','Linha/célula','Situação','Tipo de correção','Justificativa','Revisão humana']);
 const sev=Object.fromEntries(detail.map(d=>[d.Regra.split(' ·')[0]||d.Regra,d.Severidade]));
 assert.equal(sev['DATABOOK-NOT-FOUND'],'Não conformidade confirmada');assert.equal(sev['TAG-NOT-PROVEN'],'Verificação pendente');assert.equal(sev['FISCAL-FAMILY-title'],'Sugestão preventiva (não normativa)');
 assert.equal(detail[0].Severidade,'Não conformidade confirmada','erros confirmados vêm primeiro');
 assert.ok(wb.Sheets.DETALHAMENTO['!autofilter']);assert.ok(!wb.Sheets.RESUMO['!autofilter']);
 assert.match(String(detail[0]['Fonte da evidência']),/file: LD\.xlsx/,'evidência legível, não JSON bruto');

 // Cópia corrigida real: revisão do escritor → pacote → segunda auditoria.
 const ldRows=[{document:DOC,revision:'0',source:'LD.xlsx',sheet:'ELE',row:2,workflow:'WF NOVO',databook:'DB|NOVO',discipline:'ELE'}];
 const cctx={contract:'qa',versions:{databook:'v1'},bases:{databook:[{databook:'DB|NOVO'}]},ldRecords:ldRows,history:[],homologated:{},applicability:{}};
 const parsed=C.parseRows(X.utils.sheet_to_json(X.read(original,{type:'array'}).Sheets.GERAL,{header:1,defval:'',raw:true}),{contract:'qa',sourceFile:'ALOC.xlsx',sourceSheet:'GERAL',sourceHash:originalHash,allocation:'C1O-ALOC-CM-0372-2026'});
 const c2={...cctx,records:parsed.records},idx=C.prepare(c2),audited=parsed.records.map(r=>C.auditRecord(r,c2,idx));
 const rec=audited[0].recommendations.find(r=>r.field==='workflow');
 const ev={...C.reviewEvent(audited[0],{state:'Correção proposta',decision:'accepted',field:'workflow',value:rec.after,justification:'Valor conferido na LD exata',evidence:rec.evidence},'user-1'),ruleId:'rule-9',ruleVersion:2};
 const revised=await call('revise-allocation',{file:file('ALOC.xlsx',original),rows:audited,events:[ev],sourceHash:originalHash,contract:'qa'});
 const copyName='03_Alocacoes_Corrigidas/ALOC_CORRIGIDA.xlsx';
 const full={...cctx,records:parsed.records,rows:audited,progress:1,total:1,events:[ev],sessionId:'s',runId:'r2',sources:[{name:'ALOC.xlsx',sha256:originalHash,kind:'allocation'}],exceptions:[],
  files:[{name:copyName,bytes:revised.bytes,official:true,changed:revised.changed,changes:revised.changes}],plan:{items:[]}};
 const pack=await call('assistant-package',full);
 const pz=await box.JSZip.loadAsync(pack.bytes,{checkCRC32:true});
 const copyBytes=await pz.file(ROOT+copyName).async('uint8array');
 assert.equal(sha(original),originalHash,'original preservado');
 const copy=X.read(copyBytes,{type:'array'});assert.equal(copy.Sheets.GERAL.C2.v,'WF NOVO');assert.equal(X.utils.decode_range(copy.Sheets.GERAL['!ref']).e.c,15,'modelo de 16 colunas preservado');
 assert.equal(pack.manifest.corrections.executed,1);assert.equal(pack.manifest.corrections.verified,1);assert.equal(pack.manifest.corrections.authorized,1);
 assert.equal(pack.manifest.corrections.applied[0].cell,'C2');assert.equal(pack.manifest.corrections.applied[0].ruleId,'rule-9');
 assert.equal(pack.manifest.outputs.find(o=>o.name===copyName).sha256,sha(copyBytes),'hash de saída da cópia');
 assert.ok(!pack.manifest.omitted.some(o=>o.path.startsWith('03_')),'cópia produzida não é listada como omitida');
 assert.ok(pack.manifest.omitted.some(o=>o.path.startsWith('02_')),'LD não corrigida segue omitida');
 const wb2=X.read(await pz.file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});
 const d2=X.utils.sheet_to_json(wb2.Sheets.DETALHAMENTO,{defval:''}).find(d=>d['Campo']==='workflow'&&d['Valor efetivamente corrigido']);
 assert.equal(d2['Valor original'],'WF ANTIGO');assert.equal(d2['Valor efetivamente corrigido'],'WF NOVO');assert.equal(d2['Linha/célula'],'C2');assert.equal(d2['Situação'],'Corrigido e verificado em cópia');

 // Segunda auditoria rejeita cópia que não corrigiu o que declara.
 await assert.rejects(call('assistant-package',{...full,files:[{name:copyName,bytes:original,official:true,changed:1,changes:revised.changes}]}),/Segunda auditoria/);

 // Linhas da Central: só quando fornecidas; nome seguro; não consome numeração por si.
 const central=new Uint8Array(await (async()=>{const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['A'],['B']]),'Linhas');return X.write(b,{type:'array',bookType:'xlsx'});})());
 const withCentral=await call('assistant-package',{...base,files:[{name:'04_Linhas_Central_C1O-ALOC-CM-0373-2026.xlsx',bytes:central}]});
 assert.ok(withCentral.manifest.outputs.some(o=>o.kind==='central'));assert.ok(!withCentral.manifest.omitted.some(o=>o.path.startsWith('04_')));
 // Nomes inseguros e repetidos.
 for(const bad of ['../x.xlsx','/abs.xlsx','a//b.xlsx','.oculto.xlsx','x\\y.xlsx','semextensao','a<b>.xlsx'])await assert.rejects(call('assistant-package',{...base,files:[{name:bad,bytes:central}]}),/inseguro|repetido/,bad);
 await assert.rejects(call('assistant-package',{...base,files:[{name:'04_Linhas_Central_X.xlsx',bytes:central},{name:'04_Linhas_Central_X.xlsx',bytes:central}]}),/repetido/);
 await assert.rejects(call('assistant-package',{...base,files:[{name:'03_Alocacoes_Corrigidas/lixo.xlsx',bytes:new Uint8Array([1,2,3])}]}),/zip|ZIP|central|corrupt|end of/i);

 // Falha parcial: arquivo não produzido aparece no relatório e muda o estado.
 const partial=await call('assistant-package',{...base,rows:[mkRow(0,[]),mkRow(1,[])].slice(0,2),total:2,progress:2,exceptions:['LD.xlsx: reanexe a origem para produzir a cópia.']});
 assert.equal(partial.manifest.finalState,P.STATES.verify);assert.deepEqual(partial.manifest.exceptions,['LD.xlsx: reanexe a origem para produzir a cópia.']);
 const pw=X.read(await (await box.JSZip.loadAsync(partial.bytes)).file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});
 assert.match(JSON.stringify(X.utils.sheet_to_json(pw.Sheets.RESUMO,{header:1})),/Arquivo não produzido: LD\.xlsx/);

 // Três estados finais.
 const clean=[mkRow(0,[]),mkRow(1,[finding('FISCAL-PRECEDENT','suggestion','fiscalComment','history')])];
 assert.equal(P.finalState(clean,[],[],'').state,P.STATES.ready,'só sugestões: pronta, sem aprovação fiscal');
 assert.equal(P.finalState([mkRow(0,[finding('X','pending')])],[],[],'').state,P.STATES.verify);
 assert.equal(P.finalState(clean,[],[],'bases indisponíveis').state,P.STATES.verify);
 assert.equal(P.finalState([mkRow(0,[finding('UNIT-PATH-MISMATCH','error','databook')])],[],[],'').state,P.STATES.fix);
 const fixed=[{name:'x',changes:[{lineage:'L0',field:'databook',verified:true}]}];
 assert.equal(P.finalState([mkRow(0,[finding('UNIT-PATH-MISMATCH','error','databook')])],fixed,[],'').state,P.STATES.ready,'erro corrigido e verificado em cópia');
 assert.equal(P.finalState([mkRow(0,[finding('EAP-LEVEL-MISMATCH','error','levels','hierarchy')])],[{changes:[{lineage:'L0',field:'N2',verified:true}]}],[],'').state,P.STATES.ready,'N1–N6 corrigem achado de EAP');

 // Muitas ocorrências: 2.500 documentos com achados.
 const bigRows=Array.from({length:2500},(_,i)=>mkRow(i,i%3===0?[finding('TAG-NOT-PROVEN','pending','tag','tag')]:i%3===1?[finding('FISCAL-PRECEDENT','suggestion','fiscalComment','history')]:[]));
 const t0=Date.now();const big=await call('assistant-package',{...base,rows:bigRows,total:2500,progress:2500});const ms=Date.now()-t0;
 const bz=await box.JSZip.loadAsync(big.bytes,{checkCRC32:true});
 const bw=X.read(await bz.file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});
 assert.equal(X.utils.sheet_to_json(bw.Sheets.DETALHAMENTO).length,2500);assert.equal(big.manifest.counts.documents,2500);assert.ok(ms<60000,'2.500 documentos em '+ms+' ms');

 // Injeção de fórmula neutralizada.
 const inj=await call('assistant-package',{...base,rows:[mkRow(0,[{...finding('X','pending'),message:'=HYPERLINK("http://x")'}],{title:'=1+1'})],total:1,progress:1});
 const iw=X.read(await (await box.JSZip.loadAsync(inj.bytes)).file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});
 assert.equal(iw.Sheets.DETALHAMENTO.G2.v,"'=HYPERLINK(\"http://x\")");

 // Pacote incompleto é recusado.
 await assert.rejects(call('assistant-package',{...base,progress:4}),/Conclua/);
 console.log('allocation_auditor_package_phase7: ZIP, relatório de duas abas, manifesto, hashes, cópias corrigidas, Central, nomes seguros, falha parcial, 3 estados e 2.500 documentos ('+ms+' ms) aprovados');
})().catch(e=>{console.error(e);process.exit(1);});
