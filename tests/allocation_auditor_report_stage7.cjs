'use strict';
// Etapa 7 (RA-04, RA-15) — relatório didático: sugestão nunca aparece como correção; valor correto só quando comprovado; trilha completa.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const Report=require(path.join(root,'allocation_auditor_report.js')),Opinion=require(path.join(root,'allocation_auditor_opinion.js')),Reaudit=require(path.join(root,'allocation_auditor_reaudit.js'));
const H=Report.HEADERS,col=(name,list)=>list.indexOf(name);

// ---------- 1. Modelo puro ----------
const finding=(id,severity,field,extra={})=>({id,severity,field,message:'Mensagem '+id,source:'Fonte '+id,evidence:[],ruleVersion:'1.6.0',...extra});
const rec=(field,before,after,extra={})=>({field,before,after,justification:'Justificativa '+field,confidence:'media',evidence:['{"file":"LD.xlsx"}'],...extra});
const ldEvidence={field:'title',alocacao:'TITULO ALOC',ld:'TITULO LD',file:'LD.xlsx',sheet:'ELE',row:7};
const rows=[
 {lineage:'L1',allocation:'ALOC-1',document:'DOC-1',revision:'0',sourceFile:'ALOC.xlsx',sourceSheet:'GERAL',sourceRow:5,title:'TITULO ALOC',workflow:'WF-OLD',
  findings:[finding('LD-TITLE-MISMATCH','error','title',{origin:'LD exata',evidence:[ldEvidence]}),finding('WF-1','pending','workflow',{origin:'Base normativa'}),finding('S-1','suggestion','title',{suggestion:{after:'Titulo sugerido'}})],
  recommendations:[rec('workflow','WF-OLD','WF-NEW'),rec('databook','DB-OLD','DB-NEW')]},
 {lineage:'L2',allocation:'ALOC-1',document:'DOC-2',revision:'0',sourceFile:'ALOC.xlsx',sourceSheet:'GERAL',sourceRow:6,findings:[],recommendations:[]},
 {lineage:'L3',allocation:'ALOC-1',document:'DOC-3',revision:'1',sourceFile:'ALOC.xlsx',sourceSheet:'GERAL',sourceRow:7,levels:['N1','N2'],findings:[finding('LV','error','levels')],recommendations:[rec('N2','N2','N2-NOVO')]}
];
const events=[
 {lineage:'L1',document:'DOC-1',revision:'0',field:'workflow',before:'WF-OLD',after:'WF-NEW',decision:'accepted',state:'Correção proposta',justification:'Conferido na LD',evidence:['LD.xlsx linha 7'],actor:'maria',at:'2026-11-06T10:00:00Z'},
 {lineage:'L1',document:'DOC-1',revision:'0',field:'databook',before:'DB-OLD',after:'DB-NEW',decision:'rejected',state:'Correção proposta',justification:'Não procede',evidence:[],actor:'joao',at:'2026-11-06T11:00:00Z'}
];
const approved=[events[0]];
const op=Opinion.build({rows,events});
const m=Report.build({rows,events,approved,opinion:op,sources:[{name:'ALOC.xlsx',kind:'allocation',sha256:'a'.repeat(64)},{name:'LD.xlsx',kind:'ld',sha256:'b'.repeat(64),model:'mapped'}],versions:{eap:'v7'},contract:'QA'});

// O QUE CORRIGIR: erros primeiro, sem sugestões; local, referência e valores separados.
assert.equal(m.toFix.length,3,'erro de título, pendência de workflow e erro de níveis');
assert.ok(m.toFix[0][0].startsWith('Corrigir')&&m.toFix.at(-1)[0].startsWith('Conferir'),'erros confirmados vêm antes das pendências');
const fixTitle=m.toFix.find(r=>r[col('Regra',H.toFix)].startsWith('LD-TITLE-MISMATCH'));
assert.equal(fixTitle[col('Valor encontrado',H.toFix)],'TITULO ALOC');assert.equal(fixTitle[col('Valor de referência encontrado (a confirmar)',H.toFix)],'TITULO LD');
assert.match(fixTitle[col('Valor correto (somente quando comprovado)',H.toFix)],/^Sem valor comprovado/,'valor da LD é referência a confirmar, não valor correto');
assert.equal(fixTitle[col('Onde corrigir',H.toFix)],'LD: LD.xlsx · aba ELE · linha 7');
assert.match(fixTitle[col('Como verificar a resolução',H.toFix)],/Reexecutar auditoria.*REAUDITORIA/);
const fixWf=m.toFix.find(r=>r[col('Regra',H.toFix)].startsWith('WF-1'));
assert.match(fixWf[col('Onde corrigir',H.toFix)],/ALOC\.xlsx · aba GERAL · célula C5/,'campo editável da alocação aponta a célula');
assert.equal(fixWf[col('Alocação',H.toFix)],'ALOC-1');assert.equal(fixWf[col('Documento',H.toFix)],'DOC-1');assert.equal(fixWf[col('Revisão',H.toFix)],'0');
for(const r of m.toFix){assert.ok(r[col('Por que isso importa',H.toFix)].length>20);assert.ok(r[col('Ação recomendada',H.toFix)].length>20);}

