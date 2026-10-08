begin;
alter table private.grcon_document_files
 add column file_version integer not null default 1 check(file_version>0),
 add column previous_file_id uuid,
 add column is_active boolean not null default false,
 add column replaced_at timestamptz,
 add column mime_type text not null default 'application/octet-stream',
 add column source_context jsonb not null default '{}'::jsonb check(jsonb_typeof(source_context)='object');
with numbered as (
 select id,row_number() over(partition by workspace_id,contract_id,identity_code,revision,format order by sequence)::integer v,
 lag(id) over(partition by workspace_id,contract_id,identity_code,revision,format order by sequence) prior
 from private.grcon_document_files
) update private.grcon_document_files d set file_version=n.v,previous_file_id=n.prior from numbered n where n.id=d.id;
with latest as (
 select distinct on(workspace_id,contract_id,identity_code,revision,format) id from private.grcon_document_files
 where status='ready' order by workspace_id,contract_id,identity_code,revision,format,sequence desc
) update private.grcon_document_files set is_active=true where id in(select id from latest);
create index grcon_vault_version_identity_idx on private.grcon_document_files(workspace_id,contract_id,identity_code,revision,format,file_version desc);
create index grcon_vault_object_key_idx on private.grcon_document_files(object_key);
create table private.grcon_vault_emission_links (
 file_id uuid not null references private.grcon_document_files(id) on delete restrict,
 history_id uuid not null,workspace_id uuid not null,contract_id uuid not null,
 egrdt_number text not null default '',emitted_at timestamptz,purpose text not null default '',
 file_snapshot jsonb not null,linked_by uuid,linked_at timestamptz not null default now(),
 primary key(file_id,history_id)
);
alter table private.grcon_vault_emission_links enable row level security;
revoke all on private.grcon_vault_emission_links from public,anon,authenticated,service_role;
create index grcon_vault_links_history_idx on private.grcon_vault_emission_links(workspace_id,contract_id,history_id);

create function private.grcon_vault_version_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare prior private.grcon_document_files;
begin
 if tg_op='INSERT' then
  perform 1 from public.grcon_workspaces where id=new.workspace_id for update;
  select * into prior from private.grcon_document_files where workspace_id=new.workspace_id and contract_id=new.contract_id
   and identity_code=new.identity_code and revision=new.revision and format=new.format order by file_version desc limit 1;
  new.file_version:=coalesce(prior.file_version,0)+1; new.previous_file_id:=prior.id;
  new.is_active:=false;
 end if;
 if new.status='ready' and (tg_op='INSERT' or old.status<>'ready') then
  perform 1 from public.grcon_workspaces where id=new.workspace_id for update;
  -- A late completion of an older reservation must not replace a newer verified file.
  new.is_active:=not exists(select 1 from private.grcon_document_files where workspace_id=new.workspace_id and contract_id=new.contract_id
   and identity_code=new.identity_code and revision=new.revision and format=new.format and status='ready' and file_version>new.file_version);
  if new.is_active then
   update private.grcon_document_files set is_active=false,replaced_at=now() where workspace_id=new.workspace_id and contract_id=new.contract_id
    and identity_code=new.identity_code and revision=new.revision and format=new.format and id<>new.id and is_active;
  end if;
  insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
   values(new.workspace_id,new.contract_id,new.created_by,'document_vault_verified','document_file',new.id::text,
   jsonb_build_object('document_code',new.document_code,'revision',new.revision,'version',new.file_version,'sha256',new.sha256,'previous_file_id',new.previous_file_id));
 elsif new.status<>'ready' then new.is_active:=false;
 end if;
 return new;
end $$;
revoke all on function private.grcon_vault_version_trigger() from public,anon,authenticated,service_role;
create trigger grcon_vault_versions before insert or update of status on private.grcon_document_files for each row execute function private.grcon_vault_version_trigger();

