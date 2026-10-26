-- Private SECURITY DEFINER implementation; public wrapper is SECURITY INVOKER.
begin;
create or replace function private.grcon_title_decisions(target_workspace uuid, operation text, input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 actor uuid := auth.uid();
 doc text; title text; old_title text; ref text; evid jsonb; item uuid; result jsonb;
begin
 if actor is null or target_workspace is null or operation not in ('list','approve','invalidate') then
  raise exception 'Requisição inválida.' using errcode='22023';
 end if;
 if not exists(select 1 from public.grcon_memberships m
  join public.grcon_contracts c on c.id=m.contract_id and c.workspace_id=m.workspace_id and c.active
  where m.workspace_id=target_workspace and m.user_id=actor and m.active) then
  raise exception 'Acesso negado ao contrato.' using errcode='42501';
 end if;
 if operation='list' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
   select d.id,d.document_code,d.document_key,d.source_title,d.approved_title,d.source_reference,
    d.evidence,d.actor_id,d.approved_at
   from private.grcon_title_decisions d
   where d.workspace_id=target_workspace and d.invalidated_at is null
    and (nullif(trim(coalesce(input->>'q','')),'') is null
      or d.document_key=upper(trim(input->>'q')))
   order by d.approved_at desc limit 200
  ) x;
  return jsonb_build_object('rows',result);
 end if;
 if not private.grcon_has_role(target_workspace,array['owner','admin','operator']) then
  raise exception 'Sem permissão de aprovação.' using errcode='42501';
 end if;
 if operation='invalidate' then
  if not private.grcon_has_role(target_workspace,array['owner','admin']) then
   raise exception 'Somente gestão pode invalidar decisões.' using errcode='42501';
  end if;
  item := nullif(input->>'id','')::uuid;
  if item is null then raise exception 'Identificador necessário.' using errcode='22023'; end if;
  update private.grcon_title_decisions d set invalidated_at=clock_timestamp(),invalidated_by=actor
  where d.id=item and d.workspace_id=target_workspace and d.invalidated_at is null;
  if not found then raise exception 'Decisão indisponível neste contrato.' using errcode='22023'; end if;
  return jsonb_build_object('ok',true);
 end if;
 doc:=trim(coalesce(input->>'document',''));title:=trim(coalesce(input->>'title',''));
 old_title:=trim(coalesce(input->>'current',''));ref:=trim(coalesce(input->>'source',''));
 evid:=coalesce(input->'evidence','[]'::jsonb);
 if length(doc)<5 or length(doc)>255 or doc !~ '^[A-Za-z0-9][A-Za-z0-9_.\-/ ]{4,254}$'
  or length(title)<2 or length(title)>2500 or length(old_title)>2500 or length(ref)>500
  or jsonb_typeof(evid)<>'array' or pg_column_size(evid)>24000
  or jsonb_array_length(evid)>36 then
  raise exception 'Dados de título inválidos.' using errcode='22023';
 end if;
 insert into private.grcon_title_decisions
 (workspace_id,document_code,document_key,source_title,approved_title,evidence,source_reference,actor_id)
 values(target_workspace,doc,upper(doc),old_title,title,evid,ref,actor)
 returning id into item;
 return jsonb_build_object('ok',true,'id',item);
end
$function$;
revoke all on function private.grcon_title_decisions(uuid,text,jsonb) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.grcon_title_decisions(uuid,text,jsonb) to authenticated;
create or replace function public.grcon_title_decisions(target_workspace uuid,operation text,input jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as
$$ select private.grcon_title_decisions(target_workspace,operation,input) $$;
revoke all on function public.grcon_title_decisions(uuid,text,jsonb) from public,anon;
grant execute on function public.grcon_title_decisions(uuid,text,jsonb) to authenticated;
commit;