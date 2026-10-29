// Only audited historical payloads. No operational dataset or backup is removed.
const origin='https://grcon-cloudflare.grcon-qualidade.workers.dev';
const requestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if(!requestUrl||!requestToken)throw Error('SIGEM_RELEASE_OIDC_REQUIRED');
let token='',expires=0;
for(let round=0;round<1500;round++){
 if(Date.now()>expires){
  const url=new URL(requestUrl);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('SIGEM_RELEASE_OIDC_INVALID');
  url.searchParams.set('audience','grcon-sigem-release');
  const auth=await fetch(url,{headers:{authorization:'Bearer '+requestToken},redirect:'manual'});
  const body=await auth.json();if(!auth.ok||!body.value)throw Error('SIGEM_RELEASE_OIDC_FAILED');
  token=body.value;expires=Date.now()+120000;
 }
 const response=await fetch(origin+'/api/sigem-storage/deployment-release',{method:'POST',redirect:'manual',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({workspace:'cfb8e3a0-63de-4ae8-831d-7169da8015be'}),signal:AbortSignal.timeout(90000)});
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.ok)throw Error(result?.error||'SIGEM_RELEASE_FAILED');
 console.log(JSON.stringify(result));
 if(result.complete)process.exit(0);
}
throw Error('SIGEM_RELEASE_ROUND_LIMIT');
