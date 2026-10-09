-- Fotos pessoais no Supabase Storage: bucket privado, caminho e acesso por identidade.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grcon-profile-photos','grcon-profile-photos',false,1048576,array['image/webp'])
on conflict (id) do nothing;

-- Somente usuário logado com vínculo ativo; nunca concede acesso à foto de outra conta.
drop policy if exists grcon_profile_photo_self_read on storage.objects;
create policy grcon_profile_photo_self_read on storage.objects
for select to authenticated
using (
  bucket_id = 'grcon-profile-photos'
  and name = auth.uid()::text || '/avatar.webp'
  and exists(select 1 from public.grcon_memberships m where m.user_id=auth.uid() and m.active)
);

drop policy if exists grcon_profile_photo_self_insert on storage.objects;
create policy grcon_profile_photo_self_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'grcon-profile-photos'
  and name = auth.uid()::text || '/avatar.webp'
  and exists(select 1 from public.grcon_memberships m where m.user_id=auth.uid() and m.active)
);

drop policy if exists grcon_profile_photo_self_update on storage.objects;
create policy grcon_profile_photo_self_update on storage.objects
for update to authenticated
using (
  bucket_id = 'grcon-profile-photos'
  and name = auth.uid()::text || '/avatar.webp'
  and exists(select 1 from public.grcon_memberships m where m.user_id=auth.uid() and m.active)
)
with check (
  bucket_id = 'grcon-profile-photos'
  and name = auth.uid()::text || '/avatar.webp'
  and exists(select 1 from public.grcon_memberships m where m.user_id=auth.uid() and m.active)
);

drop policy if exists grcon_profile_photo_self_delete on storage.objects;
create policy grcon_profile_photo_self_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'grcon-profile-photos'
  and name = auth.uid()::text || '/avatar.webp'
  and exists(select 1 from public.grcon_memberships m where m.user_id=auth.uid() and m.active)
);
