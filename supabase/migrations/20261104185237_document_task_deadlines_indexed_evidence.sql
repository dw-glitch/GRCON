-- Aplicada em produção em 04/11/2026 (versão 20261104185237).
-- A verificação de prazo vencido varria 1,1 milhão de linhas (47 versões da Consulta Geral) aplicando
-- a normalização de código em cada uma e estourava o tempo limite (8 s) todo minuto.
-- Passa a procurar a evidência de postagem pelo índice da chave normalizada nos conteúdos distintos
-- (39 mil linhas) e, para versões não projetadas, pelo índice que já existe em grcon_sigem_query_rows.
-- Mesmo critério de antes: mesma normalização (grcon_master_document_key), mesma revisão, mesmas versões
-- (active/archived, não removidas) do mesmo workspace e contrato.
create index if not exists grcon_sigem_projection_master_key_idx
  on private.grcon_sigem_projection_contents (workspace_id, contract_id, private.grcon_master_document_key(content->'payload'->>'document'));

create or replace function private.grcon_document_task_deadlines() returns integer
language plpgsql security definer set search_path to ''
as $function$
declare changed integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Serviço necessário.' using errcode='42501'; end if;
 insert into public.grcon_notifications(workspace_id,contract_id,event_key,kind,severity,title,message,document_code,document_key,link_target,created_by,recipient_id)
 select t.workspace_id,t.contract_id,'document-task-overdue:'||t.contract_id||':'||t.document_key||':'||t.deadline_version,'DOCUMENT_TASK_OVERDUE','high',
 'Prazo de postagem vencido',t.document_code||' · Responsável: '||t.responsible||' · Prioridade: '||t.priority||' · Prazo: '||to_char(t.due_date,'DD/MM/YYYY')||'. A postagem da revisão '||coalesce(nullif(t.revision_sent,''),'não informada')||' ainda não foi confirmada no SIGEM.',
 t.document_code,t.document_key,'document-task:'||t.contract_id||':'||t.document_code,t.created_by,t.created_by
 from private.grcon_document_tasks t join public.grcon_contracts ct on ct.id=t.contract_id and ct.workspace_id=t.workspace_id and ct.active
 where t.due_date < (now() at time zone 'America/Sao_Paulo')::date
 and not exists(select 1 from public.grcon_notifications n where n.event_key='document-task-overdue:'||t.contract_id||':'||t.document_key||':'||t.deadline_version)
 and exists(select 1 from public.grcon_memberships m where m.user_id=t.created_by and m.active)
 and not (t.revision_sent<>'' and (
   -- versões projetadas: conteúdos distintos pelo índice da chave normalizada
   exists(select 1 from private.grcon_sigem_projection_contents d
     join private.grcon_sigem_projection_map m on m.content_id=d.id
     join private.grcon_sigem_query_snapshots s on s.id=m.snapshot_id and s.workspace_id=d.workspace_id and s.contract_id=d.contract_id
     join private.grcon_sigem_external_snapshots e on e.snapshot_id=m.snapshot_id and e.projected
     where d.workspace_id=t.workspace_id and d.contract_id=t.contract_id
       and private.grcon_master_document_key(d.content->'payload'->>'document')=t.document_key
       and d.content->>'revision_key'=t.revision_sent
       and s.status in('active','archived') and s.deleted_at is null)
   -- versões não projetadas: linhas diretas pelo índice (snapshot_id, chave normalizada)
   or exists(select 1 from private.grcon_sigem_query_snapshots s
     join private.grcon_sigem_query_rows r on r.snapshot_id=s.id
     where s.workspace_id=t.workspace_id and s.contract_id=t.contract_id and s.status in('active','archived') and s.deleted_at is null
       and not exists(select 1 from private.grcon_sigem_external_snapshots e where e.snapshot_id=s.id and e.projected)
       and private.grcon_master_document_key(r.payload->>'document')=t.document_key and r.revision_key=t.revision_sent)))
 on conflict(event_key) do nothing;
 get diagnostics changed=row_count;return changed;
end $function$;
