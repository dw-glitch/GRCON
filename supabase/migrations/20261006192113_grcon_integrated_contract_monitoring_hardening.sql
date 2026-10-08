-- Integration fixes for Cofre, multi-contract, monitoring and shared templates.

create or replace function private.grcon_run_sigem_comparison(
  target_workspace uuid, previous_snapshot uuid, current_snapshot uuid, is_automatic boolean
) returns uuid
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare
  comp_id uuid;
  contract uuid;
  counts_json jsonb;
begin
  if auth.uid() is null or not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso ao contrato.' using errcode='42501';
  end if;
  select c.id into contract from public.grcon_contracts c where c.workspace_id=target_workspace;
  if contract is null then raise exception 'Contrato do workspace não encontrado.' using errcode='22023'; end if;
  if previous_snapshot is null or current_snapshot is null or previous_snapshot=current_snapshot then
    raise exception 'Selecione duas versões diferentes.' using errcode='22023';
  end if;
  if not exists(select 1 from private.grcon_sigem_query_snapshots s where s.id=previous_snapshot and s.workspace_id=target_workspace and s.status in ('active','archived'))
     or not exists(select 1 from private.grcon_sigem_query_snapshots s where s.id=current_snapshot and s.workspace_id=target_workspace and s.status in ('active','archived')) then
    raise exception 'Versões indisponíveis para este contrato.' using errcode='22023';
  end if;

  if exists (
    select 1 from private.grcon_sigem_query_rows r
    where r.snapshot_id in (previous_snapshot,current_snapshot) and r.document_key<>''
    group by r.snapshot_id,r.document_key,r.revision_key
    having count(distinct r.status_normalized)>1
  ) then
    raise exception 'A Consulta Geral contém status conflitantes para o mesmo documento e revisão. Confira as linhas antes de publicar.' using errcode='22023';
  end if;

  insert into private.grcon_sigem_comparisons(
    workspace_id,contract_id,previous_snapshot_id,current_snapshot_id,automatic,compared_by
  ) values(target_workspace,contract,previous_snapshot,current_snapshot,coalesce(is_automatic,false),auth.uid())
  on conflict(workspace_id,previous_snapshot_id,current_snapshot_id,automatic)
  do update set compared_at=now(),compared_by=auth.uid()
  returning id into comp_id;

  delete from private.grcon_sigem_status_changes where comparison_id=comp_id;

  with previous_rows as (
    select distinct on (r.document_key,r.revision_key)
      r.document_key,r.revision_key,r.payload->>'document' as document_code,
      coalesce(r.payload->>'revision','') as revision,
      r.status_original,r.status_normalized,r.title,r.discipline
    from private.grcon_sigem_query_rows r
    where r.snapshot_id=previous_snapshot and r.document_key<>''
    order by r.document_key,r.revision_key,r.row_number desc
  ), current_rows as (
    select distinct on (r.document_key,r.revision_key)
      r.document_key,r.revision_key,r.payload->>'document' as document_code,
      coalesce(r.payload->>'revision','') as revision,
      r.status_original,r.status_normalized,r.title,r.discipline
    from private.grcon_sigem_query_rows r
    where r.snapshot_id=current_snapshot and r.document_key<>''
    order by r.document_key,r.revision_key,r.row_number desc
  ), joined as (
    select
      coalesce(c.document_key,p.document_key) document_key,
      coalesce(c.revision_key,p.revision_key) revision_key,
      coalesce(c.document_code,p.document_code) document_code,
      coalesce(c.revision,p.revision,'') revision,
      coalesce(c.title,p.title,'') title,
      coalesce(c.discipline,p.discipline,'') discipline,
      p.status_original previous_status,c.status_original current_status,
      p.status_normalized previous_normalized,c.status_normalized current_normalized,
      p.document_key is null is_new,c.document_key is null is_removed
    from previous_rows p
    full outer join current_rows c
      on c.document_key=p.document_key and c.revision_key=p.revision_key
  )
  insert into private.grcon_sigem_status_changes(
    comparison_id,workspace_id,contract_id,document_key,document_code,revision,title,discipline,
    previous_status,current_status,previous_status_normalized,current_status_normalized,change_type,monitored
  )
  select
    comp_id,target_workspace,contract,j.document_key,coalesce(j.document_code,j.document_key),j.revision,j.title,j.discipline,
    j.previous_status,j.current_status,j.previous_normalized,j.current_normalized,
    case
      when j.is_new then 'NOVO_NA_CONSULTA'
      when j.is_removed then 'REMOVIDO_DA_CONSULTA'
      when j.previous_normalized='EM_ANALISE' and j.current_normalized<>'EM_ANALISE' then 'SAIU_DE_ANALISE'
      when j.previous_normalized<>'EM_ANALISE' and j.current_normalized='EM_ANALISE' then 'ENTROU_EM_ANALISE'
      else 'MUDANCA_DE_STATUS'
    end,
    exists(
      select 1 from private.grcon_monitored_documents m
      where m.workspace_id=target_workspace and m.document_key=j.document_key and m.active
    )
  from joined j
  where j.is_new or j.is_removed or j.previous_normalized is distinct from j.current_normalized;

  select jsonb_build_object(
    'documentsCompared',(
      select count(*) from (
        select document_key,revision_key from private.grcon_sigem_query_rows where snapshot_id=current_snapshot
        union
        select document_key,revision_key from private.grcon_sigem_query_rows where snapshot_id=previous_snapshot
      ) q where document_key<>''
    ),
    'changes',(select count(*) from private.grcon_sigem_status_changes where comparison_id=comp_id),
    'statusChanges',(select count(*) from private.grcon_sigem_status_changes where comparison_id=comp_id and change_type in ('ENTROU_EM_ANALISE','SAIU_DE_ANALISE','MUDANCA_DE_STATUS')),
    'enteredAnalysis',(select count(*) from private.grcon_sigem_status_changes where comparison_id=comp_id and change_type='ENTROU_EM_ANALISE'),
    'leftAnalysis',(select count(*) from private.grcon_sigem_status_changes where comparison_id=comp_id and change_type='SAIU_DE_ANALISE'),
    'newDocuments',(select count(*) from private.grcon_sigem_status_changes where comparison_id=comp_id and change_type='NOVO_NA_CONSULTA'),
    'removedDocuments',(select count(*) from private.grcon_sigem_status_changes where comparison_id=comp_id and change_type='REMOVIDO_DA_CONSULTA'),
    'monitoredChanged',(select count(*) from private.grcon_sigem_status_changes where comparison_id=comp_id and monitored)
  ) into counts_json;

  update private.grcon_sigem_comparisons set counts=counts_json where id=comp_id;

  if coalesce(is_automatic,false) then
    insert into public.grcon_notifications(
      workspace_id,contract_id,event_key,kind,severity,title,message,document_key,document_code,
      previous_status,current_status,comparison_id,change_id,link_target,created_by
    )
    select
      target_workspace,contract,
      md5(contract::text||'|'||ch.document_key||'|'||ch.revision||'|'||previous_snapshot::text||'|'||current_snapshot::text||'|'||
          coalesce(ch.previous_status,'')||'|'||coalesce(ch.current_status,'')),
      case
        when ch.change_type='SAIU_DE_ANALISE' then 'MONITORED_LEFT_ANALYSIS'
        when ch.change_type='ENTROU_EM_ANALISE' then 'MONITORED_ENTERED_ANALYSIS'
        else 'MONITORED_STATUS_CHANGED'
      end,
      case when ch.change_type='SAIU_DE_ANALISE' then 'high' else 'info' end,
      case
        when ch.change_type='SAIU_DE_ANALISE' then 'Documento prioritário saiu de análise'
        when ch.change_type='ENTROU_EM_ANALISE' then 'Documento prioritário em análise'
        else 'Documento prioritário mudou de status'
      end,
      case
        when ch.change_type='SAIU_DE_ANALISE'
          then 'O documento saiu de Em análise/Em workflow e encerrou o fluxo monitorado no GRCON. Isso não implica aprovação final.'
        when ch.change_type='ENTROU_EM_ANALISE'
          then 'O documento encontra-se em análise.'
        when ch.change_type='REMOVIDO_DA_CONSULTA'
          then 'O documento monitorado não foi localizado na Consulta Geral atual.'
        when ch.change_type='NOVO_NA_CONSULTA'
          then 'O documento monitorado passou a constar na Consulta Geral.'
        else 'O documento prioritário mudou de status.'
      end,
      ch.document_key,ch.document_code,ch.previous_status,ch.current_status,comp_id,ch.id,
      'conference-status-monitor',auth.uid()
    from private.grcon_sigem_status_changes ch
    where ch.comparison_id=comp_id and ch.monitored
      and not (
        coalesce(ch.previous_status_normalized,'')='EM_ANALISE'
        and coalesce(ch.current_status_normalized,'')='EM_ANALISE'
      )
    on conflict(event_key) do nothing;
  end if;

  return comp_id;
