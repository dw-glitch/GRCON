import assert from 'node:assert/strict';
const audience='grcon-document-ai-probe';
const oidcUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);oidcUrl.searchParams.set('audience',audience);
const tokenResponse=await fetch(oidcUrl,{headers:{authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(15000)});
assert.equal(tokenResponse.status,200,'Identidade da publicação indisponível.');
const {value}=await tokenResponse.json();assert.ok(value,'Identidade da publicação ausente.');
const response=await fetch(new URL('/api/document-vault/ai-probe',process.env.GRCON_PRODUCTION_URL),{method:'POST',headers:{authorization:'Bearer '+value},signal:AbortSignal.timeout(45000)});
const result=await response.json();
assert.equal(response.status,200,'Workers AI não validado: '+String(result.error||'AI_PROBE_FAILED'));
assert.equal(result.ok,true);
if(!result.skipped){assert.equal(result.mode,'workers-ai');assert.ok(result.citedItems>0);}
console.log(JSON.stringify({ok:true,provider:'cloudflare-workers-ai',synthetic:true,...(result.skipped?{skipped:true,reason:result.reason}:{model:result.model,citedItems:result.citedItems})}));
