'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;create role service_role;
  grant usage on schema public,private,auth to authenticated,service_role;
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
  create table public.grcon_workspaces(id uuid primary key);
  create table public.grcon_contracts(id uuid primary key,workspace_id uuid,active boolean);
  create table public.grcon_memberships(workspace_id uuid,contract_id uuid,user_id uuid,role text,active boolean);
  create table private.grcon_allocation_registry_snapshots(id uuid primary key,workspace_id uuid,contract_id uuid,status text,file_name text,created_by uuid,published_at timestamptz,metadata jsonb default '{}');
  create table private.grcon_allocation_registry_rows(snapshot_id uuid,row_number int,payload jsonb);
  insert into public.grcon_workspaces values('${uuid(1)}');
  insert into public.grcon_contracts values('${uuid(3)}','${uuid(1)}',true);
  insert into public.grcon_memberships values('${uuid(1)}','${uuid(3)}','${uuid(10)}','admin',true),
    ('${uuid(1)}','${uuid(3)}','${uuid(11)}','operator',true),('${uuid(1)}','${uuid(3)}','${uuid(13)}','viewer',true);`);
  for(const file of ['20261021094333_intelligent_allocation_workspace.sql','20261021114531_allocation_review_hardening.sql',
    '20261021114934_allocation_context_alias_fix.sql','20261021192719_allocation_automatic_generation.sql',
    '20261021193544_allocation_automatic_server_validation.sql',
    '20261022120000_allocation_number_published_history.sql']){
     await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  }
  const as=async(n,role='authenticated')=>db.exec(`reset role;set request.jwt.claim.sub='${n?uuid(n):''}';set request.jwt.claim.role='${role}';set role ${role};`);
  const rpc=(op,input={},actor=null)=>db.query('select public.grcon_allocation($1,$2,$3::jsonb,$4) as r',
    [uuid(1),op,JSON.stringify(input),actor]).then(x=>x.rows[0].r);
  await as(10);
  const config=await rpc('base-begin',{kind:'config',fileName:'Config.xlsx',revision:'1',count:1,metadata:{},expectedActive:null});
  await rpc('base-chunk',{id:config.id,first:1,rows:[{prefix:'C1O-ALOC-CM',unit:'UHDT-D'}]});
  await rpc('base-publish',{id:config.id});
  await as(11);
  const sequence=await rpc('sequence-preview');assert.equal(sequence.nextSequence,1);assert.equal(sequence.prefix,'C1O-ALOC-CM');
  const year=sequence.year,versions=(await rpc('catalog')).versions;
  const doc={document:'DOC-100001',revision:'0',title:'DOCUMENTO',discipline:'TUB',workflow:'',
    eap:'',databook:'',levels:Array(10).fill(''),observation:'',warnings:[],adjusted:false};
  const body={automatic:true,versions,groups:[{documents:[doc]}],startSequence:200,requestId:uuid(30)};
  await as(0,'service_role');
  const created=await rpc('generate',body,uuid(11));
  assert.equal(created.runs[0].allocation_code,'C1O-ALOC-CM-0200-'+year);
  await as(11);
  assert.equal((await rpc('sequence-preview')).nextSequence,201);
  assert.equal((await rpc('history')).runs.length,0,'geração não comprova publicação');
  await as(0,'service_role');
  await assert.rejects(rpc('generate',{...body,requestId:uuid(31)},uuid(11)),/utilizado/);
  await db.exec('reset role');
  await db.query('insert into private.grcon_allocation_registry_snapshots(id,workspace_id,contract_id,status,file_name,created_by,published_at) values($1,$2,$3,$4,$5,$6,now())',
    [uuid(51),uuid(1),uuid(3),'active','Central.xlsx',uuid(10)]);
  await db.query('insert into private.grcon_allocation_registry_rows(snapshot_id,row_number,payload) values($1,1,$2)',
    [uuid(51),{document:doc.document,allocation:created.runs[0].allocation_code,allocationStatus:'PENDENTE ENVIO DE LD'}]);
  await as(11);
  let hist=(await rpc('history')).runs;
  assert.equal(hist.length,1);assert.equal(hist[0].control_status,'PENDENTE ENVIO DE LD');
  await db.exec('reset role');
  await db.query('update private.grcon_allocation_registry_rows set payload=$1 where snapshot_id=$2',
    [{document:doc.document,allocation:created.runs[0].allocation_code,allocationStatus:'CONCLUÍDA'},uuid(51)]);
  await as(11);
  hist=(await rpc('history')).runs;
  assert.equal(hist[0].control_status,'CONCLUÍDA','status usa sempre a última base publicada');
  await rpc('hide-run',{id:created.runs[0].id});
  assert.equal((await rpc('history')).runs.length,0,'exclusão oculta de todas as sincronizações');
  await as(13);
  await assert.rejects(rpc('restore-run',{id:created.runs[0].id}),/gestor/);
  await as(10);
  assert.equal((await rpc('hidden-history')).runs.length,1);
  await rpc('restore-run',{id:created.runs[0].id});
  assert.equal((await rpc('history')).runs.length,1);
  await db.exec('reset role');
  await db.query('delete from private.grcon_allocation_registry_rows where snapshot_id=$1',[uuid(51)]);
  await as(11);
  assert.equal((await rpc('history')).runs.length,0,'sumir da Central retira do histórico visível');
  assert.equal((await rpc('sequence-preview')).nextSequence,201,'número gerado nunca volta a ficar livre');
  console.log('Allocation published history: sequência, geração, base publicada, atualização, ocultação e restauração OK');
 }finally{await db.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
