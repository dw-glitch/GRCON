begin;
alter table private.grcon_document_tasks
 add column if not exists deadline_version integer not null default 1,
 add column if not exists created_by uuid,
 add column if not exists assignee_id uuid,
 add column if not exists revision_sent text not null default '',
 add column if not exists grdt_title text not null default '';
-- Legacy organizations retain their last recorded author; no existing content is removed.
update private.grcon_document_tasks set created_by=coalesce((select a.actor_id from public.grcon_audit_events a where a.contract_id=grcon_document_tasks.contract_id and a.entity_id=grcon_document_tasks.document_key and a.action='document_task_saved' order by a.created_at,a.id limit 1),updated_by) where created_by is null;
alter table private.grcon_document_tasks alter column created_by set not null;
alter table public.grcon_notifications add column if not exists recipient_id uuid;
create index if not exists grcon_document_tasks_due_idx on private.grcon_document_tasks(due_date) where due_date is not null;
create index if not exists grcon_notifications_recipient_idx on public.grcon_notifications(recipient_id,created_at desc) where recipient_id is not null;
create or replace function private.grcon_document_tasks(target_workspace uuid,operation text,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; member_role text; k text; d text; previous private.grcon_document_tasks; saved private.grcon_document_tasks; result jsonb; assignee uuid; author uuid; sent jsonb;
begin
 if auth.uid() is null then raise exception 'Sessão necessária.' using errcode='42501'; end if;
 select m.contract_id,m.role into c,member_role from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>12000 then raise exception 'Dados inválidos.'; end if;
 if operation='users' then
  return (select coalesce(jsonb_agg(to_jsonb(u) order by u.name,u.id),'[]') from
    (select p.id,coalesce(nullif(p.display_name,''),split_part(p.email,'@',1),'Usuário') as name
     from public.grcon_profiles p where exists(select 1 from public.grcon_memberships m where m.user_id=p.id and m.active)) u);
 end if;
 if operation='get' then
  select * into saved from private.grcon_document_tasks t where t.contract_id=(input->>'contractId')::uuid
   and t.document_key=private.grcon_master_document_key(input->>'document')
   and (t.created_by=auth.uid() or t.assignee_id=auth.uid() or (t.workspace_id=target_workspace and t.contract_id=c));
  if not found then raise exception 'Gerenciamento não encontrado ou sem acesso.' using errcode='42501'; end if;
  return to_jsonb(saved);
 end if;
 if operation='list' then
  select coalesce(jsonb_agg(to_jsonb(t) order by document_key),'[]') into result from
   (select * from private.grcon_document_tasks where workspace_id=target_workspace and contract_id=c and document_key>coalesce(input->>'after','') order by document_key limit 1000)t;
  return result;
 end if;
 if operation<>'save' then raise exception 'Operação desconhecida.'; end if;
 if member_role not in('owner','admin','operator') then raise exception 'Sem permissão para organizar pendências.' using errcode='42501'; end if;
 d:=btrim(coalesce(input->>'document','')); k:=private.grcon_master_document_key(d);
 if length(d) not between 1 and 255 then raise exception 'Documento inválido.'; end if;
 if coalesce(input->>'priority','normal') not in('normal','alta','urgente') then raise exception 'Prioridade inválida.'; end if;
 -- The contract lock also serializes first creation, without a missing-row race.
 perform 1 from public.grcon_contracts where id=c for update;
 select * into previous from private.grcon_document_tasks where contract_id=c and document_key=k;
 if previous.created_by is not null and previous.created_by<>auth.uid() then raise exception 'Somente quem criou o prazo pode alterar este gerenciamento.' using errcode='42501'; end if;
 if coalesce(previous.version,0)<>coalesce((input->>'expectedVersion')::integer,0) then raise exception 'Outro usuário alterou esta organização. Atualize antes de salvar.' using errcode='40001'; end if;
 assignee:=nullif(input->>'assigneeId','')::uuid;
 if assignee is not null and not exists(select 1 from public.grcon_memberships where user_id=assignee and active) then raise exception 'Selecione um usuário ativo do GRCON.'; end if;
 if nullif(input->>'dueDate','') is not null and assignee is null then raise exception 'Selecione o responsável pelo prazo.'; end if;
 select f into sent from public.grcon_history h cross join lateral jsonb_array_elements(coalesce(h.payload->'files','[]')) f
 where h.workspace_id=target_workspace and h.contract_id=c and h.deleted_at is null and private.grcon_master_document_key(f->>'document')=k
 order by h.generated_at desc,h.id desc limit 1;
 insert into private.grcon_document_tasks(workspace_id,contract_id,document_key,document_code,priority,responsible,due_date,note,version,updated_by,created_by,assignee_id,revision_sent,grdt_title)
 values(target_workspace,c,k,d,coalesce(input->>'priority','normal'),
 coalesce((select coalesce(nullif(display_name,''),split_part(email,'@',1)) from public.grcon_profiles where id=assignee),previous.responsible,''),
 nullif(input->>'dueDate','')::date,coalesce(input->>'note',''),coalesce(previous.version,0)+1,auth.uid(),coalesce(previous.created_by,auth.uid()),assignee,
 private.grcon_revision_key(coalesce(nullif(sent->>'grdtRevision',''),sent->>'revision',input->>'revisionSent',previous.revision_sent,'')),coalesce(sent->>'title',input->>'grdtTitle',previous.grdt_title,''))
 on conflict(contract_id,document_key) do update set priority=excluded.priority,responsible=excluded.responsible,due_date=excluded.due_date,note=excluded.note,version=excluded.version,updated_by=excluded.updated_by,updated_at=now(),deadline_version=case when grcon_document_tasks.due_date is distinct from excluded.due_date or grcon_document_tasks.revision_sent is distinct from excluded.revision_sent then grcon_document_tasks.deadline_version+1 else grcon_document_tasks.deadline_version end,assignee_id=excluded.assignee_id,revision_sent=excluded.revision_sent,grdt_title=excluded.grdt_title returning * into saved;
 if assignee is not null and (previous.assignee_id is distinct from assignee or previous.due_date is distinct from saved.due_date or previous.priority is distinct from saved.priority) then
  insert into public.grcon_notifications(workspace_id,contract_id,event_key,kind,severity,title,message,document_code,document_key,link_target,created_by,recipient_id)
  values(target_workspace,c,'document-task-assigned:'||c||':'||k||':'||saved.version,'DOCUMENT_TASK_ASSIGNED',case when saved.priority='urgente' then 'high' else 'info' end,
   'Documento atribuído a você',d||' · Prioridade: '||saved.priority||' · Prazo: '||coalesce(to_char(saved.due_date,'DD/MM/YYYY'),'não definido')||' (horário de Brasília).',d,k,'document-task:'||c||':'||d,auth.uid(),assignee) on conflict(event_key) do nothing;
 end if;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,c,auth.uid(),'document_task_saved','document_task',k,jsonb_build_object('document_code',d,'version',saved.version,'priority',saved.priority));
 return to_jsonb(saved);
