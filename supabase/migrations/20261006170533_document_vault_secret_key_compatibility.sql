create or replace function private.grcon_document_catalog(target_workspace uuid, actor_id uuid, operation text, input jsonb DEFAULT '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 member_role text; f private.grcon_document_files; reused private.grcon_document_files;
 document_identity text; code text; rev text; fmt text; digest text; size bigint;
 candidates jsonb; page jsonb; cursor_value bigint; page_limit integer; part jsonb;
 file_id uuid; expected_parts integer; part_size bigint;
begin
 -- Signed gateway role + function grants are both required. Caller-supplied actor is server-only.
 if actor_id is null or target_workspace is null then raise exception 'Sessão não identificada.' using errcode='42501'; end if;
 select m.role into member_role from public.grcon_memberships m where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
 if not found then raise exception 'Sem acesso à área de trabalho.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>98304 then raise exception 'Metadados inválidos.' using errcode='22023'; end if;
 if operation='list' then
  cursor_value=coalesce((input->>'after')::bigint,0); page_limit=coalesce((input->>'limit')::integer,200);
  if cursor_value<0 or page_limit not between 1 and 500 then raise exception 'Página inválida.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.sequence),'[]'::jsonb) into page from
   (select * from private.grcon_document_files d where d.workspace_id=target_workspace and d.status='ready' and d.sequence>cursor_value order by d.sequence limit page_limit) q;
  return jsonb_build_object('files',page,'next',case when jsonb_array_length(page)=0 then null else (page->-1->>'sequence')::bigint end);
 elsif operation='find_hash' then
  select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into page from private.grcon_document_files d where d.workspace_id=target_workspace and d.status='ready' and d.sha256=input->>'sha256' and d.size_bytes=(input->>'size_bytes')::bigint;
  return page;
 elsif operation='get' then
  select * into f from private.grcon_document_files d where d.workspace_id=target_workspace and d.id=(input->>'id')::uuid and (d.status='ready' or d.created_by=actor_id);
  return case when found then to_jsonb(f) else null end;
 end if;
 if member_role not in ('owner','admin','operator') then raise exception 'Perfil sem permissão de envio.' using errcode='42501'; end if;
 if operation='begin' then
  code=upper(btrim(coalesce(input->>'document_code',''))); rev=upper(btrim(coalesce(input->>'revision',''))); fmt=lower(btrim(coalesce(input->>'format','')));
  digest=input->>'sha256'; size=(input->>'size_bytes')::bigint;
  if length(code)>255 or length(rev)>40 or length(fmt)>40 or size is null or size not between 0 and 5497558138880 or digest is null or digest !~ '^[a-f0-9]{64}$'
    or length(btrim(coalesce(input->>'file_name',''))) not between 1 and 255 or length(coalesce(input->>'relative_path',''))>4096
    or (input->>'file_name') ~ '[/\\]' then raise exception 'Identidade do arquivo inválida.' using errcode='22023'; end if;
  document_identity=case when code='' then 'UNIDENTIFIED:'||upper(input->>'file_name') else regexp_replace(code,'^NT-','') end;
  -- Serialize the natural identity to make retries and concurrent reservations deterministic.
  perform 1 from public.grcon_workspaces where id=target_workspace for update;
  select * into f from private.grcon_document_files d where d.workspace_id=target_workspace and d.identity_code=document_identity and d.revision=rev and d.format=fmt and d.sha256=digest;
  if found then
   if f.size_bytes<>size then raise exception 'Hash e tamanho divergentes.' using errcode='22023'; end if;
   if f.status<>'ready' and f.created_by<>actor_id then return jsonb_build_object('error','UPLOAD_IN_PROGRESS','message','Este arquivo está sendo enviado por outro membro. Atualize a consulta após a conclusão.'); end if;
   if f.status='ready' and not exists(select 1 from private.grcon_document_files d where d.id=(input->>'reuse_id')::uuid and d.workspace_id=target_workspace and d.object_key=f.object_key and d.status='ready') then return jsonb_build_object('error','OBJECT_UNAVAILABLE','message','O arquivo consta no catálogo, mas não foi encontrado íntegro no R2. Solicite recuperação.'); end if;
   return jsonb_build_object('file',to_jsonb(f),'duplicate',f.status='ready','reused',false);
  end if;
  select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into candidates from private.grcon_document_files d where d.workspace_id=target_workspace and d.identity_code=document_identity and d.revision=rev and d.format=fmt and d.sha256<>digest and d.status in ('pending','ready');
  if jsonb_array_length(candidates)>0 and coalesce((input->>'allow_conflict')::boolean,false)=false then return jsonb_build_object('conflict',true,'candidates',candidates); end if;
  if input->>'reuse_id' is not null then
   select * into reused from private.grcon_document_files d where d.id=(input->>'reuse_id')::uuid and d.workspace_id=target_workspace and d.sha256=digest and d.size_bytes=size and d.status='ready';
   if not found then raise exception 'Referência de reaproveitamento inválida.' using errcode='22023'; end if;
  end if;
  file_id=gen_random_uuid();
  insert into private.grcon_document_files(id,workspace_id,created_by,file_name,relative_path,document_code,identity_code,revision,format,size_bytes,sha256,object_key,status,etag,verified_at,identity_conflict)
   values(file_id,target_workspace,actor_id,btrim(input->>'file_name'),coalesce(input->>'relative_path',input->>'file_name'),code,document_identity,rev,fmt,size,digest,
    coalesce(reused.object_key,'workspaces/'||target_workspace::text||'/documents/'||file_id::text),case when reused.id is null then 'pending' else 'ready' end,reused.etag,reused.verified_at,jsonb_array_length(candidates)>0)
   returning * into f;
  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,actor_id,case when reused.id is null then 'document_upload_reserved' else 'document_binary_reused' end,'document_file',f.id::text,jsonb_build_object('sha256',digest,'bytes',size,'identity_conflict',f.identity_conflict));
  return jsonb_build_object('file',to_jsonb(f),'duplicate',false,'reused',reused.id is not null);
 end if;
 select * into f from private.grcon_document_files d where d.workspace_id=target_workspace and d.id=(input->>'id')::uuid for update;
 if not found or f.created_by<>actor_id then raise exception 'Envio sem acesso.' using errcode='42501'; end if;
 if operation='write_session' then return to_jsonb(f); end if;
 if operation='restart' then
  if f.status='ready' then return to_jsonb(f); end if;
  update private.grcon_document_files set object_key='workspaces/'||target_workspace::text||'/documents/'||gen_random_uuid()::text,status='pending',multipart_id=null,parts='[]'::jsonb,etag=null,integrity_result=null where id=f.id returning * into f;
  return to_jsonb(f);
 end if;
 -- A stale finalize or part acknowledgement may never mutate a restarted session.
 if input->>'object_key' is distinct from f.object_key then return jsonb_build_object('error','STALE_UPLOAD','message','O envio foi reiniciado em outra sessão. Atualize a consulta.'); end if;
 if f.status='ready' and operation='complete' then return to_jsonb(f); end if;
 if f.status<>'pending' then return jsonb_build_object('error','INTEGRITY_ERROR','message','Reinicie o envio após conferir o arquivo.'); end if;
 if operation='multipart' then
  if length(coalesce(input->>'multipart_id','')) not between 1 and 2048 then raise exception 'Envio multipart inválido.' using errcode='22023'; end if;
  update private.grcon_document_files set multipart_id=coalesce(multipart_id,input->>'multipart_id') where id=f.id returning * into f;
 elsif operation='part' then
  if input->>'multipart_id' is distinct from f.multipart_id or f.multipart_id is null then return jsonb_build_object('error','STALE_UPLOAD','message','Envio multipart mudou. Atualize a consulta.'); end if;
  part=input->'part'; part_size=greatest(16777216,ceil(f.size_bytes::numeric/10000/1048576)::bigint*1048576);
  expected_parts=greatest(1,ceil(f.size_bytes::numeric/part_size)::integer);
  if jsonb_typeof(part) is distinct from 'object' or jsonb_typeof(part->'partNumber') is distinct from 'number' or jsonb_typeof(part->'size') is distinct from 'number' or part->>'etag' is null or (part->>'partNumber')::integer not between 1 and expected_parts or part->>'etag' !~ '^[a-fA-F0-9]{32}$'
    or (part->>'size')::bigint <> least(part_size,greatest(0,f.size_bytes-((part->>'partNumber')::integer-1)::bigint*part_size)) then raise exception 'Parte inválida.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(p),'[]'::jsonb) into page from jsonb_array_elements(f.parts) p where p->>'partNumber'<>part->>'partNumber';
  update private.grcon_document_files set parts=page||jsonb_build_array(jsonb_build_object('partNumber',(part->>'partNumber')::integer,'etag',lower(part->>'etag'),'size',(part->>'size')::bigint)) where id=f.id returning * into f;
 elsif operation='complete' then
  if input->>'etag' is null or length(input->>'etag')>255 then raise exception 'Integridade inválida.' using errcode='22023'; end if;
  if coalesce((input->>'ok')::boolean,false) and ((input->>'size')::bigint is distinct from f.size_bytes or input->>'sha256' is distinct from f.sha256) then raise exception 'Integridade divergente.' using errcode='22023'; end if;
  update private.grcon_document_files set status=case when coalesce((input->>'ok')::boolean,false) then 'ready' else 'integrity_error' end,
   etag=input->>'etag',parts=case when coalesce((input->>'ok')::boolean,false) then '[]'::jsonb else parts end,verified_at=case when coalesce((input->>'ok')::boolean,false) then now() else null end,
   integrity_result=jsonb_build_object('bytes',input->'size','sha256',input->'sha256') where id=f.id returning * into f;
  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,actor_id,case when f.status='ready' then 'document_upload_verified' else 'document_integrity_failed' end,'document_file',f.id::text,jsonb_build_object('sha256',f.sha256,'bytes',f.size_bytes));
 else raise exception 'Operação desconhecida.' using errcode='22023';
 end if;
 return to_jsonb(f);
end $fn$;
revoke all on function private.grcon_document_catalog(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function private.grcon_document_catalog(uuid,uuid,text,jsonb) to service_role;