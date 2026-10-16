import * as XLSX from 'npm:xlsx@0.18.5';
import './generated/discipline_resolver.js';
import './generated/grcon_contracts.js';
import './generated/core.js';
import './generated/history_core.js';
import './generated/posting_conference_core.js';
import './generated/posting_conference_refinement.js';
import './generated/egrdt_teams_trace_core.js';
import './generated/posting_conference_report.js';
const root=globalThis as any;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
 const secret=request.headers.get('apikey')||'',id=request.headers.get('x-grcon-job')||'',generation=Number(request.headers.get('x-grcon-generation'));
 if(!secret||!/^([0-9a-f-]{36})$/i.test(id)||!Number.isInteger(generation)||generation<0)return json({ok:false,code:'AUTH_REQUIRED'},401);
 const url=Deno.env.get('SUPABASE_URL')!;
 const rpc=async(operation:string,input:Record<string,unknown>={})=>{
  const headers:Record<string,string>={apikey:secret,'content-type':'application/json'};
  if(!secret.startsWith('sb_secret_'))headers.authorization=`Bearer ${secret}`;
  const response=await fetch(url+'/rest/v1/rpc/grcon_operations_service',{method:'POST',headers,body:JSON.stringify({operation,input:{id,generation,...input}})});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error('RPC_FAILED'),{code:response.status===401?'AUTH_INVALID':data.code==='42501'?'ACCESS_DENIED':data.code==='40001'?'BASE_CHANGED':'TASK_FAILED'});
  return data;
 };
 try{
  // This RPC is executable exclusively by service_role, and rechecks the live job membership.
  const job=await rpc('execute');
  if(!['conference_report','sigem_import'].includes(job.kind))return json({ok:false,code:'INVALID_KIND'},400);
  if(['succeeded','cancelled','needs_review'].includes(job.status))return json({ok:true,alreadyCompleted:true});
  const length=Number(request.headers.get('content-length')||0);if(length>24*1024*1024)return json({ok:false,code:'INPUT_TOO_LARGE'},413);
  const input=await request.json();
  if(job.kind==='sigem_import'){
   if(!Array.isArray(input.records)||input.records.length<1||input.records.length>100000)throw Object.assign(new Error('INVALID_IMPORT'),{code:'INVALID_IMPORT'});
   const current=await rpc('import_begin',{count:input.records.length,fileName:String(input.meta?.fileName||'Consulta Geral.xlsx').slice(0,255),meta:input.meta||{}});
   if(!current.context?.published){
    for(let first=1;first<=input.records.length;first+=500){
     await rpc('import_chunk',{first,rows:input.records.slice(first-1,first+499)});
     if(first===1||first%5000===1)await rpc('update',{status:'running',stage:`Importando ${Math.min(first+499,input.records.length)} de ${input.records.length} registros`,progress:Math.min(95,10+Math.floor(first/input.records.length*80))});
    }
    await rpc('import_publish');
   }
   return json({ok:true});
  }
  let rows=input.rows,options=input.options||{};
  const C=root.GrconPostingConferenceRefinement.wrapConference(root.GrconPostingConference);
  if(input.reconcile){
   if(!Array.isArray(input.history)||input.history.length>20000||!Array.isArray(input.records)||input.records.length>100000)throw Object.assign(new Error('REPORT_ROW_LIMIT'),{code:'REPORT_ROW_LIMIT'});
   const result=C.reconcile(input.history,input.records,input.previousState,{...input.preferences,baseReferenceDate:input.meta?.referenceDate,now:input.requestedAt});
   const groups=C.aggregateByGrdt(result.eventRows),scopes=new Map(groups.flatMap((g:any)=>g.rows.map((r:any)=>[r.key,C.pendingScope(g)])));
   const pending=C.pendingRows(C.filterRows(result.eventRows,input.filters||{})).map((r:any)=>({...r,pendingScope:scopes.get(r.key)}));
   rows=C.buildPendingDocumentAggregates(pending,result.documentRows);options={...options,pending:true,mode:'events',groups};
  }
  if(!Array.isArray(rows)||rows.length>10000)throw Object.assign(new Error('REPORT_ROW_LIMIT'),{code:'REPORT_ROW_LIMIT'});
  root.GRCON_REPORT_TIME_ZONE=options.timeZone||'America/Recife';
  const data=root.GrconPostingConferenceReport.tabularData(rows,options);
  const sheet=XLSX.utils.aoa_to_sheet([['GRCON — Conferência SIGEM'],['Julgamento pela última GRDT de cada documento'],['Base',options.baseFileName||input.meta?.fileName||''],['Gerado em',new Date().toISOString()],[],[],[],[],[],data.headers,...data.rows]);
  sheet['!autofilter']={ref:XLSX.utils.encode_range({s:{r:9,c:0},e:{r:9+data.rows.length,c:data.headers.length-1}})};
  sheet['!cols']=data.headers.map((_:string,i:number)=>({wch:i===0?48:i===12||i===14||i===16?65:25}));
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Detalhamento');
  const bytes=XLSX.write(book,{type:'array',bookType:'xlsx',compression:false});
  await rpc('execute'); // Do not return data if the user's access was revoked during generation.
  return new Response(bytes,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-length':String(bytes.byteLength),'cache-control':'no-store'}});
 }catch(error){
  const code=/^[A-Z_]{1,80}$/.test((error as any)?.code||'')?(error as any).code:'TASK_FAILED';
  return json({ok:false,code},code==='AUTH_INVALID'?401:code==='ACCESS_DENIED'?403:code==='BASE_CHANGED'?409:500);
 }
});
