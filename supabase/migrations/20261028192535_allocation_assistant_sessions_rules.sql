-- Opt-in assistant. No files, credentials or source workbooks are stored here.
create table private.grcon_allocation_chat_sessions (
 id uuid primary key, workspace_id uuid not null references public.grcon_workspaces(id),
 contract_id uuid not null references public.grcon_contracts(id), created_by uuid not null,
 revision integer not null default 0, payload jsonb not null default '{}',
 updated_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 days'
);
create index grcon_allocation_chat_user on private.grcon_allocation_chat_sessions(contract_id,created_by,updated_at desc);
create table private.grcon_allocation_learned_rules (
 id uuid not null, version integer not null, contract_id uuid not null references public.grcon_contracts(id),
 state text not null check(state in ('candidate','validating','active','suspended','revoked')),
 payload jsonb not null, validation jsonb not null default '{}', created_by uuid not null, created_at timestamptz not null default now(),
 primary key(id,version)
);
create index grcon_allocation_rules_contract on private.grcon_allocation_learned_rules(contract_id,id,version desc);
alter table private.grcon_allocation_chat_sessions enable row level security;
alter table private.grcon_allocation_learned_rules enable row level security;
create policy grcon_allocation_chat_deny_api on private.grcon_allocation_chat_sessions for all to public using(false) with check(false);
create policy grcon_allocation_rules_deny_api on private.grcon_allocation_learned_rules for all to public using(false) with check(false);
revoke all on private.grcon_allocation_chat_sessions,private.grcon_allocation_learned_rules from public,anon,authenticated;

