// Read-only diagnosis. Never print parameters, outputs, corporate rows or tokens.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v||'');
export function classifyWorkflowError(error){
 const text=typeof error==='string'?error:JSON.stringify(error||{});
 for(const [pattern,code] of [
  [/cpu|exceededCpu/i,'SIGEM_CPU_LIMIT'],
  [/subrequest/i,'SIGEM_SUBREQUEST_LIMIT'],
  [/step.*(?:daily|quota|limit)|daily.*step/i,'SIGEM_DAILY_STEP_LIMIT'],
  [/storage.*(?:quota|limit)/i,'SIGEM_WORKFLOW_STORAGE_LIMIT'],
  [/SOURCE_CHANGED/,'SIGEM_SOURCE_CHANGED'],
  [/rate.*limit|429/i,'SIGEM_RATE_LIMIT'],
 ])if(pattern.test(text))return code;
 const known=text.match(/\bSIGEM_[A-Z0-9_]{1,64}\b/);
 return known?known[0]:'SIGEM_WORKFLOW_UNCLASSIFIED';
}
export async function diagnoseWorkflow(config,fetcher=fetch){
 if(!/^[a-f0-9]{32}$/.test(config.account||'')||!config.token||!uuid(config.workspace))throw Error('DIAG_CONFIGURATION_INVALID');
 const api='https://api.cloudflare.com/client/v4/accounts/'+config.account;
 const get=async(path,object=false)=>{
  const response=await fetcher(api+path,{headers:{authorization:'Bearer '+config.token},redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(response.status===403?'DIAG_ACCESS_DENIED':response.status===404?'DIAG_NOT_FOUND':'DIAG_UNAVAILABLE');
  const text=await response.text();if(text.length>8*1024*1024)throw Error('DIAG_SIZE_LIMIT');
  const data=JSON.parse(text);if(object)return data;
  if(data.success!==true)throw Error('DIAG_API_REJECTED');return data.result;
 };
 const object=key=>get('/r2/buckets/grcon-documents/objects/'+key.split('/').map(encodeURIComponent).join('/'),true);
 const latest=await object('sigem-migration-jobs/v1/'+config.workspace+'/latest.json');
 if(!/^[a-f0-9]{64}$/.test(latest.id||''))throw Error('DIAG_JOB_INVALID');
 const root='sigem-migration-jobs/v1/'+config.workspace+'/'+latest.id;
 const grant=await object(root+'/grant.json');
 if(grant.workspace!==config.workspace||grant.id!==latest.id||!Array.isArray(grant.lanes)||grant.lanes.length>3)throw Error('DIAG_JOB_INVALID');
 const result=[];
 for(let lane=0;lane<grant.lanes.length;lane++){
  const report=await object(root+'/lane-'+lane+'.json');
  if(!Number.isSafeInteger(report.segment)||report.segment<0||report.segment>10000)throw Error('DIAG_SEGMENT_INVALID');
  const instance='sigem-'+latest.id.slice(0,40)+'-'+lane+(report.segment?'-s'+report.segment:'');
  const state=await get('/workflows/grcon-tasks/instances/'+instance);
  const steps=Array.isArray(state.steps)?state.steps:[];
  result.push({lane,segment:report.segment,status:state.status,error:state.error?classifyWorkflowError(state.error):null,
   lastSteps:steps.slice(-4).map(s=>({type:s.type,name:/^[a-z0-9-]{1,100}$/.test(s.name||'')?s.name:null,
    finished:s.finished===true,error:s.error?classifyWorkflowError(s.error):null,
    attempts:Array.isArray(s.attempts)?s.attempts.map(a=>({success:a.success===true,error:a.error?classifyWorkflowError(a.error):null})):[]}))});
 }
 return {ok:true,readOnly:true,id:latest.id,instances:result};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await diagnoseWorkflow({account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,workspace:process.env.GRCON_RECOVERY_WORKSPACE})));}
 catch(error){console.error(/^DIAG_[A-Z_]{1,80}$/.test(error.message)?error.message:'DIAG_FAILED');process.exitCode=1;}
}
