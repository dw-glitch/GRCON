'use strict';
// Fase 6 — correção inteligente e segura: 20 verificações com o Worker e os módulos reais.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'workers'),out=[];
function load(workerFile){
 const box={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:crypto.webcrypto,setTimeout,clearTimeout,postMessage:r=>out.push(r)};
 box.self=box;box.globalThis=box;const ctx=vm.createContext(box);
 box.importScripts=(...ps)=>{for(const p of ps)vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx,{filename:p});};
 vm.runInContext(fs.readFileSync(path.join(dir,workerFile),'utf8'),ctx);return box;
}
const W=load('allocation-auditor.worker.js'),LDW=load('allocation.worker.js');
const X=W.XLSX,C=W.GrconAllocationAuditorCore,A=W.GrconAllocationAssistant,K=W.GrconAllocationCorrections;
assert.ok(K,'módulo de correções carregado no Worker');
let id=0;
async function call(box,operation,input){out.length=0;await box.onmessage({data:{id:++id,operation,input}});assert.equal(out.length,1);if(out[0].error)throw Error(out[0].error);return out[0].result;}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const mkFile=(name,bytes)=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const HEAD=['NOMEDOCUMENTO','DATA PREVISTA','WORKFLOW','DOCUMENTO ATIVO','ACAO','DATA DA LINHA BASE','PROPOSITO DE EMISSAO ORIGINAL','DOCUMENTO CRITICO','OBSERVACAO','CAMINHO DATA BOOK','N1','N2','N3','N4','N5','N6'];
const DOC='RL-5290.00-22313-91A-C1O-121';
function allocation(rows,opts={}){
 const b=X.utils.book_new(),aoa=[[...HEAD,'RESPOSTA DA FISCAL 01'],...rows];
 const ws=X.utils.aoa_to_sheet(aoa);if(opts.formula)ws.R2={t:'n',f:'1+1',v:2};if(opts.merge)ws['!merges']=[{s:{r:1,c:2},e:{r:1,c:3}}];
 if(opts.ref)ws['!ref']='A1:R'+aoa.length;
 X.utils.book_append_sheet(b,ws,'GERAL');X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['HISTÓRICO FISCAL'],['COMENTÁRIO ORIGINAL — não alterar']]),'HIST');
 return new Uint8Array(X.write(b,{type:'array',bookType:'xlsx'}));
}
const line=(doc,wf,db,n1,fiscal='Atender TAG conforme ET.')=>[doc,'',wf,'SIM','INCLUIR','','EMISSÃO','NÃO','',db,n1,'','','','','',fiscal];
const bytes0=allocation([line(DOC,'WF ANTIGO','DB|ANTIGO','N ANTIGO'),line('RL-5290.00-22313-91A-C1O-122','WF OUTRO','DB|OUTRO','N OUTRO')],{formula:true,ref:true});
const hash0=sha(bytes0);
const ldRows=[
 {document:DOC,revision:'0',source:'LD.xlsx',sheet:'ELE',row:2,workflow:'WF NOVO',databook:'DB|NOVO',discipline:'ELE'},
 {document:'RL-5290.00-22313-91A-C1O-122',revision:'0',source:'LD.xlsx',sheet:'ELE',row:3,workflow:'WF OUTRO',databook:'DB|OUTRO',discipline:'ELE'}
];
const VERS={databook:'v1'};
const ctxBase={contract:'qa',versions:VERS,bases:{databook:[{databook:'DB|NOVO'},{databook:'DB|OUTRO'}]},ldRecords:ldRows,ldHashes:{'LD.xlsx':'b'.repeat(64)},history:[],homologated:{},applicability:{}};
function audited(bytes=bytes0,hash=hash0){
 const book=X.read(bytes,{type:'array',cellFormula:true,cellDates:true});
 const parsed=C.parseRows(X.utils.sheet_to_json(book.Sheets.GERAL,{header:1,defval:'',raw:true}),{contract:'qa',sourceFile:'ALOC.xlsx',sourceSheet:'GERAL',sourceHash:hash,allocation:'C1O-ALOC-CM-0372-2026'});
 const context={...ctxBase,records:parsed.records},index=C.prepare(context);
 return {parsed,context,rows:parsed.records.map(r=>C.auditRecord(r,context,index))};
}
const evidenceFor=r=>[JSON.stringify({origin:'LD exata',file:'LD.xlsx',sheet:'ELE',row:r.sourceRow})];
function accept(row,field){
 const rec=row.recommendations.find(x=>x.field===field);assert.ok(rec,'proposta de '+field);
 return {...C.reviewEvent(row,{state:'Correção proposta',decision:'accepted',field,value:rec.after,justification:'Valor conferido na LD exata',evidence:rec.evidence},'qa-user'),ruleId:'rule-1',ruleVersion:1};
}
const cell=(bytes,sheet,ref)=>X.read(bytes,{type:'array',cellFormula:true}).Sheets[sheet][ref];
const revise=(rows,events,{bytes=bytes0,hash=hash0,name='ALOC.xlsx'}={})=>call(W,'revise-allocation',{file:mkFile(name,bytes),rows,events,sourceHash:hash,contract:'qa'});

