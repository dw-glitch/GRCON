
create or replace function private.grcon_sigem_versions(target_workspace uuid)
returns table(
  snapshot_id uuid,version integer,file_name text,record_count integer,fingerprint text,
  published_at timestamptz,created_at timestamptz,created_by uuid,status text,previous_snapshot_id uuid,comparison_id uuid
)
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  return query
    select s.id,s.version,s.file_name,s.record_count,s.fingerprint,s.published_at,s.created_at,s.created_by,s.status,s.previous_snapshot_id,s.comparison_id
    from private.grcon_sigem_query_snapshots s
    where s.workspace_id=target_workspace and s.status in ('active','archived')
    order by coalesce(s.published_at,s.created_at) desc;
end $$;

create or replace function public.grcon_sigem_versions(target_workspace uuid)
returns table(
  snapshot_id uuid,version integer,file_name text,record_count integer,fingerprint text,
  published_at timestamptz,created_at timestamptz,created_by uuid,status text,previous_snapshot_id uuid,comparison_id uuid
)
language sql security invoker set search_path=public,private,pg_temp
as $$ select * from private.grcon_sigem_versions(target_workspace); $$;
revoke all on function public.grcon_sigem_versions(uuid) from public,anon;
grant execute on function public.grcon_sigem_versions(uuid) to authenticated;

create or replace function private.grcon_sigem_comparison_history(target_workspace uuid)
returns table(
  comparison_id uuid,previous_snapshot_id uuid,current_snapshot_id uuid,automatic boolean,
  compared_at timestamptz,compared_by uuid,counts jsonb,previous_file text,current_file text
)
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  return query
    select c.id,c.previous_snapshot_id,c.current_snapshot_id,c.automatic,c.compared_at,c.compared_by,c.counts,
           p.file_name,n.file_name
    from private.grcon_sigem_comparisons c
    join private.grcon_sigem_query_snapshots p on p.id=c.previous_snapshot_id
    join private.grcon_sigem_query_snapshots n on n.id=c.current_snapshot_id
    where c.workspace_id=target_workspace
    order by c.compared_at desc;
end $$;

create or replace function public.grcon_sigem_comparison_history(target_workspace uuid)
returns table(
  comparison_id uuid,previous_snapshot_id uuid,current_snapshot_id uuid,automatic boolean,
  compared_at timestamptz,compared_by uuid,counts jsonb,previous_file text,current_file text
)
language sql security invoker set search_path=public,private,pg_temp
as $$ select * from private.grcon_sigem_comparison_history(target_workspace); $$;
revoke all on function public.grcon_sigem_comparison_history(uuid) from public,anon;
grant execute on function public.grcon_sigem_comparison_history(uuid) to authenticated;

create or replace function private.grcon_sigem_comparison_changes(target_workspace uuid,target_comparison uuid)
returns table(
  change_id uuid,document_key text,document_code text,revision text,title text,discipline text,
  previous_status text,current_status text,change_type text,monitored boolean,created_at timestamptz
)
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  if not exists(select 1 from private.grcon_sigem_comparisons c where c.id=target_comparison and c.workspace_id=target_workspace) then
    raise exception 'Comparação indisponível.' using errcode='22023';
  end if;
  return query
    select ch.id,ch.document_key,ch.document_code,ch.revision,ch.title,ch.discipline,
           ch.previous_status,ch.current_status,ch.change_type,ch.monitored,ch.created_at
    from private.grcon_sigem_status_changes ch
    where ch.comparison_id=target_comparison and ch.workspace_id=target_workspace
    order by ch.monitored desc,ch.document_key,ch.revision;
end $$;

create or replace function public.grcon_sigem_comparison_changes(target_workspace uuid,target_comparison uuid)
returns table(
  change_id uuid,document_key text,document_code text,revision text,title text,discipline text,
  previous_status text,current_status text,change_type text,monitored boolean,created_at timestamptz
)
language sql security invoker set search_path=public,private,pg_temp
as $$ select * from private.grcon_sigem_comparison_changes(target_workspace,target_comparison); $$;
revoke all on function public.grcon_sigem_comparison_changes(uuid,uuid) from public,anon;
grant execute on function public.grcon_sigem_comparison_changes(uuid,uuid) to authenticated;

