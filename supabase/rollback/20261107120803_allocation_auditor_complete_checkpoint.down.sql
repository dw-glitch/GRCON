-- ROLLBACK da migração 20261107120803_allocation_auditor_complete_checkpoint.sql
-- NÃO está em supabase/migrations de propósito: nunca é aplicado automaticamente. Só roda com autorização explícita do proprietário.
-- Desfaz exatamente o que a migração faz: (1) remove da função privada o bloco acrescentado (operações input-chunk/input-detail e a
-- conferência de entrada em chunk/finish) e (2) remove a tabela de entradas. Execute numa transação e CONFIRA o resultado antes do COMMIT.
-- Antes de aplicar em produção: homologar este script num banco de homologação; exportar o conteúdo de
-- private.grcon_allocation_audit_inputs se houver linhas que precisem ser preservadas.
-- Referência (produção, leitura somente-leitura em 06/11/2026, antes da migração): função com 7318 caracteres e md5 34c59c9fddfaade8ef378b54a6dfa470.

do $rollback$
declare
 definition text;
 start_marker text:=' if operation in (''input-chunk'',''input-detail'') then';
 end_marker text:=' if operation=''history'' then';
 a integer;b integer;
begin
 select pg_get_functiondef('private.grcon_allocation_auditor(uuid,text,jsonb)'::regprocedure) into definition;
 a:=position(start_marker in definition);
 if a=0 then
  raise notice 'O bloco do checkpoint já não está na função; nada a remover.';
 else
  -- o bloco termina no marcador original de "history" que a migração deixou intacto depois dele
  b:=position(end_marker in substr(definition,a));
  if b=0 then raise exception 'Marcador final não encontrado: a função foi alterada depois da migração; revise manualmente.';end if;
  -- a migração inseriu uma quebra de linha logo antes do bloco; ela também sai para o texto voltar idêntico ao original
  if a>1 and substr(definition,a-1,1)=chr(10) then a:=a-1;b:=b+1;end if;
  definition:=substr(definition,1,a-1)||substr(definition,a+b-1);
  execute definition;
 end if;
end $rollback$;

-- A tabela só é removida se estiver vazia, ou se o operador confirmar que exportou os dados:
--   set local app.confirm_drop_inputs='sim';
do $drop$
declare n bigint:=0;
begin
 if to_regclass('private.grcon_allocation_audit_inputs') is not null then
  execute 'select count(*) from private.grcon_allocation_audit_inputs' into n;
  if n>0 and coalesce(current_setting('app.confirm_drop_inputs',true),'')<>'sim' then
   raise exception 'Há % linha(s) de entrada salvas em grcon_allocation_audit_inputs. Exporte-as e defina app.confirm_drop_inputs=''sim'' para removê-las.',n;
  end if;
  drop table private.grcon_allocation_audit_inputs;
 end if;
end $drop$;

-- Conferência pós-rollback (deve retornar has_checkpoint_block=false e inputs_table=null):
-- select position('input-chunk' in pg_get_functiondef('private.grcon_allocation_auditor(uuid,text,jsonb)'::regprocedure))>0 as has_checkpoint_block,
--        to_regclass('private.grcon_allocation_audit_inputs') as inputs_table,
--        md5(pg_get_functiondef('private.grcon_allocation_auditor(uuid,text,jsonb)'::regprocedure)) as md5;
