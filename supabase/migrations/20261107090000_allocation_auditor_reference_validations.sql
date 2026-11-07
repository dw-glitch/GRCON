-- Registro de validações e homologações de referências do Robô Auditor (RA-07).
-- LOCALIZADO ≠ CARREGADO ≠ VALIDADO ≠ HOMOLOGADO: sem um registro humano (responsável, data e evidência) uma referência nunca passa de "carregada".
-- Só proprietário/administrador do contrato registra ou revoga; qualquer membro lê. Registros são append-only: revogar não apaga.
-- Esta migração NÃO é aplicada automaticamente em produção; o frontend degrada com aviso quando ela ainda não existe.
create table private.grcon_allocation_reference_validations (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.grcon_workspaces(id),
 contract_id uuid not null references public.grcon_contracts(id),
 request_id uuid not null,
 record_type text not null check(record_type in ('validacao','homologacao')),
 kind text not null check(kind in ('et-codificacao','n-1710','n-381','anexo-i-apendice-3','anexo-iii-apendice-a','caminho-data-book','caminho-das-pastas','workflows-uhdt-d','memorial-uhdt-d')),
 revision text check(revision is null or length(btrim(revision)) between 1 and 20),
 sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
 responsible text not null check(length(btrim(responsible)) between 3 and 120),
 validated_on date not null,
 evidence text not null check(length(btrim(evidence)) between 5 and 2000),
 effective_date text check(effective_date is null or effective_date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'),
 effective_evidence text check(effective_evidence is null or length(btrim(effective_evidence)) between 5 and 2000),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 revoked_at timestamptz, revoked_by uuid, revoke_reason text,
 check((effective_date is null)=(effective_evidence is null)),
 check(kind<>'et-codificacao' or revision is not null), -- a revisão da ET nunca é presumida
 check((revoked_at is null)=(revoked_by is null)),
 unique(contract_id,created_by,request_id)
);
create index grcon_allocation_reference_validations_contract on private.grcon_allocation_reference_validations(contract_id,created_at desc);
alter table private.grcon_allocation_reference_validations enable row level security;
revoke all on private.grcon_allocation_reference_validations from public,anon,authenticated;

create function private.grcon_allocation_reference_validations(target_workspace uuid,operation text,input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c uuid;r text;v private.grcon_allocation_reference_validations;items jsonb;n integer;kind_ text;
begin
 if u is null then raise exception 'Sessão necessária.' using errcode='42501'; end if;
 select m.contract_id,m.role into c,r from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=u and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>20000 then raise exception 'Entrada inválida.';end if;
 if operation='list' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') into items from (
   select id,record_type,kind,revision,sha256,responsible,validated_on,evidence,effective_date,effective_evidence,created_by,created_at
   from private.grcon_allocation_reference_validations where contract_id=c and revoked_at is null order by created_at desc limit 500) q;
  return jsonb_build_object('validations',items,'canRegister',r in ('owner','admin'));
 end if;
 if operation in ('register','revoke') and r not in ('owner','admin') then raise exception 'Somente o proprietário ou administrador do contrato registra validações.' using errcode='42501';end if;
 if operation='register' then
  kind_:=input->>'kind';
  if coalesce(input->>'recordType','') not in ('validacao','homologacao') or kind_ is null then raise exception 'Tipo de registro inválido.';end if;
  if length(btrim(coalesce(input->>'responsible','')))<3 or length(btrim(coalesce(input->>'evidence','')))<5 then raise exception 'Responsável e evidência são obrigatórios.';end if;
  if kind_='et-codificacao' and length(btrim(coalesce(input->>'revision','')))=0 then raise exception 'A revisão da ET deve ser informada; ela nunca é presumida.';end if;
  if (input->>'validatedOn') is null or (input->>'validatedOn')::date>current_date+1 then raise exception 'Data da validação inválida.';end if;
  select count(*) into n from private.grcon_allocation_reference_validations where contract_id=c and revoked_at is null;
  if n>=500 then raise exception 'Limite de registros ativos atingido.';end if;
  begin
   insert into private.grcon_allocation_reference_validations(workspace_id,contract_id,request_id,record_type,kind,revision,sha256,responsible,validated_on,evidence,effective_date,effective_evidence,created_by)
   values(target_workspace,c,(input->>'requestId')::uuid,input->>'recordType',kind_,nullif(btrim(coalesce(input->>'revision','')),''),nullif(input->>'sha256',''),btrim(input->>'responsible'),(input->>'validatedOn')::date,btrim(input->>'evidence'),nullif(input->>'effectiveDate',''),nullif(btrim(coalesce(input->>'effectiveEvidence','')),''),u)
   on conflict(contract_id,created_by,request_id) do nothing returning * into v;
  exception when check_violation then raise exception 'Registro inválido: confira tipo, revisão, hash e vigência.';
  end;
  if v.id is null then
   -- reenvio da mesma requisição: só vale se o conteúdo for idêntico
   select * into v from private.grcon_allocation_reference_validations where contract_id=c and created_by=u and request_id=(input->>'requestId')::uuid;
   if v.kind is distinct from kind_ or v.record_type is distinct from input->>'recordType' or v.evidence is distinct from btrim(input->>'evidence') or v.responsible is distinct from btrim(input->>'responsible') then raise exception 'Requisição já utilizada com conteúdo diferente.';end if;
  end if;
  return jsonb_build_object('id',v.id);
 end if;
 if operation='revoke' then
  if length(btrim(coalesce(input->>'reason','')))<5 then raise exception 'Motivo da revogação obrigatório.';end if;
  update private.grcon_allocation_reference_validations set revoked_at=now(),revoked_by=u,revoke_reason=btrim(input->>'reason')
  where id=(input->>'id')::uuid and contract_id=c and revoked_at is null returning * into v;
  if v.id is null then raise exception 'Registro indisponível ou já revogado.';end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operação não reconhecida.';
end $$;
revoke all on function private.grcon_allocation_reference_validations(uuid,text,jsonb) from public,anon;
grant execute on function private.grcon_allocation_reference_validations(uuid,text,jsonb) to authenticated;
create function public.grcon_allocation_reference_validations(target_workspace uuid,operation text,input jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.grcon_allocation_reference_validations(target_workspace,operation,input)$$;
revoke all on function public.grcon_allocation_reference_validations(uuid,text,jsonb) from public,anon;
grant execute on function public.grcon_allocation_reference_validations(uuid,text,jsonb) to authenticated;
comment on function public.grcon_allocation_reference_validations(uuid,text,jsonb) is 'Auditor: registro humano de validação/homologação de referências (responsável, data e evidência); append-only.';
