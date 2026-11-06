'use strict';
// Etapa 11 — HOMOLOGAÇÃO LOCAL (integração ponta a ponta, Worker real, dados sintéticos). NÃO é homologação em produção:
// não usa banco real de homologação nem usuários. Cobre fluxo completo, volumes, coerência chat × Excel × manifesto,
// segurança do pacote e recuperação de falhas.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'workers'),out=[];
const box={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:crypto.webcrypto,setTimeout,clearTimeout,postMessage:r=>out.push(r)};
box.self=box;box.globalThis=box;const ctx=vm.createContext(box);
box.importScripts=(...ps)=>{for(const p of ps)vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx,{filename:p});};
vm.runInContext(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8'),ctx);
const X=box.XLSX,C=box.GrconAllocationAuditorCore,Opinion=require(path.join(root,'allocation_auditor_opinion.js')),Reaudit=require(path.join(root,'allocation_auditor_reaudit.js')),Errors=require(path.join(root,'allocation_auditor_errors.js'));
const chatCode=ts.transpileModule(fs.readFileSync(path.join(root,'src/react/allocation-auditor/chatView.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const chat={exports:{}};new Function('module','exports',chatCode)(chat,chat.exports);const View=chat.exports;
let serial=0;async function call(operation,input){out.length=0;await box.onmessage({data:{id:++serial,operation,input}});assert.equal(out.length,1);if(out[0].error)throw Error(out[0].error);return out[0].result;}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fileOf=(name,bytes)=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const HEAD=['NOMEDOCUMENTO','DATA PREVISTA','WORKFLOW','DOCUMENTO ATIVO','ACAO','DATA DA LINHA BASE','PROPOSITO DE EMISSAO ORIGINAL','DOCUMENTO CRITICO','OBSERVACAO','CAMINHO DATA BOOK','N1','N2','N3','N4','N5','N6'];
const code=i=>'C1O_RNEST_U32_10.2.1.2_ELE_RIR_TR-'+String(10000+i);
const ROOT='GRCON_Auditoria_Preventiva/';
const mem=()=>Math.round(process.memoryUsage().heapUsed/1048576);
const ms=()=>Number(process.hrtime.bigint()/1000000n);
const xlsxBytes=(rows)=>{const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([HEAD,...rows]),'GERAL');return new Uint8Array(X.write(b,{type:'array',bookType:'xlsx'}));};
const allocRow=(i,extra={})=>[extra.doc||code(i),'',extra.wf??(i%5===0?'WF ANTIGO':'RNEST UHDTD U-32 C&M/ELETRICA'),'SIM','INCLUIR','','PARA CONSTRUÇÃO','NÃO','',extra.db??'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR','UHDTD U-32','','','','',''];
const ldRows=(n,{from=0,rev='0',wf='RNEST UHDTD U-32 C&M/ELETRICA'}={})=>Array.from({length:n},(_,k)=>({document:code(from+k),revision:rev,source:'LD_'+(from?'B':'A')+'.xlsx',sheet:'ELE',row:k+2,title:'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO '+(from+k),workflow:wf,databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR',discipline:'ELE'}));
const baseContext=(records,ldRecords,extra={})=>({contract:'QA',records,ldRecords,history:[],bases:{databook:[{databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR'}]},versions:{databook:'v1'},ldHashes:{},homologated:{},applicability:{},...extra});
async function auditAll(parsed,context){
 await call('context',context);let rows=[];for(let i=0;i<context.records.length;i+=100)rows.push(...await call('batch',{first:i,count:100}));
 const summary=await call('summarize',{rows});return {rows,summary};
}
const readReport=async pack=>{const zip=await box.JSZip.loadAsync(pack.bytes,{checkCRC32:true});return {zip,wb:X.read(await zip.file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'}),manifest:JSON.parse(await zip.file(ROOT+'05_Manifesto.json').async('string'))};};
const sheetRows=(wb,name)=>X.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''}).slice(1).filter(r=>r.some(c=>c!==''));
const results={volumes:[],scenarios:[]};

(async()=>{
 // ---------- A. Volumes ponta a ponta: arquivo XLSX real → leitura → auditoria em lotes → pacote → releitura do Excel ----------
 // O lote grande (10.000) leva ~2 min; roda com GRCON_HOMOLOGATION_LARGE=1 (evidência de homologação), não na suíte padrão.
 for(const n of [100,500,1000,2500,...(process.env.GRCON_HOMOLOGATION_LARGE?[10000]:[])]){
  const bytes=xlsxBytes(Array.from({length:n},(_,i)=>allocRow(i))),originalHash=sha(bytes),heap0=mem();
  const t0=ms(),parsed=await call('parse',{file:fileOf('ALOC_'+n+'.xlsx',bytes),sheet:'GERAL',contract:'QA',allocation:'C1O-ALOC-CM-0372-2026'});const tParse=ms()-t0;
  assert.equal(parsed.records.length,n,'nenhuma linha perdida na leitura');assert.equal(parsed.sha256,originalHash,'hash do arquivo preservado');assert.equal(new Set(parsed.records.map(r=>r.document)).size,n);
  const ctxN=baseContext(parsed.records,ldRows(n));const t1=ms(),{rows,summary}=await auditAll(parsed,ctxN);const tAudit=ms()-t1;
  assert.equal(rows.length,n);assert.ok(rows.every(r=>r.lineage&&Array.isArray(r.findings)));assert.equal(new Set(rows.map(r=>r.lineage)).size,n,'linhagem única por documento');
  // determinismo: auditar de novo o mesmo arquivo dá o mesmo resultado
  if(n<=1000){const again=await auditAll(parsed,ctxN);assert.equal(sha(JSON.stringify(again.rows.map(r=>[r.lineage,r.findings.map(f=>f.id+f.severity),r.recommendations.map(p=>p.field+p.after)]))),sha(JSON.stringify(rows.map(r=>[r.lineage,r.findings.map(f=>f.id+f.severity),r.recommendations.map(p=>p.field+p.after)]))),'auditoria determinística');}
  const t2=ms(),pack=await call('assistant-package',{...ctxN,rows,progress:n,total:n,sessionId:'s',runId:'r-'+n,sources:[{name:'ALOC_'+n+'.xlsx',sha256:originalHash,kind:'allocation'}],events:[],files:[],exceptions:[],plan:{items:[]}});const tPack=ms()-t2;
  const t3=ms(),rep=await readReport(pack),tRead=ms()-t3;
  // coerência: parecer = visão do chat = manifesto = abas do Excel
  const op=Opinion.build({rows}),items=View.buildItems(rows,op,[]);
  assert.equal(rep.manifest.opinion.counts.documents,op.counts.documents);assert.deepEqual(rep.manifest.opinion.counts.occurrences,op.counts.occurrences);assert.deepEqual(rep.manifest.opinion.counts.proposals,op.counts.proposals);
  assert.equal(rep.manifest.counts.documents,n);assert.equal(rep.manifest.finalState,rep.manifest.opinion.state==='ready'?'Pronta para conferência final e envio':rep.manifest.opinion.state==='fix'?'Correção necessária antes do envio':'Verificação complementar necessária');
  const fixRows=sheetRows(rep.wb,'O QUE CORRIGIR').filter(r=>!/^Nenhum erro/.test(r[0]));
  assert.equal(fixRows.length,items.filter(i=>(i.kind==='erro'||i.kind==='pendencia')&&i.open).length,'O QUE CORRIGIR = pendências abertas do chat ('+n+')');
  const propRows=sheetRows(rep.wb,'PROPOSTAS PARA REVISÃO').filter(r=>!/^Nenhuma proposta/.test(r[0]));
  assert.equal(propRows.length,items.filter(i=>i.kind==='proposta'||i.kind==='sugestao').length,'PROPOSTAS = propostas+sugestões do chat');
  assert.equal(propRows.filter(r=>r[0]==='Proposta de correção').length,op.counts.proposals.total);
  const det=sheetRows(rep.wb,'DETALHAMENTO');assert.equal(det.length,op.counts.occurrences.total+op.counts.proposals.total+op.counts.documentsClear,'DETALHAMENTO não perde nem inventa linhas');
  // integridade do pacote: tudo que está no ZIP bate com o manifesto
  for(const o of rep.manifest.outputs)assert.equal(sha(await rep.zip.file(o.path).async('uint8array')),o.sha256,o.path);
  assert.equal(rep.manifest.normativeApproval,false);assert.equal(rep.manifest.numbering.consumed,false);
  // regra documental: 20% com workflow antigo → pendência/proposta de workflow (e só nelas)
  const wfFindings=rows.filter(r=>r.findings.some(f=>f.field==='workflow')).length;assert.ok(wfFindings>=Math.floor(n/5)-1&&wfFindings<=Math.ceil(n/5)+1,'workflow divergente detectado em ~20%: '+wfFindings);
  // o estado final nunca declara prontidão com pendências
  assert.notEqual(op.state,'ready');
  results.volumes.push({documents:n,parseMs:tParse,auditMs:tAudit,packageMs:tPack,readReportMs:tRead,zipMB:+(pack.bytes.length/1048576).toFixed(2),heapMB:mem(),heapDeltaMB:mem()-heap0,pendingItems:fixRows.length});
  const budget=n>=10000?{parse:60000,audit:120000,pack:240000}:{parse:20000,audit:40000,pack:80000};
  assert.ok(tParse<budget.parse&&tAudit<budget.audit&&tPack<budget.pack,'orçamento de tempo para '+n+': '+JSON.stringify(results.volumes.at(-1)));
 }

 // ---------- B. Cenários de fluxo ----------
 const scenario=(name,detail)=>results.scenarios.push({name,...detail});
 // B1. Alocação interna (registros do Gerador, sem arquivo) × externa (XLSX): mesmas regras, origem diferente
 {
  const n=30,internal=Array.from({length:n},(_,i)=>({contract:'QA',document:code(i),revision:'0',title:'TÍTULO '+i,allocation:'C1O-ALOC-CM-0372-2026',allocationIdentity:'from-source',sourceFile:'Gerador GRCON',sourceSheet:'GERAL',sourceRow:i+2,workflow:'RNEST UHDTD U-32 C&M/ELETRICA',databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR',discipline:'ELE',levels:['UHDTD U-32']}));
  const r=await auditAll(null,baseContext(internal,ldRows(n)));assert.equal(r.rows.length,n);assert.ok(r.rows.every(x=>x.allocation==='C1O-ALOC-CM-0372-2026'));
  scenario('alocação interna (Gerador) sem arquivo',{documents:n,ok:true});
 }
 // B2. Múltiplas LDs: cada documento é conferido contra a LD certa; fora de qualquer LD vira apontamento, nunca é associado por semelhança
 {
  const n=60,bytes=xlsxBytes(Array.from({length:n},(_,i)=>allocRow(i))),parsed=await call('parse',{file:fileOf('ALOC.xlsx',bytes),sheet:'GERAL',contract:'QA',allocation:'ALOC-2'});
  const ld=[...ldRows(25,{from:0}),...ldRows(25,{from:25,wf:'WF DIFERENTE NA LD B'})];  // 10 documentos (50–59) em nenhuma LD
  const r=await auditAll(parsed,baseContext(parsed.records,ld));
  const missing=r.rows.filter(x=>x.findings.some(f=>f.id==='DOCUMENT-NOT-IN-LD'));assert.equal(missing.length,10,'10 documentos fora das LDs');assert.deepEqual(missing.map(x=>x.document).sort(),Array.from({length:10},(_,k)=>code(50+k)).sort());
  const fromB=r.rows.slice(25,50);assert.ok(fromB.every(x=>x.findings.some(f=>f.id==='LD-WORKFLOW-MISMATCH'||f.field==='workflow')),'cada documento é comparado com a LD onde está');
  assert.ok(r.rows.slice(0,25).filter(x=>x.findings.some(f=>f.id==='LD-WORKFLOW-MISMATCH')).length<=5,'LD A só diverge no que é do arquivo');
  scenario('múltiplas LDs, documentos fora de LD',{documents:n,missing:missing.length,ok:true});
 }
 // B3. Revisões divergentes: nunca se casa revisão diferente em silêncio
 {
  const recs=Array.from({length:12},(_,i)=>({contract:'QA',document:code(i),revision:'01',title:'T'+i,allocation:'A',sourceFile:'A.xlsx',sourceSheet:'GERAL',sourceRow:i+2,workflow:'RNEST UHDTD U-32 C&M/ELETRICA',databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR',discipline:'ELE',levels:[]}));
  const r=await auditAll(null,baseContext(recs,ldRows(12,{rev:'0'})));
  assert.ok(r.rows.every(x=>x.findings.length>0),'revisão 01 × LD 0: sempre há apontamento');assert.ok(!r.rows.some(x=>x.status==='Sem não conformidades detectadas'),'nunca "sem apontamentos" com revisão divergente');
  scenario('revisões divergentes (01 × 0)',{documents:12,ok:true});
 }
 // B4. Ausência de fontes: sem LD e sem bases o resultado é inconclusivo, nunca "pronto"
 {
  const recs=Array.from({length:20},(_,i)=>({contract:'QA',document:code(i),revision:'0',title:'T'+i,allocation:'A',sourceFile:'A.xlsx',sourceSheet:'GERAL',sourceRow:i+2,workflow:'WF',databook:'DB',discipline:'ELE',levels:[]}));
  const r=await auditAll(null,{...baseContext(recs,[]),bases:{},contextWarning:'As bases complementares não puderam ser consultadas: rede indisponível.'});
  const op=Opinion.build({rows:r.rows,contextWarning:'As bases complementares não puderam ser consultadas.'});
  assert.notEqual(op.state,'ready');assert.ok(op.blockers.some(b=>b.code==='CONTEXTO-LIMITADO'));assert.ok(r.rows.every(x=>x.findings.some(f=>f.id==='LD-BASE-MISSING')));
  const pack=await call('assistant-package',{...baseContext(recs,[]),rows:r.rows,progress:20,total:20,sources:[],events:[],files:[],exceptions:[],contextWarning:'As bases complementares não puderam ser consultadas.',plan:{items:[]}});
  const rep=await readReport(pack);assert.notEqual(rep.manifest.finalState,'Pronta para conferência final e envio');assert.ok(rep.manifest.limitations.some(l=>/bases complementares/i.test(l)));
  scenario('ausência de LD e de bases',{documents:20,state:rep.manifest.finalState,ok:true});
 }
 // B5. Correção → cópia verificada → reauditoria: original intacto, valor verificado, prova por reauditoria, comparação anterior × posterior
 {
  const n=40,orig=xlsxBytes(Array.from({length:n},(_,i)=>allocRow(i))),origHash=sha(orig);
  const parsed=await call('parse',{file:fileOf('ALOC.xlsx',orig),sheet:'GERAL',contract:'QA',allocation:'C1O-ALOC-CM-0372-2026'});
  const ctxA=baseContext(parsed.records,ldRows(n)),first=await auditAll(parsed,ctxA);
  const targets=first.rows.filter(r=>r.recommendations.some(p=>p.field==='workflow'));assert.ok(targets.length>=6);
  const events=targets.map(r=>{const rec=r.recommendations.find(p=>p.field==='workflow');return {...C.reviewEvent(r,{state:'Correção proposta',decision:'accepted',field:'workflow',value:rec.after,justification:'Conferido na LD exata',evidence:['LD_A.xlsx']},'maria'),ruleId:'',ruleVersion:0};});
  const revised=await call('revise-allocation',{file:fileOf('ALOC.xlsx',orig),rows:first.rows,events,sourceHash:parsed.sha256,contract:'QA'});
  assert.equal(sha(orig),origHash,'original preservado byte a byte');assert.equal(revised.changed,events.length);
  const copy=X.read(revised.bytes,{type:'array'});assert.equal(copy.Sheets.GERAL.C2.v,'RNEST UHDTD U-32 C&M/ELETRICA','valor corrigido lido de volta na cópia');
  // reauditoria: audita a cópia corrigida e compara
  const parsed2=await call('parse',{file:fileOf('ALOC_CORRIGIDA.xlsx',revised.bytes),sheet:'GERAL',contract:'QA',allocation:'C1O-ALOC-CM-0372-2026'});
  const second=await auditAll(parsed2,baseContext(parsed2.records,ldRows(n)));
  const cmp=Reaudit.compare(first.rows,second.rows);assert.equal(cmp.comparable,true);assert.ok(cmp.summary.resolved>=events.length,'a reauditoria comprova a resolução: '+JSON.stringify(cmp.summary));assert.equal(cmp.summary.introduced,0,'sem regressões');
  const pack=await call('assistant-package',{...ctxA,rows:first.rows,progress:n,total:n,sessionId:'s',runId:'r5',sources:[{name:'ALOC.xlsx',sha256:origHash,kind:'allocation'}],events,files:[{name:'03_Alocacoes_Corrigidas/ALOC_CORRIGIDA.xlsx',bytes:revised.bytes,official:true,changed:revised.changed,changes:revised.changes}],exceptions:[],comparison:cmp,plan:{items:[]}});
  const rep=await readReport(pack);assert.equal(rep.manifest.corrections.verified,events.length);
  const ver=X.utils.sheet_to_json(rep.wb.Sheets['CORREÇÕES VERIFICADAS']);assert.ok(ver.filter(v=>v['Prova de resolução']==='Resolvida (comprovada)').length===events.length);
  assert.ok(X.utils.sheet_to_json(rep.wb.Sheets['ALOCAÇÃO CORRIGIDA']).filter(r=>r['Situação das alterações']==='Aplicadas em cópia verificada').length===events.length);
  assert.ok(rep.wb.SheetNames.includes('REAUDITORIA'));assert.ok(rep.manifest.opinion.counts.proposals.resolvedProven>=events.length);
  // chat × Excel: o resumo da reauditoria é o mesmo texto nas duas superfícies
  assert.match(JSON.stringify(X.utils.sheet_to_json(rep.wb.Sheets['LEIA PRIMEIRO'],{header:1})),new RegExp(Reaudit.describe(cmp).replace(/[()]/g,'\\$&')));
  scenario('correção → cópia verificada → reauditoria',{corrected:events.length,resolved:cmp.summary.resolved,regressions:cmp.summary.introduced,originalIntact:true,ok:true});
 }
 // B6. Recuperação de falhas: arquivos inválidos, planilha ilegível, tamanho e cancelamento do Worker viram erro controlado e classificado
 {
  const bad=async(f,pattern,code)=>{await assert.rejects(call('parse',{file:f,sheet:'GERAL',contract:'QA',allocation:'A'}),e=>{assert.match(e.message,pattern);assert.equal(Errors.describe(e).code,code,e.message);return true;});};
  await bad(fileOf('ruim.xlsx',new Uint8Array([1,2,3,4,5])),/inválido ou corrompido/i,'FILE_INVALID');
  const noSheet=xlsxBytes([allocRow(0)]);await assert.rejects(call('parse',{file:fileOf('a.xlsx',noSheet),sheet:'NAO_EXISTE',contract:'QA',allocation:'A'}),/aba/i);
  await assert.rejects(call('operacao-inexistente',{}),/desconhecida/i);
  scenario('falhas controladas (arquivo corrompido, aba ausente, operação desconhecida)',{ok:true});
 }

 // ---------- C. Segurança do pacote ----------
 {
  const evil=['=HYPERLINK("http://evil.test","x")','+SUM(1,1)','-2+3','@SUM(1)','=cmd|\' /C calc\'!A0'],n=evil.length;
  const rows=evil.map((e,i)=>({contract:'QA',document:code(i),revision:'0',title:e,allocation:e,sourceFile:'A.xlsx',sourceSheet:'GERAL',sourceRow:i+2,workflow:e,databook:e,discipline:'ELE',levels:[e],lineage:'E'+i,docKind:'ET',
   findings:[{id:'EVIL-'+i,category:'title',field:'title',severity:'error',message:e,source:e,origin:e,evidence:[{file:e,alocacao:e,ld:e}],ruleVersion:C.VERSION}],recommendations:[{field:'workflow',before:e,after:e,justification:e,confidence:e,evidence:[e]}]}));
  const pack=await call('assistant-package',{contract:'QA',rows,progress:n,total:n,sources:[{name:'A.xlsx',sha256:'a'.repeat(64),kind:'allocation'}],events:[],files:[],exceptions:[],plan:{items:[]}});
  const rep=await readReport(pack);const wbf=X.read(await rep.zip.file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array',cellFormula:true});
  let cells=0;for(const name of wbf.SheetNames)for(const ref of Object.keys(wbf.Sheets[name])){if(ref[0]==='!')continue;const c=wbf.Sheets[name][ref];cells++;assert.ok(!c.f,'célula com fórmula em '+name+'!'+ref+': '+c.f);if(typeof c.v==='string')assert.ok(!/^[=+\-@]/.test(c.v)||/^'/.test(c.v)||false,'texto começa como fórmula em '+name+'!'+ref+': '+c.v);}
  assert.ok(cells>200,'varreu todas as abas ('+cells+' células)');
  for(const n2 of Object.keys(rep.zip.files)){assert.ok(!n2.includes('..')&&!n2.startsWith('/')&&!/\/\//.test(n2),'nome de entrada seguro: '+n2);}
  const manifestText=JSON.stringify(rep.manifest);assert.ok(!/access_token|refresh_token|Bearer|apikey|password|secret/i.test(manifestText),'manifesto sem segredos');
  scenario('conteúdo malicioso (injeção de fórmula) em todas as abas',{cellsScanned:cells,ok:true});
 }

 // ---------- D. Consistência de entrega: todo módulo do auditor é carregado onde precisa ----------
 {
  const modules=fs.readdirSync(root).filter(f=>/^allocation_auditor_[a-z_]+\.js$/.test(f));
  const worker=fs.readFileSync(path.join(root,'workers/allocation-auditor.worker.js'),'utf8'),loader=fs.readFileSync(path.join(root,'grcon_module_loader.js'),'utf8'),verify=fs.readFileSync(path.join(root,'scripts/verify-cloudflare-production.mjs'),'utf8');
  const apiOnly=new Set(['allocation_auditor_fields.js']); // também importado pelo Worker da API
  for(const m of modules){
   const shipped=worker.includes(m)||loader.includes(m);assert.ok(shipped,m+' não é carregado nem pelo Worker nem pelo carregador de módulos');
   assert.ok(verify.includes(m),m+' ausente da verificação de produção (scripts/verify-cloudflare-production.mjs)');
   // dist-cloudflare é artefato local (gitignored) gerado por `npm run build:cloudflare`; só vale conferir se estiver mais novo que os módulos.
   const distDir=path.join(root,'dist-cloudflare'),probe=path.join(distDir,'allocation_auditor_core.js');
   if(fs.existsSync(probe)&&fs.statSync(probe).mtimeMs>=Math.max(...modules.map(x=>fs.statSync(path.join(root,x)).mtimeMs))){assert.ok(fs.existsSync(path.join(distDir,m)),m+' ausente do pacote dist-cloudflare');results.distChecked=true;}else results.distChecked=false;
  }
  void apiOnly;scenario('módulos do auditor carregados e verificados na entrega',{modules:modules.length,ok:true});
 }
 fs.writeFileSync(process.env.GRCON_HOMOLOGATION_OUT||path.join(require('node:os').tmpdir(),'grcon-homologation-stage11.json'),JSON.stringify({generatedAt:new Date().toISOString(),node:process.version,scope:'integração local, Worker real, dados sintéticos',...results},null,1));
 console.log('allocation_auditor_homologation_stage11:',JSON.stringify(results.volumes.map(v=>({n:v.documents,parseMs:v.parseMs,auditMs:v.auditMs,packageMs:v.packageMs,zipMB:v.zipMB,heapMB:v.heapMB}))),'+ cenários:',results.scenarios.map(s=>s.name).length);
})().catch(e=>{console.error(e);process.exit(1);});
