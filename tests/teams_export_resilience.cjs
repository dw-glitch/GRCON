'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../egrdt_teams_trace_core.js');
const W = '00000000-0000-4000-8000-000000000001';
const W2 = '00000000-0000-4000-8000-000000000002';
const ATTEMPT = {
  id:'00000000-0000-4000-8000-000000000003',
  workspace_id:W, history_id:'00000000-0000-4000-8000-000000000004',
  client_record_id:'test-history', requested_at:new Date().toISOString(),
  updated_at:new Date().toISOString(), delivery_status:'accepted',
  documents:[{document:'DOC-001',revision:'0'}], confirmed_at:null
};
function harness(respond){
  const root={
    GrconTeamsTraceCore:Core,GrconCloud:{state:null},
    addEventListener(){},dispatchEvent(){},setInterval(){return 1;},clearInterval(){}
  };
  let calls=0;
  const sandbox={
    globalThis:root,document:{addEventListener(){},hidden:false},
    navigator:{onLine:true},URLSearchParams,AbortSignal,Date,Map,Error,
    CustomEvent:class{constructor(type){this.type=type;}},
    fetch:async()=>{calls++;return respond(calls);},console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../egrdt_teams_trace_app.js'),'utf8'),sandbox);
  root.GrconCloud.state={membership:{workspace_id:W},session:{access_token:'test-session'}};
  return {root,calls:()=>calls};
}
async function main(){
  assert.equal(Core.columns(null,null,'Em análise',{status:'unavailable'})['Enviado ao Teams?'],'Indisponível para consulta');
  assert.equal(Core.columns(null,null,'Em análise',{status:'unavailable'})['Conferência no SIGEM'],'Em análise');
  assert.equal(Core.columns(ATTEMPT,null,'Em análise',{status:'stale'})['Postagem confirmada?'],'Dados do Teams não atualizados');
  assert.equal(Core.columns(null,null,'Em análise')['Enviado ao Teams?'],'Sem registro de envio ao Teams');

  // Repeated HTTP 500 cannot prevent reports or flood the endpoint.
  const broken=harness(()=>Response.json({ok:false,message:'Rastreabilidade indisponível.'},{status:500}));
  const first=await broken.root.GrconTeamsTrace.forReport();
  assert.equal(first.status,'unavailable');
  assert.equal(first.attempts.length,0);
  const second=await broken.root.GrconTeamsTrace.forReport();
  assert.equal(second.status,'unavailable');
  assert.equal(broken.calls(),1,'bounded retry avoids a request storm');

  // Retain same-workspace snapshots without silently reporting old confirmations as current.
  const restored=harness(i=> i===1
    ? Response.json({ok:true,enabled:true,data:[ATTEMPT]})
    : Response.json({ok:false,message:'temporarily offline'},{status:503}));
  const fresh=await restored.root.GrconTeamsTrace.forReport();
  assert.equal(fresh.status,'fresh');
  assert.equal(fresh.attempts.length,1);
  const stale=await restored.root.GrconTeamsTrace.forReport();
  assert.equal(stale.status,'stale');
  assert.equal(stale.attempts.length,1);
  assert.ok(stale.lastSuccessfulSync);
  assert.equal(Core.columns(stale.attempts[0],null,'Em análise',stale)['Enviado ao Teams?'],'Dados do Teams não atualizados');
  restored.root.GrconCloud.state.membership.workspace_id=W2;
  const changed=await restored.root.GrconTeamsTrace.forReport();
  assert.equal(changed.attempts.length,0,'must not leak data across workspaces');

  // A contract switch while the HTTP request is pending must invalidate the report snapshot.
  let finishRequest;
  const switching=harness(()=>new Promise(resolve=>{finishRequest=resolve;}));
  const pendingReport=switching.root.GrconTeamsTrace.forReport();
  switching.root.GrconCloud.state.membership.workspace_id=W2;
  finishRequest(Response.json({ok:true,enabled:true,data:[ATTEMPT]}));
  const switched=await pendingReport;
  assert.equal(switched.status,'unavailable');
  assert.equal(switched.attempts.length,0);

  const disabled=harness(()=>Response.json({ok:true,enabled:false,data:[]}));
  const disabledResult=await disabled.root.GrconTeamsTrace.forReport();
  assert.equal(disabledResult.status,'disabled');
  await disabled.root.GrconTeamsTrace.forReport();
  assert.equal(disabled.calls(),1,'disabled traceability must not poll every 15s');

  // A disabled API returns no Teams data without calling the private RPC.
  const {handleTraceRoute}=await import('../cloudflare/teams-traceability.mjs');
  const originalFetch=global.fetch;
  let calledRpc=false;
  try{
    global.fetch=async url=>{
      if(String(url).includes('/auth/v1/user'))return Response.json({id:W});
      calledRpc=true;
      throw Error('RPC must not be called when disabled');
    };
    const request=new Request('https://grcon.test/api/egrdt-teams/page?workspace='+W,{headers:{authorization:'Bearer test-session'}});
    const response=await handleTraceRoute(request,{
      SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'sb_secret_test',
      GRCON_TEAMS_TRACEABILITY_ENABLED:'false'
    });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,enabled:false,data:[]});
    assert.equal(calledRpc,false);
  }finally{global.fetch=originalFetch;}

  // XLSX is still generated, and never silently labels missing Teams evidence as not sent.
  const Report=require('../history_report.js');
  const record={id:'test-history',clientRecordId:'test-history',cloudId:ATTEMPT.history_id,workspaceId:W,
    generatedAt:'2026-10-20T12:00:00Z',egrdtNumber:'TEST-GRDT-001',
    files:[{document:'DOC-001',revision:'0',grdtRevision:'0',purpose:'Construção',discipline:'Civil'}],
    documentCount:1,fileCount:1,allocations:[]};
  const options={teamsAttempts:[],teamsTraceStatus:'unavailable',workspaceId:W,
    startDate:'2026-10-01',endDate:'2026-10-31'};
  assert.equal(Report.egrdtRows([record],options)[0]['Enviado ao Teams?'],'Indisponível para consulta');
  assert.equal(Report.documentRows([record],options)[0]['Postagem confirmada?'],'Indisponível para consulta');
  global.ExcelJS=require('../exceljs.min.js');
  global.GrconTeamsTraceCore=Core;
  global.location={href:'https://grcon.test/'};
  global.fetch=async()=>new Response(null,{status:404});
  try{
    const buf=await Report.buildWorkbook([record],options);
    const book=new global.ExcelJS.Workbook();
    await book.xlsx.load(buf);
    assert.ok(book.getWorksheet('Resumo'));
    assert.ok(book.getWorksheet('eGRDTs'));
    assert.ok(book.getWorksheet('Documentos'));
    assert.match(String(book.getWorksheet('Resumo').getCell('A4').value),/Teams: indisponível/);
  }finally{global.fetch=originalFetch;}
  console.log('Teams export resilience: HTTP 500, stale, disabled, workspace isolation and XLSX verified.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