create function private.grcon_vault_history_links() returns trigger language plpgsql security definer set search_path='' as $$
declare entry jsonb; file_id_text text; f private.grcon_document_files; inserted_rows integer;
begin
 perform 1 from public.grcon_workspaces where id=new.workspace_id for update;
 for entry in select value from jsonb_array_elements(case when jsonb_typeof(new.payload->'files')='array' then new.payload->'files' else '[]'::jsonb end) loop
  file_id_text:=coalesce(nullif(entry->>'vaultFileId',''),entry->'fileProvenance'->>'vaultFileId');
  if file_id_text is null or file_id_text='' then continue; end if;
  if file_id_text !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'Identificação do arquivo inválida.'; end if;
  select * into f from private.grcon_document_files where id=file_id_text::uuid and workspace_id=new.workspace_id and contract_id=new.contract_id;
  if not found or f.status<>'ready' then raise exception 'Arquivo da emissão indisponível no Cofre.' using errcode='22023'; end if;
  if nullif(entry->'fileProvenance'->>'sha256','') is not null and entry->'fileProvenance'->>'sha256'<>f.sha256 then raise exception 'Hash da emissão diverge do Cofre.' using errcode='22023'; end if;
  insert into private.grcon_vault_emission_links(file_id,history_id,workspace_id,contract_id,egrdt_number,emitted_at,purpose,file_snapshot,linked_by)
   values(f.id,new.id,new.workspace_id,new.contract_id,coalesce(new.egrdt_number,''),new.generated_at,coalesce(entry->>'purpose',''),
    jsonb_build_object('file_name',f.file_name,'document_code',f.document_code,'revision',f.revision,'version',f.file_version,'sha256',f.sha256,'size_bytes',f.size_bytes,'source',f.source_context),coalesce(new.updated_by,new.created_by))
   on conflict(file_id,history_id) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows>0 then
   insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
    values(new.workspace_id,new.contract_id,coalesce(new.updated_by,new.created_by),'document_vault_used_in_grdt','document_file',f.id::text,jsonb_build_object('document_code',f.document_code,'history_id',new.id,'egrdt_number',new.egrdt_number,'version',f.file_version,'sha256',f.sha256));
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.grcon_vault_history_links() from public,anon,authenticated,service_role;
create trigger grcon_vault_history_links after insert or update of payload on public.grcon_history for each row execute function private.grcon_vault_history_links();
-- Existing, valid history references receive immutable snapshots without rewriting history.
insert into private.grcon_vault_emission_links(file_id,history_id,workspace_id,contract_id,egrdt_number,emitted_at,purpose,file_snapshot,linked_by)
 select distinct f.id,h.id,h.workspace_id,h.contract_id,coalesce(h.egrdt_number,''),h.generated_at,coalesce(e.value->>'purpose',''),
 jsonb_build_object('file_name',f.file_name,'document_code',f.document_code,'revision',f.revision,'version',f.file_version,'sha256',f.sha256,'size_bytes',f.size_bytes,'source',f.source_context),h.created_by
 from public.grcon_history h cross join lateral jsonb_array_elements(case when jsonb_typeof(h.payload->'files')='array' then h.payload->'files' else '[]'::jsonb end) e
 join private.grcon_document_files f on f.id::text=coalesce(nullif(e.value->>'vaultFileId',''),e.value->'fileProvenance'->>'vaultFileId') and f.workspace_id=h.workspace_id and f.contract_id=h.contract_id and f.status='ready'
 on conflict do nothing;

