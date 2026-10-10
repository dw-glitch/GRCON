-- Persistent delta cursor and receipts. These are never exposed to the browser.
create table private.grcon_teams_sharepoint_sources (
 source_key text primary key, cursor text, updated_at timestamptz not null default now()
);
create table private.grcon_teams_sharepoint_receipts (
 source_key text not null references private.grcon_teams_sharepoint_sources(source_key),
 item_id text not null, fingerprint text not null, attempt_id uuid not null,
 workspace_id uuid not null, updated_at timestamptz not null default now(),
 primary key(source_key,item_id)
);
alter table private.grcon_teams_sharepoint_sources enable row level security;
alter table private.grcon_teams_sharepoint_receipts enable row level security;
revoke all on private.grcon_teams_sharepoint_sources,private.grcon_teams_sharepoint_receipts from public,anon,authenticated;

create function public.grcon_teams_sharepoint_sync(source_key text, operation text, input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare
 s private.grcon_teams_sharepoint_sources; r private.grcon_teams_sharepoint_receipts;
 a private.grcon_teams_attempts; d jsonb:=input->'data'; result jsonb; chosen jsonb;
 aid uuid; wid uuid; response_time timestamptz;
begin
 if source_key is null or length(source_key)>512 or source_key='' then raise exception 'Origem inválida.'; end if;
 insert into private.grcon_teams_sharepoint_sources(source_key) values(source_key) on conflict do nothing;
 select * into s from private.grcon_teams_sharepoint_sources x where x.source_key=grcon_teams_sharepoint_sync.source_key for update;
 if operation='state' then return jsonb_build_object('cursor',s.cursor); end if;
 if operation='cursor' then
  if s.cursor is distinct from input->>'expected' then return jsonb_build_object('advanced',false); end if;
  if length(input->>'cursor')>16000 then raise exception 'Cursor inválido.'; end if;
  update private.grcon_teams_sharepoint_sources x set cursor=input->>'cursor',updated_at=now() where x.source_key=grcon_teams_sharepoint_sync.source_key;
  return jsonb_build_object('advanced',true);
 end if;
 if operation<>'import' or coalesce(input->>'itemId','')!~'^\d+$' or coalesce(input->>'fingerprint','')!~'^[0-9a-f]{64}$' then raise exception 'Registro inválido.'; end if;
 aid:=(d->>'attemptId')::uuid; wid:=(d->>'workspaceId')::uuid;
 select * into r from private.grcon_teams_sharepoint_receipts x where x.source_key=grcon_teams_sharepoint_sync.source_key and x.item_id=input->>'itemId';
 if r.item_id is not null then
  if r.attempt_id is distinct from aid or r.workspace_id is distinct from wid then raise exception 'Registro de outra tentativa.'; end if;
  if r.fingerprint=input->>'fingerprint' then return jsonb_build_object('duplicate',true); end if;
 end if;
 select * into a from private.grcon_teams_attempts where id=aid and workspace_id=wid for update;
 if a.id is null then raise exception 'Tentativa não encontrada neste contrato.'; end if;
 if d->>'event'='confirm' then
  response_time:=(d->>'respondedAt')::timestamptz;
  if response_time is null or response_time<a.requested_at-interval '5 minutes' or response_time>a.expires_at or response_time>now()+interval '5 minutes' then raise exception 'Data da resposta inválida.'; end if;
  if a.confirmed_at is null then
   -- Core operation validates document indices and emits one GRCON notification.
   result:=public.grcon_teams_operation(wid,null,'confirm',d);
  else
   if a.message_id is distinct from d->>'messageId' or a.conversation_id is distinct from d->>'conversationId'
    or a.confirmed_by_id is distinct from (d#>>'{responder,objectId}')::uuid or a.confirmation_type is distinct from d->>'type'
    or a.confirmed_at is distinct from response_time then raise exception 'Resposta não corresponde à tentativa.'; end if;
   if d->>'type'='total' then chosen:=a.documents;
   else
    select coalesce(jsonb_agg(doc order by ord),'[]') into chosen from jsonb_array_elements(a.documents) with ordinality x(doc,ord)
     where (ord-1)::text in (select jsonb_array_elements_text(d->'selectedIndices'));
    if jsonb_array_length(chosen)<>jsonb_array_length(d->'selectedIndices') then raise exception 'Seleção parcial inválida.'; end if;
   end if;
   if chosen is distinct from a.confirmed_documents then raise exception 'Documentos da resposta não correspondem.'; end if;
  end if;
  select * into a from private.grcon_teams_attempts where id=aid;
  if a.notice_message_id is not null and d->>'noticeStatus'='sent' and a.notice_message_id is distinct from d->>'replyMessageId' then raise exception 'Mensagem de confirmação não corresponde.'; end if;
  if d->>'noticeStatus' in ('sending','sent','uncertain') and a.notice_status='pending' then
   perform public.grcon_teams_operation(wid,null,'claim_notice',d);
  end if;
  if d->>'noticeStatus'='sent' and a.notice_status<>'sent' then perform public.grcon_teams_operation(wid,null,'notice_sent',d);
  elsif d->>'noticeStatus'='uncertain' and a.notice_status not in ('sent','uncertain') then perform public.grcon_teams_operation(wid,null,'notice_uncertain',d); end if;
  if d->>'cardUpdated'='true' and a.card_updated_at is null then perform public.grcon_teams_operation(wid,null,'card_updated',d); end if;
 elsif d->>'event' in ('expired','failed') then
  perform public.grcon_teams_operation(wid,null,d->>'event',d);
 else raise exception 'Evento inválido.';
 end if;
 insert into private.grcon_teams_sharepoint_receipts(source_key,item_id,fingerprint,attempt_id,workspace_id)
  values(source_key,input->>'itemId',input->>'fingerprint',aid,wid)
  on conflict on constraint grcon_teams_sharepoint_receipts_pkey do update set fingerprint=excluded.fingerprint,updated_at=now();
 insert into private.grcon_teams_events(attempt_id,kind,metadata) values(aid,'SHAREPOINT_IMPORTED',jsonb_build_object('source',source_key,'itemId',input->>'itemId','fingerprint',input->>'fingerprint'));
 return jsonb_build_object('duplicate',false);
end $$;
revoke all on function public.grcon_teams_sharepoint_sync(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.grcon_teams_sharepoint_sync(text,text,jsonb) to service_role;

-- A trusted integration may supply the captured Teams response time. This keeps
-- valid replies valid when Graph delivery is delayed past the card expiry.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.grcon_teams_operation(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 if position('who := nullif(input#>>' in definition)=0 or position('a.expires_at<=now() or a.delivery_status=''expired''' in definition)=0 or position('confirmed_at=now(),updated_at=now()' in definition)=0 then
  raise exception 'Definição da rastreabilidade mudou; revisar migração antes de aplicar.';
 end if;
 definition:=replace(definition,'who := nullif(input#>>','if nullif(input->>''respondedAt'','''') is not null and ((input->>''respondedAt'')::timestamptz<a.requested_at-interval ''5 minutes'' or (input->>''respondedAt'')::timestamptz>a.expires_at or (input->>''respondedAt'')::timestamptz>now()+interval ''5 minutes'') then raise exception ''Data da resposta inválida.''; end if; who := nullif(input#>>');
 definition:=replace(definition,'a.expires_at<=now() or a.delivery_status=''expired''','a.expires_at<=coalesce(nullif(input->>''respondedAt'','''')::timestamptz,now()) or (a.delivery_status=''expired'' and nullif(input->>''respondedAt'','''') is null)');
 definition:=replace(definition,'confirmed_at=now(),updated_at=now()','confirmed_at=coalesce(nullif(input->>''respondedAt'','''')::timestamptz,now()),updated_at=now()');
 execute definition;
end $$;