end $$;

create or replace function private.grcon_sigem_query_chunk(
  target_workspace uuid, upload_id uuid, first_row integer, rows jsonb
) returns integer
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare s private.grcon_sigem_query_snapshots; total integer;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
    raise exception 'Somente o proprietário pode publicar a Consulta Geral compartilhada.' using errcode='42501';
  end if;
  select * into s from private.grcon_sigem_query_snapshots
  where id=upload_id and workspace_id=target_workspace and status='pending' and created_by=auth.uid()
  for update;
  if not found then raise exception 'Envio indisponível.' using errcode='22023'; end if;
  if jsonb_typeof(rows) is distinct from 'array' then raise exception 'Lote inválido.' using errcode='22023'; end if;
  if first_row is null or first_row<1 or jsonb_array_length(rows) not between 1 and 500
     or first_row+jsonb_array_length(rows)-1>s.expected_count or octet_length(rows::text)>4000000 then
    raise exception 'Lote ou contagem inválida.' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(rows) r
    where jsonb_typeof(r) is distinct from 'object'
       or length(btrim(coalesce(r->>'document',''))) not between 1 and 255
       or length(btrim(coalesce(r->>'revision',''))) not between 1 and 16
       or length(coalesce(r->>'status',''))>1024
  ) then raise exception 'Documento, revisão ou status inválido.' using errcode='22023'; end if;

  insert into private.grcon_sigem_query_rows(
    snapshot_id,row_number,payload,document_key,revision_key,status_original,status_normalized,title,discipline
  )
  select upload_id,first_row+n::integer-1,r,
         private.grcon_document_key(r->>'document'),private.grcon_revision_key(r->>'revision'),
         coalesce(r->>'status',''),private.grcon_status_key(r->>'status'),
         coalesce(r->>'title',''),coalesce(r->>'discipline','')
  from jsonb_array_elements(rows) with ordinality as t(r,n)
  on conflict(snapshot_id,row_number) do update set
    payload=excluded.payload,document_key=excluded.document_key,revision_key=excluded.revision_key,
    status_original=excluded.status_original,status_normalized=excluded.status_normalized,
    title=excluded.title,discipline=excluded.discipline;

  select count(*) into total from private.grcon_sigem_query_rows where snapshot_id=upload_id;
  return total;
