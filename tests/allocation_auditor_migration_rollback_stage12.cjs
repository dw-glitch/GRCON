'use strict';
// Etapa 12 — a migração do checkpoint e o seu ROLLBACK, em PGlite local (nada toca o banco de produção).
// Prova: (1) a migração aplica e é detectável por uma sonda numa análise real; (2) o rollback devolve a função exatamente ao texto anterior; (3) respeita dados salvos;
// (4) é idempotente; (5) a migração pode ser reaplicada depois do rollback.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),root=path.resolve(__dirname,'..'),u=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const mig=f=>fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8');
const up=mig('20261107120803_allocation_auditor_complete_checkpoint.sql'),down=fs.readFileSync(path.join(root,'supabase/rollback/20261107120803_allocation_auditor_complete_checkpoint.down.sql'),'utf8');
(async()=>{
 const db=new PGlite();
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;grant usage on schema private,auth to authenticated;
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.grcon_workspaces(id uuid primary key);create table public.grcon_contracts(id uuid primary key,workspace_id uuid,active boolean);create table public.grcon_memberships(workspace_id uuid,contract_id uuid,user_id uuid,role text,active boolean);
  create function private.grcon_require_master_owner() returns void language plpgsql as $$begin null;end$$;
  create table private.grcon_allocation_bases(id uuid,contract_id uuid,kind text,status text);create table private.grcon_allocation_base_rows(base_id uuid,payload jsonb);
  insert into public.grcon_workspaces values('${u(1)}');insert into public.grcon_contracts values('${u(3)}','${u(1)}',true);insert into public.grcon_memberships values('${u(1)}','${u(3)}','${u(11)}','operator',true);`);
 for(const f of ['20261027203851_allocation_auditor.sql','20261028090553_allocation_auditor_retry_safety.sql','20261028192535_allocation_assistant_sessions_rules.sql','20261030010508_allocation_assistant_release_safety.sql'])await db.exec(mig(f));
 // Optional read-only production function snapshot: exercises the exact current
 // RPC definition locally, without exporting rows or running tests in production.
 if(process.env.GRCON_AUDITOR_PRODUCTION_BASELINE)await db.exec(fs.readFileSync(path.resolve(process.env.GRCON_AUDITOR_PRODUCTION_BASELINE),'utf8'));
 const state=async()=>(await db.query(`select position('input-chunk' in d)>0 as block, md5(d) as md5, to_regclass('private.grcon_allocation_audit_inputs') is not null as inputs_table from (select pg_get_functiondef('private.grcon_allocation_auditor(uuid,text,jsonb)'::regprocedure) as d) x`)).rows[0];
 const before=await state();assert.equal(before.block,false);assert.equal(before.inputs_table,false);
 // 1. aplica a migração
 await db.exec(up);const after=await state();assert.equal(after.block,true,'migração acrescenta o bloco');assert.equal(after.inputs_table,true);assert.notEqual(after.md5,before.md5);
 if(process.env.GRCON_AUDITOR_BASELINE_REPORT)fs.writeFileSync(path.resolve(process.env.GRCON_AUDITOR_BASELINE_REPORT),JSON.stringify({productionFunctionSnapshot:Boolean(process.env.GRCON_AUDITOR_PRODUCTION_BASELINE),before,after,scope:'PGlite local; nenhuma linha real ou credencial exportada'},null,2));
 // 2. a sonda do cliente (input-detail numa análise real do contrato) distingue banco novo de banco antigo
 const rpcAs=async(op,input)=>{await db.exec(`reset role;set request.jwt.claim.sub='${u(11)}';set role authenticated;`);try{return (await db.query("select public.grcon_allocation_auditor($1,$2,$3::jsonb) as r",[u(1),op,JSON.stringify(input)])).rows[0].r;}finally{await db.exec('reset role');}};
 const run=await rpcAs('begin',{count:1,requestId:u(60),metadata:{snapshotVersion:2}});
 const probe=async()=>{try{await rpcAs('input-detail',{id:run.id,after:0});return 'ok';}catch(e){return e.message;}};
 assert.equal(await probe(),'ok','com a migração: a sonda numa análise real responde');
 // com id inexistente os dois bancos respondem igual — por isso a sonda do cliente precisa de uma análise real
 const ghost=async()=>{try{await rpcAs('input-detail',{id:'00000000-0000-0000-0000-000000000000',after:0});}catch(e){return e.message;}};
 assert.match(await ghost(),/Análise indisponível/);
 // 3. rollback: devolve a função exatamente ao texto anterior e remove a tabela vazia
 await db.exec(down);const rolled=await state();assert.equal(rolled.block,false);assert.equal(rolled.inputs_table,false);assert.equal(rolled.md5,before.md5,'a função volta byte a byte ao texto anterior à migração');
 assert.match(await probe(),/Operação não reconhecida/,'depois do rollback: a sonda recebe "Operação não reconhecida" (cliente cai no aviso de histórico indisponível)');
 assert.match(await ghost(),/Análise indisponível/,'id inexistente não distingue as versões (confirma a necessidade da análise real)');
 // 4. idempotente
 await db.exec(down);assert.equal((await state()).md5,before.md5,'segunda execução não altera nada');
 // 5. reaplicável
 await db.exec(up);assert.equal((await state()).block,true);
 // 6. com dados salvos o rollback recusa (e a função permanece inalterada pela transação)
 await db.exec(`insert into private.grcon_allocation_audit_runs(id,workspace_id,contract_id,request_id,created_by,expected_count,metadata) values('${u(50)}','${u(1)}','${u(3)}','${u(51)}','${u(11)}',1,'{}'::jsonb);insert into private.grcon_allocation_audit_inputs values('${u(50)}',1,'{"document":"D"}'::jsonb);`);
 let refused='';try{await db.exec('begin;'+down+'commit;');}catch(e){refused=e.message;await db.exec('rollback');}
 assert.match(refused,/linha\(s\) de entrada salvas/,'rollback recusa apagar entradas salvas sem confirmação');assert.equal((await state()).block,true,'transação desfeita: função continua com o bloco');
 await db.exec("begin;set local app.confirm_drop_inputs='sim';"+down+'commit;');const final=await state();assert.equal(final.inputs_table,false);assert.equal(final.md5,before.md5,'com confirmação explícita o rollback conclui');
 await db.close();
 console.log('allocation_auditor_migration_rollback_stage12: migration up, capability probe, byte-exact rollback, saved-data guard, idempotence and re-apply passed (PGlite, no production access)');
})().catch(e=>{console.error(e);process.exit(1);});
