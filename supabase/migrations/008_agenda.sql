-- Agenda para estética: profesionales, horarios y citas.
-- Correr una vez, después de 007. Una instalación nueva no lo necesita:
-- schema.sql y grants.sql ya incluyen este estado.
-- btree_gist hace falta para que dos citas no ocupen la misma hora.
-- En Supabase, si CREATE EXTENSION falla, actívala en Database → Extensions → btree_gist y vuelve a correr.

create extension if not exists btree_gist;

create type appointment_status as enum ('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio');

create table agenda_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  address text,
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 180),
  min_notice_minutes int not null default 60 check (min_notice_minutes between 0 and 10080),
  max_horizon_days int not null default 30 check (max_horizon_days between 1 and 180),
  slot_minutes int not null default 15 check (slot_minutes in (5, 10, 15, 20, 30, 60)),
  cancel_notice_hours int not null default 4 check (cancel_notice_hours between 0 and 168),
  online_status text not null default 'confirmada' check (online_status in ('pendiente', 'confirmada')),
  max_future_per_phone int not null default 3 check (max_future_per_phone between 1 and 10)
);

create table professionals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid,
  name text not null,
  photo_url text,
  active boolean not null default true,
  sort_order int not null default 0,
  unique (business_id, user_id),
  foreign key (business_id, user_id) references business_members(business_id, user_id) on delete set null (user_id)
);

create table professional_services (
  business_id uuid not null references businesses(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  price int check (price is null or price >= 0),
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  primary key (professional_id, product_id)
);

-- weekday: 0 domingo … 6 sábado, igual que extract(dow). Varios bloques por día.
create table professional_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create table professional_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at),
  check (reason is null or char_length(reason) <= 120)
);

