-- Extends the existing monitoring engine; no parallel notification channel.
create table private.grcon_monitor_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  contract_id uuid not null references public.grcon_contracts(id) on delete restrict,
  kind text not null check (kind in ('revision','grdt')),
  target_key text not null,
  label text not null,
  history_id uuid references public.grcon_history(id) on delete cascade,
  priority text not null default 'normal' check (priority in ('normal','alta','critica')),
  note text not null default '',
  active boolean not null default true,
  created_by uuid not null, updated_by uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,kind,target_key)
);
create table private.grcon_monitor_target_members (
  target_id uuid not null references private.grcon_monitor_targets(id) on delete cascade,
  document_key text not null, document_code text not null, revision_key text not null,
  primary key(target_id,document_key,revision_key)
);
alter table private.grcon_monitor_targets enable row level security;
alter table private.grcon_monitor_target_members enable row level security;
revoke all on private.grcon_monitor_targets,private.grcon_monitor_target_members from public,anon,authenticated;
create index grcon_monitor_targets_scope_idx on private.grcon_monitor_targets(workspace_id,active,kind);
create index grcon_monitor_members_identity_idx on private.grcon_monitor_target_members(document_key,revision_key,target_id);

create function private.grcon_sync_grdt_monitor_members(target_workspace uuid)
returns void language plpgsql security definer set search_path=private,public,pg_temp as $$
begin
  delete from private.grcon_monitor_target_members m using private.grcon_monitor_targets t
  where m.target_id=t.id and t.workspace_id=target_workspace and t.kind='grdt';
  insert into private.grcon_monitor_target_members(target_id,document_key,document_code,revision_key)
  select distinct on(t.id,private.grcon_document_key(f->>'document'),private.grcon_revision_key(coalesce(nullif(f->>'grdtRevision',''),f->>'revision')))
    t.id,private.grcon_document_key(f->>'document'),btrim(f->>'document'),
    private.grcon_revision_key(coalesce(nullif(f->>'grdtRevision',''),f->>'revision'))
  from private.grcon_monitor_targets t join public.grcon_history h on h.id=t.history_id and h.workspace_id=t.workspace_id and h.deleted_at is null
  cross join lateral jsonb_array_elements(coalesce(h.payload->'files','[]'::jsonb)) f
  where t.workspace_id=target_workspace and t.kind='grdt'
    and nullif(btrim(f->>'document'),'') is not null
    and nullif(private.grcon_revision_key(coalesce(nullif(f->>'grdtRevision',''),f->>'revision')),'') is not null;
  update private.grcon_monitor_targets t set label=h.egrdt_number
  from public.grcon_history h where h.id=t.history_id and t.workspace_id=target_workspace and t.kind='grdt' and t.label is distinct from h.egrdt_number;
end $$;
revoke all on function private.grcon_sync_grdt_monitor_members(uuid) from public,anon,authenticated;

