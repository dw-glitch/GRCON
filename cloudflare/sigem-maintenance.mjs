import {verifyGithubToken} from './teams-github.mjs';
import {serviceRpc} from './sigem-live.mjs';
import {migrationStatus} from './sigem-migration-job.mjs';
import {releaseVerifiedPayload} from './sigem-storage.mjs';
import {fail} from './sigem-turso.mjs';
const ROOT='sigem-migration-jobs/v1/';
const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v||'');
export async function releaseMaintenance(env,workspace){
 if(!uuid(workspace))throw fail('SIGEM_WORKSPACE_INVALID',400);
 if(env.GRCON_SIGEM_RELEASE_ENABLED!=='true'||env.GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED!=='true')throw fail('SIGEM_RELEASE_NOT_APPROVED');
 const latest=await env.GRCON_DOCUMENTS.get(ROOT+workspace+'/latest.json');
 if(!latest)throw fail('SIGEM_RELEASE_AUDIT_REQUIRED');
 const {id}=await latest.json();
 if(!/^[a-f0-9]{64}$/.test(id||''))throw fail('SIGEM_JOB_INVALID');
 const object=await env.GRCON_DOCUMENTS.get(ROOT+workspace+'/'+id+'/grant.json');
 const grant=object?await object.json():null;
 if(grant?.workspace!==workspace||grant.id!==id||!uuid(grant.actor))throw fail('SIGEM_JOB_INVALID');
 // Recheck the original Proprietário ADM's current membership on every call.
 const inventory=await serviceRpc(env,'grcon_sigem_storage_service',{target_workspace:workspace,actor_id:grant.actor,operation:'inventory',input:{}});
 const progress=await migrationStatus(env,workspace,inventory);
 const proofs=[...(progress.completedSnapshots||[]),...progress.reports.flatMap(r=>r.snapshots||[])];
 const key='sigem-release/v1/'+workspace+'/'+id+'.json';
 const saved=await env.GRCON_DOCUMENTS.get(key);
 const completed=saved?(await saved.json()).completed:[];
 if(!Array.isArray(completed)||completed.some(v=>!uuid(v)))throw fail('SIGEM_JOB_INVALID');
 const candidates=inventory.snapshots.filter(s=>!completed.includes(s.id));
 if(!candidates.length)return {complete:true,completed:completed.length,total:inventory.snapshots.length};
 const source=candidates[0],proof=proofs.find(p=>p.id===source.id);
 // Each snapshot needs its own independently sealed audit. A new pending
 // upload cannot invalidate another version's verified receipt.
 const result=await releaseVerifiedPayload(env,workspace,grant.actor,source,proof,8);
 if(result.released){
  completed.push(source.id);
  await env.GRCON_DOCUMENTS.put(key,JSON.stringify({completed}));
 }
 return {complete:completed.length===inventory.snapshots.length,completed:completed.length,total:inventory.snapshots.length,phase:result.phase,processed:result.processed,expected:result.expected};
}
export async function handleReleaseMaintenance(request,env){
 if(new URL(request.url).pathname!=='/api/sigem-storage/deployment-release')return null;
 try {
  if(request.method!=='POST')throw fail('METHOD_NOT_ALLOWED',405);
  await verifyGithubToken((request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''),{
   repository:'dw-glitch/GRCON',repositoryId:'1322072089',ownerId:'202873892',audience:'grcon-sigem-release',visibility:'public',
   workflow:'dw-glitch/GRCON/.github/workflows/deploy-cloudflare.yml@refs/heads/main',allowedEvents:['push','workflow_dispatch']});
  const input=await request.json();
  return Response.json({ok:true,...await releaseMaintenance(env,input.workspace)},{headers:{'cache-control':'no-store'}});
 } catch(error){return Response.json({ok:false,error:/^[A-Z_]+$/.test(error.code||'')?error.code:'SIGEM_RELEASE_FAILED'},{status:error.status||503,headers:{'cache-control':'no-store'}});}
}
