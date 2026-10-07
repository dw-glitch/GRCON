-- Same existing membership/RLS scope; only deliver committed notification inserts.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'grcon_notifications'
     ) then
    alter publication supabase_realtime add table public.grcon_notifications;
  end if;
end $$;
