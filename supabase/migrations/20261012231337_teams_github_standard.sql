-- Only the Worker can import records authenticated with a GitHub Actions JWT.
create table private.grcon_teams_github_receipts (
 repository_id text not null, issue_id text not null, fingerprint text not null,
 record_kind text not null, attempt_id uuid not null, workspace_id uuid not null,
 result jsonb not null, created_at timestamptz not null default now(),
 primary key(repository_id,issue_id)
);
alter table private.grcon_teams_github_receipts enable row level security;
revoke all on private.grcon_teams_github_receipts from public,anon,authenticated;

create function public.grcon_teams_github_sync(source_repository text,source_issue text,fingerprint text,input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare
 r private.grcon_teams_github_receipts; parent private.grcon_teams_github_receipts;
 a private.grcon_teams_attempts; aid uuid; wid uuid; result jsonb; claimed jsonb;
 chosen jsonb; response_time timestamptz;
begin
 if coalesce(source_repository,'')!~'^\d+$' or coalesce(source_issue,'')!~'^\d+$' or coalesce(fingerprint,'')!~'^[0-9a-f]{64}$' then raise exception 'Origem GitHub inválida.'; end if;
 aid:=(input->>'attemptId')::uuid; wid:=(input->>'workspaceId')::uuid;
 if aid is null or wid is null then raise exception 'Identificação obrigatória.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(source_repository||'/'||source_issue,0));
 select * into r from private.grcon_teams_github_receipts x where x.repository_id=source_repository and x.issue_id=source_issue;
 if r.issue_id is not null then
  if r.attempt_id is distinct from aid or r.workspace_id is distinct from wid or r.fingerprint is distinct from fingerprint then raise exception 'Registro GitHub foi alterado.'; end if;
  return r.result||jsonb_build_object('duplicate',true);
 end if;
 select * into a from private.grcon_teams_attempts where id=aid and workspace_id=wid for update;
 if a.id is null then raise exception 'Tentativa não encontrada neste contrato.'; end if;
 if input->>'kind'='confirm' then
  response_time:=(input->>'respondedAt')::timestamptz;
  if response_time is null or response_time<a.requested_at-interval '5 minutes' or response_time>a.expires_at or response_time>now()+interval '5 minutes' then raise exception 'Data da resposta inválida.'; end if;
  if a.confirmed_at is not null then
   if a.message_id is distinct from input->>'messageId' or a.conversation_id is distinct from input->>'conversationId' or a.confirmed_by_id is distinct from (input#>>'{responder,objectId}')::uuid or a.confirmed_by_name is distinct from input#>>'{responder,displayName}' or a.confirmation_type is distinct from input->>'type' or a.confirmed_at is distinct from response_time then raise exception 'Confirmação não corresponde à tentativa.'; end if;
   if input->>'type'='total' then chosen:=a.documents;
   elsif input->>'type'='partial' and jsonb_typeof(input->'selectedIndices')='array' then
    select coalesce(jsonb_agg(doc order by ord),'[]') into chosen from jsonb_array_elements(a.documents) with ordinality x(doc,ord) where (ord-1)::text in (select jsonb_array_elements_text(input->'selectedIndices'));
    if jsonb_array_length(chosen)<>jsonb_array_length(input->'selectedIndices') then raise exception 'Seleção parcial inválida.'; end if;
   else raise exception 'Tipo de confirmação inválido.'; end if;
   if chosen is distinct from a.confirmed_documents then raise exception 'Documentos não correspondem à confirmação.'; end if;
  else
   perform public.grcon_teams_operation(wid,null,'confirm',input);
  end if;
  claimed:=public.grcon_teams_operation(wid,null,'claim_notice',input);
  select * into a from private.grcon_teams_attempts where id=aid;
  result:=jsonb_build_object('attempt',to_jsonb(a),'publishConfirmation',claimed->'publishConfirmation','duplicate',false);
 elsif input->>'kind'='effects' then
  select * into parent from private.grcon_teams_github_receipts x where x.repository_id=source_repository and x.issue_id=input->>'confirmationIssueId' and x.record_kind='confirm';
  if parent.issue_id is null or parent.attempt_id is distinct from aid or parent.workspace_id is distinct from wid then raise exception 'Confirmação GitHub não corresponde ao registro.'; end if;
  if input->>'messageId' is distinct from a.message_id or input->>'conversationId' is distinct from a.conversation_id then raise exception 'Cartão não corresponde à tentativa.'; end if;
  if input->>'noticeStatus' in ('sent','uncertain') then
   if parent.result->>'publishConfirmation'<>'true' then raise exception 'Anúncio não reservado para este registro.'; end if;
   perform public.grcon_teams_operation(wid,null,case when input->>'noticeStatus'='sent' then 'notice_sent' else 'notice_uncertain' end,input);
  elsif input->>'noticeStatus'<>'skipped' then raise exception 'Estado do anúncio inválido.'; end if;
  if input->>'cardUpdated'='true' then perform public.grcon_teams_operation(wid,null,'card_updated',input); end if;
  result:=jsonb_build_object('recorded',true,'duplicate',false);
 elsif input->>'kind' in ('expired','failed') then
  perform public.grcon_teams_operation(wid,null,input->>'kind',input);
  result:=jsonb_build_object('recorded',true,'duplicate',false);
 else raise exception 'Evento GitHub inválido.';
 end if;
 insert into private.grcon_teams_github_receipts(repository_id,issue_id,fingerprint,record_kind,attempt_id,workspace_id,result) values(source_repository,source_issue,fingerprint,input->>'kind',aid,wid,result);
 insert into private.grcon_teams_events(attempt_id,kind,metadata) values(aid,'GITHUB_IMPORTED',jsonb_build_object('repositoryId',source_repository,'issueId',source_issue,'recordKind',input->>'kind','fingerprint',fingerprint));
 return result;
end $$;
revoke all on function public.grcon_teams_github_sync(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.grcon_teams_github_sync(text,text,text,jsonb) to service_role;
