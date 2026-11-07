'use strict';
// RA-07 — registro de validações/homologações de referências: migração, permissões, validações, idempotência, revogação, isolamento e rollback.
// PGlite local: nada toca o banco de produção.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),root=path.resolve(__dirname,'..'),u=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const sql=f=>fs.readFileSync(path.join(root,f),'utf8');
const UP='supabase/migrations/20261107120824_allocation_auditor_reference_validations.sql',DOWN='supabase/rollback/20261107120824_allocation_auditor_reference_validations.down.sql';
(async()=>{
 const db=new PGlite();
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;grant usage on schema private,auth to authenticated;
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.grcon_workspaces(id uuid primary key);create table public.grcon_contracts(id uuid primary key,workspace_id uuid,active boolean);create table public.grcon_memberships(workspace_id uuid,contract_id uuid,user_id uuid,role text,active boolean);
  insert into public.grcon_workspaces values('${u(1)}'),('${u(2)}');insert into public.grcon_contracts values('${u(3)}','${u(1)}',true),('${u(4)}','${u(2)}',true);
  insert into public.grcon_memberships values('${u(1)}','${u(3)}','${u(10)}','owner',true),('${u(1)}','${u(3)}','${u(14)}','admin',true),('${u(1)}','${u(3)}','${u(11)}','operator',true),('${u(1)}','${u(3)}','${u(12)}','viewer',true),('${u(2)}','${u(4)}','${u(13)}','owner',true);`);
 await db.exec(sql(UP));
 const as=async(n)=>db.exec(`reset role;set request.jwt.claim.sub='${n?u(n):''}';set role authenticated;`);
 const call=async(user,ws,op,input={})=>{await as(user);try{return (await db.query('select public.grcon_allocation_reference_validations($1,$2,$3::jsonb) r',[ws,op,JSON.stringify(input)])).rows[0].r;}finally{await db.exec('reset role');}};
 const fails=async(user,ws,op,input,pattern)=>{await assert.rejects(call(user,ws,op,input),e=>{assert.match(e.message,pattern);return true;});};
 let req=100;const rec=(over={})=>({requestId:u(++req),recordType:'validacao',kind:'et-codificacao',revision:'R',responsible:'Maria Souza (Qualidade)',validatedOn:'2026-11-05',evidence:'Ata de validação 12/2026, pasta Qualidade',...over});

 // permissões: só proprietário/administrador registram; todo membro lê; sem sessão/sem contrato nada
 const ok1=await call(10,u(1),'register',rec());assert.ok(ok1.id,'proprietário registra');
 assert.ok((await call(14,u(1),'register',rec({kind:'n-381',revision:'M'}))).id,'administrador registra');
 await fails(11,u(1),'register',rec(),/proprietário ou administrador/);await fails(12,u(1),'register',rec(),/proprietário ou administrador/);
 await fails(0,u(1),'list',{},/Sessão necessária/);await fails(13,u(1),'list',{},/Sem acesso ao contrato/);
 const asViewer=await call(12,u(1),'list');assert.equal(asViewer.canRegister,false);assert.equal(asViewer.validations.length,2,'qualquer membro lê');
 assert.equal((await call(10,u(1),'list')).canRegister,true);

 // validações do servidor: nada de registro sem responsável/evidência, ET sem revisão, data futura, tipo/kind inválidos, hash malformado
 await fails(10,u(1),'register',rec({responsible:'ab'}),/Responsável e evidência/);await fails(10,u(1),'register',rec({evidence:'curt'}),/Responsável e evidência|Registro inválido/);
 await fails(10,u(1),'register',rec({evidence:'   '}),/Responsável e evidência/);
 await fails(10,u(1),'register',rec({revision:''}),/revisão da ET deve ser informada/);await fails(10,u(1),'register',rec({revision:undefined}),/revisão da ET deve ser informada/);
 await fails(10,u(1),'register',rec({validatedOn:'2999-01-01'}),/Data da validação inválida/);await fails(10,u(1),'register',rec({recordType:'aprovacao'}),/Tipo de registro inválido/);
 await fails(10,u(1),'register',rec({kind:'inventado'}),/Registro inválido/);await fails(10,u(1),'register',rec({sha256:'xyz'}),/Registro inválido/);
 await fails(10,u(1),'register',rec({effectiveDate:'24/08/2026'}),/Registro inválido/); // vigência exige evidência da vigência
 assert.ok((await call(10,u(1),'register',rec({kind:'workflows-uhdt-d',revision:undefined,sha256:'a'.repeat(64),effectiveDate:'24/08/2026',effectiveEvidence:'Memorial UHDT-D, seção 3'}))).id,'sem revisão é aceito fora da ET; hash e vigência com evidência');
 assert.ok((await call(10,u(1),'register',rec({recordType:'homologacao',kind:'anexo-iii-apendice-a',revision:undefined}))).id);

 // idempotência: mesma requisição com o mesmo conteúdo devolve o mesmo id; com conteúdo diferente é recusada
 const same=rec({kind:'n-1710',revision:'N'});const a=await call(10,u(1),'register',same),b=await call(10,u(1),'register',same);assert.equal(a.id,b.id,'reenvio idêntico não duplica');
 await fails(10,u(1),'register',{...same,evidence:'Evidência diferente da original'},/Requisição já utilizada com conteúdo diferente/);
 for(const change of [{revision:'P'},{sha256:'b'.repeat(64)},{validatedOn:'2026-11-04'},{effectiveDate:'24/08/2026',effectiveEvidence:'Nova vigência comprovada'}])await fails(10,u(1),'register',{...same,...change},/Requisição já utilizada com conteúdo diferente/);
 await fails(10,u(1),'register',rec({effectiveDate:'31/02/2026',effectiveEvidence:'Evidência inválida para QA'}),/Data da vigência inválida/);
 const tomorrow=(await db.query("select (current_date+1)::text d")).rows[0].d;await fails(10,u(1),'register',rec({validatedOn:tomorrow}),/Data da validação inválida/);

 // revogação: exige motivo e perfil; some da lista; não apaga (append-only)
 await fails(11,u(1),'revoke',{id:a.id,reason:'motivo suficiente'},/proprietário ou administrador/);await fails(10,u(1),'revoke',{id:a.id,reason:'x'},/Motivo da revogação/);
 assert.equal((await call(10,u(1),'revoke',{id:a.id,reason:'Documento substituído pela Rev. P'})).ok,true);
 await fails(10,u(1),'revoke',{id:a.id,reason:'segunda revogação'},/indisponível ou já revogado/);
 assert.ok(!(await call(10,u(1),'list')).validations.some(v=>v.id===a.id),'revogado sai da lista');
 await db.exec('reset role');assert.equal((await db.query(`select count(*)::int n, count(revoked_at)::int r from private.grcon_allocation_reference_validations`)).rows[0].r,1,'a linha revogada continua gravada com quem e por quê');
 assert.equal((await db.query(`select revoke_reason from private.grcon_allocation_reference_validations where id='${a.id}'`)).rows[0].revoke_reason,'Documento substituído pela Rev. P');

 // isolamento entre contratos e acesso direto às tabelas
 await call(13,u(2),'register',rec({kind:'n-381',revision:'M',responsible:'Outro Responsável'}));
 assert.ok((await call(10,u(1),'list')).validations.every(v=>v.responsible!=='Outro Responsável'),'contrato 1 não vê o contrato 2');
 assert.equal((await call(13,u(2),'list')).validations.length,1);
 await as(10);await assert.rejects(db.query('select * from private.grcon_allocation_reference_validations'),/permission denied|denied/i,'tabela privada não é lida direto');await db.exec('reset role');
 await fails(10,u(2),'list',{},/Sem acesso ao contrato/,'trocar o workspace não dá acesso');
 await fails(10,u(1),'operacao-inexistente',{},/Operação não reconhecida/);

 // Atingir a capacidade não pode quebrar reenvios idênticos já confirmados.
 const atLimit=rec({kind:'n-381',revision:'M'}),limitId=(await call(10,u(1),'register',atLimit)).id;
 await db.exec(`insert into private.grcon_allocation_reference_validations(workspace_id,contract_id,request_id,record_type,kind,revision,responsible,validated_on,evidence,created_by)
 select '${u(1)}','${u(3)}',gen_random_uuid(),'validacao','n-381','M','Qualidade QA',current_date,'Evidência sintética','${u(10)}'
 from generate_series(1,500-(select count(*)::int from private.grcon_allocation_reference_validations where contract_id='${u(3)}' and revoked_at is null));`);
 assert.equal((await call(10,u(1),'register',atLimit)).id,limitId);
 await fails(10,u(1),'register',rec(),/Limite de registros ativos/);

 // rollback: recusa apagar registros sem confirmação, conclui com confirmação, é idempotente e a migração é reaplicável
 let refused='';try{await db.exec('begin;'+sql(DOWN)+'commit;');}catch(e){refused=e.message;await db.exec('rollback');}
 assert.match(refused,/registro\(s\) de validação/);assert.equal((await db.query(`select to_regclass('private.grcon_allocation_reference_validations') is not null t`)).rows[0].t,true,'transação desfeita');
 await db.exec("begin;set local app.confirm_drop_validations='sim';"+sql(DOWN)+'commit;');
 assert.equal((await db.query(`select to_regclass('private.grcon_allocation_reference_validations') is null t, to_regprocedure('public.grcon_allocation_reference_validations(uuid,text,jsonb)') is null f`)).rows[0].f,true);
 await db.exec(sql(DOWN));await db.exec(sql(UP)); // idempotente e reaplicável
 assert.equal((await call(10,u(1),'list')).validations.length,0,'depois do rollback e da reaplicação a tabela começa vazia');
 await db.close();
 console.log('allocation_auditor_reference_validations_stage13: permissions, server validation, idempotence, revocation (append-only), contract isolation, private tables, rollback and re-apply passed (PGlite, no production access)');
})().catch(e=>{console.error(e);process.exit(1);});
