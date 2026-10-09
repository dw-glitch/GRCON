-- Additive: official SIGEM evidence and historical payloads are never rewritten.
create table private.grcon_teams_attempts (
 id uuid primary key, workspace_id uuid not null references public.grcon_workspaces(id),
 contract_id uuid not null references public.grcon_contracts(id), history_id uuid not null,
 client_record_id text, egrdt_number text not null, contract_code text not null,
 documents jsonb not null, requested_by uuid not null, requested_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '7 days'),
 delivery_status text not null default 'requested' check(delivery_status in ('requested','accepted','delivered','failed','expired')),
 delivered_at timestamptz, teams_created_at timestamptz, accepted_at timestamptz, destination text not null default 'Qualidade - Documentação',
 conversation_id text, message_id text, message_url text,
 confirmation_type text check(confirmation_type in ('total','partial')), confirmed_documents jsonb,
 confirmed_by_id uuid, confirmed_by_name text, confirmed_at timestamptz,
 notice_status text not null default 'pending' check(notice_status in ('pending','sending','sent','uncertain')),
 notice_message_id text, card_updated_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table private.grcon_teams_attempts enable row level security;
revoke all on private.grcon_teams_attempts from public,anon,authenticated;
create index grcon_teams_attempts_history_idx on private.grcon_teams_attempts(workspace_id,history_id,requested_at desc);
create index grcon_teams_attempts_updates_idx on private.grcon_teams_attempts(workspace_id,updated_at,id);
create table private.grcon_teams_events (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null references private.grcon_teams_attempts(id),
 kind text not null, actor_id text, created_at timestamptz not null default now(), metadata jsonb not null default '{}'
);
alter table private.grcon_teams_events enable row level security;
revoke all on private.grcon_teams_events from public,anon,authenticated;
create index grcon_teams_events_attempt_idx on private.grcon_teams_events(attempt_id,created_at);

