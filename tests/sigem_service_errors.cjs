const assert=require('node:assert/strict');
(async()=>{
 const {serviceRpc}=await import('../cloudflare/sigem-live.mjs');const original=global.fetch;
 const env={SUPABASE_URL:'https://qa.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_qa'};
 try{
  for(const code of ['57014','55P03','40001','40P01','53300']){
   global.fetch=async()=>Response.json({code,message:'private upstream'},{status:409});
   await assert.rejects(serviceRpc(env,'qa',{}),e=>e.code==='SIGEM_CONTROL_BUSY'&&e.status===503);
  }
  global.fetch=async()=>Response.json({code:'P0001',message:'private integrity'},{status:409});
  await assert.rejects(serviceRpc(env,'qa',{}),e=>e.code==='SIGEM_IMPORT_REJECTED'&&e.status===409);
  global.fetch=async()=>Response.json({code:'42501'},{status:403});
  await assert.rejects(serviceRpc(env,'qa',{}),e=>e.code==='SIGEM_ACCESS_DENIED'&&e.status===403);
  global.fetch=async()=>new Response('private outage',{status:503});
  await assert.rejects(serviceRpc(env,'qa',{}),e=>e.code==='SIGEM_CONTROL_UNAVAILABLE'&&e.status===503);
  console.log('sigem_service_errors: transient SQL states, outage and terminal integrity/access failures classified without upstream disclosure');
 }finally{global.fetch=original;}
})().catch(e=>{console.error(e);process.exitCode=1;});
