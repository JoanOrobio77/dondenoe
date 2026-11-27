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

alter table ai_usage
  add column status text not null default 'confirmada'
  check (status in ('reservada', 'confirmada', 'liberada'));

create or replace function ai_reads_today(p_business_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(u.units), 0)::int
  from ai_usage u
  join businesses b on b.id = u.business_id
  where u.business_id = p_business_id
    and u.used_on = (timezone(coalesce(nullif(b.timezone, ''), 'America/Bogota'), now()))::date
    and (
      u.status = 'confirmada'
      or (u.status = 'reservada' and u.created_at > now() - interval '15 minutes')
    )
    and (public.is_member(p_business_id) or public.is_platform_admin());
$$;

create or replace function record_ai_usage(p_business_id uuid, p_units int) returns void
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'La lectura se reserva antes de llamar a la IA';
end $$;

create or replace function reserve_ai_read(p_business_id uuid, p_units int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_today date;
  v_used int;
  v_id uuid;
begin
  if not public.is_member(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if p_units is null or p_units < 1 or p_units > 5 then
    raise exception 'No se pudo reservar la lectura';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-read:' || p_business_id::text, 0));
  perform 1 from businesses where id = p_business_id for update;
  select (timezone(coalesce(nullif(b.timezone, ''), 'America/Bogota'), now()))::date
    into v_today
  from businesses b where b.id = p_business_id;
  select coalesce(sum(units), 0) into v_used
  from ai_usage
  where business_id = p_business_id
    and used_on = v_today
    and (
      status = 'confirmada'
      or (status = 'reservada' and created_at > now() - interval '15 minutes')
    );
  if v_used + p_units > public.ai_daily_limit(p_business_id) then
    raise exception 'Llegaste al límite de lecturas con IA de hoy';
  end if;
  insert into ai_usage (business_id, used_on, units, status)
  values (p_business_id, v_today, p_units, 'reservada')
  returning id into v_id;
  return v_id;
end $$;

create or replace function settle_ai_read(p_reservation uuid, p_units int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
  v_status text;
  v_created timestamptz;
  v_units int;
  v_today date;
  v_used int;
begin
  if p_units is null or p_units < 1 or p_units > 5 then
    raise exception 'No se pudo registrar la lectura';
  end if;
  select business_id, status, created_at, units, used_on
    into v_business, v_status, v_created, v_units, v_today
  from ai_usage where id = p_reservation for update;
  if v_business is null or not public.is_member(v_business) then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'reservada' or v_created <= now() - interval '15 minutes' then
    raise exception 'Esa reserva ya no está vigente';
  end if;
  if p_units > v_units then
    perform pg_advisory_xact_lock(hashtextextended('ai-read:' || v_business::text, 0));
    select coalesce(sum(units), 0) into v_used
    from ai_usage
    where business_id = v_business
      and used_on = v_today
      and id <> p_reservation
      and (
        status = 'confirmada'
        or (status = 'reservada' and created_at > now() - interval '15 minutes')
      );
    if v_used + p_units > public.ai_daily_limit(v_business) then
      raise exception 'Llegaste al límite de lecturas con IA de hoy';
    end if;
  end if;
  update ai_usage set units = p_units, status = 'confirmada' where id = p_reservation;
end $$;

create or replace function release_ai_read(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
  v_status text;
begin
  select business_id, status into v_business, v_status
  from ai_usage where id = p_reservation for update;
  if v_business is null or not public.is_member(v_business) then
    raise exception 'No autorizado';
  end if;
  if v_status = 'confirmada' then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'reservada' then
    return;
  end if;
  update ai_usage set status = 'liberada' where id = p_reservation;
end $$;

create or replace function platform_ai_usage()
returns table (business_id uuid, business_name text, units bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, coalesce(sum(u.units), 0)::bigint
  from businesses b
  left join ai_usage u
    on u.business_id = b.id
   and u.status = 'confirmada'
   and u.used_on >= (timezone('America/Bogota', now()))::date - 30
  where public.is_platform_admin()
  group by b.id, b.name
  order by 3 desc, b.name;
$$;

revoke all on function record_ai_usage(uuid, int) from public, anon, authenticated;
revoke all on function reserve_ai_read(uuid, int) from public, anon, authenticated;
revoke all on function settle_ai_read(uuid, int) from public, anon, authenticated;
revoke all on function release_ai_read(uuid) from public, anon, authenticated;
grant execute on function reserve_ai_read(uuid, int), settle_ai_read(uuid, int), release_ai_read(uuid) to authenticated;
