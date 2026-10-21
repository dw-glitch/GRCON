'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{const db=new PGlite();try{
 await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;create role service_role;grant usage on schema public,private,auth to authenticated,service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
 create table public.grcon_workspaces(id uuid primary key);create table public.grcon_contracts(id uuid primary key,workspace_id uuid,active boolean);
 create table public.grcon_memberships(workspace_id uuid,contract_id uuid,user_id uuid,role text,active boolean);
 create table private.grcon_allocation_registry_snapshots(id uuid,workspace_id uuid,status text);create table private.grcon_allocation_registry_rows(snapshot_id uuid,payload jsonb);
 insert into public.grcon_workspaces values('${uuid(1)}'),('${uuid(2)}');insert into public.grcon_contracts values('${uuid(3)}','${uuid(1)}',true),('${uuid(4)}','${uuid(2)}',true);
 insert into public.grcon_memberships values('${uuid(1)}','${uuid(3)}','${uuid(10)}','admin',true),('${uuid(1)}','${uuid(3)}','${uuid(11)}','operator',true),('${uuid(2)}','${uuid(4)}','${uuid(12)}','operator',true),('${uuid(1)}','${uuid(3)}','${uuid(13)}','viewer',true);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261021094333_intelligent_allocation_workspace.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021114531_allocation_review_hardening.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021114934_allocation_context_alias_fix.sql','utf8'));

 const as=async(n,role='authenticated')=>db.exec(`reset role;set request.jwt.claim.sub='${n?uuid(n):''}';set request.jwt.claim.role='${role}';set role ${role};`);
 const rpc=(op,input={},workspace=uuid(1),actor=null)=>db.query('select public.grcon_allocation($1,$2,$3::jsonb,$4) as r',[workspace,op,JSON.stringify(input),actor]).then(x=>x.rows[0].r);
 const catalog=()=>rpc('catalog');
 async function publish(kind,rows,expected=null){const {id}=await rpc('base-begin',{kind,count:rows.length,fileName:kind+'.xlsx',revision:'A',metadata:{},expectedActive:expected});for(let i=0;i<rows.length;i+=250)await rpc('base-chunk',{id,first:i+1,rows:rows.slice(i,i+250)});await rpc('base-publish',{id});return id;}
 await as(0);await assert.rejects(catalog(),/Sessão/);await as(11);await assert.rejects(publish('databook',[]),/gestores/);await assert.rejects(db.query('select * from private.grcon_allocation_bases'),/permission denied/);await assert.rejects(catalog().then(()=>rpc('context')),/servidor/);
 await as(10);const path='UHDT-D|DATA BOOK|TUBULACAO|RELATORIOS',moved='UHDT-D|DATA BOOK|MECANICOS|TUBULACAO|RELATORIOS';
 const first=await publish('databook',[{databook:path}]);await publish('config',[{prefix:'C1O-ALOC-CM',unit:'UHDT-D'}]);
 let versions=(await catalog()).versions;
 const data={document:'DOC-1',revision:'0',family:'F1',discipline:'TUB',eap:'1',title:'RELATORIO',confirmedPath:path,suggestedPath:path,levels:Array(10).fill(''),versions,evidence:[{id:'RULE'}],justification:'Conferido na base oficial',status:'corrected',validated:true};
 await as(13);assert.ok((await catalog()).versions.databook,'viewer mantém leitura do catálogo');
 assert.ok(Array.isArray((await rpc('history')).runs),'viewer mantém leitura do histórico');
 for(const op of ['decision','generate','run-status','run-files'])await assert.rejects(rpc(op,op==='decision'?data:{}),/perfis operacionais/,'viewer jamais pode alterar o gerador: '+op);
 await as(0,'service_role');await assert.rejects(rpc('decision',data,uuid(1),uuid(13)),/perfis operacionais/,'o Worker com service_role não pode elevar permissões do viewer');
 assert.equal((await rpc('context',{document:'DOC-1',confirmedPath:path},uuid(1),uuid(13))).complete,true,'viewer pode consultar evidência somente pela API autenticada');

 await as(11);const plain=await rpc('decision',data);let experiences=(await rpc('experiences')).decisions;assert.equal(experiences[0].trusted,false,'operador não forja evidência confiável');
 await assert.rejects(rpc('decision',{...data,status:'norm-confirmed'}),/gestor/);await assert.rejects(rpc('decision',{...data,confirmedPath:'INVENTADO'}),/Caminho/);
 await as(0,'service_role');const trusted=await rpc('decision',data,uuid(1),uuid(11));assert.ok(trusted.id);
 const current=await rpc('experiences',{family:'F1',discipline:'TUB',eap:'1',trustedOnly:true},uuid(1),uuid(11));assert.equal(current.decisions.length,1);
 assert.equal((await rpc('experiences',{family:'F2',trustedOnly:true},uuid(1),uuid(11))).decisions.length,0);
 await as(12);await assert.rejects(rpc('experiences'),/Sem acesso/);assert.equal((await rpc('experiences',{},uuid(2))).decisions.length,0);
 await as(11);const requestId=uuid(50),groups=[{documents:[{document:'DOC-1',revision:'0',decisionId:trusted.id}]}];
 const generated=await rpc('generate',{requestId,versions,groups});assert.equal(generated.runs.length,1);assert.equal(generated.runs[0].status,'generated','download não é aceitação');
 assert.equal((await rpc('generate',{requestId,versions,groups})).reused,true);
 await assert.rejects(rpc('generate',{requestId:uuid(51),versions,groups}),/já possui/);
 await rpc('generate',{requestId:uuid(51),versions,groups,justification:'Reenvio solicitado pela fiscalização'});
 await rpc('run-status',{id:generated.runs[0].id,status:'accepted',justification:'Aceita pela fiscalização'});
 await as(10);const second=await publish('databook',[{databook:moved}],first);
 assert.equal((await rpc('page',{id:first})).rows[0].payload.databook,path,'versão histórica intacta');
 assert.equal((await rpc('experiences',{trustedOnly:true})).decisions.length,0,'mudança de base invalida confiança');
 await assert.rejects(rpc('decision',data),/bases mudaram/);
 await rpc('base-restore',{id:first,expectedActive:second});assert.equal((await rpc('experiences',{trustedOnly:true})).decisions.length,1);
 // A new normative source also invalidates examples, independently of the path.
 await publish('norms',[{id:'R',source:'NORMA Rev.B',requirement:'Exigência vigente'}]);assert.equal((await rpc('experiences',{trustedOnly:true})).decisions.length,0);
 const history=(await rpc('history')).runs;assert.equal(history.length,2);assert.equal(history[0].base_versions.databook,first);
 // Regression: supported bases above 1000 rows must not become unconfirmable.
 await as(10);
 const lastPath='UHDT-D|DATA BOOK|TUBULACAO|ULTIMA PASTA';
 const hugeDatabook=Array.from({length:1003},(_,i)=>({databook:i===1002?lastPath:'UHDT-D|DATA BOOK|TUBULACAO|PASTA '+i}));
 await publish('databook',hugeDatabook,first);
 const hugeEap=Array.from({length:1002},(_,i)=>({code:i===1001?'10.2.1':'99.'+(i+1),levels:['NIVEL '+i]}));
 await publish('eap',hugeEap);
 const hugeNorms=Array.from({length:1001},(_,i)=>({id:i===1000?'NORMA-ALVO':'REGRA-'+i,source:'Norma vigente '+i,requirement:'Item '+i}));
 await publish('norms',hugeNorms,(await catalog()).versions.norms);
 await as(0,'service_role');
 const exact=await rpc('context',{document:'DOC-1',confirmedPath:lastPath,eap:'10.2.1',normIds:['NORMA-ALVO']},uuid(1),uuid(11));
 assert.equal(exact.complete,true,'validação não pode depender da paginação de 1000');
 assert.ok(exact.bases.databook.some(p=>p.databook===lastPath));
 assert.ok(exact.bases.eap.some(p=>p.code==='10.2.1'));
 assert.ok(exact.bases.norms.some(p=>p.id==='NORMA-ALVO'));
 const suggested=await rpc('context',{document:'DOC-1',candidatePaths:[lastPath],eap:'10.2.1',normIds:['NORMA-ALVO']},uuid(1),uuid(11));
 assert.equal(suggested.complete,true);
 assert.ok(suggested.bases.databook.some(p=>p.databook===lastPath));
 await as(10);

 await db.exec('reset role');
 const secured=await db.query("select bool_and(relrowsecurity) as yes from pg_class where relname in ('grcon_allocation_bases','grcon_allocation_base_rows','grcon_allocation_decisions','grcon_allocation_runs','grcon_allocation_events')");assert.equal(secured.rows[0].yes,true);
 console.log('Allocation DB: active contract authorization, base versions/restore, current-source learning, untrusted client feedback, sequence/idempotence, duplicate revision and lifecycle passed.');
}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
