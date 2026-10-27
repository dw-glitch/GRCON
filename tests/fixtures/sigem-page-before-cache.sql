CREATE OR REPLACE FUNCTION private.grcon_sigem_query_page(target_workspace uuid, target_snapshot uuid, after_row integer DEFAULT 0, page_size integer DEFAULT 1000)
 RETURNS TABLE(row_number integer, payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso à área de trabalho.' using errcode='42501'; end if;
 if not exists(
   select 1 from private.grcon_sigem_query_snapshots s
   where s.id=target_snapshot and s.workspace_id=target_workspace
     and s.status in ('active','archived') and s.deleted_at is null
 ) then raise exception 'Versão indisponível.' using errcode='22023'; end if;
 return query
 select r.row_number,r.payload
 from private.grcon_sigem_query_rows r
 where r.snapshot_id=target_snapshot and r.row_number>coalesce(after_row,0)
 order by r.row_number
 limit least(greatest(coalesce(page_size,1000),1),1000);
end $function$
