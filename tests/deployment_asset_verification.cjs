'use strict';
const assert=require('node:assert/strict');
(async()=>{const {verifyPublishedAsset}=await import('../scripts/deployment-asset-verification.mjs');const expected=Buffer.from('new build');let calls=0,pauses=0;
 await verifyPublishedAsset(async attempt=>{calls++;return new Response(attempt<2?'old cache':'new build')},expected,{pause:async()=>pauses++});assert.equal(calls,3);assert.equal(pauses,2);
 calls=0;await assert.rejects(verifyPublishedAsset(async()=>{calls++;return new Response('wrong build')},expected,{pause:async()=>{}}),/difere.*propagação/);assert.equal(calls,6,'persistent mismatch never passes');
 await assert.rejects(verifyPublishedAsset(async()=>new Response('missing',{status:404}),expected,{pause:async()=>{}}),/indisponível/);
 calls=0;await verifyPublishedAsset(async()=>{if(++calls===1)throw Error('temporary');return new Response(expected)},expected,{pause:async()=>{}});assert.equal(calls,2);
 console.log('Publicação: propagação transitória, divergência persistente, HTTP 404 e falha de rede preservam validação exata.');
})().catch(e=>{console.error(e);process.exitCode=1});