create table appointment_counters (
  business_id uuid primary key references businesses(id) on delete cascade,
  last_number int not null default 0
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  number int not null,
  customer_id uuid not null references customers(id),
  professional_id uuid not null references professionals(id),
  service_id uuid not null references products(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'pendiente',
  price int not null check (price >= 0),
  notes text,
  channel text not null default 'web' check (channel in ('web', 'manual')),
  cancel_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  unique (business_id, number),
  check (ends_at > starts_at),
  check (notes is null or char_length(notes) <= 300)
);

create index appointments_professional_idx on appointments (professional_id, starts_at);
create index appointments_business_idx on appointments (business_id, starts_at);

-- La cita cancelada deja libre la hora. El resto sigue ocupándola.
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelada');

create function next_appointment_number(p_business_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_number int;
begin
  insert into appointment_counters (business_id, last_number)
  values (p_business_id, 1)
  on conflict (business_id) do update
    set last_number = appointment_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end $$;

create function reject_agenda_mix() returns trigger
language plpgsql set search_path = public as $$
declare
  v_owner uuid;
  v_other uuid;
begin
  if tg_table_name = 'professional_services' then
    select business_id into v_owner from professionals where id = new.professional_id;
    select business_id into v_other from products where id = new.product_id;
    if v_owner is distinct from new.business_id or v_other is distinct from new.business_id then
      raise exception 'El servicio no pertenece a este negocio';
    end if;
  elsif tg_table_name = 'professional_hours' or tg_table_name = 'professional_blocks' then
    select business_id into v_owner from professionals where id = new.professional_id;
    if v_owner is distinct from new.business_id then
      raise exception 'El horario no pertenece a este negocio';
    end if;
  elsif tg_table_name = 'appointments' then
    select business_id into v_owner from customers where id = new.customer_id;
    select business_id into v_other from professionals where id = new.professional_id;
    if v_owner is distinct from new.business_id or v_other is distinct from new.business_id then
      raise exception 'La cita mezcla datos de otro negocio';
    end if;
    select business_id into v_owner from products where id = new.service_id;
    if v_owner is distinct from new.business_id then
      raise exception 'El servicio no pertenece a este negocio';
    end if;
  end if;
  return new;
end $$;

create function reject_order_on_agenda() returns trigger
language plpgsql set search_path = public as $$
declare
  v_template text;
begin
  select template into v_template from businesses where id = new.business_id;
  if v_template is distinct from 'tienda' then
    raise exception 'Este negocio no está recibiendo pedidos';
  end if;
  return new;
end $$;

-- Rango ocupado: la cita más el tiempo entre citas. p_ignore deja pasar un movimiento de la misma cita.
create function agenda_slot_is_free(
  p_professional uuid,
  p_starts timestamptz,
  p_ends timestamptz,
  p_buffer int,
  p_ignore uuid
) returns boolean
language sql volatile security definer set search_path = public as $$
  select not exists (
    select 1 from appointments a
    where a.professional_id = p_professional
      and a.status <> 'cancelada'
      and (p_ignore is null or a.id <> p_ignore)
      and tstzrange(a.starts_at, a.ends_at + make_interval(mins => p_buffer), '[)')
          && tstzrange(p_starts, p_ends + make_interval(mins => p_buffer), '[)')
  ) and not exists (
    select 1 from professional_blocks k
    where k.professional_id = p_professional
      and tstzrange(k.starts_at, k.ends_at, '[)')
          && tstzrange(p_starts, p_ends + make_interval(mins => p_buffer), '[)')
  );
$$;

create function agenda_within_hours(
  p_professional uuid,
  p_starts timestamptz,
  p_ends timestamptz
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  select coalesce(nullif(b.timezone, ''), 'America/Bogota') into v_tz
  from professionals pr
  join businesses b on b.id = pr.business_id
  where pr.id = p_professional;
  if not found then return false; end if;
  v_local_start := timezone(v_tz, p_starts);
  v_local_end := timezone(v_tz, p_ends);
  if v_local_end::date <> v_local_start::date then
    return false;
  end if;
  return exists (
    select 1 from professional_hours h
    where h.professional_id = p_professional
      and h.weekday = extract(dow from v_local_start)::int
      and v_local_start::time >= h.start_time
      and v_local_end::time <= h.end_time
  );
end $$;

create function protect_appointment_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_price int;
begin
  if tg_op = 'INSERT' then
    select coalesce(ps.price, p.price) into v_price
    from products p
    left join professional_services ps
      on ps.product_id = p.id and ps.professional_id = new.professional_id and ps.business_id = new.business_id
    where p.id = new.service_id and p.business_id = new.business_id;
    if v_price is null then
      raise exception 'El servicio no está disponible';
    end if;
    new.price := v_price;
  elsif new.price is distinct from old.price and not public.is_owner(new.business_id) then
    raise exception 'Solo el dueño puede cambiar el precio';
  end if;
  return new;
end $$;

-- En una agenda, el equipo puede editar el servicio, pero el precio lo cambia el dueño.
-- Una tienda no entra en esta regla.
create function protect_service_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.price is distinct from old.price
     and exists (select 1 from businesses b where b.id = new.business_id and b.template = 'agenda')
     and not public.is_owner(new.business_id) then
    raise exception 'Solo el dueño puede cambiar el precio';
  end if;
  return new;
end $$;

-- Ajusta la duración, exige horario del profesional y serializa las reservas de esa persona.
create function guard_appointment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dur int;
  v_buffer int;
begin
  if new.status = 'cancelada' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.professional_id::text));
  select coalesce(ps.duration_minutes, p.duration_minutes) into v_dur
  from products p
  left join professional_services ps
    on ps.product_id = p.id and ps.professional_id = new.professional_id and ps.business_id = new.business_id
  where p.id = new.service_id
    and p.business_id = new.business_id
    and p.kind = 'service'
    and p.active;
  if v_dur is null then
    raise exception 'El servicio no está disponible';
  end if;
  new.ends_at := new.starts_at + make_interval(mins => v_dur);
  select coalesce(buffer_minutes, 0) into v_buffer from agenda_settings where business_id = new.business_id;
  v_buffer := coalesce(v_buffer, 0);
  if not public.agenda_within_hours(new.professional_id, new.starts_at, new.ends_at)
     or not public.agenda_slot_is_free(new.professional_id, new.starts_at, new.ends_at, v_buffer, new.id) then
    raise exception 'El horario ya no está disponible';
  end if;
  return new;
end $$;

create trigger professional_services_same_business
before insert or update on professional_services
for each row execute function reject_agenda_mix();

create trigger professional_hours_same_business
before insert or update on professional_hours
for each row execute function reject_agenda_mix();

create trigger professional_blocks_same_business
before insert or update on professional_blocks
for each row execute function reject_agenda_mix();

create trigger appointments_a_same_business
before insert or update on appointments
for each row execute function reject_agenda_mix();

create trigger appointments_b_price
before insert or update on appointments
for each row execute function protect_appointment_price();

create trigger appointments_c_guard
before insert or update on appointments
for each row execute function guard_appointment();

create trigger orders_not_on_agenda
before insert on orders
for each row execute function reject_order_on_agenda();

create trigger products_agenda_price
before update on products
for each row execute function protect_service_price();

create function get_availability(
  p_business_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_date date
) returns table (
  professional_id uuid,
  professional_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  price int
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_tz text;
  v_buffer int;
  v_notice int;
  v_horizon int;
  v_slot int;
  v_today date;
  v_pro record;
  v_hour record;
  v_cursor timestamptz;
  v_limit timestamptz;
  v_end timestamptz;
begin
  select coalesce(nullif(b.timezone, ''), 'America/Bogota'),
         coalesce(s.buffer_minutes, 0),
         coalesce(s.min_notice_minutes, 60),
         coalesce(s.max_horizon_days, 30),
         coalesce(s.slot_minutes, 15)
    into v_tz, v_buffer, v_notice, v_horizon, v_slot
  from businesses b
  left join agenda_settings s on s.business_id = b.id
  where b.id = p_business_id
    and b.template = 'agenda'
    and public.business_accepts_orders(b.id);
  if not found then
    return;
  end if;

  v_today := (timezone(v_tz, now()))::date;
  if p_date < v_today or p_date > v_today + v_horizon then
    return;
  end if;

  for v_pro in
    select pr.id, pr.name,
           coalesce(ps.duration_minutes, p.duration_minutes) as dur,
           coalesce(ps.price, p.price) as amount
    from professionals pr
    join professional_services ps on ps.professional_id = pr.id and ps.product_id = p_service_id
    join products p on p.id = p_service_id
    where pr.business_id = p_business_id
      and pr.active
      and p.business_id = p_business_id
      and p.kind = 'service'
      and p.active
      and ps.business_id = p_business_id
      and (p_professional_id is null or pr.id = p_professional_id)
    order by pr.sort_order, pr.name
  loop
    if v_pro.dur is null then
      continue;
    end if;
    for v_hour in
      select h.start_time, h.end_time
      from professional_hours h
      where h.professional_id = v_pro.id
        and h.weekday = extract(dow from p_date)::int
      order by h.start_time
    loop
      v_cursor := (p_date + v_hour.start_time) at time zone v_tz;
      v_limit := (p_date + v_hour.end_time) at time zone v_tz;
      while v_cursor + make_interval(mins => v_pro.dur) <= v_limit loop
        v_end := v_cursor + make_interval(mins => v_pro.dur);
        if v_cursor >= now() + make_interval(mins => v_notice)
           and public.agenda_slot_is_free(v_pro.id, v_cursor, v_end, v_buffer, null) then
          professional_id := v_pro.id;
          professional_name := v_pro.name;
          starts_at := v_cursor;
          ends_at := v_end;
          price := v_pro.amount;
          return next;
        end if;
        v_cursor := v_cursor + make_interval(mins => v_slot);
      end loop;
    end loop;
  end loop;
end $$;

create function book_appointment(
  p_business_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_starts timestamptz,
  p_name text,
  p_phone text,
  p_notes text,
  p_channel text default 'web'
) returns table (
  appointment_number int,
  cancel_token text,
  starts_at timestamptz,
  ends_at timestamptz,
  price int
)
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_channel text := case when p_channel = 'manual' then 'manual' else 'web' end;
  v_tz text;
  v_notice int;
  v_horizon int;
  v_max int;
  v_status text;
  v_today date;
  v_local date;
  v_customer uuid;
  v_number int;
  v_id uuid;
  v_token text;
  v_start timestamptz;
  v_end timestamptz;
  v_price int;
begin
  if v_channel = 'manual' and not public.is_member(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if not exists (
    select 1 from businesses b
    where b.id = p_business_id
      and b.template = 'agenda'
      and public.business_accepts_orders(b.id)
  ) then
    raise exception 'Este negocio no recibe citas';
  end if;
  if not exists (
    select 1 from professionals pr
    join professional_services ps on ps.professional_id = pr.id and ps.product_id = p_service_id
    where pr.id = p_professional_id
      and pr.business_id = p_business_id
      and pr.active
      and ps.business_id = p_business_id
  ) then
    raise exception 'El profesional no realiza ese servicio';
  end if;

  select coalesce(nullif(b.timezone, ''), 'America/Bogota'),
         coalesce(s.min_notice_minutes, 60),
         coalesce(s.max_horizon_days, 30),
         coalesce(s.max_future_per_phone, 3),
         coalesce(s.online_status, 'confirmada')
    into v_tz, v_notice, v_horizon, v_max, v_status
  from businesses b
  left join agenda_settings s on s.business_id = b.id
  where b.id = p_business_id;

  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'El nombre debe tener entre 1 y 80 caracteres';
  end if;
  if v_phone !~ '^\d{10}$' then
    raise exception 'El celular debe tener 10 dígitos';
  end if;
  if v_notes is not null and char_length(v_notes) > 300 then
    raise exception 'Las notas no pueden pasar de 300 caracteres';
  end if;

  v_local := (timezone(v_tz, p_starts))::date;
  v_today := (timezone(v_tz, now()))::date;
  if v_channel = 'web' then
    if p_starts < now() + make_interval(mins => v_notice) then
      raise exception 'La cita queda muy pronto';
    end if;
    if v_local < v_today or v_local > v_today + v_horizon then
      raise exception 'Esa fecha está fuera del calendario';
    end if;
    if (
      select count(*)
      from appointments a
      join customers c on c.id = a.customer_id
      where a.business_id = p_business_id
        and c.phone = v_phone
        and a.status in ('pendiente', 'confirmada')
        and a.starts_at >= now()
    ) >= v_max then
      raise exception 'Ya tienes varias citas pendientes. Escríbenos por WhatsApp para seguir';
    end if;
  end if;

  insert into customers (business_id, name, phone)
  values (p_business_id, v_name, v_phone)
  on conflict (business_id, phone) do update set name = excluded.name
  returning id into v_customer;

  v_number := next_appointment_number(p_business_id);
  insert into appointments (
    business_id, number, customer_id, professional_id, service_id,
    starts_at, ends_at, status, price, notes, channel
  ) values (
    p_business_id, v_number, v_customer, p_professional_id, p_service_id,
    p_starts, p_starts + interval '1 minute', v_status::appointment_status, 0, v_notes, v_channel
  )
  returning id, appointments.starts_at, appointments.ends_at, appointments.price, appointments.cancel_token
  into v_id, v_start, v_end, v_price, v_token;

  return query select v_number, v_token, v_start, v_end, v_price;
exception
  when exclusion_violation then
    raise exception 'El horario ya no está disponible';
end $$;

create function move_appointment(p_id uuid, p_starts timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
begin
  select business_id into v_business from appointments where id = p_id;
  if not found or not public.is_member(v_business) then
    raise exception 'No autorizado';
  end if;
  update appointments
  set starts_at = p_starts
  where id = p_id
    and status in ('pendiente', 'confirmada');
  if not found then
    raise exception 'Esa cita ya no se puede mover';
  end if;
end $$;

create function public_appointment_by_token(p_token text)
returns table (
  business_name text,
  service_name text,
  professional_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status appointment_status,
  can_cancel boolean,
  timezone text
)
language sql stable security definer set search_path = public as $$
  select b.name, p.name, pr.name, a.starts_at, a.ends_at, a.status,
         a.status in ('pendiente', 'confirmada')
           and a.starts_at > now() + make_interval(hours => coalesce(s.cancel_notice_hours, 4)),
         coalesce(nullif(b.timezone, ''), 'America/Bogota')
  from appointments a
  join businesses b on b.id = a.business_id
  join products p on p.id = a.service_id
  join professionals pr on pr.id = a.professional_id
  left join agenda_settings s on s.business_id = b.id
  where a.cancel_token = p_token;
$$;

create function cancel_appointment_by_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_ok boolean;
begin
  select a.id,
         a.status in ('pendiente', 'confirmada')
           and a.starts_at > now() + make_interval(hours => coalesce(s.cancel_notice_hours, 4))
    into v_id, v_ok
  from appointments a
  left join agenda_settings s on s.business_id = a.business_id
  where a.cancel_token = p_token;
  if not found then
    raise exception 'No encontramos esa cita';
  end if;
  if not v_ok then
    raise exception 'Ya no se puede cancelar en línea';
  end if;
  update appointments set status = 'cancelada' where id = v_id;
end $$;

create function public_agenda(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'address', s.address,
    'buffer_minutes', coalesce(s.buffer_minutes, 0),
    'min_notice_minutes', coalesce(s.min_notice_minutes, 60),
    'max_horizon_days', coalesce(s.max_horizon_days, 30),
    'slot_minutes', coalesce(s.slot_minutes, 15),
    'cancel_notice_hours', coalesce(s.cancel_notice_hours, 4),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description,
        'price', p.price, 'duration_minutes', p.duration_minutes
      ) order by p.name)
      from products p
      where p.business_id = b.id and p.kind = 'service' and p.active
    ), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'photo_url', pr.photo_url,
        'services', coalesce((
          select jsonb_agg(ps.product_id) from professional_services ps where ps.professional_id = pr.id
        ), '[]'::jsonb)
      ) order by pr.sort_order, pr.name)
      from professionals pr
      where pr.business_id = b.id and pr.active
    ), '[]'::jsonb)
  )
  from businesses b
  left join agenda_settings s on s.business_id = b.id
  where b.slug = p_slug
    and b.template = 'agenda'
    and public.business_accepts_orders(b.id);
