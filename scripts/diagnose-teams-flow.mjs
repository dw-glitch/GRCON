// Read-only diagnosis explicitly authorized by the repository owner.
// Never print payloads, credentials or URLs.
const {CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account}=process.env;
if(!token||!account)throw new Error('Configuração Cloudflare ausente');
const clean=value=>String(value||'').replace(/https?:\/\/\S+/g,'[URL]').replace(/[\w.+-]+@[\w.-]+/g,'[EMAIL]').slice(0,500);
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workflows/grcon-tasks/instances/5158365e-74c7-467f-8c54-83434264dc95-0`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
const data=await response.json();
console.log(JSON.stringify({httpStatus:response.status,success:data.success,errors:data.errors?.map(e=>({code:e.code,message:clean(e.message)}))}));
if(!response.ok)process.exit(1);
const r=data.result;
console.log(JSON.stringify({status:r.status,error:r.error&&{name:clean(r.error.name),message:clean(r.error.message)},steps:r.steps?.map(s=>({name:clean(s.name),type:s.type,success:s.success,error:s.error&&{name:clean(s.error.name),message:clean(s.error.message)},attempts:s.attempts?.map(a=>({success:a.success,error:a.error&&{name:clean(a.error.name),message:clean(a.error.message)}}))}))},null,2));
