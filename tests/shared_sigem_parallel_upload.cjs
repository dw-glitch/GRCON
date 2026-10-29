const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function scenario(fail=false,switchWorkspace=false){
 let current=null,active=0,peak=0,published=0,chunks=0;const cache=new Map(),events=[];
 const records=Array.from({length:2001},(_,i)=>({document:'DOC-'+i,revision:'0',status:'Emitido',extra:i}));
 const root={crypto:require('node:crypto').webcrypto,GrconSharedSigemQueryCore:require('../shared_sigem_query_core.js'),
 GrconCloud:{state:{membership:{workspace_id:'QA',role:'owner'},online:true,session:{access_token:'qa'},client:{rpc:async()=>({data:current})}}},
 GRCONModuleLoader:{ensure:async()=>{}},GrconPostingConference:{kvGet:async(k,d)=>cache.get(k)||d,kvSet:async(k,v)=>cache.set(k,v),kvSetMany:async()=>{}},
 dispatchEvent:e=>events.push(e),addEventListener(){},document:{hidden:true,addEventListener(){}}};
 root.fetch=async(url,options)=>{
 const input=JSON.parse(options.body);
 if(url.endsWith('import-begin'))return Response.json({ok:true,id:'new'});
 if(url.endsWith('import-chunk')){
  chunks++;active++;peak=Math.max(peak,active);
  await new Promise(r=>setTimeout(r,input.first===1?5:15));active--;
  if(switchWorkspace&&input.first===1)root.GrconCloud.state.membership.workspace_id='OTHER';
  if(fail&&input.first===1)return Response.json({ok:false,error:'TURSO_UNAVAILABLE'},{status:503});
  return Response.json({ok:true,count:input.rows.length});
 }
 if(url.endsWith('import-publish')){assert.equal(active,0);published++;current={snapshot_id:'new',record_count:records.length,metadata:{},file_name:'QA'};return Response.json({ok:true,id:'new'});}
 return Response.json({ok:true,rows:records.slice(input.after,input.after+input.size).map((payload,i)=>({row_number:input.after+i+1,payload}))});
 };
 vm.runInNewContext(fs.readFileSync('shared_sigem_query_app.js','utf8'),{window:root,console,performance,TextEncoder,AbortSignal,setTimeout,clearTimeout,setInterval(){},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}});
 const api=root.GrconSharedSigemQuery;
 const operation=api.publish({meta:{fileName:'QA'},records});
 if(fail||switchWorkspace){await assert.rejects(operation);assert.equal(published,0);assert.equal(chunks,4);assert.equal(active,0);assert.equal(api.state.busy,false);}
 else{const result=await operation;assert.equal(peak,4);assert.equal(chunks,9);assert.equal(published,1);assert.deepEqual(JSON.parse(JSON.stringify(result.records)),records);const progress=events.filter(e=>e.type==='grcon:shared-sigem-progress').map(e=>e.detail.done);assert.equal(progress.at(-1),2001);assert.ok(progress.every((n,i)=>i===0||n>progress[i-1]));}
}
(async()=>{await scenario();await scenario(true);await scenario(false,true);console.log('parallel_upload: out-of-order success, bounded concurrency, drained failures and workspace changes passed');})().catch(e=>{console.error(e);process.exitCode=1;});