(async()=>{
 const {rows,context}=audited(),first=rows[0];
 assert.equal(first.officialAllocation,true);assert.equal(first.revision,'0');
 assert.ok(first.recommendations.some(r=>r.field==='workflow'&&r.after==='WF NOVO'));

 // 1+2+20: escrita real, original intacto, rastreabilidade completa.
 const ev=accept(first,'workflow');
 const res=await revise(rows,[ev]);
 assert.equal(res.changed,1);assert.equal(cell(res.bytes,'GERAL','C2').v,'WF NOVO');
 assert.equal(sha(bytes0),hash0,'o original em memória permanece idêntico');
 assert.notEqual(sha(res.bytes),hash0);assert.equal(res.outputHash,sha(res.bytes));assert.equal(res.originalHash,hash0);
 const t=res.changes[0];
 for(const k of ['cell','document','revision','lineage','field','before','after','row','column','sheet','file','ruleId','ruleVersion','reference','actor','decision','verified'])assert.ok(t[k]!==undefined&&t[k]!=='' || k==='ruleVersion',k+' rastreado');
 assert.equal(t.cell,'C2');assert.equal(t.before,'WF ANTIGO');assert.equal(t.after,'WF NOVO');assert.equal(t.sheet,'GERAL');assert.equal(t.verified,true);assert.equal(t.ruleId,'rule-1');

 // 3: hash divergente.
 await assert.rejects(revise(rows,[ev],{hash:'a'.repeat(64)}),/diferente do importado|integridade/i);
 // 4: valor anterior divergente.
 await assert.rejects(revise(rows,[{...ev,before:'OUTRO VALOR'}]),/Valor original divergente/);
 // 5: fórmulas preservadas (célula R2 com fórmula) e célula-alvo com fórmula rejeitada.
 assert.equal(cell(res.bytes,'GERAL','R2').f,'1+1');
 const fb=X.read(bytes0,{type:'array',cellFormula:true});fb.Sheets.GERAL.C2.f='"X"';
 const formulaBytes=new Uint8Array(X.write(fb,{type:'array',bookType:'xlsx'})),fh=sha(formulaBytes);
 const fa=audited(formulaBytes,fh);
 await assert.rejects(revise(fa.rows,[accept(fa.rows[0],'workflow')],{bytes:formulaBytes,hash:fh}),/fórmula/);
 // 6: células não relacionadas.
 const before=X.read(bytes0,{type:'array'}).Sheets.GERAL,after=X.read(res.bytes,{type:'array'}).Sheets.GERAL;
 for(const k of Object.keys(before).filter(x=>!x.startsWith('!')&&x!=='C2'))assert.equal(after[k]?.v,before[k].v,'célula '+k+' intacta');
 assert.equal(cell(res.bytes,'GERAL','C3').v,'WF OUTRO');
 // 7: integridade OOXML (CRC + demais partes idênticas).
 const zo=await W.JSZip.loadAsync(bytes0,{checkCRC32:true}),zn=await W.JSZip.loadAsync(res.bytes,{checkCRC32:true});
 const names=z=>Object.keys(z.files).filter(n=>!z.files[n].dir).sort();assert.deepEqual(names(zn),names(zo));
 for(const n of Object.keys(zo.files).filter(n=>!zo.files[n].dir&&!/worksheets\/sheet1\.xml$/.test(n)))assert.deepEqual([...await zn.file(n).async('uint8array')],[...await zo.file(n).async('uint8array')],n);
 // 8: comentários fiscais preservados (coluna da própria aba e aba de histórico).
 assert.equal(cell(res.bytes,'GERAL','Q2').v,'Atender TAG conforme ET.');
 assert.equal(cell(res.bytes,'HIST','A2').v,'COMENTÁRIO ORIGINAL — não alterar');

 // 9+16: correção da LD (título) em cópia, com evidência — escritor da LD existente.
 const ld=X.utils.book_new();X.utils.book_append_sheet(ld,X.utils.aoa_to_sheet([['DOCUMENTO','REVISÃO','TÍTULO'],[DOC,'0','TÍTULO ANTIGO'],['RL-5290.00-22313-91A-C1O-122','0','OUTRO TÍTULO']]),'ELE');
 const ldBytes=new Uint8Array(X.write(ld,{type:'array',bookType:'xlsx'})),ldHash=sha(ldBytes);
 const ldRes=await call(LDW,'audit-revise-origin',{file:mkFile('LD.xlsx',ldBytes),sourceHash:ldHash,rows:[{document:DOC,revision:'0',lineage:'l1',sheet:'ELE',row:2,field:'title',current:'TÍTULO ANTIGO',proposed:'TÍTULO CONFERIDO COM EVIDÊNCIA',decision:'approved'}]});
 assert.equal(ldRes.count,1);const lw=X.read(ldRes.buffer,{type:'array'}).Sheets.ELE;assert.equal(lw.C2.v,'TÍTULO CONFERIDO COM EVIDÊNCIA');assert.equal(lw.C3.v,'OUTRO TÍTULO');assert.equal(sha(ldBytes),ldHash);
 const titleRow={...first,recommendations:[{field:'title',before:'TÍTULO ANTIGO',after:'TÍTULO CONFERIDO COM EVIDÊNCIA',justification:'Padrão do título',evidence:['catálogo de títulos'],confidence:'regra',humanReview:true}]};
 const tItem=K.plan([titleRow],{...context,rules:[]},A,[]).items.find(i=>i.field==='title');
 assert.equal(tItem.klass,'B');assert.equal(tItem.target,'ld');assert.equal(tItem.situation,'B');

 // 10: correção da alocação a partir de LD correta (Situação A) — fluxo completo plano → classe A → cópia.
 const rule={id:'rule-1',version:1,state:'active',payload:{field:'workflow',before:'WF ANTIGO',after:'WF NOVO',contract:'qa',document:DOC,revision:'0',discipline:first.discipline,sourceHash:hash0,ldHash:'b'.repeat(64),versions:VERS,evidence:['regra homologada']}};
 const planA=K.plan(rows,{...context,rules:[rule]},A,[]);
 const autoItem=planA.automatic.find(i=>i.field==='workflow');
 assert.ok(autoItem,'classe A somente com regra ativa e portas completas');
 assert.equal(autoItem.situation,'A');assert.equal(autoItem.target,'allocation');assert.equal(autoItem.cell,'C2');
 assert.equal(cell((await revise(rows,[accept(first,'workflow')])).bytes,'GERAL','C2').v,autoItem.after);
 // sem regra ativa: nada é automático (B) — a IA/confiança nunca autoriza sozinha.
 const planNoRule=K.plan(rows,{...context,rules:[]},A,[]);
 assert.equal(planNoRule.safe,0);assert.ok(planNoRule.proposed>=1);
 // regra suspensa não vale; contexto com aviso de bases bloqueia a automação.
 assert.equal(K.plan(rows,{...context,rules:[{...rule,state:'suspended'}]},A,[]).safe,0);
 assert.equal(K.plan(rows,{...context,rules:[rule],contextWarning:'bases indisponíveis'},A,[]).safe,0);
 // hash de LD divergente do esperado bloqueia a automação.
 assert.equal(K.plan(rows,{...context,rules:[rule],ldHashes:{'LD.xlsx':'c'.repeat(64)}},A,[]).safe,0);
 // eventos já aceitos aparecem como autorizados — números reais, não demonstrativos.
 assert.equal(K.plan(rows,{...context,rules:[rule]},A,[accept(first,'workflow')]).safeAuthorized,1);
 assert.equal(planA.analyzed,2);

 // 11: layout externo mapeado não é editado pelo escritor oficial.
 const ext=X.utils.book_new();X.utils.book_append_sheet(ext,X.utils.aoa_to_sheet([['CODIGO','REVISAO','WORKFLOW'],[DOC,'0','WF ANTIGO']]),'GERAL');
 const extBytes=new Uint8Array(X.write(ext,{type:'array',bookType:'xlsx'})),extHash=sha(extBytes);
 const ep=C.parseRows(X.utils.sheet_to_json(X.read(extBytes,{type:'array'}).Sheets.GERAL,{header:1,defval:'',raw:true}),{contract:'qa',sourceFile:'EXT.xlsx',sourceSheet:'GERAL',sourceHash:extHash});
 assert.equal(ep.model,'mapped');
 await assert.rejects(revise([{...first,sourceFile:'EXT.xlsx',lineage:'x'}],[ev],{bytes:extBytes,hash:extHash,name:'EXT.xlsx'}),/padrão oficial de 16 colunas|Quantidade ou identidade/);
 assert.equal(K.classifyProposal({...first,officialAllocation:false},first.recommendations[0],{...context,rules:[rule]},A).klass,'B');

 // 12: duplicidade — duas correções para a mesma célula, ou a mesma decisão repetida.
 const ev2={...ev,after:'OUTRO WF',requestId:'2'};
 assert.equal(C.approvedChanges([ev,ev2]).length,1,'a decisão mais recente por campo prevalece');
 const twice=await revise(rows,[ev,ev,ev2]);assert.equal(twice.changed,1,'repetição não duplica a alteração');assert.equal(cell(twice.bytes,'GERAL','C2').v,'OUTRO WF','vale a decisão mais recente, uma só vez');
 const repeat=await revise(rows,[ev]);assert.equal(cell(repeat.bytes,'GERAL','C2').v,'WF NOVO','mesma entrada → mesmo conteúdo (idempotente)');assert.deepEqual(repeat.changes.map(c=>[c.cell,c.before,c.after]),res.changes.map(c=>[c.cell,c.before,c.after]));

 // 13: revisões diferentes não se confundem.
 await assert.rejects(revise(rows,[{...ev,revision:'1'}]),/Revisão diferente/);
 const rev1={...first,revision:'1',lineage:'rev1',origin:{...first.origin,revision:'0'}};
 assert.equal(K.classifyProposal(rev1,first.recommendations[0],{...context,rules:[rule]},A).klass,'B','revisão não confirmada na LD: sem automação');

 // 14: EAP parcial (3.9.2.1 → ancestrais 3 e 3.9) não inventa níveis nem acusa EAP ausente.
 const eapCtx={...ctxBase,homologated:{eap:true},bases:{...ctxBase.bases,eap:[{code:'3',levels:['3']},{code:'3.9',levels:['3','3.9']}]},records:[]};
 const eapRow=C.auditRecord({...first.record,contract:'qa',document:DOC,revision:'0',eap:'3.9.2.1',levels:['3','3.9','','','',''],workflow:'WF'},eapCtx);
 assert.ok(!eapRow.findings.some(f=>f.id==='EAP-NOT-FOUND'||f.id==='EAP-LEVEL-MISMATCH'),'EAP parcial aceita');
 // 15: EAP ambígua → verificação complementar, nunca correção.
 const ambCtx={...eapCtx,bases:{...ctxBase.bases,eap:[{code:'10.2.1',levels:['10','10.2','10.2.1','A']},{code:'10.2.1',levels:['10','10.2','10.2.1','B']}]}};
 const amb=C.auditRecord({...first.record,contract:'qa',document:DOC,revision:'0',eap:'10.2.1.2',levels:['','','','','',''],workflow:'WF'},ambCtx);
 assert.ok(amb.findings.some(f=>f.id==='EAP-DISCIPLINE-AMBIGUOUS'));assert.equal(amb.recommendations.filter(r=>/^N/.test(r.field)).length,0);
 const ambPlan=K.plan([amb],{...ambCtx,rules:[]},A,[]);
 assert.equal(ambPlan.safe,0);assert.equal(ambPlan.proposed,0);assert.ok(ambPlan.items.some(i=>i.findingId==='EAP-DISCIPLINE-AMBIGUOUS'&&i.klass==='C'&&i.situation==='D'));

 // 17: evidência insuficiente → falha segura (nem automática nem aplicável).
 const noEv={...first.recommendations[0],evidence:[]};
 assert.notEqual(K.classifyProposal(first,noEv,{...context,rules:[rule]},A).klass,'A');
 await assert.rejects(revise(rows,[{...ev,evidence:[]}]),/evidência/);
 await assert.rejects(revise(rows,[{...ev,humanReview:false,serverAuthorized:false}]),/aprovação humana/);
 // fontes em conflito: duas propostas distintas para o mesmo campo não são executadas.
 const conflict={...first,recommendations:[first.recommendations[0],{...first.recommendations[0],after:'WF DIVERGENTE'}]};
 const cp=K.plan([conflict],{...context,rules:[rule]},A,[]);
 assert.equal(cp.safe,0);assert.ok(cp.items.some(i=>i.findingId==='SOURCE-CONFLICT'&&i.situation==='D'));
 // sem problemas → classe D (contada como limpa, sem inventar correção).
 assert.equal(K.plan([{...first,findings:[],recommendations:[]}],context,A,[]).clear,1);

 // 18: agrupamento homogêneo — 80 documentos, mesma transformação, evidência individual preservada.
 const many=Array.from({length:80},(_,i)=>({...first,document:'DOC-'+i,lineage:'L'+i,sourceRow:i+2,recommendations:[{...first.recommendations[0],evidence:['linha '+i]}]}));
 const items=many.map(r=>K.classifyProposal(r,r.recommendations[0],{...context,rules:[]},A));
 const groups=K.groupItems(items);
 assert.equal(groups.length,1);assert.equal(groups[0].items.length,80);assert.equal(new Set(groups[0].items.map(i=>i.evidence[0])).size,80,'rastreabilidade individual');
 const mixed=K.groupItems([...items,{...items[0],lineage:'diff',after:'OUTRO'}]);assert.equal(mixed.length,2,'transformações diferentes não se misturam');
 const ag=A.groups(many);assert.equal(ag.length,1);assert.equal(ag[0].rows[5].evidence[0],'linha 5','grupo do chat usa a evidência de cada linha');

 // Portas de gravação adicionais: célula mesclada e aba protegida.
 const mergedBytes=allocation([line(DOC,'WF ANTIGO','DB|ANTIGO','N ANTIGO')],{merge:true,ref:true}),mh=sha(mergedBytes),ma=audited(mergedBytes,mh);
 await assert.rejects(revise(ma.rows,[accept(ma.rows[0],'workflow')],{bytes:mergedBytes,hash:mh}),/mesclada/);
 const pz=await W.JSZip.loadAsync(bytes0);let sx=await pz.file('xl/worksheets/sheet1.xml').async('string');
 sx=sx.replace(/<sheetData/,'<sheetProtection sheet="1" objects="1" scenarios="1"/><sheetData');pz.file('xl/worksheets/sheet1.xml',sx);
 const protectedBytes=await pz.generateAsync({type:'uint8array'}),ph=sha(protectedBytes),pa=audited(protectedBytes,ph);
 await assert.rejects(revise(pa.rows,[accept(pa.rows[0],'workflow')],{bytes:protectedBytes,hash:ph}),/protegida/);

 // 19: nenhuma numeração oficial é consumida pelos módulos de correção/cópia.
 for(const f of ['allocation_auditor_corrections.js','allocation_auditor_revision.js','allocation_auditor_package.js']){
  const src=fs.readFileSync(path.join(root,f),'utf8');
  assert.ok(!/allocationCode|reserveAllocation|nextAllocation|generateAudited|C1O-ALOC-CM-\d{4}/.test(src),f+' não toca numeração oficial');
 }
 assert.match(fs.readFileSync(path.join(root,'src/react/allocation-auditor/service.ts'),'utf8'),/assistantPackage\(sessionId:string,generateOfficial=false\)/);
 assert.match(fs.readFileSync(path.join(root,'src/react/allocation-auditor/assistantStore.ts'),'utf8'),/download\(\)\{return execute\(speak=>assistant\.downloadInternal\(false,speak\)\)/);

 console.log('allocation_auditor_corrections_phase6: 20 verificações (escrita real, hash, valor anterior, fórmulas, OOXML, comentários fiscais, LD/alocação, layout externo, duplicidade, revisões, EAP, título, evidência, agrupamento, numeração, rastreabilidade) aprovadas');
})().catch(e=>{console.error(e);process.exit(1);});
