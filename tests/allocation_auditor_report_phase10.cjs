'use strict';
// Relatório: aba ALOCAÇÃO CORRIGIDA ao lado do detalhamento e aba TÍTULOS DA LD (atual × sugerido).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.resolve(__dirname,'..','workers'),out=[];
const box={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:crypto.webcrypto,setTimeout,clearTimeout,postMessage:r=>out.push(r)};
box.self=box;box.globalThis=box;const ctx=vm.createContext(box);
box.importScripts=(...ps)=>{for(const p of ps)vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx,{filename:p});};
vm.runInContext(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8'),ctx);
const X=box.XLSX,C=box.GrconAllocationAuditorCore;
let id=0;async function pack(input){out.length=0;await box.onmessage({data:{id:++id,operation:'assistant-package',input}});if(out[0].error)throw Error(out[0].error);return out[0].result;}
const ROOT='GRCON_Auditoria_Preventiva/';
const code='C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-NF-123-BOBINA-121';
const row=(i,over={})=>({contract:'qa',document:i?'DOC-'+i:code,revision:'0',allocation:'C1O-ALOC-CM-0372-2026',sourceFile:'ALOC.xlsx',sourceSheet:'GERAL',sourceRow:i+2,lineage:'L'+i,ruleVersion:C.VERSION,officialAllocation:true,plannedDate:'2026-11-20T00:00:00.000Z',workflow:'WF ANTIGO',activeDocument:'SIM',action:'INCLUIR',purpose:'EMISSÃO',criticalDocument:'NÃO',observation:'',databook:'DB|A',levels:['1','','','','',''],origin:{file:'LD.xlsx',sheet:'ELE',row:i+2},findings:[],recommendations:[],...over});
const base={contract:'qa',progress:4,total:4,versions:{databook:'v1'},sources:[],sessionId:'s',runId:'r',exceptions:[],events:[],files:[]};
(async()=>{
 const rows=[
  row(0,{findings:[{id:'NT-PREFIX-IN-REFERENCE',category:'tag',field:'document',severity:'pending',message:'O código usa nt-, mas o TAG consta no cadastro.',evidence:[{tag:'NF-123-BOBINA-121'}],source:'Cadastro de TAGs',ruleVersion:C.VERSION,suggestion:{field:'document',before:code,after:'C1O_RNEST_U32_10.2.1.2_ELE_RIR_NF-123-BOBINA-121'}}],
   recommendations:[{field:'workflow',before:'WF ANTIGO',after:'WF NOVO',justification:'Valor da LD exata',evidence:[JSON.stringify({origin:'LD exata',row:2})],confidence:'fonte documental exata',humanReview:true}]}),
  row(1,{title:'RELATORIO DE TRANSFORMDOR',findings:[{id:'TITLE-TYPO-SUSPECT',category:'title',field:'title',severity:'pending',message:'Possível erro de digitação.',evidence:[],source:'Ortografia',ruleVersion:C.VERSION,suggestion:{field:'title',before:'RELATORIO DE TRANSFORMDOR',after:'RELATORIO DE TRANSFORMADOR'}}],
   recommendations:[{field:'title',before:'RELATORIO DE TRANSFORMDOR',after:'RELATORIO DE TRANSFORMADOR',justification:'"TRANSFORMDOR" ocorre raramente na LD.',evidence:[JSON.stringify({ajustes:[{de:'TRANSFORMDOR',para:'TRANSFORMADOR'}]})],confidence:'similaridade',humanReview:true}]}),
  row(2),row(3,{workflow:'WF OK'})
 ];
 const result=await pack({...base,rows});
 const zip=await box.JSZip.loadAsync(result.bytes,{checkCRC32:true});
 const bytes=await zip.file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array');
 const wb=X.read(bytes,{type:'array'});
 assert.deepEqual([...wb.SheetNames],['LEIA PRIMEIRO','O QUE CORRIGIR','PROPOSTAS PARA REVISÃO','CORREÇÕES VERIFICADAS','REFERÊNCIAS E DECISÕES','DETALHAMENTO','ALOCAÇÃO CORRIGIDA','TÍTULOS DA LD']);
 // Alocação corrigida (RA-04): 16 colunas oficiais com o valor RECEBIDO preservado; proposta/autorização não preenchem a célula
 const al=X.utils.sheet_to_json(wb.Sheets['ALOCAÇÃO CORRIGIDA'],{defval:''});
 assert.equal(al.length,4);
 assert.deepEqual(Object.keys(al[0]).slice(0,16),['Nome do documento','Data prevista','Workflow','Documento ativo','Ação','Data da linha base','Propósito de emissão original','Documento crítico','Observação','Caminho do Data Book','N1','N2','N3','N4','N5','N6']);
 assert.equal(al[0]['Workflow'],'WF ANTIGO','proposta não aprovada não vira valor da célula');assert.equal(al[0]['Nome do documento'],code,'o código original não é reescrito');
 assert.equal(al[0]['Código sugerido (não aplicado)'],'C1O_RNEST_U32_10.2.1.2_ELE_RIR_NF-123-BOBINA-121');
 assert.equal(al[0]['Alterações verificadas nesta linha'],'');assert.equal(al[0]['Situação das alterações'],'Nada aplicado: 1 proposta(s) aguardam decisão');assert.match(al[0]['Propostas não aplicadas (valor atual preservado)'],/Workflow: proposto «WF NOVO» \(valor atual preservado\)/);
 assert.equal(al[0]['Data prevista'],'20/11/2026','data legível');
 assert.equal(al[3]['Workflow'],'WF OK');assert.equal(al[3]['Alterações verificadas nesta linha'],'');assert.equal(al[3]['Situação das alterações'],'—');
 // sem destaque de alteração: nada foi aplicado
 const ex=new box.ExcelJS.Workbook();await ex.xlsx.load(bytes);
 const sheet=ex.getWorksheet('ALOCAÇÃO CORRIGIDA');
 assert.ok(!['FFFFE08A','FFC8E6C9'].includes(sheet.getCell('C2').fill?.fgColor?.argb),'célula não é destacada como alterada');
 assert.ok(sheet.getCell('S2').font.bold,'código sugerido em destaque');
 // Títulos da LD: título atual e sugerido lado a lado, termos alterados e origem
 const tl=X.utils.sheet_to_json(wb.Sheets['TÍTULOS DA LD'],{defval:''});
 assert.equal(tl.length,1);assert.equal(tl[0]['Título atual'],'RELATORIO DE TRANSFORMDOR');assert.equal(tl[0]['Título sugerido'],'RELATORIO DE TRANSFORMADOR');
 assert.equal(tl[0]['Termos alterados'],'TRANSFORMDOR → TRANSFORMADOR');assert.equal(tl[0]['LD de origem'],'LD.xlsx');assert.equal(tl[0]['Situação'],'Sugerida — aguarda decisão');
 // Detalhamento mostra valor atual × sugerido também para código e título
 const det=X.utils.sheet_to_json(wb.Sheets.DETALHAMENTO,{defval:''});
 const nt=det.find(d=>d['Regra / critério'].startsWith('NT-PREFIX-IN-REFERENCE'));
 assert.equal(nt['Valor atual'],code);assert.equal(nt['Valor sugerido'],'C1O_RNEST_U32_10.2.1.2_ELE_RIR_NF-123-BOBINA-121');assert.equal(nt['Campo'],'Código do documento');
 // Linguagem do RESUMO: parecer claro e guia das abas
 const res=JSON.stringify(X.utils.sheet_to_json(wb.Sheets['LEIA PRIMEIRO'],{header:1}));
 assert.match(res,/Parecer/i);assert.match(res,/ALOCAÇÃO CORRIGIDA/);assert.match(res,/TÍTULOS DA LD/);assert.match(res,/não representa aprovação da fiscalização|não equivale à aprovação/);
 assert.match(res,/Verificação complementar necessária/);assert.match(res,/não deve ser considerada pronta/);

 // Sem sugestão de título: a aba TÍTULOS DA LD não existe (nada fictício)
 const plain=await pack({...base,rows:[row(0),row(1)],total:2,progress:2});
 const pw=X.read(await (await box.JSZip.loadAsync(plain.bytes)).file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});
 assert.deepEqual([...pw.SheetNames],['LEIA PRIMEIRO','O QUE CORRIGIR','PROPOSTAS PARA REVISÃO','CORREÇÕES VERIFICADAS','REFERÊNCIAS E DECISÕES','DETALHAMENTO','ALOCAÇÃO CORRIGIDA']);

 // Correção apenas AUTORIZADA (sem cópia verificada): o valor recebido continua na célula e a situação diz que a cópia está pendente
 const row0=rows[0],ev={document:code,revision:'0',lineage:'L0',field:'workflow',before:'WF ANTIGO',after:'WF NOVO',decision:'accepted',evidence:['LD'],justification:'Conferido',actor:'u1',state:'Correção proposta'};
 const applied=await pack({...base,rows:[row0],total:1,progress:1,events:[ev],files:[]});
 const aw=X.read(await (await box.JSZip.loadAsync(applied.bytes)).file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});
 const authRow=X.utils.sheet_to_json(aw.Sheets['ALOCAÇÃO CORRIGIDA'])[0];assert.equal(authRow['Situação das alterações'],'Nada aplicado: 1 alteração(ões) autorizada(s), cópia pendente');assert.equal(authRow['Workflow'],'WF ANTIGO','autorização não preenche a célula');
 // Mais de uma alocação: abas próprias com o número, sem misturar N-1710 e ET
 const a372=[row(0,{allocation:'C1O-ALOC-CM-0372-2026',docKind:'ET',findings:[{id:'TAG-NOT-PROVEN',category:'tag',field:'tag',severity:'pending',message:'TAG não comprovado.',evidence:[],source:'x',ruleVersion:C.VERSION}]}),row(1,{allocation:'C1O-ALOC-CM-0372-2026',docKind:'ET'})];
 const a373=[row(5,{allocation:'C1O-ALOC-CM-0373-2026',docKind:'N-1710',document:'RL-5290.00-22313-91A-C1O-121',title:'RELATORIO DE TRANSFORMDOR',findings:[{id:'TITLE-TYPO-SUSPECT',category:'title',field:'title',severity:'pending',message:'Possível erro.',evidence:[],source:'o',ruleVersion:C.VERSION,suggestion:{field:'title',before:'RELATORIO DE TRANSFORMDOR',after:'RELATORIO DE TRANSFORMADOR'}}],recommendations:[{field:'title',before:'RELATORIO DE TRANSFORMDOR',after:'RELATORIO DE TRANSFORMADOR',justification:'j',evidence:[JSON.stringify({ajustes:[{de:'A',para:'B'}]})],confidence:'c',humanReview:true}]})];
 const multi=await pack({...base,rows:[...a372,...a373],total:3,progress:3});
 const mw=X.read(await (await box.JSZip.loadAsync(multi.bytes)).file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});
 assert.deepEqual([...mw.SheetNames],['LEIA PRIMEIRO','O QUE CORRIGIR','PROPOSTAS PARA REVISÃO','CORREÇÕES VERIFICADAS','REFERÊNCIAS E DECISÕES','DETALHAMENTO 0372-2026','ALOC. CORRIGIDA 0372-2026','DETALHAMENTO 0373-2026','ALOC. CORRIGIDA 0373-2026','TÍTULOS LD 0373-2026']);
 const d372=X.utils.sheet_to_json(mw.Sheets['DETALHAMENTO 0372-2026']),d373=X.utils.sheet_to_json(mw.Sheets['DETALHAMENTO 0373-2026']);
 assert.ok(d372.every(d=>d['Alocação']==='C1O-ALOC-CM-0372-2026'&&d['Norma']==='ET-5290'),'0372 só tem documentos ET');
 assert.ok(d373.every(d=>d['Alocação']==='C1O-ALOC-CM-0373-2026'&&d['Norma']==='N-1710'),'0373 só tem documentos N-1710');
 assert.equal(X.utils.sheet_to_json(mw.Sheets['ALOC. CORRIGIDA 0372-2026']).length,2);assert.equal(X.utils.sheet_to_json(mw.Sheets['ALOC. CORRIGIDA 0373-2026']).length,1);
 assert.equal(X.utils.sheet_to_json(mw.Sheets['TÍTULOS LD 0373-2026']).length,1);
 const mres=JSON.stringify(X.utils.sheet_to_json(mw.Sheets['LEIA PRIMEIRO'],{header:1}));
 assert.match(mres,/RESULTADO POR ALOCAÇÃO/);assert.match(mres,/C1O-ALOC-CM-0373-2026.*N-1710: 1/);assert.match(mres,/C1O-ALOC-CM-0372-2026.*ET-5290: 2/);
 assert.ok([...mw.SheetNames].every(n=>n.length<=31));
 // mesma numeração em anos diferentes não colide
 const dup=await pack({...base,rows:[row(0,{allocation:'ALOC-0372-2026'}),row(1,{allocation:'ALOC-0372-2027'})],total:2,progress:2});
 const dw=X.read(await (await box.JSZip.loadAsync(dup.bytes)).file(ROOT+'01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});
 assert.ok(dw.SheetNames.includes('DETALHAMENTO 0372-2026')&&dw.SheetNames.includes('DETALHAMENTO 0372-2027'));
 console.log('allocation_auditor_report_phase10: abas ALOCAÇÃO CORRIGIDA e TÍTULOS DA LD, destaques, código sugerido, termos alterados e linguagem do resumo aprovados');
})().catch(e=>{console.error(e);process.exit(1);});
