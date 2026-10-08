'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const workspace = '00000000-0000-4000-8000-000000000001';
const source = fs.readFileSync('supabase/functions/owner-manage-users/index.ts', 'utf8').replace(/^import .*\n/, '');
async function call(role, active = true, claims = {}) {
  let handler, contractReads = 0;
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'actor', user_metadata: claims } } }) },
    from(table) {
      const chain = { select() { return this; }, eq() { return this; },
        then(resolve) { return Promise.resolve({data: [{workspace_id:workspace,role,active}].filter(m=>m.active)}).then(resolve); },
        maybeSingle() { contractReads++; return Promise.resolve({ data: null }); } };
      return chain;
    },
  };
  vm.runInNewContext(ts.transpile(source, {target:ts.ScriptTarget.ES2022}), { Request, Response, crypto, createClient:()=>admin, Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://db.test':key==='SUPABASE_SERVICE_ROLE_KEY'?'server-key':''},serve:fn=>handler=fn} });
  const result = await handler(new Request('https://edge.test', {method:'POST',headers:{Authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify({workspaceId:workspace,operation:'list'})}));
  return {status:result.status,contractReads};
}
(async()=>{
  for (const role of ['admin','operator','viewer']) { const result=await call(role,true,{role:'owner'}); assert.equal(result.status,403); assert.equal(result.contractReads,0); }
  assert.equal((await call('owner',false)).status,403);
  assert.deepEqual(await call('owner'),{status:400,contractReads:1},'owner passes the authorization gate; fixture has no contract');
  console.log('Administration Edge: verified server membership, owner-only, inactive owner and forged user metadata passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
