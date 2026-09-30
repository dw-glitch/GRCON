-- Execute with SQL administration access. All fixture changes roll back.
begin;
do $$
declare w uuid; actor uuid; prior uuid; a uuid; b uuid; active uuid; n integer;
begin
 select workspace_id,user_id into w,actor from public.grcon_memberships m where m.active and m.role='owner' limit 1;
 if w is null then raise exception 'QA requer um workspace com proprietário.'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select snapshot_id into prior from public.grcon_sigem_query_current(w);
 a:=public.grcon_sigem_query_begin(w,'QA-ROLLBACK.xlsx',2,'{}',prior);
 perform public.grcon_sigem_query_chunk(w,a,1,'[{"document":"QA-001","revision":"B","status":"Em análise"}]');
 begin perform public.grcon_sigem_query_publish(w,a); raise exception 'Carga incompleta foi aceita'; exception when sqlstate '22023' then null; end;
 select snapshot_id into active from public.grcon_sigem_query_current(w);
 if active is distinct from prior then raise exception 'A versão anterior não foi preservada'; end if;
 perform public.grcon_sigem_query_chunk(w,a,2,'[{"document":"QA-002","revision":"A","status":"Recusado"}]');
 b:=public.grcon_sigem_query_begin(w,'QA-CONCURRENT.xlsx',1,'{}',prior);
 perform public.grcon_sigem_query_chunk(w,b,1,'[{"document":"QA-003","revision":"B","status":"Em análise"}]');
 perform public.grcon_sigem_query_publish(w,a);
 select snapshot_id,record_count into active,n from public.grcon_sigem_query_current(w);
 if active<>a or n<>2 then raise exception 'Versão ativa incorreta'; end if;
 begin perform public.grcon_sigem_query_publish(w,b); raise exception 'Conflito concorrente foi aceito'; exception when sqlstate '40001' then null; end;
 select count(*) into n from public.grcon_sigem_query_page(w,a,0,1000);
 if n<>2 then raise exception 'Paginação incompleta'; end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 begin perform public.grcon_sigem_query_current(w); raise exception 'Não membro leu dados'; exception when insufficient_privilege then null; end;
 begin perform public.grcon_sigem_query_begin(w,'QA.xlsx',1,'{}',null); raise exception 'Não membro publicou'; exception when insufficient_privilege then null; end;
 if has_function_privilege('anon','public.grcon_sigem_query_current(uuid)','execute') or has_table_privilege('authenticated','private.grcon_sigem_query_rows','select') then raise exception 'Permissões excessivas'; end if;
end $$;
rollback;
