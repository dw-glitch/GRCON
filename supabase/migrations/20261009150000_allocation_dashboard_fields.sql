-- GRCON Dashboard de Alocação — extensão aditiva de datas, fiscalização e ação.\n-- Aplicar após 20261008123900_consultas_fiscal01_comments.sql.
-- Extensão aditiva à lista de campos permitidos; as verificações de workspace,
-- proprietário, limites de lote e RLS permanecem idênticas à versão anterior.
begin;
create or replace function private.grcon_allocation_registry_chunk(target_workspace uuid,upload_id uuid,first_row integer,rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare s private.grcon_allocation_registry_snapshots; total integer;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then raise exception 'Sem permissão para publicar.' using errcode='42501'; end if;
 select * into s from private.grcon_allocation_registry_snapshots where id=upload_id and workspace_id=target_workspace and status='pending' and created_by=auth.uid() for update;
 if not found then raise exception 'Envio indisponível.' using errcode='22023'; end if;
 if jsonb_typeof(rows) is distinct from 'array' then raise exception 'Lote inválido.' using errcode='22023'; end if;
 if first_row is null or first_row<1 or jsonb_array_length(rows) not between 1 and 500 or first_row+jsonb_array_length(rows)-1>s.expected_count or octet_length(rows::text)>4000000 then raise exception 'Lote ou contagem inválida.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(rows) r
   where jsonb_typeof(r) is distinct from 'object'
      or length(btrim(coalesce(r->>'document',''))) not between 7 and 255
      or coalesce(r->>'document','') !~ '[0-9]'
      or jsonb_typeof(r->'sourceRow') is distinct from 'number'
      or coalesce(r->>'sourceRow','') !~ '^[1-9][0-9]{0,6}$'
      or case when coalesce(r->>'sourceRow','') ~ '^[1-9][0-9]{0,6}$' then (r->>'sourceRow')::integer > 1048576 else false end
      or r - array['document','allocation','allocationStatus','workflow','active','databook','ldSheet','ldVersion','sentAt','fiscalComment','fiscal1ReturnedAt','fiscal2ReturnedAt','fiscal2Comment','plannedAt','action','baselineAt','originalPurpose','critical','remarks','signal','sourceRow'] <> '{}'::jsonb
      or exists(select 1 from jsonb_each(r) f
        where f.key <> 'sourceRow' and (jsonb_typeof(f.value) is distinct from 'string'
          or length(f.value#>>'{}') > case when f.key in ('fiscalComment','fiscal2Comment','remarks') then 8192 when f.key='databook' then 2048 when f.key='allocationStatus' then 1024 else 255 end)))
 then raise exception 'Vínculo documental ou campos inválidos.' using errcode='22023'; end if;
 insert into private.grcon_allocation_registry_rows(snapshot_id,row_number,payload) select upload_id,first_row+n::integer-1,r from jsonb_array_elements(rows) with ordinality as t(r,n) on conflict(snapshot_id,row_number) do update set payload=excluded.payload;
 select count(*) into total from private.grcon_allocation_registry_rows where snapshot_id=upload_id;
 return total;
end; $$;
commit;
