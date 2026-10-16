import {WorkflowEntrypoint} from 'cloudflare:workers';
import worker from './worker-entry.mjs';
import {handleJobsRoute,runJob,recoverJobs,recordMetric} from './background-jobs.mjs';
import {buildBackgroundReport} from './background-report.mjs';
export class GrconTaskWorkflow extends WorkflowEntrypoint {
 async run(event,step){return runJob(this.env,event.payload,step,buildBackgroundReport);}
}
export default {
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname,started=Date.now();
  const response=await handleJobsRoute(request,env)||await worker.fetch(request,env,ctx);
  if(path.startsWith('/api/')&&!['list','detail','technical'].some(action=>path==='/api/background-jobs/'+action))ctx.waitUntil(recordMetric(env,path,response.status,Date.now()-started).catch(()=>{}));
  return response;
 },
 async scheduled(controller,env,ctx){
  if(controller.cron==='* * * * *')ctx.waitUntil(recoverJobs(env).catch(()=>console.error('GRCON_TASK_RECOVERY_FAILED')));
  return worker.scheduled(controller,env,ctx);
 }
};
