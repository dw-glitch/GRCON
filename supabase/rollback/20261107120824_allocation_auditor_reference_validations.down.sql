-- ROLLBACK da migração 20261107120824_allocation_auditor_reference_validations.sql (RA-07).
-- Fora de supabase/migrations de propósito: nunca é aplicado automaticamente; exige autorização explícita do proprietário.
-- Remove as funções e a tabela. A tabela só é removida se estiver vazia, ou com
--   set local app.confirm_drop_validations='sim';
-- depois de EXPORTAR os registros (eles são a evidência de validação das referências).
drop function if exists public.grcon_allocation_reference_validations(uuid,text,jsonb);
drop function if exists private.grcon_allocation_reference_validations(uuid,text,jsonb);
do $drop$
declare n bigint:=0;
begin
 if to_regclass('private.grcon_allocation_reference_validations') is not null then
  execute 'select count(*) from private.grcon_allocation_reference_validations' into n;
  if n>0 and coalesce(current_setting('app.confirm_drop_validations',true),'')<>'sim' then
   raise exception 'Há % registro(s) de validação. Exporte-os e defina app.confirm_drop_validations=''sim'' para removê-los.',n;
  end if;
  drop table private.grcon_allocation_reference_validations;
 end if;
end $drop$;
