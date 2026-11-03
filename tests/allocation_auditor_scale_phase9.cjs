'use strict';
// Fase 9 — desempenho e escala com dados sintéticos (nenhum dado corporativo).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'workers'),out=[];
const box={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:crypto.webcrypto,setTimeout,clearTimeout,postMessage:r=>out.push(r)};
box.self=box;box.globalThis=box;const ctx=vm.createContext(box);
box.importScripts=(...ps)=>{for(const p of ps)vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx,{filename:p});};
vm.runInContext(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8'),ctx);
const C=box.GrconAllocationAuditorCore,A=box.GrconAllocationAssistant,K=box.GrconAllocationCorrections;
let id=0;async function call(op,input){out.length=0;await box.onmessage({data:{id:++id,operation:op,input}});if(out[0].error)throw Error(out[0].error);return out[0].result;}
const ms0=()=>Number(process.hrtime.bigint()/1000000n);
const result=[];
(async()=>{
 const history=Array.from({length:6000},(_,i)=>({contract:'qa',document:'RL-5290.00-22313-91A-C1O-'+String(100000+i%1500).slice(-3)+'-X'+(i%1500),revision:'0',fiscalComment:'Completar o título do documento conforme padrão '+i%40,sourceFile:'HIST.xlsx',sourceSheet:'GERAL',sourceRow:i+2,allocation:'C1O-ALOC-CM-0001-2026'}));
 for(const n of [100,500,1000,2500]){
  const records=Array.from({length:n},(_,i)=>({contract:'qa',document:'C1O_RNEST_U32_10.2.1.2_ELE_RIR_TR-'+String(1000+i),revision:'0',title:'TÍTULO '+i,allocation:'C1O-ALOC-CM-0372-2026',sourceFile:'ALOC.xlsx',sourceSheet:'GERAL',sourceRow:i+2,sourceHash:'a'.repeat(64),officialAllocation:true,workflow:'WF '+i%7,databook:'DB|'+i%11,levels:['1','','','','',''],discipline:'ELE'}));
  const ldRecords=records.map((r,i)=>({document:r.document,revision:'0',source:'LD.xlsx',sheet:'ELE',row:i+2,workflow:i%5===0?'WF NOVO':r.workflow,databook:r.databook,discipline:'ELE'}));
  const context={contract:'qa',records,ldRecords,history,bases:{databook:Array.from({length:11},(_,i)=>({databook:'DB|'+i}))},versions:{databook:'v1'},ldHashes:{'LD.xlsx':'b'.repeat(64)},homologated:{},applicability:{}};
  const t0=ms0();await call('context',context);let rows=[];
  for(let i=0;i<n;i+=100)rows.push(...await call('batch',{first:i,count:100}));
  const tAudit=ms0()-t0;assert.equal(rows.length,n);assert.ok(rows.every(r=>r.lineage&&Array.isArray(r.findings)),'nenhuma linha descartada silenciosamente');
  const t1=ms0(),plan=K.plan(rows,{...context,rules:[]},A,[]);const tPlan=ms0()-t1;
  assert.equal(plan.analyzed,n);assert.equal(plan.safe,0,'sem regra ativa nada é automático');assert.ok(plan.proposed>=Math.floor(n/5)-1);
  const t2=ms0(),groups=K.groupItems(plan.proposals);const tGroup=ms0()-t2;assert.ok(groups.length<=7);assert.equal(groups.reduce((s,g)=>s+g.items.length,0),plan.proposals.length,"agrupar não perde itens");
  const t3=ms0(),pack=await call('assistant-package',{...context,rows,progress:n,total:n,sessionId:'s',runId:'r',sources:[],events:[],files:[],exceptions:[],plan:{items:plan.items}});const tPack=ms0()-t3;
  assert.equal(pack.manifest.counts.documents,n);
  result.push({documents:n,history:history.length,auditMs:tAudit,planMs:tPlan,groupMs:tGroup,packageMs:tPack,zipBytes:pack.bytes.length});
  // Limites generosos: o objetivo é detectar regressões grosseiras, não medir hardware.
  assert.ok(tAudit<30000&&tPlan<5000&&tPack<60000,'tempos dentro do orçamento para '+n+' documentos: '+JSON.stringify(result.at(-1)));
 }
 // O 2º lote de 100 não recalcula o índice (referências imutáveis são preparadas uma vez por contexto).
 const idxCalls=(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8').match(/C\.prepare\(/g)||[]).length;assert.equal(idxCalls,1);
 console.log('allocation_auditor_scale_phase9:',JSON.stringify(result));
})().catch(e=>{console.error(e);process.exit(1);});