end $$;
create or replace function private.grcon_notifications_list(target_workspace uuid,only_unread boolean default false,limit_count integer default 100)
returns table(
  id uuid,kind text,severity text,title text,message text,document_code text,previous_status text,current_status text,
  comparison_id uuid,change_id uuid,link_target text,created_at timestamptz,is_read boolean
)
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  return query
    select n.id,n.kind,n.severity,n.title,n.message,n.document_code,n.previous_status,n.current_status,
           n.comparison_id,n.change_id,n.link_target,n.created_at,(r.notification_id is not null)
    from public.grcon_notifications n
    left join public.grcon_notification_reads r on r.notification_id=n.id and r.user_id=auth.uid()
    where ((n.workspace_id=target_workspace and n.recipient_id is null) or n.recipient_id=auth.uid()) and (not coalesce(only_unread,false) or r.notification_id is null)
    order by n.created_at desc
    limit least(greatest(coalesce(limit_count,100),1),500);
end $$;

create or replace function public.grcon_notifications_list(target_workspace uuid,only_unread boolean default false,limit_count integer default 100)
returns table(
  id uuid,kind text,severity text,title text,message text,document_code text,previous_status text,current_status text,
  comparison_id uuid,change_id uuid,link_target text,created_at timestamptz,is_read boolean
)
language sql security invoker set search_path=public,private,pg_temp
as $$ select * from private.grcon_notifications_list(target_workspace,only_unread,limit_count); $$;
revoke all on function public.grcon_notifications_list(uuid,boolean,integer) from public,anon;
grant execute on function public.grcon_notifications_list(uuid,boolean,integer) to authenticated;

create or replace function private.grcon_notifications_mark_read(target_workspace uuid,target_ids uuid[] default null)
returns integer
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare changed integer;
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  insert into public.grcon_notification_reads(notification_id,user_id,read_at)
  select n.id,auth.uid(),now()
  from public.grcon_notifications n
  where ((n.workspace_id=target_workspace and n.recipient_id is null) or n.recipient_id=auth.uid()) and (target_ids is null or n.id=any(target_ids))
  on conflict(notification_id,user_id) do update set read_at=excluded.read_at;
  get diagnostics changed=row_count;
  return changed;
end $$;