-- Restricted entry point, called only by the Worker after validating GRCON or
-- trusted Power Automate credentials. Authorization is repeated inside Postgres.
create function public.grcon_teams_operation(target_workspace uuid, actor_id uuid, operation text, input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare
 a private.grcon_teams_attempts; h public.grcon_history; c public.grcon_contracts;
 docs jsonb; chosen jsonb; aid uuid; who uuid; person text; n integer; fresh boolean:=false;
begin
 if operation in ('start','page','detail') then
  if actor_id is null or not exists(select 1 from public.grcon_memberships m where m.workspace_id=target_workspace and m.user_id=actor_id and m.active and m.role in ('owner','admin','operator','viewer')) then
   raise exception 'Sem acesso ao contrato.' using errcode='42501';
  end if;
 end if;
 if operation='page' then
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at,t.id) from
   (select * from private.grcon_teams_attempts where workspace_id=target_workspace
     and (updated_at,id) > (coalesce(nullif(input->>'afterTime','')::timestamptz,'epoch'),coalesce(nullif(input->>'afterId','')::uuid,'00000000-0000-0000-0000-000000000000'))
     order by updated_at,id limit 500) t),'[]'::jsonb);
 end if;
 aid := (input->>'attemptId')::uuid;
 if operation='start' then
  if not exists(select 1 from public.grcon_memberships m where m.workspace_id=target_workspace and m.user_id=actor_id and m.active and m.role in ('owner','admin','operator')) then raise exception 'Sem permissão para enviar.' using errcode='42501'; end if;
  select * into h from public.grcon_history where workspace_id=target_workspace and deleted_at is null
   and (id::text=input->>'historyRecordId' or client_record_id=input->>'clientRecordId') limit 1;
  if h.id is null then raise exception 'eGRDT não sincronizada no histórico deste contrato.'; end if;
  select * into c from public.grcon_contracts where workspace_id=target_workspace and active;
  if c.id is null or (h.contract_id is not null and h.contract_id<>c.id) then raise exception 'Contrato inválido.'; end if;
  select coalesce(jsonb_agg(d order by d->>'document',d->>'revision'),'[]') into docs from (
   select jsonb_build_object('document',upper(btrim(f->>'document')),'revision',upper(coalesce(nullif(btrim(f->>'grdtRevision'),''),nullif(btrim(f->>'revision'),''),'0')),
    'discipline',string_agg(distinct coalesce(f->>'discipline',''),' / '),'purpose',string_agg(distinct coalesce(f->>'purpose',''),' / ')) d
   from jsonb_array_elements(coalesce(h.payload->'files','[]')) f where nullif(btrim(f->>'document'),'') is not null
   group by upper(btrim(f->>'document')),upper(coalesce(nullif(btrim(f->>'grdtRevision'),''),nullif(btrim(f->>'revision'),''),'0'))
  ) x;
  if jsonb_array_length(docs)=0 then raise exception 'eGRDT sem documentos.'; end if;
  insert into private.grcon_teams_attempts(id,workspace_id,contract_id,history_id,client_record_id,egrdt_number,contract_code,documents,requested_by)
   values(aid,target_workspace,c.id,h.id,h.client_record_id,h.egrdt_number,c.code,docs,actor_id) on conflict(id) do nothing;
  get diagnostics n=row_count; fresh:=n=1;
  select * into a from private.grcon_teams_attempts where id=aid for update;
  if a.workspace_id<>target_workspace or a.history_id<>h.id then raise exception 'Tentativa pertence a outra eGRDT.' using errcode='42501'; end if;
  if fresh then insert into private.grcon_teams_events(attempt_id,kind,actor_id) values(a.id,'SEND_REQUESTED',actor_id::text); end if;
  return jsonb_build_object('attempt',to_jsonb(a),'shouldSend',fresh);
 end if;
 select * into a from private.grcon_teams_attempts where id=aid and workspace_id=target_workspace for update;
 if a.id is null then raise exception 'Tentativa não encontrada neste contrato.'; end if;
 if operation='detail' then return jsonb_build_object('attempt',to_jsonb(a),'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from private.grcon_teams_events e where attempt_id=aid),'[]')); end if;
 if operation='claim_notice' then
  if a.confirmed_at is null then raise exception 'Postagem ainda não confirmada.'; end if;
  update private.grcon_teams_attempts set notice_status='sending',updated_at=now() where id=aid and notice_status='pending';
  get diagnostics n=row_count;
  insert into private.grcon_teams_events(attempt_id,kind) values(aid,case when n=1 then 'NOTICE_CLAIMED' else 'NOTICE_CLAIM_REPEATED' end);
  return jsonb_build_object('publishConfirmation',n=1,'noticeStatus',case when n=1 then 'sending' else a.notice_status end);
 elsif operation in ('notice_sent','notice_uncertain','card_updated') then
  if a.confirmed_at is null then raise exception 'Postagem ainda não confirmada.'; end if;
  if input->>'messageId' is distinct from a.message_id or input->>'conversationId' is distinct from a.conversation_id then raise exception 'Cartão não corresponde à tentativa.'; end if;
  if operation='notice_sent' then
   if nullif(input->>'replyMessageId','') is null then raise exception 'Mensagem de confirmação obrigatória.'; end if;
   if a.notice_message_id is not null and a.notice_message_id<>input->>'replyMessageId' then raise exception 'Mensagem de confirmação não corresponde.'; end if;
   update private.grcon_teams_attempts set notice_status='sent',notice_message_id=input->>'replyMessageId',updated_at=now() where id=aid;
  elsif operation='notice_uncertain' then
   update private.grcon_teams_attempts set notice_status='uncertain',updated_at=now() where id=aid and notice_status<>'sent';
  else update private.grcon_teams_attempts set card_updated_at=coalesce(card_updated_at,now()),updated_at=now() where id=aid;
  end if;
  insert into private.grcon_teams_events(attempt_id,kind) values(aid,upper(operation));
 elsif operation in ('accepted','failed','expired') then
  if a.confirmed_at is null and a.delivery_status<>'expired' and (a.delivery_status<>'delivered' or operation='expired') then
   update private.grcon_teams_attempts set delivery_status=operation,accepted_at=case when operation='accepted' then now() else accepted_at end,updated_at=now() where id=aid and delivery_status<>operation;
   get diagnostics n=row_count;
   if n=1 then insert into private.grcon_teams_events(attempt_id,kind) values(aid,upper(operation)); end if;
  end if;
 elsif operation in ('delivered','confirm') then
  if nullif(input->>'messageId','') is null or nullif(input->>'conversationId','') is null then raise exception 'Cartão e conversa obrigatórios.'; end if;
  if (a.message_id is not null and a.message_id<>input->>'messageId') or (a.conversation_id is not null and a.conversation_id<>input->>'conversationId') then raise exception 'Cartão não corresponde à tentativa.'; end if;
  if a.confirmed_at is null and (a.expires_at<=now() or a.delivery_status='expired') then raise exception 'Cartão expirado.'; end if;
  if operation='confirm' then
   who := nullif(input#>>'{responder,objectId}','')::uuid;
   person := nullif(btrim(input#>>'{responder,displayName}'),'');
   if who is null or person is null then raise exception 'Identidade autenticada do Teams obrigatória.'; end if;
   if a.confirmed_at is not null then
    insert into private.grcon_teams_events(attempt_id,kind,actor_id) values(aid,'DUPLICATE_CONFIRMATION',who::text);
    return jsonb_build_object('attempt',to_jsonb(a),'duplicate',true,'publishConfirmation',a.notice_status='pending');
   end if;
   if input->>'type'='total' then chosen:=a.documents;
   elsif input->>'type'='partial' and jsonb_typeof(input->'selectedIndices')='array' then
    input:=jsonb_set(input,'{documents}',coalesce((select jsonb_agg(d) from jsonb_array_elements(a.documents) with ordinality x(d,i) where (i-1)::text in (select jsonb_array_elements_text(input->'selectedIndices'))),'[]'));
    if jsonb_array_length(input->'documents')<>jsonb_array_length(input->'selectedIndices') then raise exception 'Seleção parcial inválida.'; end if;
    select coalesce(jsonb_agg(d),'[]') into chosen from jsonb_array_elements(a.documents) d
     where exists(select 1 from jsonb_array_elements(input->'documents') s where s->>'document'=d->>'document' and s->>'revision'=d->>'revision');
    if jsonb_array_length(chosen)=0 or jsonb_array_length(chosen)>=jsonb_array_length(a.documents) or jsonb_array_length(chosen)<>jsonb_array_length(input->'documents') then raise exception 'Seleção parcial inválida ou de outra eGRDT.'; end if;
   else raise exception 'Tipo de confirmação inválido.'; end if;
   update private.grcon_teams_attempts set confirmation_type=input->>'type',confirmed_documents=chosen,confirmed_by_id=who,confirmed_by_name=left(person,160),confirmed_at=now(),updated_at=now() where id=aid;
   insert into private.grcon_teams_events(attempt_id,kind,actor_id,metadata) values(aid,'POSTING_'||upper(input->>'type'),who::text,jsonb_build_object('documents',chosen));
   insert into public.grcon_notifications(workspace_id,contract_id,event_key,kind,title,message,document_code,link_target)
    values(a.workspace_id,a.contract_id,'teams-posted:'||aid,'TEAMS_POSTING_CONFIRMED','Postagem confirmada pelo Teams',
      person||' confirmou a postagem '||case when input->>'type'='partial' then 'parcial ' else '' end||'da eGRDT '||a.egrdt_number||' ('||a.contract_code||'). Declaração do funcionário; acompanhar conferência no SIGEM.',a.egrdt_number,'history:'||a.history_id) on conflict(event_key) do nothing;
  end if;
  if nullif(input->>'postedAt','') is not null and ((input->>'postedAt')::timestamptz<a.requested_at-interval '5 minutes' or (input->>'postedAt')::timestamptz>now()+interval '5 minutes') then raise exception 'Data do cartão inválida.'; end if;
  update private.grcon_teams_attempts set teams_created_at=coalesce(teams_created_at,nullif(input->>'postedAt','')::timestamptz),delivery_status='delivered',delivered_at=coalesce(delivered_at,now()),message_id=input->>'messageId',conversation_id=input->>'conversationId',message_url=coalesce(input->>'messageUrl',message_url),updated_at=now() where id=aid;
  if a.delivered_at is null then insert into private.grcon_teams_events(attempt_id,kind) values(aid,'CARD_DELIVERED'); end if;
 else raise exception 'Operação inválida.';
 end if;
 select * into a from private.grcon_teams_attempts where id=aid;
 return jsonb_build_object('attempt',to_jsonb(a),'duplicate',false,'publishConfirmation',operation='confirm');
end $$;
revoke all on function public.grcon_teams_operation(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.grcon_teams_operation(uuid,uuid,text,jsonb) to service_role;