end $$;

create or replace function private.grcon_sigem_query_publish(target_workspace uuid,upload_id uuid)
returns uuid
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare
  s private.grcon_sigem_query_snapshots;
  active_id uuid;
  total integer;
  next_version integer;
  new_comparison uuid;
  comparison_counts jsonb;
  alert_count integer;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
    raise exception 'Somente o proprietário pode publicar a Consulta Geral compartilhada.' using errcode='42501';
  end if;
  perform 1 from public.grcon_workspaces where id=target_workspace for update;
  select * into s from private.grcon_sigem_query_snapshots
  where id=upload_id and workspace_id=target_workspace and status='pending' and created_by=auth.uid()
  for update;
  if not found then raise exception 'Envio indisponível.' using errcode='22023'; end if;

  select id into active_id from private.grcon_sigem_query_snapshots
  where workspace_id=target_workspace and status='active';
  if active_id is distinct from s.expected_active then
    raise exception 'Outro usuário publicou uma nova Consulta Geral. Recarregue antes de publicar novamente.' using errcode='40001';
  end if;

  select count(*) into total from private.grcon_sigem_query_rows where snapshot_id=upload_id;
  if total<>s.expected_count then
    raise exception 'Carga incompleta: % de % registros.',total,s.expected_count using errcode='22023';
  end if;
  if not exists(select 1 from private.grcon_sigem_query_rows where snapshot_id=upload_id and length(btrim(status_original))>0) then
    raise exception 'Consulta Geral sem status.' using errcode='22023';
  end if;

  if exists (
    select 1 from private.grcon_sigem_query_rows r where r.snapshot_id=upload_id
    group by r.document_key,r.revision_key having count(distinct r.status_normalized)>1
  ) then raise exception 'Status conflitantes para o mesmo documento e revisão.' using errcode='22023'; end if;

  select coalesce(max(version),0)+1 into next_version
  from private.grcon_sigem_query_snapshots
  where workspace_id=target_workspace and status in ('active','archived');

  update private.grcon_sigem_query_snapshots
  set status='archived'
  where workspace_id=target_workspace and status='active';

  update private.grcon_sigem_query_snapshots
  set status='active',record_count=total,published_at=now(),version=next_version,
      fingerprint=coalesce(metadata->>'checksum',''),previous_snapshot_id=active_id
  where id=upload_id;

  if active_id is not null then
    new_comparison=private.grcon_run_sigem_comparison(target_workspace,active_id,upload_id,true);
    select counts into comparison_counts from private.grcon_sigem_comparisons where id=new_comparison;
    select count(*) into alert_count from public.grcon_notifications where comparison_id=new_comparison;
    update private.grcon_sigem_query_snapshots set comparison_id=new_comparison where id=upload_id;
  else
    comparison_counts='{}'::jsonb;
    alert_count=0;
  end if;

  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    target_workspace,auth.uid(),'sigem_query_published','sigem_query',upload_id::text,
    jsonb_build_object(
      'arquivo',s.file_name,'registros',total,'checksum',s.metadata->>'checksum',
      'version',next_version,'previous_snapshot',active_id,'comparison',new_comparison,
      'changes',coalesce(comparison_counts->'changes','0'::jsonb),'alerts',coalesce(alert_count,0)
    )
  );

  delete from private.grcon_sigem_query_snapshots
  where workspace_id=target_workspace and status='pending' and created_at<now()-interval '1 day';

  return upload_id;
