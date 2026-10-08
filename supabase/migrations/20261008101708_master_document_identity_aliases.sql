-- Match the existing dashboard's ET separators and neutral NT- TAG identity.
-- This is a read identity only: it does not rewrite stored files or history.
create function private.grcon_master_document_key(value text) returns text
language sql immutable strict set search_path='' as $$
 select case when normalized ~ '^([A-Z0-9]{3})[-_]RNEST[-_]([A-Z0-9]+)[-_](\d+(?:\.\d+){3})[-_]([A-Z0-9]+)[-_]([A-Z0-9]+)[-_](.+)$'
 then regexp_replace(regexp_replace(normalized,
 '^([A-Z0-9]{3})[-_]RNEST[-_]([A-Z0-9]+)[-_](\d+(?:\.\d+){3})[-_]([A-Z0-9]+)[-_]([A-Z0-9]+)[-_](.+)$',
 '\1_RNEST_\2_\3_\4_\5_\6'),
 '^([A-Z0-9]{3}_RNEST_[A-Z0-9]+_\d+(?:\.\d+){3}_[A-Z0-9]+_[A-Z0-9]+_)NT-', '\1')
 else regexp_replace(normalized,'^NT-','') end
 from (select upper(regexp_replace(btrim(value),'\s+','','g')) normalized)n;
