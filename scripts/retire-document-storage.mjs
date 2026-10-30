// Protected main deployment; only counts are logged.
import {pathToFileURL} from 'node:url';
export async function retireDocuments({base='https://grcon-cloudflare.grcon-qualidade.workers.dev',token,workspace='cfb8e3a0-63de-4ae8-831d-7169da8015be',fetcher=fetch}){
 const url=new URL(base);
 if(url.protocol!=='https:'||url.hostname!=='grcon-cloudflare.grcon-qualidade.workers.dev'||!token||!/^[a-f0-9-]{36}$/i.test(workspace))throw Error('R2_RETIREMENT_CONFIGURATION_INVALID');
 const endpoint=new URL('/api/document-vault/retire-legacy-storage',url);
 let deletedObjects=0,deletedBytes=0;
 for(let round=0;round<64;round++){
  const response=await fetcher(endpoint,{method:'POST',redirect:'manual',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({workspace}),signal:AbortSignal.timeout(45000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok||!Number.isSafeInteger(data.deleted)||data.deleted<0||!Number.isSafeInteger(data.bytes)||data.bytes<0)throw Error('R2_RETIREMENT_FAILED');
  deletedObjects+=data.deleted;deletedBytes+=data.bytes;
  if(data.complete===true)return {ok:true,complete:true,deletedObjects,deletedBytes};
 }
 throw Error('R2_RETIREMENT_BATCH_LIMIT');
}
async function main(){
 const requestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(!requestUrl||!requestToken)throw Error('R2_RETIREMENT_OIDC_REQUIRED');
 const url=new URL(requestUrl);if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('R2_RETIREMENT_OIDC_INVALID');
 url.searchParams.set('audience','grcon-document-retirement');
 const response=await fetch(url,{headers:{authorization:'Bearer '+requestToken},redirect:'manual',signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>null);if(!response.ok||!data?.value)throw Error('R2_RETIREMENT_OIDC_FAILED');
 const result=await retireDocuments({base:process.env.GRCON_PRODUCTION_URL||undefined,token:data.value});
 console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{console.error(/^R2_RETIREMENT_[A-Z_]+$/.test(error.message)?error.message:'R2_RETIREMENT_FAILED');process.exitCode=1;});
}
