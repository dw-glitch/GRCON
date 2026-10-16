// Workers Free orchestrates I/O; heavy computation uses the existing Supabase backend.
export async function buildBackgroundReport(object,env,job){
 const key=env.SUPABASE_SECRET_KEY;
 const headers={apikey:key,'x-grcon-job':job.id,'x-grcon-generation':String(job.generation),'content-type':'application/json'};
 if(!key.startsWith('sb_secret_'))headers.authorization=`Bearer ${key}`;
 const response=await fetch(`${env.SUPABASE_URL}/functions/v1/grcon-background-processor`,{method:'POST',headers,body:object.body,signal:AbortSignal.timeout(140000)});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw Object.assign(new Error(data.code||'PROCESSOR_UNAVAILABLE'),{code:data.code||'PROCESSOR_UNAVAILABLE'});}
 return response;
}
