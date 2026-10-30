begin;
-- Operators can submit and publish; operational dates remain owner/admin and deletion remains master.
CREATE OR REPLACE FUNCTION private.grcon_pw_base(target_workspace uuid, operation text, input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid; member_role text; s private.grcon_pw_snapshots; active_id uuid; new_id uuid;
 count_rows integer; result jsonb; first_row integer; date_value timestamptz;
begin
 if auth.uid() is null then raise exception 'Sessão necessária.' using errcode='42501'; end if;
 select m.contract_id,m.role into c,member_role from public.grcon_memberships m
 join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' then raise exception 'Parâmetros inválidos.' using errcode='22023'; end if;
 if operation='current' then
  select to_jsonb(b)||jsonb_build_object('snapshot_id',b.id) into result from private.grcon_pw_snapshots b
  where b.workspace_id=target_workspace and b.contract_id=c and b.status='active';
  return jsonb_build_object('snapshot',result);
 elsif operation='list' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.version desc),'[]') into result from (
   select id as snapshot_id,version,file_name,record_count,metadata,status,created_by,created_at,published_at
   from private.grcon_pw_snapshots where workspace_id=target_workspace and contract_id=c and status in ('active','archived')
  ) q;
  return jsonb_build_object('versions',result);
 elsif operation='page' then
  select * into s from private.grcon_pw_snapshots b where b.id=(input->>'id')::uuid
  and b.workspace_id=target_workspace and b.contract_id=c and b.status in ('active','archived');
  if not found then raise exception 'Snapshot PW indisponível.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.row_number),'[]') into result from (
   select row_number,payload from private.grcon_pw_rows where snapshot_id=s.id
   and row_number>greatest(0,coalesce((input->>'after')::integer,0)) order by row_number limit 1000
  ) q;
  return jsonb_build_object('rows',result);
 end if;
 if operation in ('begin','chunk','publish') and member_role not in ('owner','admin','operator') then raise exception 'Sem permissão para publicar PW.' using errcode='42501'; end if;
 if operation='date' and member_role not in ('owner','admin') then raise exception 'Somente proprietário ou administrador pode alterar a data operacional PW.' using errcode='42501'; end if;
 if operation='begin' then
  count_rows:=(input->>'count')::integer;
  if count_rows is null or count_rows not between 1 and 100000
   or length(btrim(coalesce(input->>'fileName',''))) not between 1 and 255
   or jsonb_typeof(input->'metadata') is distinct from 'object' or octet_length((input->'metadata')::text)>65536
   then raise exception 'Arquivo PW ou metadados inválidos.' using errcode='22023'; end if;
  insert into private.grcon_pw_snapshots(workspace_id,contract_id,file_name,expected_count,metadata,expected_active,created_by)
  values(target_workspace,c,input->>'fileName',count_rows,input->'metadata',(input->>'expectedActive')::uuid,auth.uid()) returning id into new_id;
  return jsonb_build_object('id',new_id);
 elsif operation='chunk' then
  select * into s from private.grcon_pw_snapshots b where b.id=(input->>'id')::uuid
   and b.workspace_id=target_workspace and b.contract_id=c and b.status='pending' and b.created_by=auth.uid() for update;
  if not found then raise exception 'Envio PW indisponível.' using errcode='42501'; end if;
  first_row:=(input->>'first')::integer;
  if jsonb_typeof(input->'rows') is distinct from 'array' or jsonb_array_length(input->'rows') not between 1 and 500
   or first_row is null or first_row<1 or first_row+jsonb_array_length(input->'rows')-1>s.expected_count
   or octet_length(input::text)>4000000 then raise exception 'Lote PW inválido.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(input->'rows') r where jsonb_typeof(r) is distinct from 'object'
   or (
      length(btrim(coalesce(r->>'document',''))) not between 1 and 255
      and not (
        r->'pwRawInvalid' = 'true'::jsonb
        and btrim(coalesce(r->>'document','')) = ''
        and case when jsonb_typeof(r->'pwRawCells')='array'
          then jsonb_array_length(r->'pwRawCells') between 1 and 256
          else false end
      )
   ) or octet_length(r::text)>65536)
   then raise exception 'Documento PW inválido.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(input->'rows') with ordinality t(r,n)
   join private.grcon_pw_rows old on old.snapshot_id=s.id and old.row_number=first_row+n-1 where old.payload is distinct from r)
   then raise exception 'Um lote recebido não pode ser substituído por outro conteúdo.' using errcode='22023'; end if;
  insert into private.grcon_pw_rows(snapshot_id,row_number,payload)
   select s.id,first_row+n::integer-1,r from jsonb_array_elements(input->'rows') with ordinality t(r,n) on conflict do nothing;
  return jsonb_build_object('ok',true);
 end if;
 -- All mutations of the active pointer use the same contract lock.
 perform 1 from public.grcon_contracts where id=c for update;
 select * into s from private.grcon_pw_snapshots b where b.id=(input->>'id')::uuid
  and b.workspace_id=target_workspace and b.contract_id=c for update;
 if not found then raise exception 'Snapshot PW indisponível.' using errcode='42501'; end if;
 if operation='publish' then
  if s.status<>'pending' or s.created_by<>auth.uid() then raise exception 'Envio PW indisponível.' using errcode='42501'; end if;
  select id into active_id from private.grcon_pw_snapshots where contract_id=c and status='active';
  if active_id is distinct from s.expected_active then raise exception 'Outra base PW foi publicada. Atualize e revise antes de publicar novamente.' using errcode='40001'; end if;
  select count(*) into count_rows from private.grcon_pw_rows where snapshot_id=s.id;
  if count_rows<>s.expected_count then raise exception 'Carga PW incompleta.' using errcode='22023'; end if;
  update private.grcon_pw_snapshots set status='archived' where contract_id=c and status='active';
  update private.grcon_pw_snapshots set status='active',record_count=count_rows,published_at=now() where id=s.id;
 elsif operation='date' then
  if s.status not in ('active','archived') then raise exception 'Base PW não publicada.'; end if;
  if input ? 'expectedImportedAt' and s.metadata->>'importedAt' is distinct from input->>'expectedImportedAt'
   then raise exception 'A data PW foi alterada por outro usuário. Atualize antes de salvar.' using errcode='40001'; end if;
  date_value:=(input->>'importedAt')::timestamptz;
  if date_value is null or not isfinite(date_value) then raise exception 'Data PW inválida.'; end if;
  update private.grcon_pw_snapshots set metadata=metadata||jsonb_build_object(
   'sourceImportedAt',coalesce(metadata->>'sourceImportedAt',metadata->>'importedAt'),
   'importedAt',input->>'importedAt','referenceDate',to_char(date_value at time zone 'UTC','YYYY-MM-DD')) where id=s.id;
 elsif operation='delete' then
  if not private.grcon_is_master_owner() then raise exception 'Somente proprietário master pode excluir snapshots PW.' using errcode='42501'; end if;
  if s.status='pending' then raise exception 'Snapshot PW não publicado.'; end if;
  delete from private.grcon_pw_snapshots where id=s.id;
  if s.status='active' then
   update private.grcon_pw_snapshots set status='active' where id=(select id from private.grcon_pw_snapshots
    where contract_id=c and status='archived' order by version desc limit 1);
  end if;
 else raise exception 'Operação PW inválida.' using errcode='22023';
 end if;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,c,auth.uid(),'pw_'||operation,'pw_snapshot',s.id::text,
  jsonb_build_object('file',s.file_name,'count',coalesce(count_rows,s.record_count)));
 return jsonb_build_object('id',s.id,'ok',true);
end $function$;

commit;
