-- Fix 57014/HTTP 500: keep retention off the atomic publish transaction.

-- Matches live functions in Supabase migration 20261026134520; ledger and ownership guards retained.

begin;

CREATE OR REPLACE FUNCTION private.grcon_allocation_registry_publish(target_workspace uuid, upload_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 s private.grcon_allocation_registry_snapshots;
 active_id uuid;
 total integer;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
  raise exception 'Sem permissão para publicar.' using errcode='42501';
 end if;

 perform 1 from public.grcon_workspaces where id=target_workspace for update;
 select * into s from private.grcon_allocation_registry_snapshots
 where id=upload_id and workspace_id=target_workspace
   and status in ('pending','active') and created_by=auth.uid()
 for update;
 if not found then raise exception 'Envio indisponível.' using errcode='22023'; end if;
 if s.status='active' then return upload_id; end if;

 select id into active_id from private.grcon_allocation_registry_snapshots
 where workspace_id=target_workspace and status='active';
 if active_id is distinct from s.expected_active then
  raise exception 'Outro usuário publicou uma nova Central de alocação. Recarregue e revise sua prévia antes de publicar novamente.'
   using errcode='PT409';
 end if;

 select count(*) into total from private.grcon_allocation_registry_rows
 where snapshot_id=upload_id;
 if total<>s.expected_count then
  raise exception 'Carga incompleta: % de % registros.',total,s.expected_count using errcode='22023';
 end if;
 if not exists (
  select 1 from private.grcon_allocation_registry_rows
  where snapshot_id=upload_id and length(btrim(coalesce(payload->>'allocationStatus','')))>0
 ) then
  raise exception 'Central de alocação sem status registrado.' using errcode='22023';
 end if;

 update private.grcon_allocation_registry_snapshots
  set status='archived' where workspace_id=target_workspace and status='active';
 update private.grcon_allocation_registry_snapshots
  set status='active', record_count=total, published_at=now() where id=upload_id;
 insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,auth.uid(),'allocation_registry_published','allocation_registry',upload_id::text,
  jsonb_build_object('arquivo',s.file_name,'registros',total,'checksum',s.metadata->>'checksum'));

 -- Não executar DELETE/cascade/ledger neste RPC: causava statement_timeout e rollback da publicação.
 -- Versões vencidas são removidas por tarefa separada, com limite de lotes.
 return upload_id;
end; $function$
;

CREATE OR REPLACE FUNCTION private.grcon_allocation_numbers_from_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if TG_OP='DELETE' then
  -- Exclusão direta da versão ativa ainda preserva os códigos.
  if OLD.status='active' then
   perform private.grcon_remember_allocation_numbers(OLD.id);
  end if;
  return OLD;
 end if;
 perform private.grcon_remember_allocation_numbers(NEW.id);
 return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION private.grcon_allocation_registry_prune_batch(max_snapshots integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 expired record;
 removed integer:=0;
begin
 for expired in
  select s.id
  from private.grcon_allocation_registry_snapshots s
  where (s.status='archived' and s.published_at<now()-interval '7 days')
     or (s.status='pending' and s.created_at<now()-interval '1 day')
  order by coalesce(s.published_at,s.created_at),s.id
  limit least(greatest(coalesce(max_snapshots,1),1),2)
  for update skip locked
 loop
  delete from private.grcon_allocation_registry_snapshots where id=expired.id;
  removed:=removed+1;
 end loop;
 return removed;
end; $function$
;

revoke all on function private.grcon_allocation_registry_prune_batch(integer) from public,anon,authenticated;

commit;