end $$;


create or replace function private.grcon_email_template_save(target_workspace uuid,target_scope text,input jsonb)
returns uuid
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare
  contract uuid;
  next_version integer;
  result uuid;
  scope_clean text:=lower(btrim(coalesce(target_scope,'contract')));
begin
  if jsonb_typeof(coalesce(input,'{}'::jsonb))<>'object' or octet_length(input::text)>262144 then
    raise exception 'Template inválido.' using errcode='22023';
  end if;
  if scope_clean not in ('global','contract') then raise exception 'Escopo inválido.' using errcode='22023'; end if;
  select c.id into contract from public.grcon_contracts c where c.workspace_id=target_workspace;
  if contract is null or not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso ao contrato.' using errcode='42501';
  end if;
  if scope_clean='global' and not private.grcon_is_global_owner() then
    raise exception 'Somente o proprietário pode alterar o modelo global.' using errcode='42501';
  end if;
  if scope_clean='contract' and not private.grcon_has_role(target_workspace,array['owner','admin']) then
    raise exception 'Somente proprietário ou administrador pode alterar o modelo do contrato.' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('grcon_email_template:'||case when scope_clean='global' then 'global' else contract::text end));

  if scope_clean='global' then
    select coalesce(max(version),0)+1 into next_version
    from private.grcon_email_template_versions where scope='global';
    update private.grcon_email_template_versions set active=false
    where scope='global' and active;
    insert into private.grcon_email_template_versions(scope,version,configuration,active,updated_by)
    values('global',next_version,input,true,auth.uid())
    returning id into result;
  else
    select coalesce(max(version),0)+1 into next_version
    from private.grcon_email_template_versions
    where scope='contract' and contract_id=contract;
    update private.grcon_email_template_versions set active=false
    where scope='contract' and contract_id=contract and active;
    insert into private.grcon_email_template_versions(
      workspace_id,contract_id,scope,version,configuration,active,updated_by
    )
    values(target_workspace,contract,'contract',next_version,input,true,auth.uid())
    returning id into result;
  end if;

  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace,auth.uid(),'email_template_saved','email_template',result::text,
         jsonb_build_object('scope',scope_clean,'version',next_version));
  return result;
end $$;

