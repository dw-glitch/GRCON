'use strict';
const assert=require('node:assert/strict');
(async()=>{const worker=(await import('../cloudflare/worker-entry.mjs')).default,original=global.fetch;
const {prepareAuditPrompt,analyzeAudit,validateAuditAnswer,auditAiFailure}=await import('../cloudflare/allocation-audit-ai.mjs');
const prompt=prepareAuditPrompt({document:'QA-121',title:'Teste sintético',findings:[{id:'finding:0',field:'title',message:'Conferir evidência',evidence:[]},{id:'finding:1',field:'eap',message:'EAP não comprovada',evidence:[]}]});
const proposalPrompt=prepareAuditPrompt({document:'QA-121',title:'Teste',question:'Qual é a evidência?',findings:[{id:'finding:0',field:'workflow',message:'Conferir',evidence:[]}],proposals:[{id:'proposal:0',field:'workflow',before:'A',after:'B',evidence:['LD exata']}]});
const proposed=validateAuditAnswer({findingIds:['finding:0'],proposalIds:['proposal:0'],rationale:'Conferir a LD indicada.',missingEvidence:[]},proposalPrompt);
assert.equal(proposed.proposals[0].after,'B');assert.equal(proposed.humanReview,true);
assert.throws(()=>validateAuditAnswer({findingIds:['finding:0'],proposalIds:['invented'],rationale:'X',missingEvidence:[]},proposalPrompt),/INVALID/);
const schema=prompt.input.response_format.json_schema;
assert.equal(prompt.input.response_format.type,'json_schema');
assert.equal(schema.type,'object');assert.equal(schema.additionalProperties,false);
assert.deepEqual(schema.properties.findingIds.items.enum,['finding:0','finding:1']);
assert.equal(schema.properties.rationale.maxLength,600);assert.equal(prompt.input.max_completion_tokens,500);
const answer={findingIds:['finding:1'],rationale:'Conferir a EAP na fonte aplicável.',missingEvidence:['EAP contratual']};
for(const output of [{response:answer},{choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]}]){
 let calls=0;const result=await analyzeAudit({run:async(_model,input)=>{calls++;assert.equal(input,prompt.input);return output;}},prompt);
 assert.equal(calls,1);assert.equal(result.references[0].id,'finding:1');assert.equal(result.normativeProof,false);assert.equal(result.humanReview,true);
}
assert.throws(()=>validateAuditAnswer('{broken',prompt),/AUDIT_AI_JSON_INVALID/);
assert.throws(()=>validateAuditAnswer({...answer,findingIds:['invented']},prompt),/AUDIT_AI_RESPONSE_INVALID/);
assert.throws(()=>validateAuditAnswer({...answer,rationale:'x'.repeat(601)},prompt),/AUDIT_AI_RESPONSE_INVALID/);
let incompleteCalls=0;
await assert.rejects(analyzeAudit({run:async()=>{incompleteCalls++;return {choices:[{finish_reason:'length',message:{content:JSON.stringify(answer)}}]};}},prompt),/AI_INCOMPLETE/);
assert.equal(incompleteCalls,1,'No automatic inference retry or acceptance of truncated output');
assert.equal(auditAiFailure(Error('AI_INCOMPLETE')).code,'AI_INCOMPLETE');
assert.equal(auditAiFailure(Error('AI_TIMEOUT')).code,'AI_TIMEOUT');
assert.equal(auditAiFailure(Error('AUDIT_AI_JSON_INVALID')).code,'AI_RESPONSE_INVALID');
assert.deepEqual(auditAiFailure(Error('private provider data')),auditAiFailure(Error('unknown')),'Provider details never escape through error messages');
const ws='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';let called=0,available=true,valid=true;
const env={SUPABASE_URL:'https://qa.test',SUPABASE_SECRET_KEY:'sb_secret_test',GRCON_DOCUMENT_AI_ENABLED:'true',AI:{run:async()=>{called++;return {response:{findingIds:valid?['finding:0']:['fake'],rationale:'Verificar a classe de tensão na fonte.',missingEvidence:['Classe de tensão']}};}}};
global.fetch=async(url,options)=>{if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'real-actor'});const b=JSON.parse(options.body);assert.equal(b.actor_id,'real-actor');if(b.target_workspace!==ws)return Response.json({code:'42501',message:'Sem acesso ao contrato.'},{status:403});assert.ok(String(url).endsWith('/grcon_document_ai_budget'));return Response.json(b.operation==='status'?{available}:{allowed:available});};
const request=(extra={},token=true)=>new Request('https://grcon.test/api/document-vault/allocation-audit-ai',{method:'POST',headers:token?{authorization:'Bearer qa'}:{},body:JSON.stringify({workspaceId:ws,document:'C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-BOBINA121',title:'Relatório de cabo',findings:[{id:'finding:0',field:'title',message:'Falta classe de tensão',evidence:[]}],...extra})});
try{assert.equal((await worker.fetch(request({},false),env)).status,401);assert.equal((await worker.fetch(request({workspaceId:other}),env)).status,403);assert.equal(called,0);available=false;assert.equal((await worker.fetch(request(),env)).status,429);assert.equal(called,0);available=true;let r=await worker.fetch(request(),env);assert.equal(r.status,200);const d=await r.json();assert.equal(d.analysis.normativeProof,false);assert.equal(d.analysis.humanReview,true);valid=false;r=await worker.fetch(request(),env);assert.equal(r.status,503);const rejected=await r.text();assert.ok(!rejected.includes('fake'));assert.ok(rejected.includes('AI_RESPONSE_INVALID'));
env.AI.run=async()=>({choices:[{finish_reason:'length',message:{content:JSON.stringify(answer)}}]});r=await worker.fetch(request(),env);assert.equal(r.status,503);assert.ok((await r.text()).includes('AI_INCOMPLETE'));
env.AI.run=async()=>{throw Error('private provider data');};r=await worker.fetch(request(),env);assert.equal(r.status,503);const unavailable=await r.text();assert.ok(unavailable.includes('AI_UNAVAILABLE'));assert.ok(!unavailable.includes('private provider data'));
assert.equal((await worker.fetch(request({title:'x'.repeat(10000)}),env)).status,413);console.log('allocation_auditor_api: native JSON schema, citation integrity, complete output, safe diagnostics, identity, contract authorization, shared budget and manual fallback passed');}finally{global.fetch=original;}
})().catch(e=>{console.error(e);process.exitCode=1;});
