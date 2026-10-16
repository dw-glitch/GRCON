-- A replay after a network interruption must never import into an already published snapshot.
begin;
create or replace function private.grcon_operations_service(operation text,actor_id uuid default null,target_workspace uuid default null,input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.grcon_background_jobs; master boolean:=false; fresh boolean:=false; v uuid; role_name text;
begin
 -- Only the service wrapper can call this function. Actor IDs always come from Auth.getUser in the Worker.
 if operation='metric' then
  if input->>'route' not in ('vault','teams','jobs','other') then raise exception 'Invalid route'; end if;
  insert into private.grcon_operational_metrics(minute,route,requests,errors,duration_ms,max_ms,last_code)
  values(date_trunc('minute',now()),input->>'route',1,case when (input->>'status')::integer>=500 then 1 else 0 end,
   least(600000,greatest(0,(input->>'duration')::integer)),least(600000,greatest(0,(input->>'duration')::integer)),
   case when (input->>'status')::integer>=500 then left(input->>'code',80) else null end)
  on conflict(minute,route) do update set requests=private.grcon_operational_metrics.requests+1,
   errors=private.grcon_operational_metrics.errors+excluded.errors,duration_ms=private.grcon_operational_metrics.duration_ms+excluded.duration_ms,
   max_ms=greatest(private.grcon_operational_metrics.max_ms,excluded.max_ms),last_code=coalesce(excluded.last_code,private.grcon_operational_metrics.last_code);
  return '{}'::jsonb;
 end if;
 if operation='recover' then
  insert into private.grcon_operational_heartbeat(name) values('scheduler') on conflict(name) do update set checked_at=now();
  update private.grcon_background_jobs set status='failed',error_code='UPLOAD_INCOMPLETE',stage='Envio de dados não concluído',updated_at=now()
   where status='uploading' and updated_at<now()-interval '15 minutes';
  delete from private.grcon_operational_metrics where minute<now()-interval '7 days';
  return coalesce((select jsonb_agg(to_jsonb(t)) from (select id,generation,kind,status from private.grcon_background_jobs where (status='queued' and updated_at<now()-interval '1 minute') or (status in ('running','retry_wait') and updated_at<now()-interval '15 minutes') order by created_at limit 20)t),'[]');
 end if;
 if actor_id is not null then
  select exists(select 1 from private.grcon_master_owner g where g.user_id=actor_id and exists(select 1 from public.grcon_memberships m where m.user_id=actor_id and m.active and m.role='owner')) into master;
 end if;
 if operation='technical' then
  if not master then raise exception 'Acesso exclusivo do proprietário master.' using errcode='42501'; end if;
  return jsonb_build_object('metrics',coalesce((select jsonb_agg(to_jsonb(t)) from (
   select route,sum(requests) requests,sum(errors) errors,round(sum(duration_ms)::numeric/nullif(sum(requests),0)) average_ms,max(max_ms) max_ms
   from private.grcon_operational_metrics where minute>now()-interval '24 hours' group by route)t),'[]'),
   'counts',coalesce((select jsonb_object_agg(status,n) from(select status,count(*) n from private.grcon_background_jobs where created_at>now()-interval '7 days' group by status)t),'{}'),
   'jobs',coalesce((select jsonb_agg(to_jsonb(t)) from(select id,workspace_id,kind,title,status,progress,stage,attempts,error_code,created_at,updated_at from private.grcon_background_jobs order by updated_at desc limit 100)t),'[]'),
   'scheduler',(select checked_at from private.grcon_operational_heartbeat where name='scheduler'));
 end if;
 if operation='list' then
  if actor_id is null or not exists(select 1 from public.grcon_memberships m where m.user_id=actor_id and m.workspace_id=target_workspace and m.active) then raise exception 'Sem acesso ao contrato.' using errcode='42501';end if;
  return coalesce((select jsonb_agg(to_jsonb(t)) from(select id,kind,title,status,progress,stage,attempts,error_code,output_name,generation,created_at,updated_at,completed_at from private.grcon_background_jobs where workspace_id=target_workspace and grcon_background_jobs.actor_id=grcon_operations_service.actor_id order by created_at desc limit 100)t),'[]');
 end if;
 if operation='create' then
  select m.role into role_name from public.grcon_memberships m join public.grcon_contracts c on c.workspace_id=m.workspace_id and c.active where m.user_id=actor_id and m.workspace_id=target_workspace and m.active;
  if role_name not in ('owner','admin','operator') or role_name is null then raise exception 'Sem permissão para criar tarefas.' using errcode='42501';end if;
  if input->>'kind'='sigem_import' and role_name<>'owner' then raise exception 'Somente o proprietário pode publicar a base.' using errcode='42501';end if;
  select * into j from private.grcon_background_jobs b where b.workspace_id=target_workspace and b.actor_id=grcon_operations_service.actor_id and b.kind=input->>'kind' and b.request_key=input->>'key';
  if found then
   if j.fingerprint is distinct from input->>'fingerprint' then raise exception 'Identificador já utilizado com outros dados.' using errcode='22023';end if;
   return jsonb_build_object('job',to_jsonb(j),'fresh',false);
  end if;
  if (select count(*) from private.grcon_background_jobs b where b.actor_id=grcon_operations_service.actor_id and b.status in ('uploading','queued','running','retry_wait'))>=10 then raise exception 'Aguarde as tarefas em andamento.' using errcode='22023';end if;
  select id into v from private.grcon_sigem_query_snapshots where workspace_id=target_workspace and status='active';
  insert into private.grcon_background_jobs(workspace_id,actor_id,kind,request_key,fingerprint,title,expected_active)
   values(target_workspace,actor_id,input->>'kind',input->>'key',input->>'fingerprint',left(input->>'title',180),v)
   on conflict on constraint grcon_jobs_request_unique do nothing returning * into j;
  fresh:=found;
  if not fresh then
   select * into j from private.grcon_background_jobs b where b.workspace_id=target_workspace and b.actor_id=grcon_operations_service.actor_id and b.kind=input->>'kind' and b.request_key=input->>'key';
   if j.fingerprint is distinct from input->>'fingerprint' then raise exception 'Identificador já utilizado com outros dados.';end if;
  end if;
  if fresh then update private.grcon_background_jobs set input_key='operations/'||target_workspace||'/'||j.id||'/input.json' where id=j.id returning * into j;end if;
  return jsonb_build_object('job',to_jsonb(j),'fresh',fresh);
 end if;
 select * into j from private.grcon_background_jobs where id=(input->>'id')::uuid for update;
 if j.id is null then raise exception 'Tarefa não encontrada.' using errcode='22023';end if;
 if operation in ('get','ready','retry') then
  if actor_id is null or (j.actor_id<>actor_id and not master) or not exists(select 1 from public.grcon_memberships m where m.user_id=actor_id and m.workspace_id=j.workspace_id and m.active) then raise exception 'Sem acesso à tarefa.' using errcode='42501';end if;
  if operation='ready' and j.status='uploading' then update private.grcon_background_jobs set status='queued',progress=5,stage='Na fila',updated_at=now() where id=j.id;end if;
  if operation='retry' then
   if j.status<>'failed' or j.error_code='UPLOAD_INCOMPLETE' then raise exception 'Esta tarefa não permite repetição automática.';end if;
   update private.grcon_background_jobs set status='queued',generation=generation+1,error_code=null,stage='Na fila',progress=5,updated_at=now(),completed_at=null where id=j.id;
  end if;
 else
  -- Execution rechecks live membership, including before every import chunk or external delivery.
  if not (operation='update' and input->>'status' in ('failed','cancelled','needs_review')) and not exists(select 1 from public.grcon_memberships m join public.grcon_contracts c on c.workspace_id=m.workspace_id and c.active where m.user_id=j.actor_id and m.workspace_id=j.workspace_id and m.active and m.role=any(case when j.kind='sigem_import' then array['owner'] else array['owner','admin','operator'] end)) then raise exception 'Acesso do solicitante revogado.' using errcode='42501';end if;
  if (input->>'generation')::integer is distinct from j.generation then raise exception 'Execução substituída.' using errcode='22023';end if;
  if operation='update' then
   if input->>'status' not in ('running','retry_wait','succeeded','failed','needs_review','cancelled') then raise exception 'Estado inválido';end if;
   if j.status in ('succeeded','needs_review','cancelled') then return to_jsonb(j);end if;
   update private.grcon_background_jobs set status=input->>'status',progress=coalesce((input->>'progress')::integer,progress),stage=left(input->>'stage',160),error_code=left(input->>'errorCode',80),
    attempts=attempts+case when input->>'increment'='true' then 1 else 0 end,
    output_key=case when input->>'output'='true' then 'operations/'||j.workspace_id||'/'||j.id||'/result.xlsx' else output_key end,
    output_name=case when input->>'output'='true' then 'GRCON_Conferencia_'||j.id||'.xlsx' else output_name end,
    updated_at=now(),completed_at=case when input->>'status' in ('succeeded','failed','needs_review','cancelled') then now() else null end where id=j.id;
  elsif operation like 'import_%' and j.kind='sigem_import' then
   perform set_config('request.jwt.claim.sub',j.actor_id::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',j.actor_id,'role','authenticated')::text,true);
   if operation='import_begin' then
    if j.import_snapshot is null then
     v:=private.grcon_sigem_query_begin(j.workspace_id,input->>'fileName',(input->>'count')::integer,coalesce(input->'meta','{}'),j.expected_active);
     update private.grcon_background_jobs set import_snapshot=v where id=j.id;
    end if;
   elsif operation='import_chunk' then
    if j.import_snapshot is null then raise exception 'Importação não iniciada';end if;
    perform private.grcon_sigem_query_chunk(j.workspace_id,j.import_snapshot,(input->>'first')::integer,input->'rows');
   elsif operation='import_publish' then
    if not exists(select 1 from private.grcon_sigem_query_snapshots where id=j.import_snapshot and status in ('active','archived')) then perform private.grcon_sigem_query_publish(j.workspace_id,j.import_snapshot);end if;
    update private.grcon_background_jobs set context=context||jsonb_build_object('published',true),updated_at=now() where id=j.id;
   else raise exception 'Operação inválida';end if;
  elsif operation<>'execute' then raise exception 'Operação inválida';end if;
 end if;
 select * into j from private.grcon_background_jobs where id=j.id;
 return to_jsonb(j);
end $$;

commit;