create or replace function private.grcon_sigem_document_status_history(target_workspace uuid,target_document text)
returns table(
  compared_at timestamptz,previous_status text,current_status text,change_type text,revision text,comparison_id uuid
)
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare k text:=private.grcon_document_key(target_document);
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  return query
    select c.compared_at,ch.previous_status,ch.current_status,ch.change_type,ch.revision,ch.comparison_id
    from private.grcon_sigem_status_changes ch
    join private.grcon_sigem_comparisons c on c.id=ch.comparison_id
    where ch.workspace_id=target_workspace and ch.document_key=k
    order by c.compared_at desc;
end $$;

create or replace function public.grcon_sigem_document_status_history(target_workspace uuid,target_document text)
returns table(
  compared_at timestamptz,previous_status text,current_status text,change_type text,revision text,comparison_id uuid
)
language sql security invoker set search_path=public,private,pg_temp
as $$ select * from private.grcon_sigem_document_status_history(target_workspace,target_document); $$;
revoke all on function public.grcon_sigem_document_status_history(uuid,text) from public,anon;
grant execute on function public.grcon_sigem_document_status_history(uuid,text) to authenticated;

create or replace function private.grcon_sigem_compare_versions(target_workspace uuid,previous_snapshot uuid,current_snapshot uuid)
returns uuid
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  return private.grcon_run_sigem_comparison(target_workspace,previous_snapshot,current_snapshot,false);
end $$;
create or replace function public.grcon_sigem_compare_versions(target_workspace uuid,previous_snapshot uuid,current_snapshot uuid)
returns uuid language sql security invoker set search_path=public,private,pg_temp
as $$ select private.grcon_sigem_compare_versions(target_workspace,previous_snapshot,current_snapshot); $$;
revoke all on function public.grcon_sigem_compare_versions(uuid,uuid,uuid) from public,anon;
grant execute on function public.grcon_sigem_compare_versions(uuid,uuid,uuid) to authenticated;

create or replace function private.grcon_monitored_documents_list(target_workspace uuid)
returns table(
  id uuid,document_key text,document_code text,description text,note text,priority text,active boolean,
  current_status text,last_status text,last_change timestamptz,last_snapshot timestamptz,title text
)
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  return query
    with current_snapshot as (
      select s.id,s.published_at from private.grcon_sigem_query_snapshots s
      where s.workspace_id=target_workspace and s.status='active' limit 1
    ), current_rows as (
      select distinct on(r.document_key)
        r.document_key,r.status_original,r.title,cs.published_at
      from current_snapshot cs
      join private.grcon_sigem_query_rows r on r.snapshot_id=cs.id
      order by r.document_key,r.row_number desc
    ), last_change as (
      select distinct on(ch.document_key)
        ch.document_key,ch.previous_status,ch.current_status,c.compared_at
      from private.grcon_sigem_status_changes ch
      join private.grcon_sigem_comparisons c on c.id=ch.comparison_id
      where ch.workspace_id=target_workspace
      order by ch.document_key,c.compared_at desc
    )
    select m.id,m.document_key,m.document_code,m.description,m.note,m.priority,m.active,
           cr.status_original,lc.previous_status,lc.compared_at,cr.published_at,cr.title
    from private.grcon_monitored_documents m
    left join current_rows cr on cr.document_key=m.document_key
    left join last_change lc on lc.document_key=m.document_key
    where m.workspace_id=target_workspace
    order by m.active desc,
      case m.priority when 'critica' then 0 when 'alta' then 1 else 2 end,
      m.document_code;
end $$;

create or replace function public.grcon_monitored_documents_list(target_workspace uuid)
returns table(
  id uuid,document_key text,document_code text,description text,note text,priority text,active boolean,
  current_status text,last_status text,last_change timestamptz,last_snapshot timestamptz,title text
)
language sql security invoker set search_path=public,private,pg_temp
as $$ select * from private.grcon_monitored_documents_list(target_workspace); $$;
revoke all on function public.grcon_monitored_documents_list(uuid) from public,anon;
grant execute on function public.grcon_monitored_documents_list(uuid) to authenticated;

