begin;
create table if not exists private.grcon_document_tasks (
 workspace_id uuid not null references public.grcon_workspaces(id),
 contract_id uuid not null references public.grcon_contracts(id),
 document_key text not null, document_code text not null,
 priority text not null default 'normal' check(priority in('normal','alta','urgente')),
 responsible text not null default '' check(length(responsible)<=160),
 due_date date, note text not null default '' check(length(note)<=2000),
 version integer not null default 1, updated_by uuid not null, updated_at timestamptz not null default now(),
 primary key(contract_id,document_key)
);
alter table private.grcon_document_tasks enable row level security;
revoke all on private.grcon_document_tasks from public,anon,authenticated;
create or replace function private.grcon_document_tasks(target_workspace uuid,operation text,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; member_role text; k text; d text; previous private.grcon_document_tasks; saved private.grcon_document_tasks; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sessão necessária.' using errcode='42501'; end if;
 select m.contract_id,m.role into c,member_role from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>12000 then raise exception 'Dados inválidos.'; end if;
 if operation='list' then
  select coalesce(jsonb_agg(to_jsonb(t) order by document_key),'[]') into result from
   (select * from private.grcon_document_tasks where workspace_id=target_workspace and contract_id=c and document_key>coalesce(input->>'after','') order by document_key limit 1000)t;
  return result;
 end if;
 if operation<>'save' then raise exception 'Operação desconhecida.'; end if;
 if member_role not in('owner','admin','operator') then raise exception 'Sem permissão para organizar pendências.' using errcode='42501'; end if;
 d:=btrim(coalesce(input->>'document','')); k:=private.grcon_master_document_key(d);
 if length(d) not between 1 and 255 then raise exception 'Documento inválido.'; end if;
 if coalesce(input->>'priority','normal') not in('normal','alta','urgente') then raise exception 'Prioridade inválida.'; end if;
 -- The contract lock also serializes first creation, without a missing-row race.
 perform 1 from public.grcon_contracts where id=c for update;
 select * into previous from private.grcon_document_tasks where contract_id=c and document_key=k;
 if coalesce(previous.version,0)<>coalesce((input->>'expectedVersion')::integer,0) then raise exception 'Outro usuário alterou esta organização. Atualize antes de salvar.' using errcode='40001'; end if;
 insert into private.grcon_document_tasks(workspace_id,contract_id,document_key,document_code,priority,responsible,due_date,note,version,updated_by)
 values(target_workspace,c,k,d,coalesce(input->>'priority','normal'),coalesce(input->>'responsible',''),nullif(input->>'dueDate','')::date,coalesce(input->>'note',''),coalesce(previous.version,0)+1,auth.uid())
 on conflict(contract_id,document_key) do update set priority=excluded.priority,responsible=excluded.responsible,due_date=excluded.due_date,note=excluded.note,version=excluded.version,updated_by=excluded.updated_by,updated_at=now() returning * into saved;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,c,auth.uid(),'document_task_saved','document_task',k,jsonb_build_object('document_code',d,'version',saved.version,'priority',saved.priority));
 return to_jsonb(saved);
end $$;
create or replace function public.grcon_document_tasks(target_workspace uuid,operation text,input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.grcon_document_tasks(target_workspace,operation,input);$$;
revoke all on function private.grcon_document_tasks(uuid,text,jsonb),public.grcon_document_tasks(uuid,text,jsonb) from public,anon;
grant execute on function private.grcon_document_tasks(uuid,text,jsonb),public.grcon_document_tasks(uuid,text,jsonb) to authenticated;
commit;