// PROPOSTAS: valor sugerido nunca é "corrigido"; decisão e responsável aparecem.
const prop=(field)=>m.proposals.find(r=>r[col('Tipo',H.proposals)]==='Proposta de correção'&&r[col('Campo',H.proposals)]===field);
assert.equal(prop('Workflow')[col('Decisão',H.proposals)],'Autorizada — falta aplicar');assert.equal(prop('Workflow')[col('Decidido por',H.proposals)],'maria');
assert.equal(prop('Caminho do Data Book')[col('Decisão',H.proposals)],'Recusada');assert.equal(prop('Caminho do Data Book')[col('Justificativa da decisão',H.proposals)],'Não procede');
assert.equal(prop('Nível 2 da EAP')[col('Decisão',H.proposals)],'Aguardando decisão');assert.equal(prop('Workflow')[col('Valor atual (recebido)',H.proposals)],'WF-OLD');assert.equal(prop('Workflow')[col('Valor sugerido (NÃO aplicado)',H.proposals)],'WF-NEW');
assert.ok(H.proposals.includes('Valor sugerido (NÃO aplicado)')&&!H.proposals.some(h=>/corrigido/i.test(h)),'nenhuma coluna de proposta se chama corrigido');
const preventive=m.proposals.filter(r=>r[0].startsWith('Sugestão preventiva'));assert.equal(preventive.length,1);assert.equal(m.proposals.at(-1)[0].startsWith('Sugestão preventiva'),true,'sugestão preventiva por último');
assert.match(preventive[0][col('Como decidir',H.proposals)],/não é erro confirmado/);
// Autorizado: valor correto passa a aparecer em O QUE CORRIGIR (com quem autorizou) quando o campo continua com apontamento.
{const ev2=[{lineage:'L1',document:'DOC-1',revision:'0',field:'workflow',after:'WF-NEW',decision:'accepted',state:'Correção proposta',justification:'ok ok',evidence:['x'],actor:'maria',at:'2026-11-06T10:00:00Z'}];
 const r2=Report.build({rows,events:ev2,approved:ev2,opinion:Opinion.build({rows,events:ev2})});
 const wf=r2.toFix.find(r=>r[col('Regra',H.toFix)].startsWith('WF-1'));assert.equal(wf[col('Valor correto (somente quando comprovado)',H.toFix)],'WF-NEW (autorizado por maria; ainda não aplicado na cópia)');}

// CORREÇÕES VERIFICADAS: só alteração verificada; prova depende da reauditoria.
const files=[{name:'03_x.xlsx',changes:[{lineage:'L3',document:'DOC-3',revision:'1',field:'N2',before:'N2',after:'N2-NOVO',verified:true,sheet:'GERAL',cell:'L7'},{lineage:'L1',field:'workflow',after:'WF-NEW',before:'WF-OLD',verified:false,cell:'C5'}]}];
{const withFile=Report.build({rows,events,approved,files,opinion:Opinion.build({rows,events,files,reaudit:[]})});
 assert.equal(withFile.verified.length,1,'alteração não verificada não entra');
 const v=withFile.verified[0];assert.equal(v[col('Valor corrigido',H.verified)],'N2-NOVO');assert.equal(v[col('Célula',H.verified)],'L7');assert.equal(v[col('Prova de resolução',H.verified)],'Aplicada — falta reauditar','sem reauditoria não há prova');
 const proven=Report.build({rows,events,approved,files,opinion:Opinion.build({rows,events,files,reaudit:[{lineage:'L3',findings:[],recommendations:[]}]})});
 assert.equal(proven.verified[0][col('Prova de resolução',H.verified)],'Resolvida (comprovada)');assert.match(proven.verified[0][col('Verificação feita',H.verified)],/reauditoria da cópia/);}
assert.equal(m.verified.length,0,'sem alterações geradas não há "correção verificada" inventada');

