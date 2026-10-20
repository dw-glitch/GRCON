(function(root){
 'use strict';
 const limit=200;let requests=[],longTasks=[],errors={};
 const origin=()=>root.location?.origin||'http://localhost';
 function route(name){try{const u=new URL(name,origin());if(u.origin===origin()){if(u.pathname.startsWith('/api/document-vault/'))return 'cofre';if(u.pathname.startsWith('/api/background-jobs/'))return 'tarefas';if(u.pathname.startsWith('/api/egrdt-teams/'))return 'teams';if(u.pathname.startsWith('/api/'))return 'outras APIs';return '';}
  const configured=root.GRCON_CLOUD_CONFIG?.projectUrl;if(configured&&u.origin!==new URL(configured).origin)return '';
  if(!configured&&!/^[a-z0-9-]+\.supabase\.co$/i.test(u.hostname))return '';
  if(u.pathname.startsWith('/rest/v1/rpc/'))return 'Supabase RPC';if(u.pathname.startsWith('/rest/v1/'))return 'Supabase dados';if(u.pathname.startsWith('/auth/v1/'))return 'Supabase sessão';return '';
 }catch(_){return '';}}
 function duration(value){return Number.isFinite(Number(value))?Math.round(Math.max(0,Math.min(3600000,Number(value)))):0;}
 function recordResource(entry){const category=route(entry?.name);if(!category)return;const status=Number(entry.responseStatus);requests.push({category,ms:duration(entry.duration),status:Number.isInteger(status)&&status>=100&&status<=599?status:0});if(requests.length>limit)requests.shift();}
 function recordLongTask(entry){longTasks.push(duration(entry?.duration));if(longTasks.length>limit)longTasks.shift();}
 function error(kind){if(['Error','TypeError','RangeError','ReferenceError','SyntaxError','SecurityError','QuotaExceededError','UnhandledRejection'].includes(kind))errors[kind]=(errors[kind]||0)+1;else errors.Error=(errors.Error||0)+1;}
 function summarize(values){if(!values.length)return {count:0,averageMs:0,p95Ms:0,maxMs:0};const sorted=values.slice().sort((a,b)=>a-b);return {count:values.length,averageMs:Math.round(values.reduce((a,b)=>a+b,0)/values.length),p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted[sorted.length-1]};}
 function snapshot(){const grouped=new Map();for(const row of requests){if(!grouped.has(row.category))grouped.set(row.category,[]);grouped.get(row.category).push(row);}const storage=root.GrconOperationalPersistence?.status?.()||{};
 return {schema:'grcon.client-diagnostics.v1',generatedAt:new Date().toISOString(),sampleLimit:limit,scope:'esta aba',requests:[...grouped].map(([category,rows])=>({category,...summarize(rows.map(r=>r.ms)),httpErrors:rows.filter(r=>r.status>=400).length,unknownStatus:rows.filter(r=>!r.status).length})),longTasks:summarize(longTasks),errors:{...errors},support:{workers:typeof root.Worker==='function',indexedDB:Boolean(root.indexedDB),serviceWorker:Boolean(root.navigator?.serviceWorker?.controller),performanceObserver:typeof root.PerformanceObserver==='function'},persistence:{ready:Boolean(storage.ready),degraded:Boolean(storage.degraded),writeBlocked:Boolean(storage.writeBlocked)},sources:{sigemCached:Boolean(root.GrconSharedSigemQuery?.state?.stale),sigemUpdateError:Boolean(root.GrconSharedSigemQuery?.state?.error),pwCached:Boolean(root.GrconSharedPwQuery?.state?.stale),pwUpdateError:Boolean(root.GrconSharedPwQuery?.state?.error)}};
 }
 function reset(){requests=[];longTasks=[];errors={};}
 function download(){if(!root.GrconCloud?.isMasterOwner?.())throw Error('Diagnóstico disponível na Administração do proprietário master.');const data=snapshot(),url=root.URL.createObjectURL(new root.Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=root.document.createElement('a');a.href=url;a.download='GRCON_Diagnostico_Local.json';a.click();root.setTimeout(()=>root.URL.revokeObjectURL(url),30000);return data;}
 if(typeof root.PerformanceObserver==='function'){
  try{const observer=new root.PerformanceObserver(list=>list.getEntries().forEach(recordResource));observer.observe({type:'resource',buffered:false});}catch(_){}
  try{const observer=new root.PerformanceObserver(list=>list.getEntries().forEach(recordLongTask));observer.observe({type:'longtask',buffered:false});}catch(_){}
 }
 root.addEventListener?.('error',event=>{if(event.error)error(event.error.name);});root.addEventListener?.('unhandledrejection',()=>error('UnhandledRejection'));
 for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])root.addEventListener?.(event,reset);
 root.GrconClientDiagnostics=Object.freeze({snapshot,download,recordResource,recordLongTask,reset});
})(typeof window==='undefined'?globalThis:window);