$$;

create function admin_appointment_report(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns table (
  section text,
  label text,
  citas bigint,
  ingresos bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Solo el dueño puede ver este reporte';
  end if;
  return query
    select 'estado'::text, a.status::text, count(*)::bigint, coalesce(sum(a.price), 0)::bigint
    from appointments a
    where a.business_id = p_business_id
      and a.starts_at >= p_from and a.starts_at < p_to
    group by a.status
    union all
    select 'servicio'::text, p.name, count(*)::bigint,
           coalesce(sum(a.price) filter (where a.status = 'completada'), 0)::bigint
    from appointments a
    join products p on p.id = a.service_id
    where a.business_id = p_business_id
      and a.starts_at >= p_from and a.starts_at < p_to
    group by p.name
    union all
    select 'profesional'::text, pr.name, count(*)::bigint,
           coalesce(sum(a.price) filter (where a.status = 'completada'), 0)::bigint
    from appointments a
    join professionals pr on pr.id = a.professional_id
    where a.business_id = p_business_id
      and a.starts_at >= p_from and a.starts_at < p_to
    group by pr.name;
end $$;

drop function public_store(text);
drop function public_store_by_domain(text);

create function public_store(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  brand_color text,
  whatsapp_number text,
  timezone text,
  status business_status,
  age_verification boolean,
  tobacco_rules boolean,
  delivery boolean,
  opening_hours jsonb,
  orders_open boolean,
  template text
)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.logo_url, b.brand_color, b.whatsapp_number, b.timezone, b.status,
         coalesce(s.age_verification, true),
         coalesce(s.tobacco_rules, true),
         coalesce(s.delivery, true),
         coalesce(s.opening_hours, '{}'::jsonb),
         public.business_accepts_orders(b.id),
         b.template
  from businesses b
  left join business_settings s on s.business_id = b.id
  where b.slug = p_slug;
$$;

create function public_store_by_domain(p_domain text)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  brand_color text,
  whatsapp_number text,
  timezone text,
  status business_status,
  age_verification boolean,
  tobacco_rules boolean,
  delivery boolean,
  opening_hours jsonb,
  orders_open boolean,
  template text
)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.logo_url, b.brand_color, b.whatsapp_number, b.timezone, b.status,
         coalesce(s.age_verification, true),
         coalesce(s.tobacco_rules, true),
         coalesce(s.delivery, true),
         coalesce(s.opening_hours, '{}'::jsonb),
         public.business_accepts_orders(b.id),
         b.template
  from business_domains d
  join businesses b on b.id = d.business_id
  left join business_settings s on s.business_id = b.id
  where d.verified
    and domain_is_valid(lower(btrim(p_domain)))
    and d.domain = lower(btrim(p_domain));
$$;

alter table agenda_settings enable row level security;
alter table professionals enable row level security;
alter table professional_services enable row level security;
alter table professional_hours enable row level security;
alter table professional_blocks enable row level security;
alter table appointment_counters enable row level security;
alter table appointments enable row level security;

create policy "miembros leen ajustes de agenda" on agenda_settings for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "superadmin crea ajustes de agenda" on agenda_settings for insert to authenticated
  with check (is_platform_admin());
create policy "dueño actualiza ajustes de agenda" on agenda_settings for update to authenticated
  using (is_owner(business_id) or is_platform_admin())
  with check (is_owner(business_id) or is_platform_admin());

create policy "miembros leen profesionales" on professionals for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean profesionales" on professionals for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan profesionales" on professionals for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "dueño borra profesionales" on professionals for delete to authenticated
  using (is_owner(business_id));

create policy "miembros leen servicios del profesional" on professional_services for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros asignan servicios" on professional_services for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan servicios del profesional" on professional_services for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros quitan servicios del profesional" on professional_services for delete to authenticated
  using (is_member(business_id));

create policy "miembros leen horarios" on professional_hours for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean horarios" on professional_hours for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan horarios" on professional_hours for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran horarios" on professional_hours for delete to authenticated
  using (is_member(business_id));

create policy "miembros leen bloqueos" on professional_blocks for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean bloqueos" on professional_blocks for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan bloqueos" on professional_blocks for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran bloqueos" on professional_blocks for delete to authenticated
  using (is_member(business_id));

create policy "miembros leen citas" on appointments for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean citas" on appointments for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan citas" on appointments for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "dueño borra citas" on appointments for delete to authenticated
  using (is_owner(business_id));

revoke all on function next_appointment_number(uuid) from public, anon, authenticated;
revoke all on function agenda_slot_is_free(uuid, timestamptz, timestamptz, int, uuid) from public, anon, authenticated;
revoke all on function agenda_within_hours(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function get_availability(uuid, uuid, uuid, date) from public, anon, authenticated;
revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function move_appointment(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public_appointment_by_token(text) from public, anon, authenticated;
revoke all on function cancel_appointment_by_token(text) from public, anon, authenticated;
revoke all on function public_agenda(text) from public, anon, authenticated;
revoke all on function admin_appointment_report(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public_store(text), public_store_by_domain(text) from public, anon, authenticated;
revoke all on function reject_agenda_mix(), reject_order_on_agenda(), protect_appointment_price(), guard_appointment()
  from public, anon, authenticated;

grant execute on function get_availability(uuid, uuid, uuid, date) to anon, authenticated;
grant execute on function book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public_appointment_by_token(text), cancel_appointment_by_token(text), public_agenda(text)
  to anon, authenticated;
grant execute on function move_appointment(uuid, timestamptz), admin_appointment_report(uuid, timestamptz, timestamptz)
  to authenticated;
grant execute on function public_store(text), public_store_by_domain(text) to anon, authenticated;
grant execute on function reject_agenda_mix(), reject_order_on_agenda(), protect_appointment_price(), protect_service_price(), guard_appointment()
  to anon, authenticated;
grant execute on function next_appointment_number(uuid) to postgres;

grant select, update on agenda_settings to authenticated;
grant insert (business_id, address, buffer_minutes, min_notice_minutes, max_horizon_days, slot_minutes, cancel_notice_hours, online_status, max_future_per_phone)
  on agenda_settings to authenticated;
grant select, insert, update, delete on professionals, professional_services, professional_hours, professional_blocks to authenticated;
grant select, insert, update, delete on appointments to authenticated;

revoke all on agenda_settings, professionals, professional_services, professional_hours, professional_blocks, appointments, appointment_counters
  from anon;
