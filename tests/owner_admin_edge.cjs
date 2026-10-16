'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const workspace = '00000000-0000-4000-8000-000000000001';
const source = fs.readFileSync('supabase/functions/owner-manage-users/index.ts', 'utf8').replace(/^import .*\n/, '');
async function call(master=false,claims={},rpcError=null) {
  let handler, contractReads=0, verificationHeaders;
  const admin={auth:{getUser:async()=>({data:{user:{id:'actor',user_metadata:claims}}})},
    from(){return {select(){return this;},eq(){return this;},maybeSingle(){contractReads++;return Promise.resolve({data:null});}};}};
  const caller={rpc:async(name)=>{assert.equal(name,'grcon_is_master_owner');return {data:master,error:rpcError};}};
  vm.runInNewContext(ts.transpile(source,{target:ts.ScriptTarget.ES2022}),{Request,Response,crypto,createClient:(_url,_key,options)=>{if(options.global){verificationHeaders=options.global.headers;return caller;}return admin;},Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://db.test':key==='SUPABASE_SERVICE_ROLE_KEY'?'server-key':''},serve:fn=>handler=fn}});
  const result=await handler(new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify({workspaceId:workspace,operation:'list',isMasterOwner:true,role:'master_owner'})}));
  assert.equal(verificationHeaders.Authorization,'Bearer jwt','capability is queried with the verified caller JWT');
  return {status:result.status,contractReads};
}
(async()=>{
 for(const role of ['owner','admin','operator','viewer','master_owner'])assert.deepEqual(await call(false,{role,isMasterOwner:true}),{status:403,contractReads:0});
 assert.deepEqual(await call(null,{},new Error('unavailable')),{status:503,contractReads:0});
 assert.deepEqual(await call(true),{status:400,contractReads:1});
 console.log('Administration Edge: only live database master capability authorizes; ordinary owner, forged metadata/body and authorization failures deny access.');
})().catch(error=>{console.error(error);process.exitCode=1;});