$$;
revoke all on function private.grcon_master_document_key(text) from public,anon,authenticated;
grant execute on function private.grcon_master_document_key(text) to service_role;
create index grcon_master_sigem_key_idx on private.grcon_sigem_query_rows(snapshot_id,private.grcon_master_document_key(payload->>'document'));
create index grcon_master_requests_key_idx on private.grcon_requests_rows(base_id,private.grcon_master_document_key(payload->>'document'));
create or replace function private.grcon_vault_operations(target_workspace uuid,actor_id uuid,operation text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; member_role text; f private.grcon_document_files; result jsonb; code text; q text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente API de servidor.' using errcode='42501'; end if;
 select m.contract_id,m.role into c,member_role from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>16384 then raise exception 'Operação inválida.'; end if;
 if operation in('detail','metadata','access','restore') then
  select * into f from private.grcon_document_files where id=(input->>'id')::uuid and workspace_id=target_workspace and contract_id=c;
  if not found then raise exception 'Arquivo não localizado.' using errcode='22023'; end if;
  if operation='restore' then
   if member_role not in('owner','admin','operator') then raise exception 'Sem permissão para recuperar arquivo.' using errcode='42501'; end if;
   perform 1 from public.grcon_workspaces where id=target_workspace for update;
   update private.grcon_document_files set status='pending',created_by=actor_id,object_key='workspaces/'||target_workspace::text||'/documents/'||gen_random_uuid()::text,multipart_id=null,parts='[]'::jsonb,etag=null,integrity_result=null where id=f.id and status in('ready','integrity_error') returning * into f;
   if not found then raise exception 'Recuperação já iniciada por outro usuário.'; end if;
   insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,c,actor_id,'document_vault_restore','document_file',f.id::text,jsonb_build_object('document_code',f.document_code,'sha256',f.sha256,'version',f.file_version));
   return to_jsonb(f);
  end if;
  if operation='metadata' then
   if member_role not in('owner','admin','operator') then raise exception 'Sem permissão para alterar metadados.' using errcode='42501'; end if;
   update private.grcon_document_files set mime_type=left(coalesce(input->>'mime_type',mime_type),255),source_context=source_context||jsonb_build_object(
    'origin',left(coalesce(input->>'origin','cofre'),40),'purpose',left(coalesce(input->>'purpose',''),255),'discipline',left(coalesce(input->>'discipline',''),255),
    'class',case when input->>'class' in('ET','N-1710','CV') then input->>'class' else coalesce(source_context->>'class','Não identificado') end,'normalized_name',left(coalesce(input->>'normalized_name',file_name),255)) where id=f.id;
  end if;
  if operation in('metadata','access') then
   if operation='access' and input->>'action' not in('download','view') then raise exception 'Acesso inválido.'; end if;
   insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,c,actor_id,
    'document_vault_'||case when operation='metadata' then 'metadata' else input->>'action' end,'document_file',f.id::text,
    jsonb_build_object('document_code',f.document_code,'revision',f.revision,'version',f.file_version,'result','success'));
   return jsonb_build_object('ok',true);
  end if;
  return jsonb_build_object('file',private.grcon_vault_enrich(jsonb_build_array(to_jsonb(f)))->0,
   'versions',(select private.grcon_vault_enrich(coalesce(jsonb_agg(to_jsonb(d) order by d.file_version desc),'[]'::jsonb)) from private.grcon_document_files d where d.workspace_id=target_workspace and d.contract_id=c and d.identity_code=f.identity_code and d.revision=f.revision and d.format=f.format),
   'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from(select ev.action,ev.created_at,ev.actor_id,ev.metadata from public.grcon_audit_events ev where ev.workspace_id=target_workspace and ev.contract_id=c and ev.entity_type='document_file' and ev.entity_id=f.id::text order by ev.created_at desc limit 100)a));
 elsif operation='global_targets' then
  if member_role<>'owner' then raise exception 'Visão global exclusiva do proprietário.' using errcode='42501'; end if;
  return jsonb_build_object('targets',(select coalesce(jsonb_agg(jsonb_build_object('workspace_id',ct.workspace_id,'code',ct.code)),'[]'::jsonb) from public.grcon_contracts ct join public.grcon_memberships m on m.workspace_id=ct.workspace_id and m.contract_id=ct.id where ct.active and m.user_id=actor_id and m.active and m.role='owner'));
 elsif operation='metrics' then
  return jsonb_build_object('active',(select count(*) from private.grcon_document_files where workspace_id=target_workspace and contract_id=c and status='ready' and is_active),
   'historical',(select count(*) from private.grcon_document_files where workspace_id=target_workspace and contract_id=c and status='ready' and not is_active),
   'unlinked',(select count(*) from private.grcon_document_files d where workspace_id=target_workspace and contract_id=c and status='ready' and not exists(select 1 from private.grcon_vault_emission_links where file_id=d.id)),
   'byType',(select coalesce(jsonb_object_agg(format,n),'{}'::jsonb) from(select format,count(*) n from private.grcon_document_files where workspace_id=target_workspace and contract_id=c and status='ready' group by format)t),
   'byClass',(select coalesce(jsonb_object_agg(cls,n),'{}'::jsonb) from(select case when document_code like 'ET-%' then 'ET' when document_code like 'CV-%' then 'CV' else 'Não identificado' end cls,count(*) n from private.grcon_document_files where workspace_id=target_workspace and contract_id=c and status='ready' group by 1)t),
   'evolution',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at),'[]'::jsonb) from(select created_at,metadata->'physical_bytes' bytes,metadata->'physical_objects' objects from public.grcon_audit_events where workspace_id=target_workspace and contract_id=c and action='document_vault_storage_reconciled' order by created_at desc limit 30)a));
 elsif operation='master' then
  code:=private.grcon_master_document_key(input->>'code');
  if code='' or length(code)>255 then raise exception 'Informe o código documental.'; end if;
  return jsonb_build_object('code',code,
   'vault',(select private.grcon_vault_enrich(coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb)) from(select * from private.grcon_document_files where workspace_id=target_workspace and contract_id=c and private.grcon_master_document_key(identity_code)=code and status='ready' order by file_version desc limit 100)d),
   'sigem',(select coalesce(jsonb_agg(payload),'[]'::jsonb) from(select r.payload from private.grcon_sigem_query_rows r join private.grcon_sigem_query_snapshots s on s.id=r.snapshot_id where s.workspace_id=target_workspace and s.contract_id=c and s.status='active' and private.grcon_master_document_key(r.payload->>'document')=code order by r.row_number limit 100)t),
   'requests',(select coalesce(jsonb_agg(payload),'[]'::jsonb) from(select r.payload from private.grcon_requests_rows r join private.grcon_requests_bases b on b.id=r.base_id where b.workspace_id=target_workspace and b.contract_id=c and b.status='active' and private.grcon_master_document_key(r.payload->>'document')=code order by row_number limit 100)t),
   'history',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from(select h.id,h.egrdt_number,h.generated_at,e.value file from public.grcon_history h cross join lateral jsonb_array_elements(case when jsonb_typeof(h.payload->'files')='array' then h.payload->'files' else '[]'::jsonb end)e where h.workspace_id=target_workspace and h.contract_id=c and h.deleted_at is null and private.grcon_master_document_key(e.value->>'document')=code order by h.generated_at desc limit 100)t),
   'monitorChanges',(select coalesce(jsonb_agg(to_jsonb(ch)),'[]'::jsonb) from(select document_code,revision,previous_status,current_status,created_at from private.grcon_sigem_status_changes where workspace_id=target_workspace and contract_id=c and private.grcon_master_document_key(document_code)=code and exists(select 1 from private.grcon_monitored_documents m where m.workspace_id=target_workspace and m.contract_id=c and m.created_by=actor_id and m.active and private.grcon_master_document_key(m.document_code)=code) order by created_at desc limit 30)ch),
   'monitor',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from private.grcon_monitored_documents m where workspace_id=target_workspace and contract_id=c and created_by=actor_id and active and private.grcon_master_document_key(document_code)=code),
   'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from(select action,created_at,metadata from public.grcon_audit_events where workspace_id=target_workspace and contract_id=c and private.grcon_master_document_key(metadata->>'document_code')=code order by created_at desc limit 100)a));
 elsif operation='search' then
  q:=lower(btrim(coalesce(input->>'q','')));
  if length(q) not between 2 and 160 then raise exception 'Informe pelo menos dois caracteres.'; end if;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from(
   select document_code code,file_name label,'cofre' source from private.grcon_document_files where workspace_id=target_workspace and contract_id=c and status='ready' and (position(q in lower(document_code||' '||file_name||' '||revision||' '||source_context::text))>0)
   union all select r.payload->>'document',r.payload->>'title','sigem' from private.grcon_sigem_query_rows r join private.grcon_sigem_query_snapshots s on s.id=r.snapshot_id where s.workspace_id=target_workspace and s.contract_id=c and s.status='active' and position(q in lower(r.payload::text))>0
   union all select r.payload->>'document',r.payload->>'sheet','solicitacoes' from private.grcon_requests_rows r join private.grcon_requests_bases b on b.id=r.base_id where b.workspace_id=target_workspace and b.contract_id=c and b.status='active' and position(q in lower(r.payload::text))>0
   union all select e.value->>'document',h.egrdt_number,'egrdt' from public.grcon_history h cross join lateral jsonb_array_elements(case when jsonb_typeof(h.payload->'files')='array' then h.payload->'files' else '[]'::jsonb end)e where h.workspace_id=target_workspace and h.contract_id=c and h.deleted_at is null and position(q in lower(h.egrdt_number||' '||e.value::text))>0
   order by 1,3 limit 100)t;
  return jsonb_build_object('results',result,'limit',100);
 end if;
 raise exception 'Operação desconhecida.' using errcode='22023';
end $$;
