import assert from 'node:assert/strict';
import {prepareTitlePrompt,validateTitleAiAnswer,suggestTitle} from '../cloudflare/title-ai.mjs';
const evidence=[{id:'fact:0',field:'tipo',value:'RELATORIO DE INSPECAO',source:'ET Rev. R'},
{id:'fact:1',field:'objeto',value:'VALVULA GAVETA',source:'LI Rev. C'}];
const prompt=prepareTitlePrompt({document:'C1O_RNEST_U32_3.1.1.1_TUB_RIR_VM-320003',
candidates:[{id:'title:0',title:'RELATORIO DE INSPECAO - VALVULA GAVETA - VM-320003'}],evidence});
const valid=validateTitleAiAnswer({candidateId:'title:0',reason:'Descrição identificada na LI.',citations:['fact:0','fact:1']},prompt);
assert.equal(valid.title,'RELATORIO DE INSPECAO - VALVULA GAVETA - VM-320003');
assert.throws(()=>validateTitleAiAnswer({candidateId:'title:1',reason:'Mudou',citations:['fact:0']},prompt));
assert.throws(()=>validateTitleAiAnswer({candidateId:'title:0',reason:'Mudou',citations:['fact:999']},prompt));
assert.throws(()=>prepareTitlePrompt({document:'DOC',candidates:[{id:'title:0',title:'X'}],evidence}));
const binding={run:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({candidateId:'title:0',reason:'Fonte LI',citations:['fact:1']})}}]})};
const selection=await suggestTitle(binding,prompt);
assert.equal(selection.title,prompt.candidates[0].title);
console.log('title_ai_security: candidatos e citações estritos OK');
