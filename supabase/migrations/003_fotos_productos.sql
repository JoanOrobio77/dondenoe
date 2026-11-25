-- Depósito de fotos para productos nuevos. Ejecutar una vez en Supabase > SQL Editor.
-- La tienda ya está creada: no vuelvas a correr schema.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos de productos públicas" on storage.objects;
drop policy if exists "admin sube fotos de productos" on storage.objects;
drop policy if exists "admin actualiza fotos de productos" on storage.objects;
drop policy if exists "admin borra fotos de productos" on storage.objects;

create policy "fotos de productos públicas" on storage.objects for select
  to public using (bucket_id = 'products');
create policy "admin sube fotos de productos" on storage.objects for insert
  to authenticated with check (bucket_id = 'products' and public.is_admin());
create policy "admin actualiza fotos de productos" on storage.objects for update
  to authenticated using (bucket_id = 'products' and public.is_admin())
  with check (bucket_id = 'products' and public.is_admin());
create policy "admin borra fotos de productos" on storage.objects for delete
  to authenticated using (bucket_id = 'products' and public.is_admin());
