begin;
-- Keep legacy free-text names only when the assignee field was not touched.
-- A new overdue alert reflects changes to every task field displayed in its message.
create or replace function private.grcon_document_tasks(target_workspace uuid,operation text,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; member_role text; k text; d text; previous private.grcon_document_tasks; saved private.grcon_document_tasks; result jsonb; assignee uuid; author uuid; sent jsonb;
begin
 if auth.uid() is null then raise exception 'Sessão necessária.' using errcode='42501'; end if;
 select m.contract_id,m.role into c,member_role from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>12000 then raise exception 'Dados inválidos.'; end if;
 if operation='users' then
  return (select coalesce(jsonb_agg(to_jsonb(u) order by u.name,u.id),'[]') from
    (select p.id,coalesce(nullif(p.display_name,''),split_part(p.email,'@',1),'Usuário') as name
     from public.grcon_profiles p where exists(select 1 from public.grcon_memberships m where m.user_id=p.id and m.active)) u);
 end if;
 if operation='get' then
  select * into saved from private.grcon_document_tasks t where t.contract_id=(input->>'contractId')::uuid
   and t.document_key=private.grcon_master_document_key(input->>'document')
   and (t.created_by=auth.uid() or t.assignee_id=auth.uid() or (t.workspace_id=target_workspace and t.contract_id=c));
  if not found then raise exception 'Gerenciamento não encontrado ou sem acesso.' using errcode='42501'; end if;
  return to_jsonb(saved);
 end if;
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
 if previous.created_by is not null and previous.created_by<>auth.uid() then raise exception 'Somente quem criou o prazo pode alterar este gerenciamento.' using errcode='42501'; end if;
 if coalesce(previous.version,0)<>coalesce((input->>'expectedVersion')::integer,0) then raise exception 'Outro usuário alterou esta organização. Atualize antes de salvar.' using errcode='40001'; end if;
 assignee:=case when input ? 'assigneeId' then nullif(input->>'assigneeId','')::uuid else previous.assignee_id end;
 if assignee is not null and not exists(select 1 from public.grcon_memberships where user_id=assignee and active) then raise exception 'Selecione um usuário ativo do GRCON.'; end if;
 if nullif(input->>'dueDate','') is not null and assignee is null then raise exception 'Selecione o responsável pelo prazo.'; end if;
 select f into sent from public.grcon_history h cross join lateral jsonb_array_elements(coalesce(h.payload->'files','[]')) f
 where h.workspace_id=target_workspace and h.contract_id=c and h.deleted_at is null and private.grcon_master_document_key(f->>'document')=k
 order by h.generated_at desc,h.id desc limit 1;
 insert into private.grcon_document_tasks(workspace_id,contract_id,document_key,document_code,priority,responsible,due_date,note,version,updated_by,created_by,assignee_id,revision_sent,grdt_title)
 values(target_workspace,c,k,d,coalesce(input->>'priority','normal'),
 case when assignee is null then case when not(input ? 'assigneeId') and previous.assignee_id is null then coalesce(previous.responsible,'') else '' end else coalesce((select coalesce(nullif(display_name,''),split_part(email,'@',1)) from public.grcon_profiles where id=assignee),'') end,
 nullif(input->>'dueDate','')::date,coalesce(input->>'note',''),coalesce(previous.version,0)+1,auth.uid(),coalesce(previous.created_by,auth.uid()),assignee,
 private.grcon_revision_key(coalesce(nullif(sent->>'grdtRevision',''),sent->>'revision',input->>'revisionSent',previous.revision_sent,'')),coalesce(sent->>'title',input->>'grdtTitle',previous.grdt_title,''))
 on conflict(contract_id,document_key) do update set priority=excluded.priority,responsible=excluded.responsible,due_date=excluded.due_date,note=excluded.note,version=excluded.version,updated_by=excluded.updated_by,updated_at=now(),deadline_version=case when grcon_document_tasks.due_date is distinct from excluded.due_date or grcon_document_tasks.revision_sent is distinct from excluded.revision_sent or grcon_document_tasks.assignee_id is distinct from excluded.assignee_id or grcon_document_tasks.responsible is distinct from excluded.responsible or grcon_document_tasks.priority is distinct from excluded.priority or grcon_document_tasks.document_code is distinct from excluded.document_code then grcon_document_tasks.deadline_version+1 else grcon_document_tasks.deadline_version end,assignee_id=excluded.assignee_id,revision_sent=excluded.revision_sent,grdt_title=excluded.grdt_title returning * into saved;
 if assignee is not null and (previous.assignee_id is distinct from assignee or previous.due_date is distinct from saved.due_date or previous.priority is distinct from saved.priority) then
  insert into public.grcon_notifications(workspace_id,contract_id,event_key,kind,severity,title,message,document_code,document_key,link_target,created_by,recipient_id)
  values(target_workspace,c,'document-task-assigned:'||c||':'||k||':'||saved.version,'DOCUMENT_TASK_ASSIGNED',case when saved.priority='urgente' then 'high' else 'info' end,
   'Documento atribuído a você',d||' · Prioridade: '||saved.priority||' · Prazo: '||coalesce(to_char(saved.due_date,'DD/MM/YYYY'),'não definido')||' (horário de Brasília).',d,k,'document-task:'||c||':'||d,auth.uid(),assignee) on conflict(event_key) do nothing;
 end if;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,c,auth.uid(),'document_task_saved','document_task',k,jsonb_build_object('document_code',d,'version',saved.version,'priority',saved.priority));
 return to_jsonb(saved);
end $$;
commit;
