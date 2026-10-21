-- Fix PostgreSQL ambiguity: the function's b record must not share
-- the active-base SELECT alias. Applied and registered in production.
begin;
create or replace function private.grcon_allocation(target_workspace uuid,operation text,input jsonb default '{}',actor_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c uuid;r text;is_server boolean:=coalesce(auth.jwt()->>'role','')='service_role';
 b private.grcon_allocation_bases;d private.grcon_allocation_decisions;run private.grcon_allocation_runs;
 k text;v jsonb;versions jsonb;new_id uuid;active_id uuid;num integer;first_row integer;year_no integer;seq integer;
 prefix text;path text;doc jsonb;item jsonb;items jsonb;result jsonb;count_rows integer;trusted_decision boolean;
begin
 if is_server then u:=actor_id; end if;
 if u is null then raise exception 'Sessão necessária.' using errcode='42501'; end if;
 select m.contract_id,m.role into c,r from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active where m.workspace_id=target_workspace and m.user_id=u and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>4000000 then raise exception 'Parâmetros inválidos.' using errcode='22023'; end if;
 select coalesce(jsonb_object_agg(kind,id::text),'{}') into versions from private.grcon_allocation_bases where contract_id=c and status='active';
 if operation='context' then
  if not is_server then raise exception 'Somente API de servidor.' using errcode='42501'; end if;
  -- As primeiras 1.000 linhas permitem busca inicial, mas comprovacao de
  -- caminho, EAP e norma usa chave exata sobre TODA a base publicada.
  select coalesce(jsonb_object_agg(q.kind,q.rows),'{}') into result from (
   select active_base.kind,(select coalesce(jsonb_agg(br.payload order by br.row_number),'[]')
     from private.grcon_allocation_base_rows br
     where br.base_id=active_base.id and (
      br.row_number<=1000
      or (active_base.kind='databook' and (
        br.payload->>'databook'=coalesce(input->>'confirmedPath','')
        or exists(select 1 from jsonb_array_elements_text(coalesce(input->'candidatePaths','[]'::jsonb)) cp(path) where cp.path=br.payload->>'databook')
      ))
      or (active_base.kind='eap' and coalesce(input->>'eap','')<>'' and (
        br.payload->>'code'=input->>'eap'
        or input->>'eap' like (br.payload->>'code')||'.%'
      ))
      or (active_base.kind='norms' and exists(
        select 1 from jsonb_array_elements_text(coalesce(input->'normIds','[]'::jsonb)) nr(id) where nr.id=br.payload->>'id'
      ))
      or (active_base.kind='titles' and upper(br.payload->>'document')=upper(input->>'document'))
     )
     and (active_base.kind<>'titles' or upper(br.payload->>'document')=upper(input->>'document'))
   ) as rows
   from private.grcon_allocation_bases active_base where active_base.contract_id=c and active_base.status='active' and active_base.kind in ('databook','eap','norms','titles','config')
  ) q;
  -- Complete agora significa que a evidencia do documento foi lida por chave,
  -- nao que a base inteira precisa caber na primeira pagina.
  return jsonb_build_object('bases',result,'versions',versions,'complete',
    coalesce(input->>'confirmedPath','')<>''
    or jsonb_array_length(coalesce(input->'candidatePaths','[]'::jsonb))>0
    or not exists(select 1 from private.grcon_allocation_bases
      where contract_id=c and status='active' and kind in ('databook','eap','norms') and record_count>1000));
 elsif operation='catalog' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.version desc),'[]') into result from (select id,kind,version,file_name,revision,metadata,record_count,status,created_by,created_at,published_at from private.grcon_allocation_bases where contract_id=c and status in ('active','archived')) q;
  return jsonb_build_object('versions',versions,'bases',result,'canManage',r in ('owner','admin'));
 elsif operation='page' then
  select * into b from private.grcon_allocation_bases where id=(input->>'id')::uuid and contract_id=c and status in ('active','archived');
  if not found then raise exception 'Base indisponível.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.row_number),'[]') into result from (select row_number,payload from private.grcon_allocation_base_rows where base_id=b.id and row_number>greatest(0,coalesce((input->>'after')::integer,0)) order by row_number limit 1000) q;
  return jsonb_build_object('rows',result);
 elsif operation='history' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') into items from (select id,allocation_code,status,base_versions,
   jsonb_array_length(documents) as document_count,(select jsonb_agg(dd) from (select dd from jsonb_array_elements(documents) dd limit 20) doc) as documents,
   (select coalesce(jsonb_agg(jsonb_build_object('name',f->>'name','kind',f->>'kind','sha256',f->>'sha256')),'[]') from jsonb_array_elements(files) f) as files,
   justification,created_by,created_at from private.grcon_allocation_runs where contract_id=c and (coalesce(input->>'q','')='' or allocation_code ilike '%'||left(input->>'q',180)||'%' or documents::text ilike '%'||left(input->>'q',180)||'%') order by created_at desc limit 100 offset least(10000,greatest(0,coalesce((input->>'after')::integer,0)))) q;
  return jsonb_build_object('runs',items);
 elsif operation='run-detail' then
  select to_jsonb(rr) into result from private.grcon_allocation_runs rr where rr.id=(input->>'id')::uuid and rr.contract_id=c;
  if result is null then raise exception 'Alocação indisponível.' using errcode='42501'; end if;
  return result;
 elsif operation='experiences' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') into items from (select id,document,revision,family,discipline,eap,title,suggested_path,confirmed_path,levels,base_versions,evidence,changes,origin,confidence,status,trusted,justification,created_by,created_at,(base_versions=versions) as current_sources from private.grcon_allocation_decisions where contract_id=c and (coalesce(input->>'family','')='' or family=input->>'family') and (coalesce(input->>'discipline','')='' or discipline=input->>'discipline') and (coalesce(input->>'eap','')='' or eap=input->>'eap') and (not coalesce((input->>'trustedOnly')::boolean,false) or (trusted and status<>'invalidated' and base_versions=versions)) order by created_at desc limit 100 offset least(10000,greatest(0,coalesce((input->>'after')::integer,0)))) q;
  return jsonb_build_object('decisions',items,'versions',versions);
 end if;
 if operation in ('decision','generate','run-status','run-files') and r not in ('owner','admin','operator') then
  raise exception 'Operação reservada aos perfis operacionais.' using errcode='42501';
 end if;
 if operation in ('base-begin','base-chunk','base-publish','base-restore') then
  if r not in ('owner','admin') then raise exception 'Somente gestores de bases.' using errcode='42501'; end if;
  if operation='base-begin' then
   k:=input->>'kind';num:=(input->>'count')::integer;
   if k not in ('databook','eap','titles','norms','template','li','scon','appendix','config') or num is null or num not between 1 and 100000 or length(btrim(coalesce(input->>'fileName',''))) not between 1 and 255 or length(btrim(coalesce(input->>'revision',''))) not between 1 and 80 or jsonb_typeof(input->'metadata') is distinct from 'object' or octet_length((input->'metadata')::text)>16000 then raise exception 'Base ou revisão inválida.'; end if;
   insert into private.grcon_allocation_bases(workspace_id,contract_id,kind,file_name,revision,metadata,expected_count,expected_active,created_by) values(target_workspace,c,k,input->>'fileName',input->>'revision',input->'metadata',num,(input->>'expectedActive')::uuid,u) returning id into new_id;
   return jsonb_build_object('id',new_id);
  end if;
  select * into b from private.grcon_allocation_bases where id=(input->>'id')::uuid and contract_id=c for update;
  if not found then raise exception 'Base indisponível.' using errcode='42501'; end if;
  if operation='base-chunk' then
   first_row:=(input->>'first')::integer;
   if b.status<>'pending' or b.created_by<>u or jsonb_typeof(input->'rows') is distinct from 'array' or jsonb_array_length(input->'rows') not between 1 and 500 or first_row is null or first_row<1 or first_row+jsonb_array_length(input->'rows')-1>b.expected_count then raise exception 'Lote inválido.'; end if;
   for item in select value from jsonb_array_elements(input->'rows') loop
    if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>2000000 then raise exception 'Registro inválido.'; end if;
    if b.kind='databook' and (length(btrim(coalesce(item->>'databook',''))) not between 8 and 2048 or array_length(string_to_array(item->>'databook','|'),1) not between 3 and 15 or item->>'databook' ~ '\|\s*\|') then raise exception 'Hierarquia Databook inválida.'; end if;
    if b.kind='eap' and (length(coalesce(item->>'code','')) not between 1 and 80 or jsonb_typeof(item->'levels') is distinct from 'array' or jsonb_array_length(item->'levels') not between 1 and 10) then raise exception 'EAP inválida.'; end if;
    if b.kind='titles' and (length(coalesce(item->>'document','')) not between 1 and 255 or length(coalesce(item->>'title','')) not between 1 and 2000) then raise exception 'Título inválido.'; end if;
    if b.kind='norms' and (length(coalesce(item->>'id','')) not between 1 and 100 or length(coalesce(item->>'source','')) not between 1 and 500 or length(coalesce(item->>'requirement','')) not between 1 and 4000) then raise exception 'Referência normativa inválida.'; end if;
    if b.kind='config' and (coalesce(item->>'prefix','') !~ '^[A-Z0-9]{2,8}-ALOC-[A-Z0-9]{1,8}$' or length(coalesce(item->>'unit','')) not between 1 and 80) then raise exception 'Configuração contratual inválida.'; end if;
    if b.kind='template' and (length(coalesce(item->>'base64','')) not between 100 and 1900000 or coalesce(item->>'sha256','') !~ '^[a-f0-9]{64}$' or b.expected_count<>1) then raise exception 'Modelo inválido.'; end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(input->'rows') with ordinality t(value,n) join private.grcon_allocation_base_rows old on old.base_id=b.id and old.row_number=first_row+n-1 where old.payload is distinct from value) then raise exception 'Lote já recebido com outro conteúdo.'; end if;
   insert into private.grcon_allocation_base_rows select b.id,first_row+n::integer-1,value from jsonb_array_elements(input->'rows') with ordinality t(value,n) on conflict do nothing;
   return jsonb_build_object('ok',true);
  end if;
  perform 1 from public.grcon_contracts where id=c for update;
  select id into active_id from private.grcon_allocation_bases where contract_id=c and kind=b.kind and status='active';
  if active_id is distinct from (input->>'expectedActive')::uuid and operation='base-restore' or operation='base-publish' and active_id is distinct from b.expected_active then raise exception 'Outra versão foi publicada. Atualize a prévia.' using errcode='40001'; end if;
  if operation='base-publish' then
   select count(*) into count_rows from private.grcon_allocation_base_rows where base_id=b.id;
   if b.status<>'pending' or b.created_by<>u or count_rows<>b.expected_count then raise exception 'Base incompleta.'; end if;
  elsif b.status not in ('active','archived') then raise exception 'Versão não publicada.'; end if;
  update private.grcon_allocation_bases set status='archived' where contract_id=c and kind=b.kind and status='active';
  update private.grcon_allocation_bases set status='active',record_count=expected_count,published_at=coalesce(published_at,now()) where id=b.id;
  new_id:=b.id;
 elsif operation='decision' then
  if input->'versions' is distinct from versions then raise exception 'As bases mudaram. Reanalise.' using errcode='40001'; end if;
  path:=input->>'confirmedPath';
  if not exists(select 1 from private.grcon_allocation_base_rows br where br.base_id=(versions->>'databook')::uuid and br.payload->>'databook'=path) then raise exception 'Caminho ausente na base ativa.'; end if;
  if length(coalesce(input->>'document','')) not between 1 and 255 or length(coalesce(input->>'title','')) not between 1 and 2000 or length(coalesce(input->>'family','')) not between 1 and 180 or length(coalesce(input->>'discipline','')) not between 1 and 180 or jsonb_typeof(input->'levels') is distinct from 'array' or jsonb_array_length(input->'levels')<>10 or jsonb_typeof(input->'evidence') is distinct from 'array' or jsonb_array_length(input->'evidence')=0 or length(btrim(coalesce(input->>'justification',''))) not between 5 and 2000 then raise exception 'Decisão incompleta.'; end if;
  if input->>'status' not in ('accepted','corrected','norm-confirmed') then raise exception 'Situação inválida.'; end if;
  if input->>'status'='norm-confirmed' and r not in ('owner','admin') then raise exception 'Confirmação normativa exige gestor.' using errcode='42501'; end if;
  trusted_decision:=is_server and coalesce((input->>'validated')::boolean,false);
  insert into private.grcon_allocation_decisions(workspace_id,contract_id,document,revision,family,discipline,eap,title,suggested_path,confirmed_path,levels,base_versions,evidence,changes,origin,confidence,status,trusted,server_checked,justification,created_by)
  values(target_workspace,c,input->>'document',coalesce(input->>'revision','0'),input->>'family',input->>'discipline',coalesce(input->>'eap',''),input->>'title',coalesce(input->>'suggestedPath',''),path,input->'levels',versions,input->'evidence',coalesce(input->'changes','{}'),left(coalesce(input->>'origin','manual'),80),left(coalesce(input->>'confidence','baixa'),20),input->>'status',trusted_decision,is_server,input->>'justification',u) returning id into new_id;
 elsif operation='invalidate' then
  if r not in ('owner','admin') then raise exception 'Somente gestor pode invalidar experiência.' using errcode='42501'; end if;
  update private.grcon_allocation_decisions set status='invalidated',trusted=false where id=(input->>'id')::uuid and contract_id=c returning id into new_id;
  if new_id is null then raise exception 'Decisão indisponível.'; end if;
 elsif operation='generate' then
  if input->'versions' is distinct from versions then raise exception 'As bases mudaram. Reanalise.' using errcode='40001'; end if;
  if jsonb_typeof(input->'groups') is distinct from 'array' or jsonb_array_length(input->'groups') not between 1 and 50 then raise exception 'Lote inválido.'; end if;
  perform 1 from public.grcon_contracts where id=c for update;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.sequence),'[]') into result from private.grcon_allocation_runs q where q.contract_id=c and q.request_id=(input->>'requestId')::uuid;
  if jsonb_array_length(result)>0 then return jsonb_build_object('runs',result,'reused',true); end if;
  select br.payload->>'prefix' into prefix from private.grcon_allocation_base_rows br where br.base_id=(versions->>'config')::uuid limit 1;
  if prefix is null then raise exception 'Publique a configuração de numeração do contrato.'; end if;
  year_no:=extract(year from now() at time zone 'UTC')::integer;
  select coalesce(max(sequence),0) into seq from private.grcon_allocation_runs where contract_id=c and year=year_no;
  if input ? 'observedSequence' then
   num:=(input->>'observedSequence')::integer;if num is null or num not between 0 and 9999 then raise exception 'Sequência histórica inválida.'; end if;
   seq:=greatest(seq,num);
  end if;
  select greatest(seq,coalesce(max((regexp_match(ar.payload->>'allocation','([0-9]{4})-'||year_no||'$'))[1]::integer),0)) into seq from private.grcon_allocation_registry_rows ar join private.grcon_allocation_registry_snapshots s on s.id=ar.snapshot_id where s.workspace_id=target_workspace and s.status in ('active','archived') and ar.payload->>'allocation' like prefix||'-%';
  result:='[]';
  for item in select value from jsonb_array_elements(input->'groups') loop
   items:='[]';
   if jsonb_typeof(item->'documents') is distinct from 'array' or jsonb_array_length(item->'documents') not between 1 and 2000 then raise exception 'Documentos inválidos.'; end if;
   for doc in select value from jsonb_array_elements(item->'documents') loop
    select * into d from private.grcon_allocation_decisions where id=(doc->>'decisionId')::uuid and contract_id=c and base_versions=versions and status<>'invalidated';
    if not found or not d.server_checked or d.document is distinct from doc->>'document' or d.revision is distinct from doc->>'revision' then raise exception 'Confirme cada documento com as bases atuais antes de gerar.'; end if;
    if exists(select 1 from private.grcon_allocation_runs rr,jsonb_array_elements(rr.documents) dd where rr.contract_id=c and rr.status<>'cancelled' and dd->>'document'=d.document and dd->>'revision'=d.revision) and length(btrim(coalesce(input->>'justification','')))<10 then raise exception 'Revisão já possui alocação. Informe justificativa operacional.'; end if;
    items:=items||jsonb_build_array(jsonb_build_object('document',d.document,'revision',d.revision,'decisionId',d.id,'title',d.title,'databook',d.confirmed_path,'levels',d.levels,'evidence',d.evidence,'discipline',d.discipline,'eap',d.eap));
   end loop;
   seq:=seq+1;if seq>9999 then raise exception 'Sequência esgotada.'; end if;
   insert into private.grcon_allocation_runs(workspace_id,contract_id,request_id,allocation_code,year,sequence,base_versions,documents,justification,created_by) values(target_workspace,c,(input->>'requestId')::uuid,prefix||'-'||lpad(seq::text,4,'0')||'-'||year_no,year_no,seq,versions,items,coalesce(input->>'justification',''),u) returning * into run;
   result:=result||jsonb_build_array(to_jsonb(run));
  end loop;
  insert into private.grcon_allocation_events(workspace_id,contract_id,actor_id,action,details) values(target_workspace,c,u,'generate',jsonb_build_object('requestId',input->>'requestId','count',jsonb_array_length(result)));
  return jsonb_build_object('runs',result);
 elsif operation='run-status' then
  if input->>'status' not in ('submitted','accepted','rejected','cancelled') or length(btrim(coalesce(input->>'justification','')))<5 then raise exception 'Situação ou justificativa inválida.'; end if;
  update private.grcon_allocation_runs set status=input->>'status',justification=input->>'justification' where id=(input->>'id')::uuid and contract_id=c returning id into new_id;
  if new_id is null then raise exception 'Alocação indisponível.'; end if;
 elsif operation='run-files' then
  if jsonb_typeof(input->'files') is distinct from 'array' or octet_length((input->'files')::text)>3000000 then raise exception 'Arquivos inválidos.'; end if;
  update private.grcon_allocation_runs set files=input->'files' where id=(input->>'id')::uuid and contract_id=c and created_by=u and files='[]' returning id into new_id;
  if new_id is null then raise exception 'Registro indisponível ou arquivos já preservados.'; end if;
 else raise exception 'Operação inválida.'; end if;
 insert into private.grcon_allocation_events(workspace_id,contract_id,actor_id,action,entity_id,details) values(target_workspace,c,u,operation,new_id,jsonb_build_object('versions',versions));
 return jsonb_build_object('ok',true,'id',new_id);
end $$;
commit;
