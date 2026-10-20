begin;
-- A separate read RPC keeps legacy vault operations compatible.
create index if not exists grcon_master_pw_key_idx on private.grcon_pw_rows(snapshot_id,private.grcon_master_document_key(payload->>'document'));
create or replace function private.grcon_master_query(target_workspace uuid,actor_id uuid,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; code text; source text; requested text; page_rows jsonb; all_rows jsonb; revision text;
 result jsonb := '{}'; pages jsonb := '{}'; sources jsonb := '{}';
 page_offset integer; sigem_id uuid; pw_id uuid; requests_id uuid; base_meta jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente API de servidor.' using errcode='42501'; end if;
 select m.contract_id into c from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>16384 then raise exception 'Consulta inválida.'; end if;
 code:=private.grcon_master_document_key(input->>'code');
 if coalesce(length(code),0) not between 1 and 255 then raise exception 'Informe o código documental.'; end if;
 requested:=coalesce(input->>'source','');
 if requested<>'' and requested not in('vault','sigem','pw','history','requests','monitor','monitorChanges','audit') then raise exception 'Fonte inválida.'; end if;
 page_offset:=coalesce((input->>'after')::integer,0);
 if page_offset not between 0 and 1000000 then raise exception 'Página inválida.'; end if;
 select id,jsonb_build_object('snapshotId',id,'fileName',file_name,'date',coalesce(metadata->>'referenceDate',metadata->>'importedAt'),'available',true) into sigem_id,base_meta from private.grcon_sigem_query_snapshots where workspace_id=target_workspace and contract_id=c and status='active';
 sources:=sources||jsonb_build_object('sigem',coalesce(base_meta,'{"available":false,"reason":"Nenhuma Consulta Geral publicada neste contrato."}'));
 base_meta:=null;
 select id,jsonb_build_object('snapshotId',id,'fileName',file_name,'date',coalesce(metadata->>'referenceDate',metadata->>'importedAt'),'available',true) into pw_id,base_meta from private.grcon_pw_snapshots where workspace_id=target_workspace and contract_id=c and status='active';
 sources:=sources||jsonb_build_object('pw',coalesce(base_meta,'{"available":false,"reason":"Nenhum PW compartilhado publicado neste contrato."}'));
 base_meta:=null;
 select id,jsonb_build_object('snapshotId',id,'fileName',file_name,'date',published_at,'available',true) into requests_id,base_meta from private.grcon_requests_bases where workspace_id=target_workspace and contract_id=c and status='active';
 sources:=sources||jsonb_build_object('requests',coalesce(base_meta,'{"available":false,"reason":"Nenhuma base de Solicitações publicada neste contrato."}'));
 foreach source in array array['vault','sigem','pw','history','requests','monitor','monitorChanges','audit'] loop
  if requested<>'' and source<>requested then continue; end if;
  -- A revision of the complete document-specific result prevents offset drift.
  -- A concurrent import or historical insertion asks the reader to refresh.
  if source='vault' then
   select coalesce(jsonb_agg(item),'[]') into all_rows from (select to_jsonb(d) item from private.grcon_document_files d where d.workspace_id=target_workspace and d.contract_id=c and private.grcon_master_document_key(d.identity_code)=code and d.status='ready' order by d.file_version desc,d.id) rows;
  elsif source='sigem' then
   select coalesce(jsonb_agg(item),'[]') into all_rows from (select r.payload item from private.grcon_sigem_query_rows r where r.snapshot_id=sigem_id and private.grcon_master_document_key(r.payload->>'document')=code order by r.row_number) rows;
  elsif source='pw' then
   select coalesce(jsonb_agg(item),'[]') into all_rows from (select r.payload item from private.grcon_pw_rows r where r.snapshot_id=pw_id and private.grcon_master_document_key(r.payload->>'document')=code order by r.row_number) rows;
  elsif source='requests' then
   select coalesce(jsonb_agg(item),'[]') into all_rows from (select r.payload item from private.grcon_requests_rows r where r.base_id=requests_id and private.grcon_master_document_key(r.payload->>'document')=code order by r.row_number) rows;
  elsif source='history' then
   select coalesce(jsonb_agg(item),'[]') into all_rows from (select jsonb_build_object('id',h.id,'egrdt_number',h.egrdt_number,'generated_at',h.generated_at,'file',e.value) item from public.grcon_history h cross join lateral jsonb_array_elements(case when jsonb_typeof(h.payload->'files')='array' then h.payload->'files' else '[]'::jsonb end) with ordinality e(value,n) where h.workspace_id=target_workspace and h.contract_id=c and h.deleted_at is null and private.grcon_master_document_key(e.value->>'document')=code order by h.generated_at desc,h.id,e.n) rows;
  elsif source='monitor' then
   select coalesce(jsonb_agg(item),'[]') into all_rows from (select to_jsonb(m) item from private.grcon_monitored_documents m where m.workspace_id=target_workspace and m.contract_id=c and m.created_by=actor_id and m.active and private.grcon_master_document_key(m.document_code)=code order by m.updated_at desc,m.id) rows;
  elsif source='monitorChanges' then
   select coalesce(jsonb_agg(item),'[]') into all_rows from (select to_jsonb(ch) item from private.grcon_sigem_status_changes ch where ch.workspace_id=target_workspace and ch.contract_id=c and private.grcon_master_document_key(ch.document_code)=code and exists(select 1 from private.grcon_monitored_documents m where m.workspace_id=target_workspace and m.contract_id=c and m.created_by=actor_id and m.active and private.grcon_master_document_key(m.document_code)=code) order by ch.created_at desc,ch.id) rows;
  elsif source='audit' then
   select coalesce(jsonb_agg(item),'[]') into all_rows from (select to_jsonb(a) item from public.grcon_audit_events a where a.workspace_id=target_workspace and a.contract_id=c and private.grcon_master_document_key(a.metadata->>'document_code')=code order by a.created_at desc,a.id) rows;
  end if;
  revision:=md5(all_rows::text||coalesce(sources->source->>'snapshotId',''));
  if requested<>'' and input->>'revision' is not null and input->>'revision'<>revision then raise exception 'A fonte mudou. Atualize o Registro Mestre antes de continuar.' using errcode='40001'; end if;
  select coalesce(jsonb_agg(value order by n),'[]') into page_rows from jsonb_array_elements(all_rows) with ordinality e(value,n) where n>page_offset and n<=page_offset+100;
  if source='vault' then page_rows:=private.grcon_vault_enrich(page_rows); end if;
  result:=result||jsonb_build_object(source,page_rows);
  pages:=pages||jsonb_build_object(source,jsonb_build_object('after',page_offset,'next',page_offset+jsonb_array_length(page_rows),'hasMore',jsonb_array_length(all_rows)>page_offset+100,'revision',revision));
 end loop;
 return result||jsonb_build_object('code',code,'pages',pages,'sources',sources,'queriedAt',now());
end $$;
create or replace function public.grcon_master_query(target_workspace uuid,actor_id uuid,input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.grcon_master_query(target_workspace,actor_id,input); $$;
revoke all on function private.grcon_master_query(uuid,uuid,jsonb),public.grcon_master_query(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_master_query(uuid,uuid,jsonb),public.grcon_master_query(uuid,uuid,jsonb) to service_role;
commit;
