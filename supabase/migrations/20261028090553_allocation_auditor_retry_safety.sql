-- A lost finish response must not invalidate an identical retry.
create or replace function private.grcon_allocation_auditor(target_workspace uuid, operation text, input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c uuid;r text;v private.grcon_allocation_audit_runs;rid uuid;item jsonb;items jsonb;n integer;first_row integer;
begin
 if u is null then raise exception 'Sessão necessária.' using errcode='42501'; end if;
 select m.contract_id,m.role into c,r from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=u and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>2000000 then raise exception 'Entrada inválida.';end if;
 if operation='history' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (select id,metadata,expected_count,created_at,completed_at,created_by from private.grcon_allocation_audit_runs where contract_id=c order by created_at desc limit 50 offset greatest(0,least(5000,coalesce((input->>'after')::integer,0)))) q;
  return jsonb_build_object('runs',items);
 end if;
 if operation in ('begin','chunk','finish','event') and r not in ('owner','admin','operator') then raise exception 'Perfil sem permissão de escrita.' using errcode='42501';end if;
 if operation='begin' then
  n:=(input->>'count')::integer;
  if n is null or n not between 1 and 50000 or jsonb_typeof(input->'metadata') is distinct from 'object' or octet_length((input->'metadata')::text)>64000 then raise exception 'Metadados inválidos.';end if;
  insert into private.grcon_allocation_audit_runs(workspace_id,contract_id,request_id,created_by,expected_count,metadata)
  values(target_workspace,c,(input->>'requestId')::uuid,u,n,input->'metadata') on conflict do nothing returning id into rid;
  select * into v from private.grcon_allocation_audit_runs where contract_id=c and created_by=u and request_id=(input->>'requestId')::uuid;
  if v.expected_count<>n or v.metadata is distinct from input->'metadata' then raise exception 'Requisição já utilizada com conteúdo diferente.';end if;
  return jsonb_build_object('id',v.id);
 end if;
 select * into v from private.grcon_allocation_audit_runs where id=(input->>'id')::uuid and contract_id=c and workspace_id=target_workspace for update;
 if not found then raise exception 'Análise indisponível.' using errcode='42501';end if;
 if operation='detail' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.row_number),'[]') into items from (select row_number,payload from private.grcon_allocation_audit_rows where run_id=v.id and row_number>greatest(0,coalesce((input->>'after')::integer,0)) order by row_number limit 200) q;
  return jsonb_build_object('run',to_jsonb(v),'rows',items,'events',(select coalesce(jsonb_agg(payload||jsonb_build_object('actor',created_by,'at',created_at) order by created_at),'[]') from private.grcon_allocation_audit_events where run_id=v.id));
 end if;
 if operation in ('chunk','finish') and v.created_by<>u then raise exception 'Somente o autor pode completar a análise.' using errcode='42501';end if;
 if operation='chunk' then
  first_row:=(input->>'first')::integer;
  if jsonb_typeof(input->'rows') is distinct from 'array' or jsonb_array_length(input->'rows') not between 1 and 200 or first_row is null or first_row<1 or first_row+jsonb_array_length(input->'rows')-1>v.expected_count then raise exception 'Lote inválido.';end if;
  if v.completed_at is not null then
   if (select count(*) from jsonb_array_elements(input->'rows') with ordinality a(value,n)
     join private.grcon_allocation_audit_rows old on old.run_id=v.id and old.row_number=first_row+a.n-1 and old.payload=a.value)=jsonb_array_length(input->'rows') then
    return jsonb_build_object('ok',true,'reused',true);
   end if;
   raise exception 'Análise concluída é imutável.';
  end if;
  for item in select value from jsonb_array_elements(input->'rows') loop
   if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>100000 or length(coalesce(item->>'document','')) not between 1 and 255 or item->>'contract' is distinct from c::text then raise exception 'Registro inválido.';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(input->'rows') with ordinality a(value,n) join private.grcon_allocation_audit_rows old on old.run_id=v.id and old.row_number=first_row+a.n-1 where old.payload is distinct from a.value) then raise exception 'Lote imutável já recebido com outro conteúdo.';end if;
  insert into private.grcon_allocation_audit_rows select v.id,first_row+a.n::integer-1,a.value from jsonb_array_elements(input->'rows') with ordinality a(value,n) on conflict do nothing;
  return jsonb_build_object('ok',true);
 elsif operation='finish' then
  if (select count(*) from private.grcon_allocation_audit_rows where run_id=v.id)<>v.expected_count then raise exception 'Análise incompleta.';end if;
  update private.grcon_allocation_audit_runs set completed_at=coalesce(completed_at,now()) where id=v.id;
  return jsonb_build_object('ok',true);
 elsif operation='event' then
  item:=input->'event';
  if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>16000 or length(btrim(coalesce(item->>'justification','')))<5 or coalesce(item->>'state','') not in ('Aberto','Correção proposta','Corrigido na origem','Reapresentado','Aguardando avaliação','Resolvido com evidência','Aceito com ressalvas','Exceção justificada','Não comprovado') then raise exception 'Decisão incompleta.';end if;
  if coalesce(item->>'decision','proposed') not in ('proposed','accepted','rejected','exception') or coalesce(item->>'field','') not in ('','title','databook','tag','eap','discipline') then raise exception 'Decisão inválida.';end if;
  if item->>'decision'='accepted' and item->>'field' in ('databook','tag','eap','discipline') and (jsonb_typeof(item->'evidence') is distinct from 'array' or jsonb_array_length(item->'evidence')=0) then raise exception 'Evidência de classificação obrigatória.';end if;
  if not exists(select 1 from private.grcon_allocation_audit_rows where run_id=v.id and payload->>'lineage'=item->>'lineage' and payload->>'document'=item->>'document') then raise exception 'Documento não pertence à análise.';end if;
  if item->>'state' in ('Corrigido na origem','Resolvido com evidência','Exceção justificada') and (jsonb_typeof(item->'evidence') is distinct from 'array' or jsonb_array_length(item->'evidence')=0) then raise exception 'Evidência obrigatória.';end if;
  item:=item-'actor'-'at';
  if exists(select 1 from private.grcon_allocation_audit_events where run_id=v.id and created_by=u and request_id=(input->>'requestId')::uuid and payload is distinct from item) then raise exception 'Decisão idempotente divergente.';end if;
  insert into private.grcon_allocation_audit_events(run_id,request_id,payload,created_by) values(v.id,(input->>'requestId')::uuid,item,u) on conflict do nothing;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operação não reconhecida.';
end $$;
