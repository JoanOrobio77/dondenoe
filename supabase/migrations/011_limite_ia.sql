-- El cupo de IA se liquida en el servidor. Corre una sola vez, después de 010.
-- Una instalación nueva no lo necesita: schema.sql y grants.sql ya incluyen este estado.

create or replace function settle_ai_read(p_reservation uuid, p_units int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
  v_status text;
  v_units int;
  v_today date;
  v_used int;
begin
  if p_units is null or p_units < 1 or p_units > 5 then
    raise exception 'No se pudo registrar la lectura';
  end if;
  select business_id, status, units, used_on
    into v_business, v_status, v_units, v_today
  from ai_usage where id = p_reservation for update;
  if v_business is null then
    raise exception 'No autorizado';
  end if;
  if v_status = 'confirmada' then
    raise exception 'Esa lectura ya quedó registrada';
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
  if v_business is null then
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

revoke all on function settle_ai_read(uuid, int) from public, anon, authenticated;
revoke all on function release_ai_read(uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function settle_ai_read(uuid, int), release_ai_read(uuid) to service_role;
  end if;
end $$;

drop policy if exists "miembros leen uso de IA" on ai_usage;
create policy "miembros leen uso de IA" on ai_usage for select to authenticated
  using ((is_member(business_id) or is_platform_admin()) and status = 'confirmada');