create function private.grcon_monitor_targets_api(target_workspace uuid,operation text,input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=private,public,pg_temp as $$
declare k text; code text; rev text; c uuid; target uuid; h public.grcon_history; result jsonb;
begin
  if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  if operation='list' then
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'kind',t.kind,'label',t.label,'priority',t.priority,'note',t.note,'active',t.active,
      'historyId',t.history_id,'sourceAvailable',t.kind='revision' or (hist.id is not null and hist.deleted_at is null),
      'members',(select coalesce(jsonb_agg(jsonb_build_object('document',m.document_code,'revision',m.revision_key) order by m.document_code,m.revision_key),'[]'::jsonb) from private.grcon_monitor_target_members m where m.target_id=t.id)) order by t.active desc,t.label),'[]'::jsonb)
    into result from private.grcon_monitor_targets t left join public.grcon_history hist on hist.id=t.history_id
    where t.workspace_id=target_workspace;
    return result;
  end if;
  if not private.grcon_has_role(target_workspace,array['owner','admin']) then raise exception 'Somente proprietário ou administrador pode alterar monitoramentos.' using errcode='42501'; end if;
  if operation in ('delete','toggle') then
    select t.id into target from private.grcon_monitor_targets t where t.id=(input->>'id')::uuid and t.workspace_id=target_workspace for update;
    if target is null then raise exception 'Monitoramento indisponível neste contrato.' using errcode='22023'; end if;
    if operation='delete' then delete from private.grcon_monitor_targets where id=target;
    else update private.grcon_monitor_targets set active=coalesce((input->>'active')::boolean,false),updated_at=now(),updated_by=auth.uid() where id=target; end if;
  elsif operation='save' then
    select id into c from public.grcon_contracts where workspace_id=target_workspace;
    if input->>'kind'='revision' then
      code=btrim(coalesce(input->>'documentCode','')); k=private.grcon_document_key(code); rev=private.grcon_revision_key(input->>'revision');
      if k='' or length(code)>255 or coalesce(rev,'')='' or length(rev)>16 then raise exception 'Informe documento e revisão válidos.' using errcode='22023'; end if;
      insert into private.grcon_monitor_targets(workspace_id,contract_id,kind,target_key,label,priority,note,created_by,updated_by)
      values(target_workspace,c,'revision',k||'|'||rev,code||' · Rev. '||rev,
        case when input->>'priority' in ('normal','alta','critica') then input->>'priority' else 'normal' end,left(coalesce(input->>'note',''),2000),auth.uid(),auth.uid())
      on conflict(workspace_id,kind,target_key) do update set active=true,priority=excluded.priority,note=excluded.note,updated_at=now(),updated_by=auth.uid() returning id into target;
      insert into private.grcon_monitor_target_members(target_id,document_key,document_code,revision_key) values(target,k,code,rev)
      on conflict(target_id,document_key,revision_key) do update set document_code=excluded.document_code;
    elsif input->>'kind'='grdt' then
      select * into h from public.grcon_history where workspace_id=target_workspace and deleted_at is null
        and (id::text=input->>'historyId' or client_record_id=input->>'historyId') order by generated_at desc limit 1;
      if h.id is null then raise exception 'GRDT indisponível neste contrato.' using errcode='22023'; end if;
      if jsonb_array_length(coalesce(h.payload->'files','[]'))=0 then raise exception 'A GRDT não possui documentos ativos.' using errcode='22023'; end if;
      insert into private.grcon_monitor_targets(workspace_id,contract_id,kind,target_key,label,history_id,priority,note,created_by,updated_by)
      values(target_workspace,c,'grdt',h.id::text,h.egrdt_number,h.id,
        case when input->>'priority' in ('normal','alta','critica') then input->>'priority' else 'normal' end,left(coalesce(input->>'note',''),2000),auth.uid(),auth.uid())
      on conflict(workspace_id,kind,target_key) do update set active=true,priority=excluded.priority,note=excluded.note,updated_at=now(),updated_by=auth.uid() returning id into target;
      perform private.grcon_sync_grdt_monitor_members(target_workspace);
      if not exists(select 1 from private.grcon_monitor_target_members where target_id=target) then raise exception 'A GRDT não possui documento/revisão identificável.' using errcode='22023'; end if;
    else raise exception 'Tipo de monitoramento inválido.' using errcode='22023'; end if;
  else raise exception 'Operação inválida.' using errcode='22023'; end if;
  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
    values(target_workspace,auth.uid(),'monitor_target_'||operation,'monitor_target',target::text,jsonb_build_object('kind',input->>'kind'));
  return jsonb_build_object('id',target,'ok',true);
