-- Superadmin: plantilla, pagos, auditoría y cierre por mora.
-- Correr una vez, después de 006, en el SQL Editor. No correr en una instalación nueva:
-- schema.sql y grants.sql ya incluyen este estado.
-- No borra datos de ningún negocio.

alter table businesses
  add column template text not null default 'tienda';

alter table businesses
  add constraint businesses_template_check check (template in ('tienda', 'agenda'));

create table platform_settings (
  key text primary key,
  value jsonb not null
);

insert into platform_settings (key, value) values ('past_due_grace_days', '5'::jsonb);

create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  amount int not null check (amount > 0),
  method text not null check (char_length(btrim(method)) between 1 and 40),
  paid_at timestamptz not null,
  period_start date not null,
  period_end date not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index payments_business_id_idx on payments (business_id, paid_at desc);

create table platform_audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id),
  action text not null,
  business_id uuid references businesses(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_log_business_idx on platform_audit_log (business_id, created_at desc);

create function past_due_grace_days() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (value #>> '{}')::int
    from platform_settings
    where key = 'past_due_grace_days'
      and jsonb_typeof(value) = 'number'
      and (value #>> '{}')::int between 0 and 60
  ), 5);
$$;

create function business_accepts_orders(p_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from businesses b
    where b.id = p_business_id
      and (
        b.status in ('trial', 'active')
        or (
          b.status = 'past_due'
          and b.paid_until is not null
          and b.paid_until >= now() - make_interval(days => public.past_due_grace_days())
        )
      )
  );
$$;

create or replace function business_is_open(business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.business_accepts_orders(business_id);
$$;

create function platform_business_overview()
returns table (
  id uuid,
  slug text,
  name text,
  plan business_plan,
  status business_status,
  trial_ends_at timestamptz,
  paid_until timestamptz,
  template text,
  products bigint,
  orders_month bigint
)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.plan, b.status, b.trial_ends_at, b.paid_until, b.template,
         (select count(*) from products p where p.business_id = b.id),
         (select count(*) from orders o
           where o.business_id = b.id
             and o.created_at >= date_trunc('month', now()))
  from businesses b
  where public.is_platform_admin()
  order by b.name;
$$;

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
  orders_open boolean
)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.logo_url, b.brand_color, b.whatsapp_number, b.timezone, b.status,
         coalesce(s.age_verification, true),
         coalesce(s.tobacco_rules, true),
         coalesce(s.delivery, true),
         coalesce(s.opening_hours, '{}'::jsonb),
         public.business_accepts_orders(b.id)
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
  orders_open boolean
)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.logo_url, b.brand_color, b.whatsapp_number, b.timezone, b.status,
         coalesce(s.age_verification, true),
         coalesce(s.tobacco_rules, true),
         coalesce(s.delivery, true),
         coalesce(s.opening_hours, '{}'::jsonb),
         public.business_accepts_orders(b.id)
  from business_domains d
  join businesses b on b.id = d.business_id
  left join business_settings s on s.business_id = b.id
  where d.verified
    and domain_is_valid(lower(btrim(p_domain)))
    and d.domain = lower(btrim(p_domain));
$$;

do $$
declare
  src text;
  old text := $old$if not found or v_status not in ('trial', 'active') then
    raise exception 'Este negocio no está recibiendo pedidos';
  end if;$old$;
  fresh text := $fresh$if not public.business_accepts_orders(p_business_id) then
    raise exception 'Tienda temporalmente no disponible';
  end if;$fresh$;
  patched text := $patched$if not found then
    raise exception 'Este negocio no está recibiendo pedidos';
  end if;
  if not public.business_accepts_orders(p_business_id) then
    raise exception 'Tienda temporalmente no disponible';
  end if;$patched$;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_order';

  if position(fresh in src) > 0 then
    return;
  end if;
  if position(old in src) = 0 then
    raise exception 'No se pudo actualizar create_order';
  end if;
  execute replace(src, old, patched);
end $$;

create function reject_billing_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    if new.status is distinct from old.status
       or new.plan is distinct from old.plan
       or new.paid_until is distinct from old.paid_until
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.template is distinct from old.template then
      raise exception 'Solo el superadmin puede cambiar el plan o el estado';
    end if;
  end if;
  return new;
end $$;

create trigger businesses_protect_billing
before update on businesses
for each row execute function reject_billing_change();

alter table platform_settings enable row level security;
alter table payments enable row level security;
alter table platform_audit_log enable row level security;

create policy "superadmin crea negocios" on businesses for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin actualiza negocios" on businesses for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy "superadmin borra negocios" on businesses for delete to authenticated
  using (is_platform_admin());

create policy "superadmin crea ajustes" on business_settings for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin actualiza ajustes" on business_settings for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

create policy "superadmin agrega miembros" on business_members for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin cambia miembros" on business_members for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy "superadmin quita miembros" on business_members for delete to authenticated
  using (is_platform_admin());

create policy "superadmin lee ajustes de plataforma" on platform_settings for select to authenticated
  using (is_platform_admin());
create policy "superadmin cambia ajustes de plataforma" on platform_settings for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

create policy "superadmin lee pagos" on payments for select to authenticated
  using (is_platform_admin());
create policy "superadmin registra pagos" on payments for insert to authenticated
  with check (is_platform_admin());

create policy "superadmin lee auditoría" on platform_audit_log for select to authenticated
  using (is_platform_admin());
create policy "superadmin escribe auditoría" on platform_audit_log for insert to authenticated
  with check (is_platform_admin());

grant select (template) on businesses to authenticated;
grant insert (slug, name, logo_url, brand_color, whatsapp_number, timezone, status, plan, trial_ends_at, paid_until, template)
  on businesses to authenticated;
grant update (timezone, status, plan, trial_ends_at, paid_until, template) on businesses to authenticated;
grant delete on businesses to authenticated;

grant insert (business_id, age_verification, tobacco_rules, delivery, opening_hours, appointments)
  on business_settings to authenticated;

revoke all on platform_settings, payments, platform_audit_log from public, anon, authenticated;
grant select, update on platform_settings to authenticated;
grant select, insert on payments to authenticated;
grant select, insert on platform_audit_log to authenticated;

grant usage, select on all sequences in schema public to authenticated;

revoke all on function past_due_grace_days() from public, anon, authenticated;
revoke all on function business_accepts_orders(uuid) from public, anon, authenticated;
revoke all on function platform_business_overview() from public, anon, authenticated;
revoke all on function reject_billing_change() from public, anon, authenticated;
revoke all on function public_store(text) from public, anon, authenticated;
revoke all on function public_store_by_domain(text) from public, anon, authenticated;

grant execute on function past_due_grace_days() to authenticated;
grant execute on function business_accepts_orders(uuid) to anon, authenticated;
grant execute on function platform_business_overview() to authenticated;
grant execute on function reject_billing_change() to anon, authenticated;
grant execute on function public_store(text), public_store_by_domain(text) to anon, authenticated;
