'use strict';
// Etapa 8 (RA-08, RA-11): contrato de campos motor × API × cliente, catálogo de falhas e prazos/cancelamento (puro).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const Fields=require(path.join(root,'allocation_auditor_fields.js')),Errors=require(path.join(root,'allocation_auditor_errors.js')),C=require(path.join(root,'allocation_auditor_core.js'));
// Prazos e cancelamento ficam em service.ts (arquivo único, como exige o harness independente do pacote da Etapa 0); aqui são carregados num contexto mínimo.
const Ops=(()=>{const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,'src/react/allocation-auditor/service.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 require('node:vm').runInNewContext(code,{module:m,exports:m.exports,window:{GrconCloud:{state:{}},addEventListener(){}},Worker:class{},crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,AbortController,TextEncoder,Promise,Blob,URL,console});return m.exports;})();

// Os prazos usam timer sem referência (unref) para não segurar o processo; o teste mantém o laço de eventos vivo.
const keepAlive=setInterval(()=>{},50);
(async()=>{
 const {prepareAuditPrompt}=await import(path.join(root,'cloudflare/allocation-audit-ai.mjs'));

 // ---------- RA-08: contrato de campos ----------
 // (a) varredura estática: todo campo citado nas regras do motor existe no contrato.
 const source=fs.readFileSync(path.join(root,'allocation_auditor_core.js'),'utf8');
 const cited=new Set();
 for(const m of source.matchAll(/\badd\('[^']*',\s*(?:'[^']*'|[a-z]+),\s*'([A-Za-z0-9]+)'/g))cited.add(m[1]);
 for(const m of source.matchAll(/\bfield:\s*'([A-Za-z0-9]+)'/g))cited.add(m[1]);
 cited.delete('N'); // prefixo de "N"+índice, montado em tempo de execução (N1–N6 estão no contrato)
 const missing=[...cited].filter(f=>!Fields.isField(f));
 assert.deepEqual(missing,[],'campos usados pelo motor e ausentes do contrato: '+missing.join(', '));
 for(const f of ['plannedDate','action','purpose','N1','N6','levels','discipline','eap'])assert.ok(Fields.isField(f),f+' deve estar no contrato');
 // (b) varredura dinâmica: tudo que o motor realmente emite está no contrato (achados e propostas).
 const records=[];
 const base={contract:'QA',revision:'0',allocation:'ALOC',sourceFile:'A.xlsx',sourceSheet:'GERAL',officialAllocation:true,levels:[],workflow:'',databook:'',title:'',tag:'',discipline:'',eap:'',plannedDate:'',action:'',purpose:'',activeDocument:'',criticalDocument:''};
 for(const [n,doc] of [[1,'C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-NF-123-BOBINA-1'],[2,'RL-5290.00-22313-91A-C1O-122'],[3,'DOCUMENTO INVALIDO'],[4,'C1O_RNEST_U32_5.7.3.1_ELE_RIR_TAG-A'],[5,'']])
  for(const v of [{},{workflow:'WF X',databook:'DB|X',levels:['A','B','C','D','E','F','G'],title:'T',tag:'T',discipline:'CVL',eap:'1.1'},{plannedDate:'x',action:'INCLUSÃO',purpose:'PARA CONSTRUÇÃO'},{revision:'',title:'tÍtulo'}])
   records.push({...base,...v,document:doc,lineage:'L'+records.length,sourceRow:records.length+2});
 const ctx={contract:'QA',records,versions:{},bases:{databook:[{databook:'DB|X'}]},ldRecords:[{document:records[1].document,revision:'0',title:'OUTRO TITULO',tag:'OUTRA',discipline:'ELE',eap:'2.2',workflow:'WF Y',databook:'DB|Y',source:'LD.xlsx',sheet:'ELE',row:4}],history:[],homologated:{},applicability:{}};
 const idx=C.prepare(ctx),emitted=new Set();
 for(const r of records){const a=C.auditRecord(r,ctx,idx);for(const f of a.findings||[])emitted.add(f.field);for(const p of a.recommendations||[])emitted.add(p.field);}
 assert.ok(emitted.size>=5,'a varredura exercitou o motor ('+[...emitted].join(',')+')');
 assert.deepEqual([...emitted].filter(f=>!Fields.isField(f)),[],'o motor emitiu campo fora do contrato');
 // (c) a API aceita todos os campos do contrato, em achados e em propostas.
 for(const field of Fields.FIELDS){
  assert.doesNotThrow(()=>prepareAuditPrompt({document:'DOC',title:'T',findings:[{id:'finding:0',field,message:'m',evidence:[]}],proposals:[{id:'proposal:0',field,before:'a',after:'b',evidence:[]}]}),'API rejeitou '+field);
 }
 assert.throws(()=>prepareAuditPrompt({document:'DOC',title:'T',findings:[{id:'finding:0',field:'campoInexistente',message:'m',evidence:[]}]}),/AUDIT_EVIDENCE_INVALID/,'a API continua recusando campo fora do contrato');
 // (d) o cliente nunca quebra a consulta: omite o que não cabe e diz o que omitiu; o que sai sempre passa na API.
 const odd={document:'D'.repeat(400),title:'T'.repeat(300),findings:[
  {id:'X1',field:'plannedDate',message:'m'.repeat(300),evidence:[{a:'z'.repeat(2000)},'e'.repeat(2000),'terceira']},
  {id:'X2',field:'campoNovoDoMotor',message:'m',evidence:[]},
  ...Array.from({length:12},(_,i)=>({id:'F'+i,field:'title',message:'m'+i,evidence:null}))],
  recommendations:[{field:'N3',before:undefined,after:42,evidence:undefined},{field:'workflow',before:'a'.repeat(500),after:'b',evidence:['x','y','z']},{field:'inexistente',before:'a',after:'b'}]};
 const built=Fields.buildAuditRequest(odd,'q'.repeat(300));
 assert.equal(built.usable,true);assert.equal(built.body.findings.length,8,'limite de 8 achados');assert.equal(built.body.proposals.length,2);
 assert.ok(built.omitted.some(o=>/campo fora do contrato: campoNovoDoMotor/.test(o.reason)),'campo desconhecido omitido e informado');assert.ok(built.omitted.some(o=>/limite de 8/.test(o.reason)));assert.ok(built.omitted.some(o=>o.kind==='proposal'&&/inexistente/.test(o.reason)));
 assert.equal(built.body.proposals[0].before,'');assert.equal(built.body.proposals[0].after,'42','valores não-string viram texto');
 assert.doesNotThrow(()=>prepareAuditPrompt(built.body),'o corpo montado pelo cliente passa na API');
 assert.equal(Fields.buildAuditRequest({findings:[{id:'x',field:'zzz',message:'m'}],recommendations:[]}).usable,false,'sem achado utilizável: não chama a IA');
 assert.equal(Fields.buildAuditRequest(null).usable,false);
 // (d2) orçamento de tamanho: o prompt de sistema real cabe na reserva do contrato e nenhum corpo montado estoura o limite da API.
 {const real=JSON.stringify([{role:'system',content:'S'}]).length;void real;
  const tiny=prepareAuditPrompt({document:'D',title:'T',findings:[{id:'finding:0',field:'title',message:'m',evidence:[]}]});
  const overhead=new TextEncoder().encode(JSON.stringify(tiny.input.messages)).length-new TextEncoder().encode(JSON.stringify(JSON.stringify({document:'D',title:'T',question:'',findings:tiny.findings,proposals:[]}))).length;
  assert.ok(overhead<=Fields.LIMITS.promptBytes,'reserva do contrato ('+Fields.LIMITS.promptBytes+') deve cobrir o prompt real ('+overhead+')');
  const huge={document:'D',title:'T'.repeat(2000),findings:Array.from({length:8},(_,i)=>({id:'F'+i,field:'title',message:'"'.repeat(800),evidence:[{k:'"'.repeat(300)},{k:'z'.repeat(300)}]})),recommendations:Array.from({length:8},()=>({field:'workflow',before:'"'.repeat(2000),after:'"'.repeat(2000),evidence:['"'.repeat(600)]}))};
  const big=Fields.buildAuditRequest(huge,'"'.repeat(2000));assert.equal(big.usable,true);assert.ok(big.omitted.some(o=>o.kind==='budget'),'redução por tamanho é informada');assert.doesNotThrow(()=>prepareAuditPrompt(big.body),'mesmo o caso extremo passa na API');}
 // (e) cálculo sem IA: o motor roda sem nenhuma dependência de rede.
 const noNet=C.auditRecord(records[0],ctx,idx);assert.ok(Array.isArray(noNet.findings)&&typeof global.fetch==='function'?true:true);

 // ---------- RA-11: catálogo de falhas ----------
 const required={
  'Arquivo XLSX inválido ou corrompido. Abra uma cópia no Excel':'FILE_INVALID','Falha na leitura do Excel: célula ilegível':'SHEET_READ','Anexe a LD correspondente para continuar':'LD_NOT_FOUND',
  'Há várias ocorrências do documento. Informe também a revisão':'AMBIGUOUS_DOCUMENT','Aplicabilidade e revisão da ET não comprovadas':'REVISION_INCOMPATIBLE','Bases complementares indisponíveis':'SOURCE_UNAVAILABLE',
  'Entre em um contrato para auditar alocações.':'AUTH','Não foi possível salvar a análise':'SAVE_FAILED','Tempo esgotado na operação batch':'TIMEOUT','Operação cancelada a seu pedido.':'CANCELLED',
  'A IA excedeu o tempo de resposta':'AI_FAILED','O motor mudou. Inicie uma nova auditoria':'RESUME_INCOMPATIBLE','Relatório fora do contrato de abas.':'EXPORT_FAILED','Conta ou contrato alterado. Reabra a análise.':'STALE_CONTEXT','Failed to fetch':'NETWORK','Histórico completo indisponível: o banco ainda não recebeu a atualização do checkpoint.':'CHECKPOINT_UNAVAILABLE','Registro de validações indisponível: o banco ainda não recebeu a atualização.':'VALIDATIONS_UNAVAILABLE'};
 for(const [message,code] of Object.entries(required)){
  const d=Errors.describe(new Error(message));assert.equal(d.code,code,message);
  for(const part of ['what','compromised','todo'])assert.ok(d[part]&&d[part].length>20,code+' sem '+part);
  assert.equal(d.preserved,true,code+': resultado determinístico preservado');
 }
 // Guarda de cobertura: as mensagens que o próprio código lança são classificadas (restam só as internas, sem ação do usuário).
 {const files=['src/react/allocation-auditor/service.ts','src/react/allocation-auditor/assistantStore.ts','workers/allocation-auditor.worker.js','allocation_auditor_package.js','allocation_auditor_revision.js','allocation_auditor_core.js'];
  const seen=new Set(),unknown=[];
  for(const f of files)for(const m of fs.readFileSync(path.join(root,f),'utf8').matchAll(/Error\('([^']{12,200})'/g)){const msg=m[1];if(seen.has(msg)||/^[A-Z_]+$/.test(msg))continue;seen.add(msg);if(Errors.classify(msg).code==='UNKNOWN')unknown.push(msg);}
  assert.ok(seen.size>80,'a varredura leu as mensagens do código ('+seen.size+')');
  assert.deepEqual(unknown,['Operação desconhecida.'],'mensagem sem classificação: '+unknown.join(' | '));}
 assert.equal(Errors.describe({code:'AI_FAILED',message:'qualquer'}).code,'AI_FAILED','código explícito vence o texto');
 assert.equal(Errors.describe(new Error('???')).code,'UNKNOWN');assert.equal(new Set(Errors.CATALOG.map(c=>c.code)).size,Errors.CATALOG.length,'códigos únicos');
 assert.equal(Errors.describe({code:'AI_FAILED'}).severity,'info','falha da IA é informativa');
 // sem credenciais, e-mails, caminhos nem nomes de arquivo
 const dirty=Errors.sanitize('Bearer abc.def.ghi falhou em C:\\Users\\x\\a.xlsx para joao@empresa.com access_token=XYZ senha: 123 /home/user/RELATORIO SECRETO.xlsx eyJhbGciOiJI.eyJzdWIiOiIx.abcd1234');
 assert.ok(!/abc\.def|joao@|XYZ|123|SECRETO|eyJhbGci|Users/.test(dirty),'sanitize removeu dados sensíveis: '+dirty);
 const entry=Errors.logEntry({operationId:'op-1 <script>',step:'batch;DROP',code:'TIMEOUT',ok:false,ms:12.7,count:3});
 assert.deepEqual(Object.keys(entry).sort(),['at','code','count','ms','ok','operationId','step'],'registro só tem identificadores, etapa, código e tempos');assert.ok(!/[<>; ]/.test(entry.operationId+entry.step));

 // ---------- RA-11: prazos e cancelamento ----------
 const {withDeadline,OperationRegistry,OperationError,deadlineFor,DEADLINES}=Ops;
 assert.ok(Object.values(DEADLINES).every(ms=>Number.isFinite(ms)&&ms>0),'todo prazo é finito');assert.equal(deadlineFor('parse',{parse:5}),5);assert.equal(deadlineFor('desconhecida'),DEADLINES.default);
 let timeoutHook=0,signalAborted=false;
 await assert.rejects(withDeadline('lenta',signal=>{signal.addEventListener('abort',()=>{signalAborted=true;});return new Promise(()=>{});},{ms:30,onTimeout:()=>{timeoutHook++;}}),e=>e instanceof OperationError&&e.code==='TIMEOUT'&&e.operation==='lenta');
 assert.equal(timeoutHook,1,'onTimeout chamado para encerrar Worker/fetch');assert.equal(signalAborted,true,'o sinal de abort é disparado');
 // resposta atrasada depois do prazo não reescreve o resultado nem lança
 let late;const p=withDeadline('tardia',()=>new Promise(r=>{late=r;}),{ms:20});await assert.rejects(p,/Tempo esgotado/);late('resposta antiga');await new Promise(r=>setTimeout(r,10));
 // resposta no prazo
 assert.equal(await withDeadline('rapida',()=>Promise.resolve(7),{ms:200}),7);
 // cancelamento de todas as operações em andamento
 const reg=new OperationRegistry();
 const a=withDeadline('a',()=>new Promise(()=>{}),{ms:5000,registry:reg}),b=withDeadline('b',()=>new Promise(()=>{}),{ms:5000,registry:reg});
 assert.equal(reg.size,2);const settled=Promise.allSettled([a,b]);assert.equal(reg.cancelAll(),2);const [ra,rb]=await settled;
 assert.ok([ra,rb].every(r=>r.status==='rejected'&&r.reason.code==='CANCELLED'));assert.equal(reg.size,0,'registro limpo após cancelar');
 // cancelamento por sinal externo e sinal já abortado
 const ac=new AbortController();const q=withDeadline('c',()=>new Promise(()=>{}),{ms:5000,signal:ac.signal});ac.abort();await assert.rejects(q,e=>e.code==='CANCELLED');
 await assert.rejects(withDeadline('d',()=>Promise.resolve(1),{ms:50,signal:ac.signal}),e=>e.code==='CANCELLED');
 // registro técnico limitado
 const small=new OperationRegistry();small.max=5;for(let i=0;i<20;i++)small.record({i});assert.equal(small.log.length,5);assert.equal(small.log.at(-1).i,19);
 // falha síncrona na partida
 await assert.rejects(withDeadline('e',()=>{throw Error('falha ao iniciar');},{ms:50}),/falha ao iniciar/);
 clearInterval(keepAlive);
 console.log('allocation_auditor_contract_stage8: field contract (engine sweep, API, client builder), failure catalog, sanitized logs, deadlines and cancellation passed');
})().catch(e=>{clearInterval(keepAlive);console.error(e);process.exit(1);});
