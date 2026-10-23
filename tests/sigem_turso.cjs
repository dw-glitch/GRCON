'use strict';
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const {readFileSync} = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
(async () => {
 const M = await import('../cloudflare/sigem-turso.mjs');
 const engine = new DatabaseSync(':memory:'); engine.exec('PRAGMA foreign_keys=ON');
 const db = {execute: async (sql,args=[]) => {const s=engine.prepare(sql);return s.columns().length ? {rows:s.all(...args)} : {rows:[],affected:s.run(...args).changes};}};
 const objects = new Map(); let unavailable = false;
 const bucket = {put:async(k,v)=>{if(unavailable)throw Error('network');objects.set(k,v);},head:async k=>objects.has(k)?{}:null,get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null};
 const source={id:uuid(3),workspace_id:uuid(1),contract_id:uuid(2),record_count:501,status:'active',metadata:{title:'Símbolos é ç 漢字',date:'2026-10-23'},deleted_at:null};
 const rows=Array.from({length:501},(_,i)=>({snapshot_id:source.id,row_number:i+1,document_key:'DOC-'+(i+1),revision_key:i===121?'A':'0',status_original:'Em workflow',status_normalized:'em_analise',title:'Título '+i,discipline:'CV',payload:{document:'DOC-'+(i+1),revision:i===121?'A':'0',status:'Em workflow',title:'Título '+i,extra:{original:'__0_-N-1710',array:[null,0,'']}}}));
 await M.initialize(db); await M.initialize(db); await M.beginSnapshot(db,source);
 await assert.rejects(M.beginSnapshot(db,{...source,metadata:{date:'changed'}}),/SOURCE_CHANGED/);
 await assert.rejects(M.verifiedPage(db,source,0,1000),/NOT_VERIFIED/);
 unavailable=true;await assert.rejects(M.copyPage(db,bucket,source,0,rows.slice(0,250)),/network/);
 assert.equal(engine.prepare('select count(*) n from sigem_rows').get().n,0,'backup failure must precede destination writes');
 unavailable=false; const first=await M.copyPage(db,bucket,source,0,rows.slice(0,250));
 await M.copyPage(db,bucket,source,0,rows.slice(0,250));
 assert.equal(engine.prepare('select count(*) n from sigem_rows').get().n,250,'resume cannot duplicate rows');
 await assert.rejects(M.copyPage(db,bucket,source,0,[{...rows[0],title:'WRONG'},...rows.slice(1,250)]),/DESTINATION_CONFLICT/);
 await assert.rejects(M.sealSnapshot(db,bucket,source),/INCOMPLETE/);
 await M.copyPage(db,bucket,source,250,rows.slice(250,500));await M.copyPage(db,bucket,source,500,rows.slice(500));
 const report=await M.sealSnapshot(db,bucket,source),verified=await M.verifySnapshot(db,bucket,source);
 assert.equal(report.checksum,verified.checksum);assert.equal(report.count,501);
 const {restoreBackup}=await import('../scripts/restore-sigem-backup.mjs');
 const disk=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const backupRoot=await disk.mkdtemp(path.join(os.tmpdir(),'grcon-sigem-restore-'));
 try{
  for(const [key,value] of objects){const location=path.join(backupRoot,key);await disk.mkdir(path.dirname(location),{recursive:true});await disk.writeFile(location,value);}
  const output=path.join(backupRoot,'restored.sqlite');
  const restored=await restoreBackup(backupRoot,report.manifestKey,report.manifestHash,output);assert.equal(restored.records,501);
  const restoredDb=new DatabaseSync(output);assert.equal(restoredDb.prepare('select count(*) n from sigem_rows').get().n,501);assert.equal(JSON.parse(restoredDb.prepare('select row_json from sigem_rows where row_number=122').get().row_json).payload.document,'DOC-122');restoredDb.close();
  await assert.rejects(restoreBackup(backupRoot,report.manifestKey,report.manifestHash,output),/OUTPUT_EXISTS/);
  await disk.writeFile(path.join(backupRoot,first.backupKey),'corrupt');
  await assert.rejects(restoreBackup(backupRoot,report.manifestKey,report.manifestHash,path.join(backupRoot,'bad.sqlite')),/BACKUP_HASH_MISMATCH/);
  assert.ok(!(await disk.readdir(backupRoot)).some(n=>n.startsWith('bad.sqlite')),'failed restoration must not expose a partial database');
 }finally{await disk.rm(backupRoot,{recursive:true,force:true});}

 assert.deepEqual(await M.readRows(db,source,0,1000),rows,'complete source columns/payload/order survive');
 const page=await M.verifiedPage(db,source,120,2);assert.equal(page[0].payload.document,'DOC-121');assert.equal(page[1].payload.document,'DOC-122');
 assert.deepEqual(await M.readRows(db,{...source,workspace_id:uuid(9)},0,1000),[],'same snapshot cannot leak across workspaces');
 await assert.rejects(M.verifiedPage(db,{...source,contract_id:uuid(9)},0,1000),/NOT_VERIFIED/);
 objects.set(first.backupKey,'corrupt');await assert.rejects(M.verifySnapshot(db,bucket,source),/VERIFY_MISMATCH/);
 objects.set(first.backupKey,M.canonical(rows.slice(0,250)));
 engine.prepare('update sigem_rows set row_json=? where row_number=122').run(M.canonical({...rows[121],payload:{document:'DOC-121'}}));
 await assert.rejects(M.verifySnapshot(db,bucket,source),/VERIFY_MISMATCH/);
 engine.close();
 assert.equal(M.canonical({b:1,a:{y:2,x:3}}),M.canonical({a:{x:3,y:2},b:1}));
 assert.throws(()=>M.canonical({n:9007199254740992}),/NON_CANONICAL/);
 for (const bad of ['https://evil.test','https://x.turso.io.evil.test','https://user:pass@x.turso.io','https://x.turso.io/path','turso://x.turso.io']) assert.throws(()=>M.tursoClient({TURSO_DATABASE_URL:bad,TURSO_AUTH_TOKEN:'secret'}),/NOT_CONFIGURED/);
 let requestBody;
 const http=M.tursoClient({TURSO_DATABASE_URL:'libsql://test-org.turso.io',TURSO_AUTH_TOKEN:'private'},async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(String(url),'https://test-org.turso.io/v2/pipeline');requestBody=JSON.parse(options.body);return Response.json({results:[{type:'ok',response:{type:'execute',result:{cols:[{name:'n'}],rows:[[{type:'integer',value:'1'}]],affected_row_count:0}}},{type:'ok',response:{type:'close'}}]});});
 assert.equal((await http.execute('select ? n',[1])).rows[0].n,1);assert.deepEqual(requestBody.requests[0].stmt.args,[{type:'integer',value:'1'}]);
 const bad=M.tursoClient({TURSO_DATABASE_URL:'libsql://test-org.turso.io',TURSO_AUTH_TOKEN:'private'},async()=>Response.json({results:[{type:'error',error:{message:'secretSQL'}}]}));
 await assert.rejects(bad.execute('select 1'),e=>e.message==='TURSO_QUERY_FAILED');

 // Real Postgres engine: master enforcement, inactive membership, contract
 // boundaries, deleted-history migration and exact paginated source payloads.
 const pg=new PGlite();try{
 await pg.exec(`create schema auth;create schema private;create role anon;create role authenticated;create role service_role;grant usage on schema public,private,auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.grcon_contracts(id uuid,workspace_id uuid,active boolean);
 create table public.grcon_memberships(workspace_id uuid,contract_id uuid,user_id uuid,active boolean);
 create table private.grcon_sigem_query_snapshots(id uuid primary key,workspace_id uuid,contract_id uuid,status text,record_count integer,created_at timestamptz default now(),deleted_at timestamptz,metadata jsonb);
 create table private.grcon_sigem_query_rows(snapshot_id uuid,row_number integer,payload jsonb,document_key text,revision_key text,status_original text,status_normalized text,title text,discipline text);
 create function private.grcon_require_master_owner() returns void language plpgsql as $$begin if auth.uid() is distinct from '${uuid(10)}'::uuid then raise exception 'Master necessário' using errcode='42501';end if;end$$;
 insert into public.grcon_contracts values('${uuid(2)}','${uuid(1)}',true),('${uuid(22)}','${uuid(21)}',true);
 insert into public.grcon_memberships values('${uuid(1)}','${uuid(2)}','${uuid(10)}',true),('${uuid(1)}','${uuid(2)}','${uuid(11)}',true),('${uuid(21)}','${uuid(22)}','${uuid(12)}',true);
 insert into private.grcon_sigem_query_snapshots(id,workspace_id,contract_id,status,record_count,metadata) values('${uuid(3)}','${uuid(1)}','${uuid(2)}','active',1,'{}'),('${uuid(23)}','${uuid(21)}','${uuid(22)}','active',1,'{}');
 insert into private.grcon_sigem_query_rows values('${uuid(3)}',1,'{"document":"DOC-122","revision":"A","extra":"preserved"}','DOC-122','A','Em workflow','em_analise','Título','CV');`);
 await pg.exec(readFileSync('supabase/migrations/20261023152857_turso_sigem_preparation.sql','utf8'));
 const as=async n=>pg.exec(`reset role;set request.jwt.claim.sub='${n?uuid(n):''}';set role authenticated;`);
 const rpc=(op,input={},workspace=uuid(1))=>pg.query('select public.grcon_sigem_storage_control($1,$2,$3) r',[workspace,op,input]).then(r=>r.rows[0].r);
 await as(0);await assert.rejects(rpc('inventory'),/Sessão/);
 await as(11);await assert.rejects(rpc('inventory'),/Master/);assert.equal((await rpc('authorize-page',{snapshot:uuid(3)})).id,uuid(3));
 await assert.rejects(rpc('authorize-page',{snapshot:uuid(23)}),/indisponível/);
 await assert.rejects(pg.query('select * from private.grcon_sigem_query_rows'),/permission denied/);
 await as(12);await assert.rejects(rpc('inventory'),/contrato/);
 await as(10);assert.equal((await rpc('inventory')).snapshots.length,1);
 assert.equal((await rpc('source-page',{snapshot:uuid(3),after:0})).rows[0].payload.extra,'preserved');
 await assert.rejects(rpc('source-page',{snapshot:uuid(3),after:-1}),/Página/);
 await pg.exec(`reset role;update private.grcon_sigem_query_snapshots set deleted_at=now() where id='${uuid(3)}';`);
 await as(10);assert.equal((await rpc('inventory')).snapshots.length,1,'logical deletion is preserved in migration');await assert.rejects(rpc('authorize-page',{snapshot:uuid(3)}),/indisponível/);
 await pg.exec(`reset role;update public.grcon_memberships set active=false where user_id='${uuid(10)}';`);await as(10);await assert.rejects(rpc('inventory'),/contrato/);
 }finally{await pg.close();}
 console.log('SIGEM Turso: SQLite integrity/resume/backups, exact identities, HTTP isolation, and PostgreSQL master/contract authorization passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
