-- Correcciones de la importación. Corre una sola vez, después de 009_catalogo_ia.sql.
-- Una instalación nueva no lo necesita: schema.sql y grants.sql ya incluyen este estado.

create or replace function purge_expired_imports() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- El archivo vive en Storage. Lo borra /api/cron/purgar-importaciones con la API,
  -- y solo entonces deja file_path en null. Esta función no toca storage.objects.
  raise exception 'Los archivos de importación se borran desde la tarea programada';
end $$;

revoke all on function purge_expired_imports() from public, anon, authenticated;
