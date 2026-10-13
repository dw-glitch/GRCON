-- Revision alerts open the exact historical revision, even after a newer revision exists.
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
      case when exists(select 1 from private.grcon_monitor_targets t join private.grcon_monitor_target_members m on m.target_id=t.id where t.workspace_id=target_workspace and t.kind='revision' and t.active and m.document_key=ch.document_key and m.revision_key=private.grcon_revision_key(ch.revision)) then 'sigem-central-revision:'||ch.document_code||'|'||ch.revision else 'conference-status-monitor' end,auth.uid()
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