// REFERÊNCIAS E DECISÕES: trilha completa em ordem cronológica, fontes com SHA-256 e versões.
assert.deepEqual(m.references.decisions.map(d=>d[1]),['maria','joao']);assert.equal(m.references.decisions[1][7],'Recusada');
assert.equal(m.references.sources[0][2],'a'.repeat(64));assert.match(m.references.sources[1][3],/sem correção automática/);assert.deepEqual(m.references.versions,[['eap','v7']]);

// REAUDITORIA no modelo: itens resolvidos entram em CORREÇÕES VERIFICADAS como prova da execução anterior.
{const before=[rows[0]],after=[{...rows[0],findings:[finding('WF-1','pending','workflow',{origin:'Base normativa'})],recommendations:[]}];
 const cmp=Reaudit.compare(before,after),r3=Report.build({rows:after,events:[],opinion:Opinion.build({rows:after}),comparison:cmp});
 assert.ok(r3.reaudit.some(x=>x[5]==='Resolvida (comprovada pela reauditoria)'&&x[3]==='LD-TITLE-MISMATCH'));assert.ok(r3.reaudit.some(x=>x[5]==='Persiste após a correção'&&x[3]==='WF-1'));
 assert.ok(r3.verified.some(x=>x[0].startsWith('Reauditoria')&&/Resolvida \(comprovada pela reauditoria\)/.test(x[12])));}

// A orientação do relatório e a do chat são a mesma (tabelas não divergem).
{const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/react/allocation-auditor/chatView.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);
 const chat=mod.exports.buildItems([{lineage:'X',document:'D',revision:'0',findings:Object.keys(Report.WHY).map(f=>({id:'F-'+f,severity:'error',field:f,message:'m'})),recommendations:[]}],null,[]);
 for(const it of chat)assert.equal(it.why,Report.WHY[it.field],'orientação "por que importa" divergente para '+it.field);}

// Proposta aplicada sem reauditoria que a cubra também impede "pronta" (encerrar exige reauditoria).
{const only=[{lineage:'P1',allocation:'A',document:'D',revision:'0',findings:[],recommendations:[rec('workflow','OLD','NEW')]}];
 const filesP=[{name:'03_x.xlsx',changes:[{lineage:'P1',field:'workflow',after:'NEW',before:'OLD',verified:true,cell:'C2'}]}];
 const unproven=Opinion.build({rows:only,files:filesP,reaudit:[]});assert.ok(unproven.blockers.some(b=>b.code==='SEM-REAUDITORIA-PROPOSTA'));assert.equal(unproven.state,'verify');
 const provenP=Opinion.build({rows:only,files:filesP,reaudit:[{lineage:'P1',findings:[],recommendations:[]}]});assert.equal(provenP.state,'ready');assert.equal(provenP.counts.proposals.resolvedProven,1);
 assert.equal(Opinion.build({rows:only,files:filesP}).state,'ready','sem modo reauditoria vale a verificação da própria cópia (compatível)');}

