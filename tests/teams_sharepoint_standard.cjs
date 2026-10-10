const assert = require('node:assert/strict');
const fs = require('node:fs');
const {randomUUID,webcrypto} = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');
if (!global.crypto) global.crypto=webcrypto;
(async()=>{
 const {sharepointConfig,sharepointInput,graphUrl,syncSharepoint} = await import('../cloudflare/teams-sharepoint.mjs');
 const w=randomUUID(),other=randomUUID(),user=randomUUID(),cid=randomUUID(),hid=randomUUID(),tenant=randomUUID();
 const env={GRCON_TEAMS_TRACEABILITY_ENABLED:'true',GRCON_TEAMS_TRANSPORT:'sharepoint',GRCON_MICROSOFT_TENANT_ID:tenant,
  GRCON_GRAPH_CLIENT_ID:randomUUID(),GRCON_GRAPH_CLIENT_SECRET:'test-secret',GRCON_SHAREPOINT_SITE_ID:`company.sharepoint.com,${randomUUID()},${randomUUID()}`,
  GRCON_SHAREPOINT_LIST_ID:randomUUID(),GRCON_TEAMS_CONVERSATION_ID:'trusted-chat',SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'sb_secret_test'};
 const config=sharepointConfig(env),base=`https://graph.microsoft.com${config.path}/delta`;
 assert.throws(()=>sharepointConfig({...env,GRCON_MICROSOFT_TENANT_ID:'common'}));
 assert.throws(()=>graphUrl('https://evil.test/token',config));
 assert.throws(()=>graphUrl(base.replace(config.list,randomUUID()),config));
 const db=new PGlite();
 try {
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
   create table grcon_workspaces(id uuid primary key);create table grcon_contracts(id uuid primary key,workspace_id uuid,code text,active boolean);
   create table grcon_memberships(workspace_id uuid,user_id uuid,active boolean,role text);
   create table grcon_history(id uuid primary key,workspace_id uuid,contract_id uuid,client_record_id text,egrdt_number text,deleted_at timestamptz,payload jsonb);
   create table grcon_notifications(id uuid default gen_random_uuid(),workspace_id uuid,contract_id uuid,event_key text unique,kind text,title text,message text,document_code text,link_target text);
   insert into grcon_workspaces values('${w}'),('${other}');insert into grcon_contracts values('${cid}','${w}','TEST',true);
   insert into grcon_memberships values('${w}','${user}',true,'operator');
   insert into grcon_history values('${hid}','${w}','${cid}','client','TEST-eGRDT',null,'{"files":[{"document":"A","revision":"0"},{"document":"B","revision":"1"}]}');`);
  for (const file of ['20261009141012_egrdt_teams_traceability.sql','20261010004058_teams_sharepoint_standard.sql']) await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  const rpc=(operation,input)=>db.query('select grcon_teams_sharepoint_sync($1,$2,$3) data',[config.source,operation,input]).then(r=>r.rows[0].data);
  const core=(operation,input)=>db.query('select grcon_teams_operation($1,$2,$3,$4) data',[w,['start','detail'].includes(operation)?user:null,operation,input]).then(r=>r.rows[0].data);
  const attempt=randomUUID();await core('start',{attemptId:attempt,historyRecordId:hid});
  const response={messageId:'card1',conversationId:'trusted-chat',type:'partial',selection:'0',respondedAt:new Date().toISOString(),responder:{tenantId:tenant,objectId:randomUUID(),displayName:'Equipe Teste'}};
  const item={id:'1',fields:{RequestKey:attempt,WorkspaceId:w,State:'Confirmed',ResponseJson:JSON.stringify(response),NoticeStatus:'pending',CardUpdated:false}};
  const input=sharepointInput(item,config);
  assert.throws(()=>sharepointInput({...item,fields:{...item.fields,ResponseJson:JSON.stringify({...response,responder:{...response.responder,tenantId:randomUUID()}})}},config));
  assert.throws(()=>sharepointInput({...item,fields:{...item.fields,ResponseJson:JSON.stringify({...response,conversationId:'wrong'})}},config));
  assert.throws(()=>sharepointInput({...item,fields:{...item.fields,ResponseJson:JSON.stringify({...response,selection:'0,0'})}},config));
  const record={itemId:'1',fingerprint:'a'.repeat(64),data:input};
  assert.equal((await rpc('import',record)).duplicate,false);
  assert.equal((await rpc('import',record)).duplicate,true);
  assert.equal((await db.query('select count(*)::int n from grcon_notifications')).rows[0].n,1);
  assert.equal(Date.parse((await core('detail',{attemptId:attempt})).attempt.confirmed_at),Date.parse(response.respondedAt));
  await assert.rejects(rpc('import',{...record,data:{...input,workspaceId:other}}),/outra tentativa/);
  const notice={...input,noticeStatus:'sent',replyMessageId:'reply1',cardUpdated:true};
  await rpc('import',{...record,fingerprint:'b'.repeat(64),data:notice});
  const updated=(await core('detail',{attemptId:attempt})).attempt;
  assert.equal(updated.notice_status,'sent');assert.ok(updated.card_updated_at);
  assert.equal((await db.query('select count(*)::int n from grcon_notifications')).rows[0].n,1);
  await assert.rejects(rpc('import',{...record,fingerprint:'c'.repeat(64),data:{...notice,responder:{...notice.responder,objectId:randomUUID()}}}),/não corresponde/);
  assert.equal((await rpc('cursor',{expected:null,cursor:base+'?token=one'})).advanced,true);
  assert.equal((await rpc('cursor',{expected:null,cursor:base+'?token=stale'})).advanced,false);
  await db.exec('set role authenticated');await assert.rejects(rpc('state',{}),/permission denied/);
  await assert.rejects(db.query('select * from private.grcon_teams_sharepoint_sources'),/permission denied/);await db.exec('reset role');
  // Real delta pages and RPC transactions, with controlled Graph replies.
  let pages=0,externalPosts=0;const links=[];
  const fetchImpl=async(url,options={})=>{
   url=String(url);links.push(url);
   assert.equal(options.redirect,'error');
   if(url.startsWith('https://login.microsoftonline.com/'))return Response.json({access_token:'graph-test'});
   if(url.includes('/rpc/')){const p=JSON.parse(options.body);return Response.json(await rpc(p.operation,p.input));}
   assert.ok(url.startsWith(base));assert.equal(options.headers.authorization,'Bearer graph-test');
   if(options.method && options.method!=='GET')externalPosts++;
   pages++;
   return Response.json(pages===1?{value:[item], '@odata.nextLink':base+'?token=page2'}:{value:[{...item,fields:{...item.fields,NoticeStatus:'sent',ReplyMessageId:'reply1',CardUpdated:true}}], '@odata.deltaLink':base+'?token=done'});
  };
  const synced=await syncSharepoint(env,{fetchImpl,maxPages:2});assert.equal(synced.complete,true);assert.equal(externalPosts,0);
  assert.equal((await rpc('state',{})).cursor,base+'?token=done');
  const before=(await rpc('state',{})).cursor;
  await assert.rejects(syncSharepoint(env,{fetchImpl:async(url,opts)=>String(url).startsWith(base)?Response.json({value:[{...item,fields:{...item.fields,ResponseJson:'broken'}}],'@odata.deltaLink':base+'?token=bad'}):fetchImpl(url,opts)}),/RESPONSE_INVALID/);
  assert.equal((await rpc('state',{})).cursor,before,'failed rows never advance the cursor');
  await assert.rejects(syncSharepoint(env,{fetchImpl:async(url,opts)=>String(url).startsWith(base)?Response.json({value:[],'@odata.deltaLink':'https://evil.test/secret'}):fetchImpl(url,opts)}),/LINK_REJECTED/);
  assert.equal((await syncSharepoint({...env,GRCON_TEAMS_TRACEABILITY_ENABLED:'false'},{fetchImpl:()=>{throw Error('must not fetch');}})).enabled,false);
  const late=randomUUID();await core('start',{attemptId:late,historyRecordId:hid});
  await db.query("update private.grcon_teams_attempts set requested_at=now()-interval '8 days',expires_at=now()-interval '1 day',delivery_status='expired' where id=$1",[late]);
  const lateResponse={...input,attemptId:late,messageId:'card-late',respondedAt:new Date(Date.now()-2*86400000).toISOString()};
  await rpc('import',{itemId:'2',fingerprint:'d'.repeat(64),data:lateResponse});
  assert.equal(Date.parse((await core('detail',{attemptId:late})).attempt.confirmed_at),Date.parse(lateResponse.respondedAt),'on-time clicks survive delayed synchronization');
  console.log('SharePoint standard: delta, tenant/chat, receipts, RLS, timestamps, cursor recovery and notifications PASS');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