create or replace function private.grcon_monitored_document_save(target_workspace uuid,input jsonb)
returns uuid
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare k text; code text; contract uuid; result uuid;
begin
  if not private.grcon_has_role(target_workspace,array['owner','admin']) then
    raise exception 'Somente proprietário ou administrador pode alterar documentos monitorados.' using errcode='42501';
  end if;
  code=btrim(coalesce(input->>'documentCode',''));
  k=private.grcon_document_key(code);
  if k='' or length(code)>255 then raise exception 'Código documental inválido.' using errcode='22023'; end if;
  select c.id into contract from public.grcon_contracts c where c.workspace_id=target_workspace;
  insert into private.grcon_monitored_documents as m(
    workspace_id,contract_id,document_key,document_code,description,note,priority,active,created_by,updated_by
  ) values(
    target_workspace,contract,k,code,
    left(coalesce(input->>'description',''),500),
    left(coalesce(input->>'note',''),2000),
    case when input->>'priority' in ('normal','alta','critica') then input->>'priority' else 'normal' end,
    coalesce((input->>'active')::boolean,true),auth.uid(),auth.uid()
  )
  on conflict(workspace_id,document_key) do update set
    document_code=excluded.document_code,description=excluded.description,note=excluded.note,
    priority=excluded.priority,active=excluded.active,updated_by=auth.uid(),updated_at=now()
  returning id into result;
  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace,auth.uid(),'monitored_document_saved','monitored_document',result::text,jsonb_build_object('document',code));
  return result;
end $$;

create or replace function public.grcon_monitored_document_save(target_workspace uuid,input jsonb)
returns uuid language sql security invoker set search_path=public,private,pg_temp
as $$ select private.grcon_monitored_document_save(target_workspace,input); $$;
revoke all on function public.grcon_monitored_document_save(uuid,jsonb) from public,anon;
grant execute on function public.grcon_monitored_document_save(uuid,jsonb) to authenticated;

create or replace function private.grcon_monitored_document_delete(target_workspace uuid,target_id uuid)
returns boolean
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare removed integer;
begin
  if not private.grcon_has_role(target_workspace,array['owner','admin']) then
    raise exception 'Sem permissão para alterar documentos monitorados.' using errcode='42501';
  end if;
  delete from private.grcon_monitored_documents where id=target_id and workspace_id=target_workspace;
  get diagnostics removed=row_count;
  if removed>0 then
    insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
    values(target_workspace,auth.uid(),'monitored_document_deleted','monitored_document',target_id::text,'{}'::jsonb);
  end if;
  return removed>0;
end $$;

create or replace function public.grcon_monitored_document_delete(target_workspace uuid,target_id uuid)
returns boolean language sql security invoker set search_path=public,private,pg_temp
as $$ select private.grcon_monitored_document_delete(target_workspace,target_id); $$;
revoke all on function public.grcon_monitored_document_delete(uuid,uuid) from public,anon;
grant execute on function public.grcon_monitored_document_delete(uuid,uuid) to authenticated;

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
    where n.workspace_id=target_workspace and (not coalesce(only_unread,false) or r.notification_id is null)
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
  where n.workspace_id=target_workspace and (target_ids is null or n.id=any(target_ids))
  on conflict(notification_id,user_id) do update set read_at=excluded.read_at;
  get diagnostics changed=row_count;
  return changed;
end $$;

create or replace function public.grcon_notifications_mark_read(target_workspace uuid,target_ids uuid[] default null)
returns integer language sql security invoker set search_path=public,private,pg_temp
as $$ select private.grcon_notifications_mark_read(target_workspace,target_ids); $$;
revoke all on function public.grcon_notifications_mark_read(uuid,uuid[]) from public,anon;
grant execute on function public.grcon_notifications_mark_read(uuid,uuid[]) to authenticated;