create or replace function public.grcon_notifications_mark_read(target_workspace uuid,target_ids uuid[] default null)
returns integer language sql security invoker set search_path=public,private,pg_temp
as $$ select private.grcon_notifications_mark_read(target_workspace,target_ids); $$;
revoke all on function public.grcon_notifications_mark_read(uuid,uuid[]) from public,anon;
grant execute on function public.grcon_notifications_mark_read(uuid,uuid[]) to authenticated;
create or replace function private.grcon_notifications_unread_count(target_workspace uuid)
returns integer language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
 if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 return (select count(*)::integer from public.grcon_notifications n where ((n.workspace_id=target_workspace and n.recipient_id is null) or n.recipient_id=auth.uid())
   and not exists(select 1 from public.grcon_notification_reads r where r.notification_id=n.id and r.user_id=auth.uid()));
end $$;
create or replace function public.grcon_notifications_unread_count(target_workspace uuid)
returns integer language sql security invoker set search_path=public,private,pg_temp as $$ select private.grcon_notifications_unread_count(target_workspace); $$;
revoke all on function private.grcon_notifications_unread_count(uuid) from public,anon;
revoke all on function public.grcon_notifications_unread_count(uuid) from public,anon;
grant execute on function private.grcon_notifications_unread_count(uuid), public.grcon_notifications_unread_count(uuid) to authenticated;

drop policy if exists grcon_notifications_select on public.grcon_notifications;
create policy grcon_notifications_select on public.grcon_notifications for select to authenticated using(
 (recipient_id is null and private.grcon_is_member(workspace_id)) or
 (recipient_id=auth.uid() and exists(select 1 from public.grcon_memberships m where m.user_id=auth.uid() and m.active)));

drop policy if exists grcon_notification_reads_select on public.grcon_notification_reads;
create policy grcon_notification_reads_select on public.grcon_notification_reads for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.grcon_notifications n where n.id=notification_id));
drop policy if exists grcon_notification_reads_insert on public.grcon_notification_reads;
create policy grcon_notification_reads_insert on public.grcon_notification_reads for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.grcon_notifications n where n.id=notification_id));

-- Called only by the existing trusted server schedule, including when users are offline.
create or replace function private.grcon_document_task_deadlines() returns integer
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Serviço necessário.' using errcode='42501'; end if;
 insert into public.grcon_notifications(workspace_id,contract_id,event_key,kind,severity,title,message,document_code,document_key,link_target,created_by,recipient_id)
 select t.workspace_id,t.contract_id,'document-task-overdue:'||t.contract_id||':'||t.document_key||':'||t.deadline_version,'DOCUMENT_TASK_OVERDUE','high',
 'Prazo de postagem vencido',t.document_code||' · Responsável: '||t.responsible||' · Prioridade: '||t.priority||' · Prazo: '||to_char(t.due_date,'DD/MM/YYYY')||'. A postagem da revisão '||coalesce(nullif(t.revision_sent,''),'não informada')||' ainda não foi confirmada no SIGEM.',
 t.document_code,t.document_key,'document-task:'||t.contract_id||':'||t.document_code,t.created_by,t.created_by
 from private.grcon_document_tasks t join public.grcon_contracts ct on ct.id=t.contract_id and ct.workspace_id=t.workspace_id and ct.active
 where t.due_date < (now() at time zone 'America/Sao_Paulo')::date
 and not exists(select 1 from public.grcon_notifications n where n.event_key='document-task-overdue:'||t.contract_id||':'||t.document_key||':'||t.deadline_version)
 and exists(select 1 from public.grcon_memberships m where m.user_id=t.created_by and m.active)
 and not exists(select 1 from private.grcon_sigem_query_snapshots s join private.grcon_sigem_query_rows r on r.snapshot_id=s.id
  where s.workspace_id=t.workspace_id and s.contract_id=t.contract_id and s.status in('active','archived') and s.deleted_at is null
   and private.grcon_master_document_key(r.payload->>'document')=t.document_key and r.revision_key=t.revision_sent and t.revision_sent<>'' and r.status_normalized='EM_ANALISE'
   and not exists(select 1 from private.grcon_sigem_query_rows conflict where conflict.snapshot_id=s.id and conflict.document_key=r.document_key and conflict.revision_key=r.revision_key and conflict.status_normalized<>'EM_ANALISE'))
 on conflict(event_key) do nothing;
 get diagnostics changed=row_count;return changed;
end $$;
create or replace function public.grcon_document_task_deadlines() returns integer language sql security invoker set search_path='' as $$select private.grcon_document_task_deadlines();$$;
revoke all on function private.grcon_document_task_deadlines(),public.grcon_document_task_deadlines() from public,anon,authenticated;
grant execute on function private.grcon_document_task_deadlines(),public.grcon_document_task_deadlines() to service_role;
commit;