create or replace function public.grcon_email_template_save(target_workspace uuid,target_scope text,input jsonb)
returns uuid
language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.grcon_email_template_save(target_workspace,target_scope,input); $$;
revoke all on function public.grcon_email_template_save(uuid,text,jsonb) from public,anon;
grant execute on function public.grcon_email_template_save(uuid,text,jsonb) to authenticated;

create or replace function private.grcon_email_template_restore(target_workspace uuid,target_template uuid)
returns uuid
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare
  source_scope text;
  source_workspace uuid;
  source_config jsonb;
begin
  select t.scope,t.workspace_id,t.configuration
  into source_scope,source_workspace,source_config
  from private.grcon_email_template_versions t
  where t.id=target_template;
  if not found then raise exception 'Versão de template não encontrada.' using errcode='22023'; end if;
  if source_scope='contract' and source_workspace<>target_workspace then
    raise exception 'Versão pertence a outro contrato.' using errcode='42501';
  end if;
  return private.grcon_email_template_save(target_workspace,source_scope,source_config);
end $$;

create or replace function public.grcon_email_template_restore(target_workspace uuid,target_template uuid)
returns uuid
language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.grcon_email_template_restore(target_workspace,target_template); $$;
revoke all on function public.grcon_email_template_restore(uuid,uuid) from public,anon;
grant execute on function public.grcon_email_template_restore(uuid,uuid) to authenticated;


-- Public API wrappers invoke these private functions as the authenticated role.
-- Keep internal mutation/trigger helpers unavailable, with authenticated checks
-- inside the narrow entry points. The private schema is never API-exposed.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in (
      'grcon_contract_context','grcon_contract_save','grcon_contract_settings_save',
      'grcon_sigem_versions','grcon_sigem_comparison_history','grcon_sigem_comparison_changes',
      'grcon_sigem_document_status_history','grcon_sigem_compare_versions',
      'grcon_monitored_documents_list','grcon_monitored_document_save','grcon_monitored_document_delete',
      'grcon_notifications_list','grcon_notifications_mark_read',
      'grcon_email_template_get','grcon_email_template_versions','grcon_email_template_save','grcon_email_template_restore'
    ) loop
      execute format('revoke all on function %s from public,anon',r.signature);
      execute format('grant execute on function %s to authenticated',r.signature);
    end loop;
end $$;
revoke all on function private.grcon_run_sigem_comparison(uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function private.grcon_is_global_owner() from public,anon;
grant execute on function private.grcon_is_global_owner() to authenticated;

-- Administrators may not turn a membership into global ownership.
drop policy if exists grcon_memberships_insert_admins on public.grcon_memberships;
create policy grcon_memberships_insert_admins on public.grcon_memberships for insert to authenticated
with check(private.grcon_has_role(workspace_id,array['owner','admin']) and (role<>'owner' or private.grcon_is_global_owner()));
drop policy if exists grcon_memberships_update_admins on public.grcon_memberships;
create policy grcon_memberships_update_admins on public.grcon_memberships for update to authenticated
using(private.grcon_has_role(workspace_id,array['owner','admin']) and (role<>'owner' or private.grcon_is_global_owner()))
with check(private.grcon_has_role(workspace_id,array['owner','admin']) and (role<>'owner' or private.grcon_is_global_owner()));
drop policy if exists grcon_memberships_delete_admins on public.grcon_memberships;
create policy grcon_memberships_delete_admins on public.grcon_memberships for delete to authenticated
using(private.grcon_has_role(workspace_id,array['owner','admin']) and (role<>'owner' or private.grcon_is_global_owner()));

create or replace function private.grcon_notifications_unread_count(target_workspace uuid)
returns integer language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
 if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 return (select count(*)::integer from public.grcon_notifications n where n.workspace_id=target_workspace
   and not exists(select 1 from public.grcon_notification_reads r where r.notification_id=n.id and r.user_id=auth.uid()));
end $$;
create or replace function public.grcon_notifications_unread_count(target_workspace uuid)
returns integer language sql security invoker set search_path=public,private,pg_temp as $$ select private.grcon_notifications_unread_count(target_workspace); $$;
revoke all on function private.grcon_notifications_unread_count(uuid) from public,anon;
revoke all on function public.grcon_notifications_unread_count(uuid) from public,anon;
grant execute on function private.grcon_notifications_unread_count(uuid), public.grcon_notifications_unread_count(uuid) to authenticated;
