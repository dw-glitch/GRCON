begin;
create or replace function private.grcon_document_vault_lookup(target_workspace uuid,actor_id uuid,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; active_snapshot uuid; results jsonb;
begin
 select m.contract_id into c from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 500 then raise exception 'Consulta em lote inválida.'; end if;
 if exists(select 1 from jsonb_array_elements(input->'items') item where jsonb_typeof(item) is distinct from 'object' or length(btrim(coalesce(item->>'documentCode',''))) not between 1 and 255 or length(coalesce(item->>'revision',''))>40) then raise exception 'Código ou revisão inválido.'; end if;
 select id into active_snapshot from private.grcon_planned_document_snapshots where workspace_id=target_workspace and contract_id=c and status='active' order by published_at desc nulls last,created_at desc limit 1;
 with wanted as (
  select n,item,regexp_replace(upper(regexp_replace(btrim(item->>'documentCode'),'\s+','','g')),'^NT-','') as code,
   upper(btrim(coalesce(item->>'revision',''))) as revision
  from jsonb_array_elements(input->'items') with ordinality t(item,n)
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'requestId',left(coalesce(w.item->>'requestId',''),64),'input',left(coalesce(w.item->>'input',''),512),
  'documentCode',upper(regexp_replace(btrim(w.item->>'documentCode'),'\s+','','g')),'requestedRevision',w.revision,
  'matches',matched.files) order by w.n),'[]') into results
 from wanted w cross join lateral (
  select coalesce(jsonb_agg(to_jsonb(q) order by q.revision,q.sequence),'[]') as files from (
   select d.id,d.sequence,d.file_name,d.document_code,d.identity_code,d.revision,d.format,d.size_bytes,d.sha256,d.created_at,d.verified_at,
    exists(select 1 from private.grcon_planned_document_items p where p.snapshot_id=active_snapshot and p.document_key in (d.identity_code,d.document_code)) as allocated
   from private.grcon_document_files d where d.workspace_id=target_workspace and d.contract_id=c and d.status='ready'
   and d.identity_code=w.code and (w.revision='' or d.revision=w.revision)
  ) q
 ) matched;
 return jsonb_build_object('results',results,'contract_id',c,'allocation_snapshot',active_snapshot);
end $$;
revoke all on function private.grcon_document_vault_lookup(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_document_vault_lookup(uuid,uuid,jsonb) to service_role;
commit;
