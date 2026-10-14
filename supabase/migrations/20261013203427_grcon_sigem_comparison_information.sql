-- Comparison metadata changes are descriptive; they never imply posting or approval.
create or replace function private.grcon_sigem_comparison_rows(target_workspace uuid,target_comparison uuid)
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
      coalesce(ch.change_type,case when p.document_key is not null and n.document_key is not null and (p.title is distinct from n.title or p.discipline is distinct from n.discipline or p.status_original is distinct from n.status_original) then 'MUDANCA_DE_INFORMACOES' else 'SEM_ALTERACAO' end),private.grcon_monitor_matches(target_workspace,coalesce(n.document_key,p.document_key),coalesce(n.rev,p.rev))
    from p full join n using(document_key,revision_key)
    left join private.grcon_sigem_status_changes ch on ch.comparison_id=c.id and ch.document_key=coalesce(n.document_key,p.document_key) and private.grcon_revision_key(ch.revision)=coalesce(n.revision_key,p.revision_key)
    order by coalesce(n.code,p.code),coalesce(n.revision_key,p.revision_key);
end $$;