// ---------- 2. Pacote real (Worker) ----------
const dir=path.join(root,'workers'),out=[];
const box={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:crypto.webcrypto,setTimeout,clearTimeout,postMessage:r=>out.push(r)};
box.self=box;box.globalThis=box;const ctx=vm.createContext(box);
box.importScripts=(...ps)=>{for(const p of ps)vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx,{filename:p});};
vm.runInContext(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8'),ctx);
const X=box.XLSX;let id=0;
async function call(operation,input){out.length=0;await box.onmessage({data:{id:++id,operation,input}});assert.equal(out.length,1);if(out[0].error)throw Error(out[0].error);return out[0].result;}
const ROOT='GRCON_Auditoria_Preventiva/';
(async()=>{
 const doc='C1O_RNEST_U32_5.7.3.1_ELE_TEST_TAG-A';
 const base={contract:'QA',progress:1,total:1,sources:[],files:[],exceptions:[],plan:{items:[]}};
 const row={contract:'QA',document:doc,revision:'0',title:'TITULO',officialAllocation:true,sourceFile:'QA.xlsx',sourceSheet:'GERAL',sourceRow:2,sourceHash:'a'.repeat(64),allocation:'QA-001',workflow:'WF-OLD',discipline:'ELE',eap:'5.7.3.1',databook:'DB|QUALIDADE|ELE',levels:['L1'],lineage:'QA-LINE',docKind:'ET',
  findings:[{id:'WORKFLOW-REFERENCE',category:'workflow',field:'workflow',severity:'pending',message:'Workflow divergente da referência',source:'Referência QA',evidence:[{actual:'WF-OLD',expected:'WF-NEW'}]}],
  recommendations:[{field:'workflow',before:'WF-OLD',after:'WF-NEW',evidence:['Referência sintética'],confidence:'fonte documental exata',justification:'Verificar workflow na fonte antes de aprovar.'}]};
 const read=async pack=>{const zip=await box.JSZip.loadAsync(pack.bytes);return {zip,wb:X.read(await zip.file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'}),manifest:JSON.parse(await zip.file(ROOT+'05_Manifesto.json').async('string'))};};
 const json=(wb,name)=>X.utils.sheet_to_json(wb.Sheets[name],{defval:''});
 // (a) proposta pendente: células preservadas, proposta separada, nada "corrigido".
 const a=await read(await call('assistant-package',{...base,rows:[row],events:[]}));
 assert.deepEqual([...a.wb.SheetNames],['LEIA PRIMEIRO','O QUE CORRIGIR','PROPOSTAS PARA REVISÃO','CORREÇÕES VERIFICADAS','REFERÊNCIAS E DECISÕES','DETALHAMENTO','ALOCAÇÃO CORRIGIDA']);
 const alloc=json(a.wb,'ALOCAÇÃO CORRIGIDA')[0];assert.equal(alloc.Workflow,'WF-OLD');assert.equal(alloc['Alterações verificadas nesta linha'],'');assert.match(alloc['Propostas não aplicadas (valor atual preservado)'],/proposto «WF-NEW»/);
 assert.equal(json(a.wb,'PROPOSTAS PARA REVISÃO')[0]['Valor sugerido (NÃO aplicado)'],'WF-NEW');assert.equal(json(a.wb,'PROPOSTAS PARA REVISÃO')[0]['Decisão'],'Aguardando decisão');
 const emptyVerified=X.utils.sheet_to_json(a.wb.Sheets['CORREÇÕES VERIFICADAS'],{header:1});assert.match(emptyVerified[1][0],/Nenhuma correção verificada/,'aba vazia explica o motivo, sem linhas fictícias');
 const fix=json(a.wb,'O QUE CORRIGIR');assert.equal(fix.length,1);assert.equal(fix[0]['Valor encontrado'],'WF-OLD');assert.equal(fix[0]['Valor de referência encontrado (a confirmar)'],'WF-NEW');assert.match(fix[0]['Valor correto (somente quando comprovado)'],/^Sem valor comprovado/);
 assert.equal(json(a.wb,'DETALHAMENTO')[0]['Valor atual'],'WF-OLD');
 const leia=JSON.stringify(X.utils.sheet_to_json(a.wb.Sheets['LEIA PRIMEIRO'],{header:1}));assert.match(leia,/POR ONDE COMEÇAR/);assert.match(leia,/Nada ali é correção realizada/);assert.ok(!/REAUDITORIA \(ANTERIOR/i.test(leia),'sem comparação, sem seção de reauditoria');
 assert.equal(a.wb.SheetNames.includes('REAUDITORIA'),false);
 // (b) reauditoria anterior × atual aparece e comprova resolução; regressão é dita.
 const cmp=Reaudit.compare([{...row,findings:[{id:'OLD-ERR',field:'tag',severity:'error',message:'TAG ausente'},...row.findings]}],[row]);
 const b=await read(await call('assistant-package',{...base,rows:[row],events:[],comparison:cmp}));
 assert.ok(b.wb.SheetNames.includes('REAUDITORIA'));assert.equal(b.wb.SheetNames.indexOf('REAUDITORIA'),5,'REAUDITORIA logo após as cinco abas didáticas');
 const re=json(b.wb,'REAUDITORIA');assert.ok(re.some(x=>x['Regra']==='OLD-ERR'&&x['Situação']==='Resolvida (comprovada pela reauditoria)'));assert.ok(re.some(x=>x['Regra']==='WORKFLOW-REFERENCE'&&x['Situação']==='Persiste após a correção'));
 assert.ok(json(b.wb,'CORREÇÕES VERIFICADAS').some(x=>String(x['Origem da verificação']).startsWith('Reauditoria')));
 assert.match(JSON.stringify(X.utils.sheet_to_json(b.wb.Sheets['LEIA PRIMEIRO'],{header:1})),/1 apontamento\(s\) resolvido/);
 // (c) manifesto e parecer consistentes com o relatório.
 assert.equal(a.manifest.opinion.counts.proposals.total,1);assert.equal(a.manifest.normativeApproval,false);
 console.log('allocation_auditor_report_stage7: model, sheets, unapplied proposals preserved, proven values only, verification proof and reaudit sheet passed');
})().catch(e=>{console.error(e);process.exit(1);});
