const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const source=ts.transpileModule(fs.readFileSync('src/react/sigem-pw/services/sigemPwProcessingClient.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const timers=new Set();let latest;
class Worker { constructor(){latest=this;this.terminated=false;} postMessage(payload){this.payload=payload;} terminate(){this.terminated=true;} }
const moduleResult={exports:{}};
vm.runInNewContext(source,{exports:moduleResult.exports,Worker,document:{baseURI:'https://example.test/'},URL,DOMException,setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)});
const run=moduleResult.exports.runPwProcessing;
(async()=>{
 let p=run({kind:'operations'});latest.onmessage({data:{ok:true,result:42}});assert.equal(await p,42);assert.equal(latest.terminated,true);assert.equal(timers.size,0);
 p=run({});const timed=latest;[...timers][0]();await assert.rejects(p,/Tempo excedido/);assert.equal(timed.terminated,true);assert.equal(timers.size,0);
 p=run({});latest.onmessageerror();await assert.rejects(p,/receber/);assert.equal(latest.terminated,true);
 const controller=new AbortController();p=run({},controller.signal);controller.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(latest.terminated,true);assert.equal(timers.size,0);
 console.log('Cliente Worker: sucesso, timeout, messageerror e cancelamento limpam Worker e timer OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