alter function private.grcon_document_delete(uuid,uuid,text,jsonb) rename to grcon_document_delete_unlinked;
create function private.grcon_document_delete(target_workspace uuid,actor_id uuid,operation text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.grcon_workspaces where id=target_workspace for update;
 if coalesce(auth.jwt()->>'role','')<>'service_role' or not exists(select 1 from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active where m.workspace_id=target_workspace and m.user_id=actor_id and m.active and m.role in('owner','admin')) then raise exception 'Sem permissão para excluir neste contrato.' using errcode='42501'; end if;
 if operation='begin' and exists(select 1 from private.grcon_vault_emission_links where file_id=(input->>'id')::uuid and workspace_id=target_workspace) then
  raise exception 'Arquivo utilizado em GRDT: preserve esta versão histórica.' using errcode='22023';
 end if;
 return private.grcon_document_delete_unlinked(target_workspace,actor_id,operation,input);
end $$;
revoke all on function private.grcon_document_delete(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function private.grcon_document_delete_unlinked(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.grcon_document_delete(uuid,uuid,text,jsonb) to service_role;

create function private.grcon_vault_enrich(files jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(e.value||jsonb_build_object('file_version',f.file_version,'previous_file_id',f.previous_file_id,'is_active',f.is_active,
 'format',f.format,'replaced_at',f.replaced_at,'mime_type',f.mime_type,'source_context',f.source_context,'emissions',coalesce(l.emissions,'[]'::jsonb)) order by e.n),'[]'::jsonb)
 from jsonb_array_elements(files) with ordinality e(value,n) join private.grcon_document_files f on f.id::text=e.value->>'id'
 left join lateral(select jsonb_agg(jsonb_build_object('egrdt_number',egrdt_number,'purpose',purpose,'date',emitted_at) order by emitted_at desc) emissions from private.grcon_vault_emission_links where file_id=f.id) l on true;
$$;
revoke all on function private.grcon_vault_enrich(jsonb) from public,anon,authenticated,service_role;
alter function private.grcon_document_vault_list(uuid,uuid,jsonb) rename to grcon_document_vault_list_base;
create function private.grcon_document_vault_list(target_workspace uuid,actor_id uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.grcon_document_vault_list_base(target_workspace,actor_id,input);
 return result||jsonb_build_object('files',private.grcon_vault_enrich(result->'files'));
end $$;
alter function private.grcon_document_vault_lookup(uuid,uuid,jsonb) rename to grcon_document_vault_lookup_base;
create function private.grcon_document_vault_lookup(target_workspace uuid,actor_id uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.grcon_document_vault_lookup_base(target_workspace,actor_id,input);
 return jsonb_build_object('results',(select jsonb_agg(value||jsonb_build_object('matches',(select coalesce(jsonb_agg(v),'[]'::jsonb) from jsonb_array_elements(private.grcon_vault_enrich(value->'matches')) v where (v->>'is_active')::boolean)) order by n)
 from jsonb_array_elements(result->'results') with ordinality t(value,n)));
end $$;
revoke all on function private.grcon_document_vault_list_base(uuid,uuid,jsonb),private.grcon_document_vault_lookup_base(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.grcon_document_vault_list(uuid,uuid,jsonb),private.grcon_document_vault_lookup(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_document_vault_list(uuid,uuid,jsonb),private.grcon_document_vault_lookup(uuid,uuid,jsonb) to service_role;

alter function private.grcon_document_vault_storage_catalog(uuid,uuid) rename to grcon_document_vault_storage_catalog_base;
create function private.grcon_document_vault_storage_catalog(target_workspace uuid,actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.grcon_document_vault_storage_catalog_base(target_workspace,actor_id);
 return result||jsonb_build_object('files',private.grcon_vault_enrich(result->'files'));
end $$;
revoke all on function private.grcon_document_vault_storage_catalog_base(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.grcon_document_vault_storage_catalog(uuid,uuid) from public,anon,authenticated;
grant execute on function private.grcon_document_vault_storage_catalog(uuid,uuid) to service_role;

create function private.grcon_vault_operations(target_workspace uuid,actor_id uuid,operation text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  code:=regexp_replace(upper(regexp_replace(btrim(coalesce(input->>'code','')),'\s+','','g')),'^NT-','');
  if code='' or length(code)>255 then raise exception 'Informe o código documental.'; end if;
  return jsonb_build_object('code',code,
   'vault',(select private.grcon_vault_enrich(coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb)) from(select * from private.grcon_document_files where workspace_id=target_workspace and contract_id=c and identity_code=code and status='ready' order by file_version desc limit 100)d),
   'sigem',(select coalesce(jsonb_agg(payload),'[]'::jsonb) from(select r.payload from private.grcon_sigem_query_rows r join private.grcon_sigem_query_snapshots s on s.id=r.snapshot_id where s.workspace_id=target_workspace and s.contract_id=c and s.status='active' and regexp_replace(upper(regexp_replace(r.payload->>'document','\s+','','g')),'^NT-','')=code order by r.row_number limit 100)t),
   'requests',(select coalesce(jsonb_agg(payload),'[]'::jsonb) from(select r.payload from private.grcon_requests_rows r join private.grcon_requests_bases b on b.id=r.base_id where b.workspace_id=target_workspace and b.contract_id=c and b.status='active' and regexp_replace(upper(regexp_replace(r.payload->>'document','\s+','','g')),'^NT-','')=code order by row_number limit 100)t),
   'history',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from(select h.id,h.egrdt_number,h.generated_at,e.value file from public.grcon_history h cross join lateral jsonb_array_elements(case when jsonb_typeof(h.payload->'files')='array' then h.payload->'files' else '[]'::jsonb end)e where h.workspace_id=target_workspace and h.contract_id=c and h.deleted_at is null and regexp_replace(upper(regexp_replace(e.value->>'document','\s+','','g')),'^NT-','')=code order by h.generated_at desc limit 100)t),
   'monitorChanges',(select coalesce(jsonb_agg(to_jsonb(ch)),'[]'::jsonb) from(select document_code,revision,previous_status,current_status,created_at from private.grcon_sigem_status_changes where workspace_id=target_workspace and contract_id=c and regexp_replace(upper(document_code),'^NT-','')=code and exists(select 1 from private.grcon_monitored_documents m where m.workspace_id=target_workspace and m.contract_id=c and m.created_by=actor_id and m.active and regexp_replace(upper(m.document_code),'^NT-','')=code) order by created_at desc limit 30)ch),
   'monitor',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from private.grcon_monitored_documents m where workspace_id=target_workspace and contract_id=c and created_by=actor_id and active and regexp_replace(upper(document_code),'^NT-','')=code),
   'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from(select action,created_at,metadata from public.grcon_audit_events where workspace_id=target_workspace and contract_id=c and metadata->>'document_code'=code order by created_at desc limit 100)a));
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
create function public.grcon_vault_operations(target_workspace uuid,actor_id uuid,operation text,input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_vault_operations(target_workspace,actor_id,operation,input); $$;
revoke all on function public.grcon_vault_operations(uuid,uuid,text,jsonb),private.grcon_vault_operations(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.grcon_vault_operations(uuid,uuid,text,jsonb),private.grcon_vault_operations(uuid,uuid,text,jsonb) to service_role;
create function private.grcon_vault_maintenance(operation text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; w uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente manutenção de servidor.' using errcode='42501'; end if;
 if operation='targets' then
  return (select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from(select ct.workspace_id,(select m.user_id from public.grcon_memberships m where m.workspace_id=ct.workspace_id and m.contract_id=ct.id and m.active and m.role='owner' order by joined_at limit 1) actor_id from public.grcon_contracts ct where ct.active order by ct.id limit 50)t where t.actor_id is not null);
 elsif operation='record' then
  w:=(input->>'workspace_id')::uuid;
  select id into c from public.grcon_contracts where workspace_id=w and active;
  if not found or octet_length(input::text)>65536 then raise exception 'Conferência inválida.'; end if;
  insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
   values(w,c,null,'document_vault_storage_reconciled','document_vault',c::text,jsonb_build_object('origin','cron','physical_bytes',input->'physicalBytes','physical_objects',input->'physicalObjects','missing_objects',input->'missingObjects','size_mismatches',input->'sizeMismatches','orphan_objects',input->'orphanObjects'));
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operação inválida.';
end $$;
create function public.grcon_vault_maintenance(operation text,input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_vault_maintenance(operation,input); $$;
revoke all on function private.grcon_vault_maintenance(text,jsonb),public.grcon_vault_maintenance(text,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_vault_maintenance(text,jsonb),public.grcon_vault_maintenance(text,jsonb) to service_role;
-- Rebuild the public entry points after renaming their private implementations.
create or replace function public.grcon_document_vault_list(target_workspace uuid,actor_id uuid,input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_document_vault_list(target_workspace,actor_id,input); $$;
create or replace function public.grcon_document_vault_lookup(target_workspace uuid,actor_id uuid,input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_document_vault_lookup(target_workspace,actor_id,input); $$;
create or replace function public.grcon_document_vault_storage_catalog(target_workspace uuid,actor_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_document_vault_storage_catalog(target_workspace,actor_id); $$;
create or replace function public.grcon_document_delete(target_workspace uuid,actor_id uuid,operation text,input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_document_delete(target_workspace,actor_id,operation,input); $$;
revoke all on function public.grcon_document_vault_list(uuid,uuid,jsonb),public.grcon_document_vault_lookup(uuid,uuid,jsonb),public.grcon_document_vault_storage_catalog(uuid,uuid),public.grcon_document_delete(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.grcon_document_vault_list(uuid,uuid,jsonb),public.grcon_document_vault_lookup(uuid,uuid,jsonb),public.grcon_document_vault_storage_catalog(uuid,uuid),public.grcon_document_delete(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