end $$;
revoke all on function private.grcon_monitor_targets_api(uuid,text,jsonb) from public,anon;
grant execute on function private.grcon_monitor_targets_api(uuid,text,jsonb) to authenticated;
create function public.grcon_monitor_targets(target_workspace uuid,operation text,input jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=public,private,pg_temp
as $$ select private.grcon_monitor_targets_api(target_workspace,operation,input); $$;
revoke all on function public.grcon_monitor_targets(uuid,text,jsonb) from public,anon;
grant execute on function public.grcon_monitor_targets(uuid,text,jsonb) to authenticated;

create function private.grcon_monitor_matches(w uuid,d text,r text,include_grdt boolean default true)
returns boolean language sql stable set search_path=private,public,pg_temp as $$
  select exists(select 1 from private.grcon_monitored_documents m where m.workspace_id=w and m.document_key=d and m.active)
  or exists(select 1 from private.grcon_monitor_targets t join private.grcon_monitor_target_members m on m.target_id=t.id
    where t.workspace_id=w and t.active and m.document_key=d and m.revision_key=private.grcon_revision_key(r)
      and (include_grdt or t.kind='revision'));
$$;
revoke all on function private.grcon_monitor_matches(uuid,text,text,boolean) from public,anon,authenticated;

create function private.grcon_notify_grdt_targets(w uuid,comparison uuid)
returns void language plpgsql security definer set search_path=private,public,pg_temp as $$
begin
  insert into public.grcon_notifications(workspace_id,contract_id,event_key,kind,severity,title,message,document_code,comparison_id,link_target,created_by)
  select w,t.contract_id,md5('grdt|'||t.id::text||'|'||c.previous_snapshot_id::text||'|'||c.current_snapshot_id::text),
    'MONITORED_GRDT_CHANGED',case t.priority when 'normal' then 'info' else 'high' end,'GRDT monitorada atualizada',
    count(distinct ch.document_key||'|'||ch.revision)::text||' integrante(s) tiveram alteração comprovada na Consulta Geral. Abra a GRDT para conferir as revisões e a situação completa.',
    t.label,c.id,'sigem-central-grdt:'||t.history_id::text,auth.uid()
  from private.grcon_monitor_targets t
  join private.grcon_monitor_target_members m on m.target_id=t.id
  join private.grcon_sigem_status_changes ch on ch.comparison_id=comparison and ch.workspace_id=w and ch.document_key=m.document_key and private.grcon_revision_key(ch.revision)=m.revision_key
  join private.grcon_sigem_comparisons c on c.id=ch.comparison_id and c.automatic
  where t.workspace_id=w and t.kind='grdt' and t.active
  group by t.id,c.id,c.previous_snapshot_id,c.current_snapshot_id
  on conflict(event_key) do nothing;
end $$;
revoke all on function private.grcon_notify_grdt_targets(uuid,uuid) from public,anon,authenticated;

-- Complete projection of a comparison, using the official change classification.
create function private.grcon_sigem_comparison_rows(target_workspace uuid,target_comparison uuid)
returns table(document_code text,revision text,title text,discipline text,previous_status text,current_status text,change_type text,monitored boolean)
language plpgsql security definer set search_path=private,public,pg_temp as $$
declare c private.grcon_sigem_comparisons;
begin
  if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  select * into c from private.grcon_sigem_comparisons where id=target_comparison and workspace_id=target_workspace;
  if c.id is null then raise exception 'Comparação indisponível neste contrato.' using errcode='22023'; end if;
  return query with p as (
    select distinct on(r.document_key,r.revision_key) r.document_key,r.revision_key,r.payload->>'document' code,r.payload->>'revision' rev,r.title,r.discipline,r.status_original
    from private.grcon_sigem_query_rows r where r.snapshot_id=c.previous_snapshot_id order by r.document_key,r.revision_key,r.row_number desc
  ), n as (
    select distinct on(r.document_key,r.revision_key) r.document_key,r.revision_key,r.payload->>'document' code,r.payload->>'revision' rev,r.title,r.discipline,r.status_original
    from private.grcon_sigem_query_rows r where r.snapshot_id=c.current_snapshot_id order by r.document_key,r.revision_key,r.row_number desc
  ) select coalesce(n.code,p.code),coalesce(n.rev,p.rev),coalesce(n.title,p.title,''),coalesce(n.discipline,p.discipline,''),p.status_original,n.status_original,
      coalesce(ch.change_type,'SEM_ALTERACAO'),private.grcon_monitor_matches(target_workspace,coalesce(n.document_key,p.document_key),coalesce(n.rev,p.rev))
    from p full join n using(document_key,revision_key)
    left join private.grcon_sigem_status_changes ch on ch.comparison_id=c.id and ch.document_key=coalesce(n.document_key,p.document_key) and private.grcon_revision_key(ch.revision)=coalesce(n.revision_key,p.revision_key)
    order by coalesce(n.code,p.code),coalesce(n.revision_key,p.revision_key);
end $$;
revoke all on function private.grcon_sigem_comparison_rows(uuid,uuid) from public,anon;
grant execute on function private.grcon_sigem_comparison_rows(uuid,uuid) to authenticated;
create function public.grcon_sigem_comparison_rows(target_workspace uuid,target_comparison uuid)
returns table(document_code text,revision text,title text,discipline text,previous_status text,current_status text,change_type text,monitored boolean)
language sql security invoker set search_path=public,private,pg_temp as $$ select * from private.grcon_sigem_comparison_rows(target_workspace,target_comparison); $$;
revoke all on function public.grcon_sigem_comparison_rows(uuid,uuid) from public,anon;
grant execute on function public.grcon_sigem_comparison_rows(uuid,uuid) to authenticated;

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

  perform private.grcon_sync_grdt_monitor_members(target_workspace);
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
    private.grcon_monitor_matches(target_workspace,j.document_key,j.revision)
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
      case when exists(select 1 from private.grcon_monitor_targets t join private.grcon_monitor_target_members m on m.target_id=t.id where t.workspace_id=target_workspace and t.kind='revision' and t.active and m.document_key=ch.document_key and m.revision_key=private.grcon_revision_key(ch.revision)) then 'sigem-central-document:'||ch.document_code else 'conference-status-monitor' end,auth.uid()
    from private.grcon_sigem_status_changes ch
    where ch.comparison_id=comp_id and ch.monitored and private.grcon_monitor_matches(target_workspace,ch.document_key,ch.revision,false)
      and not (
        coalesce(ch.previous_status_normalized,'')='EM_ANALISE'
        and coalesce(ch.current_status_normalized,'')='EM_ANALISE'
      )
    on conflict(event_key) do nothing;
    perform private.grcon_notify_grdt_targets(target_workspace,comp_id);
  end if;

  return comp_id;
end $$;


revoke all on function private.grcon_run_sigem_comparison(uuid,uuid,uuid,boolean) from public,anon;