create function private.grcon_allocation_rule_matches(row_data jsonb, policy jsonb, metadata jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(
  row_data->>'officialAllocation'='true' and policy->>'field' in ('workflow','databook','N1','N2','N3','N4','N5','N6')
  and length(policy->>'revision')>0 and length(policy->>'sourceHash')=64 and length(policy->>'ldHash')=64
  and row_data->>'contract'=policy->>'contract' and row_data->>'document'=policy->>'document'
  and row_data->'origin'->>'revision'=row_data->>'revision' and row_data->>'revision'=policy->>'revision' and row_data->>'discipline'=policy->>'discipline'
  and row_data->>'sourceHash'=policy->>'sourceHash' and row_data->'versions'=policy->'versions'
  and metadata->'ldHashes'->>(row_data->'origin'->>'file')=policy->>'ldHash'
  and exists(select 1 from jsonb_array_elements(row_data->'recommendations') p where p->>'field'=policy->>'field' and p->>'before'=policy->>'before' and p->>'after'=policy->>'after')
 ,false)
$$;
revoke all on function private.grcon_allocation_rule_matches(jsonb,jsonb,jsonb) from public,anon,authenticated;

create function private.grcon_allocation_assistant(target_workspace uuid, operation text, input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c uuid;r text;v private.grcon_allocation_chat_sessions;rule private.grcon_allocation_learned_rules;
 run private.grcon_allocation_audit_runs;item jsonb;rec jsonb;body jsonb;items jsonb;test jsonb;testrow jsonb;testmeta jsonb;
 rid uuid;next_version integer;positives integer:=0;negatives integer:=0;failures integer:=0;matched boolean;ev jsonb;
begin
 if u is null then raise exception 'Sessão necessária.' using errcode='42501';end if;
 select m.contract_id,m.role into c,r from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active where m.workspace_id=target_workspace and m.user_id=u and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>120000 then raise exception 'Entrada inválida.';end if;
 if operation='sessions' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (select id,revision,updated_at,payload->>'runId' as run_id from private.grcon_allocation_chat_sessions where contract_id=c and created_by=u and expires_at>now() order by updated_at desc limit 30) q;
  return jsonb_build_object('sessions',items);
 elsif operation in ('session-read','session-write') then
  rid:=(input->>'id')::uuid;
  if operation='session-write' then
   if r not in ('owner','admin','operator') then raise exception 'Perfil sem permissão.' using errcode='42501';end if;
   body:=input->'payload';
   if jsonb_typeof(body) is distinct from 'object' or jsonb_typeof(body->'messages') is distinct from 'array' or jsonb_array_length(body->'messages')>100 or octet_length(body::text)>80000 or body-'messages'-'runId'-'sourceHashes' <> '{}'::jsonb then raise exception 'Sessão inválida.';end if;
   for item in select value from jsonb_array_elements(body->'messages') loop
    if item->>'role' not in ('user','assistant') or length(item->>'text')>2000 or item-'role'-'text'-'id' <> '{}'::jsonb then raise exception 'Mensagem inválida.';end if;
   end loop;
   if nullif(body->>'runId','') is not null and not exists(select 1 from private.grcon_allocation_audit_runs where id=(body->>'runId')::uuid and contract_id=c and created_by=u) then raise exception 'Análise indisponível.';end if;
   delete from private.grcon_allocation_chat_sessions where contract_id=c and created_by=u and expires_at<=now();
   insert into private.grcon_allocation_chat_sessions(id,workspace_id,contract_id,created_by) values(rid,target_workspace,c,u) on conflict do nothing;
  end if;
  select * into v from private.grcon_allocation_chat_sessions where id=rid and workspace_id=target_workspace and contract_id=c and created_by=u and expires_at>now() for update;
  if not found then raise exception 'Sessão indisponível.' using errcode='42501';end if;
  if operation='session-write' then
   if v.revision is distinct from (input->>'revision')::integer then
    if v.payload=body then return to_jsonb(v);end if;
    raise exception 'Sessão alterada em outra janela. Reabra antes de continuar.';
   end if;
   update private.grcon_allocation_chat_sessions set payload=body,revision=revision+1,updated_at=now() where id=rid returning * into v;
  end if;
  return to_jsonb(v);
 elsif operation='authorize' then
  if r not in ('owner','admin','operator') then raise exception 'Perfil sem permissão.' using errcode='42501';end if;
  select * into run from private.grcon_allocation_audit_runs where id=(input->>'runId')::uuid and contract_id=c and workspace_id=target_workspace and created_by=u and completed_at is not null for update;
  if not found then raise exception 'Análise concluída obrigatória.';end if;
  if (select coalesce(jsonb_object_agg(kind,id::text),'{}') from private.grcon_allocation_bases where contract_id=c and status='active') is distinct from run.metadata->'versions' then raise exception 'As bases mudaram. Reanalise.';end if;
  if coalesce(run.metadata->>'contextWarning','')<>'' then raise exception 'Fontes indisponíveis. Correção automática bloqueada.';end if;
  items:='[]';
  for item in select payload from private.grcon_allocation_audit_rows where run_id=run.id order by row_number loop
   for rule in select * from (select distinct on(id) * from private.grcon_allocation_learned_rules where contract_id=c order by id,version desc) latest where state='active' loop
    if not private.grcon_allocation_rule_matches(item,rule.payload,run.metadata) then continue;end if;
    if exists(select 1 from private.grcon_allocation_audit_events where run_id=run.id and payload->>'lineage'=item->>'lineage' and payload->>'field'=rule.payload->>'field') then continue;end if;
    if rule.payload->>'field'='databook' and not exists(select 1 from private.grcon_allocation_base_rows br join private.grcon_allocation_bases b on b.id=br.base_id where b.contract_id=c and b.kind='databook' and b.status='active' and br.payload->>'databook'=rule.payload->>'after') then continue;end if;
    ev:=jsonb_build_object('document',item->>'document','revision',item->>'revision','lineage',item->>'lineage','field',rule.payload->>'field','before',rule.payload->>'before','after',rule.payload->>'after','evidence',rule.payload->'evidence','justification',rule.payload->>'instruction','decision','accepted','state','Correção proposta','humanReview',false,'serverAuthorized',true,'ruleId',rule.id,'ruleVersion',rule.version,'actor',u,'at',now());
    rid:=gen_random_uuid();insert into private.grcon_allocation_audit_events(run_id,request_id,payload,created_by) values(run.id,rid,ev-'actor'-'at',u);
    items:=items||jsonb_build_array(ev||jsonb_build_object('requestId',rid));
    if jsonb_array_length(items)>=1000 then raise exception 'Limite de correções por execução excedido.';end if;
   end loop;
  end loop;
  return jsonb_build_object('events',items);
 elsif operation='rules' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (select distinct on(id) * from private.grcon_allocation_learned_rules where contract_id=c order by id,version desc) q;
  return jsonb_build_object('rules',items);
 elsif operation='rule-history' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.version),'[]') into items from (select * from private.grcon_allocation_learned_rules where contract_id=c and id=(input->>'id')::uuid order by version) q;
  return jsonb_build_object('versions',items);
 elsif operation in ('candidate','rule-validate','rule-state','rule-restore') then
  perform private.grcon_require_master_owner();
  if operation='candidate' then
   select * into run from private.grcon_allocation_audit_runs where id=(input->>'runId')::uuid and contract_id=c and completed_at is not null;
   if not found then raise exception 'Análise concluída obrigatória.';end if;
   select payload into item from private.grcon_allocation_audit_rows where run_id=run.id and payload->>'lineage'=input->>'lineage';
   select value into rec from jsonb_array_elements(item->'recommendations') where value->>'field'=input->>'field' limit 1;
   if (select count(*) from jsonb_array_elements(item->'recommendations') p where p->>'field'=input->>'field')<>1 then raise exception 'Proposta ambígua.';end if;
   if rec is null or rec->>'field' not in ('workflow','databook','N1','N2','N3','N4','N5','N6') or length(btrim(coalesce(input->>'instruction','')))<5 then raise exception 'Proposta determinística e orientação obrigatórias.';end if;
   body:=jsonb_build_object('contract',c,'document',item->>'document','revision',item->>'revision','discipline',item->>'discipline','sourceHash',item->>'sourceHash','ldHash',run.metadata->'ldHashes'->>(item->'origin'->>'file'),'versions',item->'versions','field',rec->>'field','before',rec->>'before','after',rec->>'after','evidence',rec->'evidence','instruction',left(input->>'instruction',2000),'sourceRun',run.id);
   rid:=gen_random_uuid();insert into private.grcon_allocation_learned_rules values(rid,1,c,'candidate',body,'{}',u,now());
   return jsonb_build_object('id',rid);
  end if;
  -- Serialize state changes per rule; append-only versions, optimistic lease.
  perform pg_advisory_xact_lock(hashtext(input->>'id'));
  select * into rule from private.grcon_allocation_learned_rules where id=(input->>'id')::uuid and contract_id=c order by version desc limit 1;
  if not found or rule.version is distinct from (input->>'version')::integer then raise exception 'Versão da regra mudou.';end if;
  if operation='rule-restore' then
   select payload into body from private.grcon_allocation_learned_rules where id=rule.id and contract_id=c and version=(input->>'restoreVersion')::integer;
   if body is null then raise exception 'Versão histórica indisponível.';end if;
   insert into private.grcon_allocation_learned_rules values(rule.id,rule.version+1,c,'candidate',body,'{}',u,now());
   return jsonb_build_object('ok',true);
  elsif operation='rule-validate' then
   if jsonb_typeof(input->'tests') is distinct from 'array' or jsonb_array_length(input->'tests') not between 2 and 100 then raise exception 'Informe casos positivos e negativos separados.';end if;
   if (select count(distinct (t->>'runId',t->>'rowNumber')) from jsonb_array_elements(input->'tests') t)<>jsonb_array_length(input->'tests') then raise exception 'Casos de teste repetidos.';end if;
   for test in select value from jsonb_array_elements(input->'tests') loop
    if jsonb_typeof(test->'expected') is distinct from 'boolean' then raise exception 'Rótulo de teste obrigatório.';end if;
    select ar.payload,rr.metadata into testrow,testmeta from private.grcon_allocation_audit_rows ar join private.grcon_allocation_audit_runs rr on rr.id=ar.run_id where ar.run_id=(test->>'runId')::uuid and ar.row_number=(test->>'rowNumber')::integer and rr.contract_id=c and rr.completed_at is not null;
    if not found then raise exception 'Caso histórico indisponível.';end if;
    matched:=private.grcon_allocation_rule_matches(testrow,rule.payload,testmeta);
    if (test->>'expected')::boolean then positives:=positives+1;else negatives:=negatives+1;end if;
    if matched is distinct from (test->>'expected')::boolean then failures:=failures+1;end if;
   end loop;
   body:=jsonb_build_object('positives',positives,'negatives',negatives,'failures',failures,'tests',input->'tests','passed',positives>0 and negatives>0 and failures=0,'technicalOnly',true);
   insert into private.grcon_allocation_learned_rules values(rule.id,rule.version+1,c,'validating',rule.payload,body,u,now());
  else
   if input->>'state' not in ('active','suspended','revoked','candidate') then raise exception 'Estado inválido.';end if;
   if input->>'state'='active' and length(btrim(coalesce(input->>'homologation','')))<10 then raise exception 'Referência de homologação obrigatória.';end if;
   if input->>'state'='active' and (rule.validation->>'passed' is distinct from 'true' or rule.state='revoked') then raise exception 'Validação positiva e negativa obrigatória; revogação é definitiva.';end if;
   if input->>'state'='active' and exists(select 1 from (select distinct on(id) * from private.grcon_allocation_learned_rules where contract_id=c order by id,version desc) x where x.id<>rule.id and x.state='active' and x.payload->>'document'=rule.payload->>'document' and x.payload->>'revision'=rule.payload->>'revision' and x.payload->>'field'=rule.payload->>'field' and x.payload->>'sourceHash'=rule.payload->>'sourceHash' and x.payload->>'after'<>rule.payload->>'after') then raise exception 'Conflito com regra ativa.';end if;
   insert into private.grcon_allocation_learned_rules values(rule.id,rule.version+1,c,input->>'state',rule.payload,rule.validation||case when input->>'state'='active' then jsonb_build_object('homologation',left(input->>'homologation',1000)) else '{}'::jsonb end,u,now());
  end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operação não reconhecida.';
