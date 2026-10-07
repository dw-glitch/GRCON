begin;
alter table private.grcon_document_files drop constraint grcon_document_files_status_check;
alter table private.grcon_document_files add constraint grcon_document_files_status_check
 check(status in ('pending','ready','integrity_error','deleting','delete_failed'));
create table private.grcon_document_deletions (
 document_id uuid primary key, workspace_id uuid not null, contract_id uuid not null,
 document_code text not null, revision text not null, object_key text not null,
 retained_key text not null, deleted_by uuid not null, requested_at timestamptz not null default now(),
 deleted_at timestamptz, result text not null default 'pending', error text
);
alter table private.grcon_document_deletions enable row level security;
revoke all on private.grcon_document_deletions from public,anon,authenticated,service_role;
create function private.grcon_document_delete(target_workspace uuid,actor_id uuid,operation text,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f private.grcon_document_files; j private.grcon_document_deletions; c uuid; member_role text;
begin
 select m.role,m.contract_id into member_role,c from public.grcon_memberships m
 join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
 if not found or member_role not in ('owner','admin') then raise exception 'Sem permissão para excluir neste contrato.' using errcode='42501'; end if;
 -- Serialize deletion/retries and reservations that may reuse the same object.
 perform 1 from public.grcon_workspaces where id=target_workspace for update;
 select * into j from private.grcon_document_deletions where document_id=(input->>'id')::uuid and workspace_id=target_workspace and contract_id=c for update;
 if found and j.result='success' then return jsonb_build_object('completed',true); end if;
 select * into f from private.grcon_document_files where id=(input->>'id')::uuid and workspace_id=target_workspace and contract_id=c for update;
 if not found then raise exception 'Documento não localizado neste contrato.' using errcode='22023'; end if;
 if f.object_key not like 'workspaces/'||target_workspace::text||'/documents/%'
 or exists(select 1 from private.grcon_document_files d where d.object_key=f.object_key and (d.workspace_id<>target_workspace or d.contract_id<>c)) then
  raise exception 'Objeto não pertence exclusivamente a este contrato.' using errcode='42501'; end if;
 if operation='begin' then
  if exists(select 1 from private.grcon_document_deletions dj where dj.object_key=f.object_key and dj.document_id<>f.id and dj.result<>'success') then raise exception 'Outro documento com o mesmo arquivo está sendo excluído. Conclua essa exclusão primeiro.' using errcode='40001'; end if;
  if f.status not in ('ready','deleting','delete_failed') then raise exception 'Conclua o envio antes de excluir.' using errcode='22023'; end if;
  insert into private.grcon_document_deletions(document_id,workspace_id,contract_id,document_code,revision,object_key,retained_key,deleted_by)
   values(f.id,target_workspace,c,f.document_code,f.revision,f.object_key,f.object_key||'.retained-'||f.id::text,actor_id)
   on conflict(document_id) do update set result='pending',error=null,deleted_by=actor_id returning * into j;
  update private.grcon_document_files set status='deleting' where id=f.id;
 elsif operation='retain' then
  if j.document_id is null then raise exception 'Exclusão não iniciada.'; end if;
  update private.grcon_document_files set object_key=j.retained_key where object_key=j.object_key and id<>f.id and workspace_id=target_workspace and contract_id=c;
 elsif operation in ('finish','fail') then
  if j.document_id is null then raise exception 'Exclusão não iniciada.'; end if;
  if operation='finish' then
   if exists(select 1 from private.grcon_document_files where object_key=j.object_key and id<>f.id) then raise exception 'Objeto ainda utilizado por outro documento.'; end if;
   delete from private.grcon_document_files where id=f.id;
   update private.grcon_document_deletions set result='success',deleted_at=now(),error=null where document_id=f.id;
  else
   update private.grcon_document_files set status='delete_failed' where id=f.id;
   update private.grcon_document_deletions set result='failed',error=left(input->>'error',500) where document_id=f.id;
  end if;
  insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
   values(target_workspace,c,actor_id,'document_vault_delete_'||operation,'document_file',f.id::text,
    jsonb_build_object('document_id',f.id,'document_code',f.document_code,'revision',f.revision,'contract_id',c,
    'deleted_by',actor_id,'deleted_at',now(),'r2_object_key',f.object_key,'resultado',case when operation='finish' then 'success' else 'failed' end,'error',left(input->>'error',500)));
 end if;
 return to_jsonb(j)||jsonb_build_object('shared_object',exists(select 1 from private.grcon_document_files where object_key=f.object_key and id<>f.id));
end $$;
create function public.grcon_document_delete(target_workspace uuid,actor_id uuid,operation text,input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_document_delete(target_workspace,actor_id,operation,input); $$;
revoke all on function private.grcon_document_delete(uuid,uuid,text,jsonb),public.grcon_document_delete(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_document_delete(uuid,uuid,text,jsonb),public.grcon_document_delete(uuid,uuid,text,jsonb) to service_role;
-- Keep failures visible for authorized retries, but exclude them from GRDT lookup.
do $$ declare definition text; begin
 select pg_get_functiondef('private.grcon_document_vault_list(uuid,uuid,jsonb)'::regprocedure) into definition;
 definition:=replace(definition, 'd.status = ''ready''', 'd.status in (''ready'',''deleting'',''delete_failed'')');
 definition:=replace(definition, 'd.created_by, d.created_at', 'd.created_by, (select coalesce(nullif(p.display_name,''''),p.email) from public.grcon_profiles p where p.id=d.created_by) as created_by_name, d.created_at');
 definition:=replace(definition, 'where d.workspace_id = target_workspace', 'where d.workspace_id = target_workspace and d.contract_id = (select m.contract_id from public.grcon_memberships m where m.workspace_id=target_workspace and m.user_id=actor_id and m.active)');
 execute definition;
end $$;
commit;
