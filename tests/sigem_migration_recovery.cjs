const assert=require('node:assert/strict');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
 const M=await import('../cloudflare/sigem-migration-job.mjs'),T=await import('../cloudflare/sigem-turso.mjs');
 const objects=new Map(),instances=new Map(),inventory={snapshots:[],pendingSnapshots:0},hash=await T.sha256(T.canonical(inventory));
 const bucket={get:async key=>objects.has(key)?{text:async()=>objects.get(key),json:async()=>JSON.parse(objects.get(key))}:null,
  put:async(key,body)=>objects.set(key,body),list:async({prefix,limit,cursor})=>{
   const keys=[...objects.keys()].filter(k=>k.startsWith(prefix)).sort(),start=Number(cursor||0),end=start+limit;
   return {objects:keys.slice(start,end).map(key=>({key})),truncated:end<keys.length,cursor:String(end)};
  }};
 const env={SUPABASE_URL:'https://scope.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_TEST',GRCON_DOCUMENTS:bucket,GRCON_MIGRATION_SELF:{},
  GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED:'true',GRCON_SIGEM_MIGRATION_PREFLIGHT_APPROVED:'true',GRCON_TASKS:{
   get:async key=>({status:async()=>{if(!instances.has(key))throw Error('missing');return {status:instances.get(key)};},restart:async()=>instances.set(key,'queued')}),
   create:async x=>{assert.equal(instances.has(x.id),false);instances.set(x.id,'queued');return {id:x.id};}}};
 const original=global.fetch;global.fetch=async(url,opts)=>{
  assert.equal(new URL(url).hostname,'scope.supabase.co','empty audit receipts must not query uninitialized Turso');
  return Response.json(inventory);
 };
 try{
  for(let i=1;i<=7;i++){
   const workspace=id(i),job=String(i).repeat(64),root='sigem-migration-jobs/v1/'+workspace+'/'+job;
   objects.set('sigem-migration-watch/v1/'+workspace+'.json',T.canonical({workspace,id:job}));
   objects.set(root+'/grant.json',T.canonical({id:job,workspace,actor:id(9),inventoryHash:hash,lanes:[{snapshots:[]}]}));
   objects.set(root+'/lane-0.json',T.canonical({segment:1,status:'waiting',dispatchPending:true,dispatch:'cron',copied:0,validated:0,snapshots:[]}));
  }
  await M.recoverMigrations(env);assert.equal(instances.size,5);
  await M.recoverMigrations(env);assert.equal(instances.size,7,'later workspaces must receive their next continuation');
  await M.recoverMigrations(env);assert.equal(instances.size,7,'repeated cron cannot duplicate dispatches');
  // An older job may exist before its first copy initializes Turso.
  const workspace=id(20),job='a'.repeat(64),root='sigem-migration-jobs/v1/'+workspace+'/'+job;
  objects.set('sigem-migration-jobs/v1/'+workspace+'/latest.json',T.canonical({id:job}));
  objects.set(root+'/grant.json',T.canonical({id:job,workspace,actor:id(9),inventoryHash:hash,lanes:[{snapshots:[]}]}));
  inventory.snapshots.push({id:id(21),workspace_id:workspace,contract_id:id(22),record_count:1,status:'active'});
  const result=await M.startMigration(env,workspace,id(9),inventory);assert.equal(result.records,1);
 }finally{global.fetch=original;}
 console.log('SIGEM cron recovery: paginated watch list, all workspaces visited, idempotent dispatch and startup without prior audit/Turso schema passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