end $$;
revoke all on function private.grcon_allocation_assistant(uuid,text,jsonb) from public,anon;
grant execute on function private.grcon_allocation_assistant(uuid,text,jsonb) to authenticated;
create function public.grcon_allocation_assistant(target_workspace uuid,operation text,input jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.grcon_allocation_assistant(target_workspace,operation,input)$$;
revoke all on function public.grcon_allocation_assistant(uuid,text,jsonb) from public,anon;
grant execute on function public.grcon_allocation_assistant(uuid,text,jsonb) to authenticated;

-- Preserve the existing implementation and its access checks while extending its field allowlist.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('private.grcon_allocation_auditor(uuid,text,jsonb)'::regprocedure) into definition;
 if position($old$('','title','databook','tag','eap','discipline')$old$ in definition)=0 then raise exception 'Allowlist original inesperada; revisar migration antes de aplicar.';end if;
 definition:=replace(definition,$old$('','title','databook','tag','eap','discipline')$old$,$new$('','title','databook','tag','eap','discipline','workflow','N1','N2','N3','N4','N5','N6')$new$);
 definition:=replace(definition,$old$('databook','tag','eap','discipline')$old$,$new$('databook','tag','eap','discipline','workflow','N1','N2','N3','N4','N5','N6')$new$);
 execute definition;
end $migration$;
