-- DondeNoe como plataforma: un negocio por dominio.
-- Instalación nueva, en este orden: schema.sql, grants.sql, seed.sql.
-- Si la base ya existe, no corras este archivo.
-- Una tienda de un solo negocio: 005, luego 006, 007, 008 y 009.
-- Una base que ya tiene 008: solo migrations/009_catalogo_ia.sql.
-- pg_trgm: si CREATE EXTENSION falla en Supabase, actívala en Database → Extensions.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create extension if not exists pg_trgm;

-- ============ Negocios ============

create type business_status as enum ('trial', 'active', 'past_due', 'suspended');
create type business_plan as enum ('basico', 'completo');
create type member_role as enum ('owner', 'staff');
create type product_kind as enum ('product', 'service');

create table businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  logo_url text,
  brand_color text not null default '#0b4a56',
  whatsapp_number text,
  timezone text not null default 'America/Bogota',
  status business_status not null default 'trial',
  plan business_plan not null default 'basico',
  trial_ends_at timestamptz,
  paid_until timestamptz,
  template text not null default 'tienda' check (template in ('tienda', 'agenda')),
  created_at timestamptz not null default now()
);

-- Horario por día: {"mon":{"open":"11:00","close":"22:00"}, ...}.
-- {} significa que todavía no hay horario y la tienda no lo valida.
-- appointments queda en false: la agenda de citas no se construye en este segmento.
create table business_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  age_verification boolean not null default true,
  tobacco_rules boolean not null default true,
  delivery boolean not null default true,
  opening_hours jsonb not null default '{}'::jsonb,
  appointments boolean not null default false,
  sale_margin_percent int not null default 30 check (sale_margin_percent between 0 and 500)
);

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null,
  primary key (business_id, user_id)
);

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Días de mora antes de cerrar una tienda past_due. create_order lo lee aquí, no de una variable del servidor.
create table platform_settings (
  key text primary key,
  value jsonb not null
);

insert into platform_settings (key, value) values ('past_due_grace_days', '5'::jsonb);

-- Pagos manuales. Solo el superadmin los lee y los escribe.
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

-- Altas, estados, pagos, miembros y dominios. El detalle no guarda contraseñas ni claves.
create table platform_audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id),
  action text not null,
  business_id uuid references businesses(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_log_business_idx on platform_audit_log (business_id, created_at desc);

-- El dominio completo (dondenoe.vercel.app) abre el negocio solo si verified = true.
-- Lo escribe el superadmin. El dueño solo puede leer los de su negocio.
create table business_domains (
  business_id uuid not null references businesses(id) on delete cascade,
  domain text not null unique,
  verified boolean not null default false
);

create table business_order_counters (
  business_id uuid primary key references businesses(id) on delete cascade,
  last_number int not null default 0
);

-- Catálogo maestro compartido. No pertenece a un negocio.
create table master_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand text not null check (char_length(btrim(brand)) between 1 and 80),
  kind text not null check (kind in (
    'aguardiente', 'ron', 'cerveza', 'whisky', 'vino', 'mezclador', 'hielo', 'snack', 'cigarrillo', 'otro'
  )),
  presentation text not null check (char_length(btrim(presentation)) between 1 and 80),
  volume_ml int check (volume_ml is null or volume_ml > 0),
  units_per_pack int not null default 1 check (units_per_pack > 0),
  barcode text,
  image_url text,
  niche text not null default 'estanco' check (char_length(niche) between 1 and 40),
  active boolean not null default true,
  aliases text[] not null default '{}',
  draft boolean not null default true,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  identity_key text generated always as (
    niche || '|' || lower(btrim(name)) || '|' || lower(btrim(brand)) || '|' || lower(btrim(presentation))
  ) stored,
  unique (identity_key),
  unique (barcode)
);

create function master_products_search_text() returns trigger
language plpgsql as $$
begin
  new.search_text := lower(
    btrim(new.name) || ' ' || btrim(new.brand) || ' ' || btrim(new.presentation) || ' ' || array_to_string(new.aliases, ' ')
  );
  return new;
end $$;

create trigger master_products_search
before insert or update of name, brand, presentation, aliases on master_products
for each row execute function master_products_search_text();

create index master_products_search_idx on master_products using gin (search_text gin_trgm_ops);

-- ============ Catálogo ============

create table categories (
  id serial primary key,
  business_id uuid not null references businesses(id),
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  -- Ley 1335 de 2009: el tabaco no puede promocionarse.
  allows_promotion boolean not null default true,
  unique (business_id, slug)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  category_id int not null references categories(id),
  name text not null,
  description text,
  price int not null check (price >= 0),
  cost int not null default 0 check (cost >= 0),
  stock int not null default 0,
  min_stock int not null default 0,
  image_url text,
  active boolean not null default true,
  kind product_kind not null default 'product',
  duration_minutes int,
  master_product_id uuid references master_products(id) on delete set null,
  barcode text,
  created_at timestamptz not null default now(),
  check (duration_minutes is null or (kind = 'service' and duration_minutes > 0))
);

create table combos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  name text not null,
  description text,
  price int not null check (price >= 0),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table combo_items (
  business_id uuid not null references businesses(id),
  combo_id uuid not null references combos(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null check (quantity > 0),
  primary key (combo_id, product_id)
);

create table delivery_zones (
  id serial primary key,
  business_id uuid not null references businesses(id),
  name text not null,
  fee int not null check (fee >= 0),
  active boolean not null default true
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  title text not null,
  description text,
  discount_percent int check (discount_percent between 0 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true
);

-- ============ Clientes y pedidos ============

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  name text not null,
  phone text not null,
  address text,
  accepts_marketing boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

create type order_status as enum ('nuevo', 'confirmado', 'en_camino', 'entregado', 'cancelado');
create type payment_method as enum ('efectivo', 'nequi', 'daviplata', 'transferencia');

create table orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  number int not null,
  customer_id uuid not null references customers(id),
  zone_id int references delivery_zones(id),
  customer_name text,
  address text,
  subtotal int not null,
  delivery_fee int not null default 0,
  total int not null,
  payment_method payment_method not null,
  status order_status not null default 'nuevo',
  age_confirmed boolean not null,
  age_verified_on_delivery boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (business_id, number)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  combo_id uuid references combos(id),
  name text not null,
  unit_price int not null,
  unit_cost int not null default 0,
  quantity int not null check (quantity > 0),
  check ((product_id is null) <> (combo_id is null))
);

-- ============ Inventario ============

create type movement_reason as enum ('entrada', 'venta', 'ajuste', 'devolucion');

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  product_id uuid not null references products(id),
  quantity int not null,
  reason movement_reason not null,
  order_id uuid references orders(id),
  note text,
  created_at timestamptz not null default now()
);

create index categories_business_id_idx on categories (business_id);
create index products_business_id_idx on products (business_id);
create index combos_business_id_idx on combos (business_id);
create index combo_items_business_id_idx on combo_items (business_id);
create index delivery_zones_business_id_idx on delivery_zones (business_id);
create index promotions_business_id_idx on promotions (business_id);
create index customers_business_id_idx on customers (business_id);
create index orders_business_id_idx on orders (business_id);
create index order_items_business_id_idx on order_items (business_id);
create index order_items_order_id_idx on order_items (order_id);
create index inventory_movements_business_id_idx on inventory_movements (business_id);
create unique index products_business_barcode_idx on products (business_id, barcode) where barcode is not null;

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('csv', 'xlsx', 'image', 'pdf')),
  status text not null check (status in ('revisando', 'confirmado', 'fallido')),
  file_path text,
  result jsonb,
  created_at timestamptz not null default now(),
  check (file_path is null or char_length(file_path) <= 300)
);

create index import_jobs_business_idx on import_jobs (business_id, created_at desc);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  used_on date not null,
  units int not null check (units > 0 and units <= 20),
  estimated_cost numeric(12, 4) check (estimated_cost is null or estimated_cost >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_business_day_idx on ai_usage (business_id, used_on);

insert into platform_settings (key, value)
values ('ai_daily_reads', '{"basico":10,"completo":10}'::jsonb);
create index business_members_user_id_idx on business_members (user_id);

-- ============ Funciones de acceso ============

create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create function is_member(business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_members
    where business_members.business_id = is_member.business_id
      and user_id = auth.uid()
  );
$$;

create function is_owner(business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_members
    where business_members.business_id = is_owner.business_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

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

-- trial y active reciben pedidos. past_due también, mientras el atraso no pase los días de gracia.
-- suspended no recibe pedidos.
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

create function business_is_open(business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.business_accepts_orders(business_id);
$$;

-- Lista del superpanel. Quien no es superadmin no recibe filas.
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

create function storage_object_business(object_name text) returns uuid
language sql immutable set search_path = public as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then substring(object_name from 1 for 36)::uuid
    else null
  end;
$$;

-- La vitrina necesita saber si el negocio existe aunque esté suspendido.
-- No devuelve costos, clientes ni pedidos.
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

-- Hostname en minúsculas, sin puerto ni ruta. Exige al menos un punto.
create function domain_is_valid(p_domain text) returns boolean
language sql immutable set search_path = public as $$
  select p_domain is not null
    and char_length(p_domain) <= 253
    and p_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$';
$$;

alter table business_domains
  add constraint business_domains_domain_format check (domain_is_valid(domain));

-- Igual que public_store, pero solo dominios verificados.
-- Un negocio suspendido o vencido también se resuelve, para mostrar que la tienda no está disponible.
-- orders_open dice si todavía recibe pedidos. No devuelve la tabla business_domains.
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

create function next_order_number(p_business_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_number int;
begin
  insert into business_order_counters (business_id, last_number)
  values (p_business_id, 1)
  on conflict (business_id) do update
    set last_number = business_order_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end $$;

-- Impide que un pedido, un combo o un movimiento mezcle datos de otro negocio.
create function reject_cross_business() returns trigger
language plpgsql set search_path = public as $$
declare
  v_owner uuid;
  v_other uuid;
  v_kind product_kind;
begin
  if tg_table_name = 'products' then
    select business_id into v_owner from categories where id = new.category_id;
    if v_owner is distinct from new.business_id then
      raise exception 'La categoría no pertenece a este negocio';
    end if;
  elsif tg_table_name = 'orders' then
    select business_id into v_owner from customers where id = new.customer_id;
    if v_owner is distinct from new.business_id then
      raise exception 'El cliente no pertenece a este negocio';
    end if;
    if new.zone_id is not null then
      select business_id into v_other from delivery_zones where id = new.zone_id;
      if v_other is distinct from new.business_id then
        raise exception 'La zona no pertenece a este negocio';
      end if;
    end if;
  elsif tg_table_name = 'order_items' then
    select business_id into v_owner from orders where id = new.order_id;
    if v_owner is distinct from new.business_id then
      raise exception 'El ítem no pertenece al negocio del pedido';
    end if;
    if new.product_id is not null then
      select business_id into v_other from products where id = new.product_id;
      if v_other is distinct from new.business_id then
        raise exception 'El producto no pertenece a este negocio';
      end if;
    end if;
    if new.combo_id is not null then
      select business_id into v_other from combos where id = new.combo_id;
      if v_other is distinct from new.business_id then
        raise exception 'El combo no pertenece a este negocio';
      end if;
    end if;
  elsif tg_table_name = 'combo_items' then
    select business_id into v_owner from combos where id = new.combo_id;
    select business_id into v_other from products where id = new.product_id;
    if v_owner is distinct from new.business_id or v_other is distinct from new.business_id then
      raise exception 'El producto del combo no pertenece a este negocio';
    end if;
  elsif tg_table_name = 'inventory_movements' then
    select business_id, kind into v_other, v_kind from products where id = new.product_id;
    if v_other is distinct from new.business_id then
      raise exception 'El movimiento no pertenece al negocio del producto';
    end if;
    if v_kind is distinct from 'product' then
      raise exception 'El inventario solo aplica a productos';
    end if;
    if new.order_id is not null then
      select business_id into v_owner from orders where id = new.order_id;
      if v_owner is distinct from new.business_id then
        raise exception 'El movimiento no pertenece al negocio del pedido';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger products_same_business
before insert or update on products
for each row execute function reject_cross_business();

create trigger orders_same_business
before insert or update on orders
for each row execute function reject_cross_business();

create trigger order_items_same_business
before insert or update on order_items
for each row execute function reject_cross_business();

create trigger combo_items_same_business
before insert or update on combo_items
for each row execute function reject_cross_business();

create trigger movements_same_business
before insert or update on inventory_movements
for each row execute function reject_cross_business();

create function apply_inventory_movement() returns trigger
language plpgsql set search_path = public as $$
begin
  update products set stock = stock + new.quantity
  where id = new.product_id and kind = 'product';
  return new;
end $$;

create trigger inventory_movement_applies_stock
after insert on inventory_movements
for each row execute function apply_inventory_movement();

create function discount_stock_on_delivery() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'entregado' and old.status <> 'entregado' then
    new.delivered_at := now();
    insert into inventory_movements (business_id, product_id, quantity, reason, order_id)
    select new.business_id, lines.product_id, -sum(lines.qty), 'venta', new.id
    from (
      select oi.product_id, oi.quantity as qty
      from order_items oi
      where oi.order_id = new.id and oi.product_id is not null
      union all
      select ci.product_id, oi.quantity * ci.quantity
      from order_items oi
      join combo_items ci on ci.combo_id = oi.combo_id
      where oi.order_id = new.id
    ) lines
    join products p on p.id = lines.product_id and p.kind = 'product'
    group by lines.product_id;
  end if;
  return new;
end $$;

create trigger order_delivered_discounts_stock
before update of status on orders
for each row execute function discount_stock_on_delivery();

-- El costo solo lo ve y lo escribe el dueño. El empleado recibe cost = null.
-- min_stock sí se devuelve: el empleado lo usa para el aviso de stock bajo.
create function admin_list_products(business_id uuid)
returns table (
  id uuid,
  category_id int,
  name text,
  description text,
  price int,
  cost int,
  stock int,
  min_stock int,
  image_url text,
  active boolean,
  kind product_kind,
  duration_minutes int,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(business_id) then
    raise exception 'No autorizado';
  end if;
  return query
  select p.id, p.category_id, p.name, p.description, p.price,
         case when public.is_owner(admin_list_products.business_id) then p.cost else null end,
         p.stock, p.min_stock, p.image_url, p.active, p.kind, p.duration_minutes, p.created_at
  from products p
  where p.business_id = admin_list_products.business_id
  order by p.name;
end $$;

create function admin_set_product_private(business_id uuid, product_id uuid, cost int, min_stock int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(business_id) then
    raise exception 'Solo el dueño puede cambiar el costo';
  end if;
  if product_id is null or cost is null or min_stock is null or cost < 0 or min_stock < 0 then
    raise exception 'Costo o stock mínimo inválido';
  end if;
  update products
  set cost = admin_set_product_private.cost,
      min_stock = admin_set_product_private.min_stock
  where id = product_id
    and products.business_id = admin_set_product_private.business_id;
  if not found then
    raise exception 'Producto no encontrado';
  end if;
end $$;

-- Ventas y ganancia por producto. order_items.unit_cost no se concede al panel.
create function admin_sales_report(business_id uuid, desde timestamptz, hasta timestamptz)
returns table (
  product_name text,
  quantity bigint,
  sales bigint,
  profit bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner(business_id) then
    raise exception 'Solo el dueño puede ver las ganancias';
  end if;
  if desde is null or hasta is null or hasta < desde then
    raise exception 'Indica el rango del reporte';
  end if;
  return query
  select oi.name,
         sum(oi.quantity)::bigint,
         sum(oi.unit_price::bigint * oi.quantity)::bigint,
         sum((oi.unit_price - oi.unit_cost)::bigint * oi.quantity)::bigint
  from order_items oi
  join orders o on o.id = oi.order_id and o.business_id = oi.business_id
  where oi.business_id = admin_sales_report.business_id
    and o.status = 'entregado'
    and o.created_at >= desde
    and o.created_at <= hasta
  group by oi.name
  order by oi.name;
end $$;

-- Un negocio siempre conserva al menos un dueño.
create function protect_last_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_others int;
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      select count(*) into v_others
      from business_members
      where business_id = old.business_id
        and role = 'owner'
        and user_id <> old.user_id;
      if v_others = 0 then
        raise exception 'Este negocio no puede quedar sin dueño';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'owner'
     and (new.role is distinct from 'owner' or new.business_id is distinct from old.business_id) then
    select count(*) into v_others
    from business_members
    where business_id = old.business_id
      and role = 'owner'
      and user_id <> old.user_id;
    if v_others = 0 then
      raise exception 'Este negocio no puede quedar sin dueño';
    end if;
  end if;
  return new;
end $$;

create trigger business_members_keep_owner
before update or delete on business_members
for each row execute function protect_last_owner();

-- El dueño cambia el nombre y la marca. El plan, el estado, la prueba y la plantilla no.
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

-- ============ Crear pedido ============
-- p_business_id lo resuelve el servidor a partir del dominio. El navegador no lo elige.
-- Los precios salen de la base. El stock solo se valida en kind = product.

create function create_order(
  p_business_id uuid,
  p_name text,
  p_phone text,
  p_address text,
  p_zone_id int,
  p_payment payment_method,
  p_age_confirmed boolean,
  p_items jsonb,
  p_notes text default null,
  p_accepts_marketing boolean default false
) returns table (order_number int, order_total int)
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_address text := btrim(coalesce(p_address, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal int;
  v_fee int := 0;
  v_number int;
  v_short_name text;
  v_have int;
  v_status business_status;
  v_timezone text;
  v_hours jsonb;
  v_age boolean;
  v_delivery boolean;
  v_local timestamp;
  v_day text;
  v_open time;
  v_close time;
  v_now time;
begin
  select b.status, b.timezone, coalesce(s.opening_hours, '{}'::jsonb),
         coalesce(s.age_verification, true), coalesce(s.delivery, true)
  into v_status, v_timezone, v_hours, v_age, v_delivery
  from businesses b
  left join business_settings s on s.business_id = b.id
  where b.id = p_business_id;

  if not found then
    raise exception 'Este negocio no está recibiendo pedidos';
  end if;
  if not public.business_accepts_orders(p_business_id) then
    raise exception 'Tienda temporalmente no disponible';
  end if;

  if v_age and not coalesce(p_age_confirmed, false) then
    raise exception 'Solo se vende a mayores de 18 años';
  end if;

  if v_hours is not null and v_hours <> '{}'::jsonb then
    v_local := timezone(coalesce(nullif(v_timezone, ''), 'America/Bogota'), now());
    v_day := case extract(dow from v_local)::int
      when 0 then 'sun' when 1 then 'mon' when 2 then 'tue'
      when 3 then 'wed' when 4 then 'thu' when 5 then 'fri' else 'sat' end;
    if jsonb_typeof(v_hours->v_day) <> 'object' then
      raise exception 'En este momento la tienda está cerrada';
    end if;
    begin
      v_open := (v_hours->v_day->>'open')::time;
      v_close := (v_hours->v_day->>'close')::time;
    exception
      when others then
        raise exception 'En este momento la tienda está cerrada';
    end;
    v_now := v_local::time;
    if v_open is null or v_close is null then
      raise exception 'En este momento la tienda está cerrada';
    elsif v_open <= v_close then
      if v_now < v_open or v_now >= v_close then
        raise exception 'En este momento la tienda está cerrada';
      end if;
    elsif v_now < v_open and v_now >= v_close then
      raise exception 'En este momento la tienda está cerrada';
    end if;
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'El nombre debe tener entre 1 y 80 caracteres';
  end if;
  if v_phone !~ '^\d{10}$' then
    raise exception 'El celular debe tener 10 dígitos';
  end if;
  if char_length(v_address) < 1 or char_length(v_address) > 200 then
    raise exception 'La dirección debe tener entre 1 y 200 caracteres';
  end if;
  if v_notes is not null and char_length(v_notes) > 300 then
    raise exception 'Las notas no pueden pasar de 300 caracteres';
  end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'El pedido no puede tener más de 30 líneas';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) i
    where coalesce(i->>'type', '') not in ('product', 'combo')
       or coalesce(i->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'Un producto del pedido ya no está disponible';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) i
    where coalesce(i->>'quantity', '') !~ '^[0-9]+$'
       or (i->>'quantity')::int < 1
       or (i->>'quantity')::int > 50
  ) then
    raise exception 'Cada producto debe pedirse entre 1 y 50 unidades';
  end if;

  if (
    select count(*)
    from orders o
    join customers c on c.id = o.customer_id
    where o.business_id = p_business_id
      and c.business_id = p_business_id
      and c.phone = v_phone
      and o.status = 'nuevo'
  ) >= 3 then
    raise exception 'Ya tienes 3 pedidos sin confirmar. Escríbenos por WhatsApp para seguir';
  end if;

  if not v_delivery and p_zone_id is not null then
    raise exception 'Este negocio no hace domicilios';
  end if;
  if p_zone_id is not null then
    select fee into v_fee from delivery_zones
    where id = p_zone_id and active and business_id = p_business_id;
    if not found then
      raise exception 'Zona de domicilio no válida';
    end if;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) i
    where i->>'type' = 'product'
      and not exists (
        select 1 from products p
        where p.id = (i->>'id')::uuid
          and p.business_id = p_business_id
          and p.active
      )
  ) then
    raise exception 'Un producto del pedido ya no está disponible';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) i
    where i->>'type' = 'combo'
      and not exists (
        select 1 from combos c
        where c.id = (i->>'id')::uuid
          and c.business_id = p_business_id
          and c.active
      )
  ) then
    raise exception 'Un combo del pedido ya no está disponible';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) i
    join combo_items ci on ci.combo_id = (i->>'id')::uuid
    left join products p on p.id = ci.product_id and p.active and p.business_id = p_business_id
    where i->>'type' = 'combo' and p.id is null
  ) then
    raise exception 'Un producto del pedido ya no está disponible';
  end if;

  select p.name, p.stock
  into v_short_name, v_have
  from (
    select product_id, sum(qty) as need
    from (
      select (i->>'id')::uuid as product_id, (i->>'quantity')::int as qty
      from jsonb_array_elements(p_items) i
      join products p on p.id = (i->>'id')::uuid and p.kind = 'product'
      where i->>'type' = 'product'
      union all
      select ci.product_id, (i->>'quantity')::int * ci.quantity
      from jsonb_array_elements(p_items) i
      join combo_items ci on ci.combo_id = (i->>'id')::uuid
      join products p on p.id = ci.product_id and p.kind = 'product'
      where i->>'type' = 'combo'
    ) lines
    group by product_id
  ) demand
  join products p on p.id = demand.product_id and p.business_id = p_business_id
  where demand.need > p.stock
  limit 1;

  if found then
    raise exception using message = format('No hay suficiente stock de %s (quedan %s)', v_short_name, v_have);
  end if;

  insert into customers (business_id, name, phone, address, accepts_marketing)
  values (p_business_id, v_name, v_phone, v_address, coalesce(p_accepts_marketing, false))
  on conflict (business_id, phone) do update
    set accepts_marketing = customers.accepts_marketing or excluded.accepts_marketing
  returning id into v_customer_id;

  v_number := next_order_number(p_business_id);

  insert into orders (
    business_id, number, customer_id, customer_name, zone_id, address, subtotal, delivery_fee, total,
    payment_method, age_confirmed, notes
  )
  values (
    p_business_id, v_number, v_customer_id, v_name, p_zone_id, v_address, 0, v_fee, 0,
    p_payment, coalesce(p_age_confirmed, false), v_notes
  )
  returning id into v_order_id;

  insert into order_items (business_id, order_id, product_id, name, unit_price, unit_cost, quantity)
  select p_business_id, v_order_id, p.id, p.name, p.price, p.cost, (i->>'quantity')::int
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i->>'id')::uuid and p.active and p.business_id = p_business_id
  where i->>'type' = 'product';

  insert into order_items (business_id, order_id, combo_id, name, unit_price, unit_cost, quantity)
  select p_business_id, v_order_id, c.id, c.name, c.price,
         (select coalesce(sum(p.cost * ci.quantity), 0)
            from combo_items ci join products p on p.id = ci.product_id
           where ci.combo_id = c.id),
         (i->>'quantity')::int
  from jsonb_array_elements(p_items) i
  join combos c on c.id = (i->>'id')::uuid and c.active and c.business_id = p_business_id
  where i->>'type' = 'combo';

  select coalesce(sum(unit_price * quantity), 0) into v_subtotal
  from order_items where order_id = v_order_id;

  if v_subtotal = 0 then
    raise exception 'Ningún producto del pedido está disponible';
  end if;

  update orders set subtotal = v_subtotal, total = v_subtotal + v_fee
  where id = v_order_id;

  return query select v_number, v_subtotal + v_fee;
end $$;

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

create function search_master_products(p_query text, p_kind text default null, p_include_drafts boolean default false)
returns table (
  id uuid,
  name text,
  brand text,
  kind text,
  presentation text,
  volume_ml int,
  units_per_pack int,
  barcode text,
  image_url text,
  aliases text[],
  active boolean,
  draft boolean,
  score real
)
language sql stable security definer set search_path = public as $$
  with q as (select lower(btrim(coalesce(p_query, ''))) as t),
  scored as (
    select m.*,
      greatest(
        similarity(lower(m.name), q.t),
        similarity(lower(m.brand), q.t),
        similarity(lower(m.presentation), q.t),
        coalesce((select max(similarity(lower(alias), q.t)) from unnest(m.aliases) alias), 0)
      ) as rank
    from master_products m
    cross join q
    where (p_kind is null or p_kind = '' or m.kind = p_kind)
      and (
        public.is_platform_admin()
        or (
          m.active and not m.draft
          and exists (select 1 from business_members bm where bm.user_id = auth.uid())
        )
      )
      and (
        not public.is_platform_admin()
        or p_include_drafts
        or (m.active and not m.draft)
      )
      and (
        q.t = ''
        or m.search_text % q.t
        or m.search_text like '%' || q.t || '%'
        or similarity(m.search_text, q.t) > 0.24
      )
  )
  select s.id, s.name, s.brand, s.kind, s.presentation, s.volume_ml, s.units_per_pack,
         s.barcode, s.image_url, s.aliases, s.active, s.draft, s.rank
  from scored s
  where (select t from q) = '' or s.rank > 0 or lower(s.name) like '%' || (select t from q) || '%'
  order by s.draft, s.rank desc, s.name
  limit 40;
$$;

create function match_catalog_lines(p_business_id uuid, p_lines jsonb)
returns table (
  idx int,
  master_product_id uuid,
  master_name text,
  score real,
  product_id uuid,
  product_name text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_line jsonb;
  v_index int := 0;
  v_name text;
  v_barcode text;
  v_master uuid;
  v_label text;
  v_score real;
  v_product uuid;
  v_product_name text;
begin
  if not public.is_member(p_business_id) then
    return;
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    return;
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_name := lower(btrim(coalesce(v_line->>'nombre', '')));
    v_barcode := nullif(btrim(coalesce(v_line->>'codigo_barras', '')), '');
    v_master := null;
    v_label := null;
    v_score := 0;
    v_product := null;
    v_product_name := null;
    if v_barcode is not null then
      select m.id, m.name || ' ' || m.presentation, 1
        into v_master, v_label, v_score
      from master_products m
      where m.barcode = v_barcode and m.active and not m.draft
      limit 1;
    end if;
    if v_master is null and v_name <> '' then
      select m.id, m.name || ' ' || m.presentation,
             greatest(
               similarity(lower(m.name), v_name),
               similarity(lower(m.brand), v_name),
               coalesce((select max(similarity(lower(alias), v_name)) from unnest(m.aliases) alias), 0)
             )
        into v_master, v_label, v_score
      from master_products m
      where m.active and not m.draft
      order by 3 desc
      limit 1;
    end if;
    if v_score is null or v_score < 0.3 then
      v_master := null;
      v_label := null;
      v_score := coalesce(v_score, 0);
    end if;
    select p.id, p.name into v_product, v_product_name
    from products p
    where p.business_id = p_business_id
      and (
        (v_barcode is not null and p.barcode = v_barcode)
        or (v_master is not null and p.master_product_id = v_master)
        or (v_name <> '' and similarity(lower(p.name), v_name) > 0.55)
      )
    order by case when v_barcode is not null and p.barcode = v_barcode then 0 else 1 end
    limit 1;
    idx := v_index;
    master_product_id := v_master;
    master_name := v_label;
    score := v_score;
    product_id := v_product;
    product_name := v_product_name;
    return next;
    v_index := v_index + 1;
  end loop;
end $$;

create function add_products_from_master(p_business_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_master uuid;
  v_category int;
  v_price int;
  v_cost int;
  v_stock int;
  v_name text;
  v_presentation text;
  v_image text;
  v_barcode text;
  v_existing uuid;
  v_id uuid;
  v_created int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_owner boolean := public.is_owner(p_business_id);
begin
  if not public.is_member(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Elige entre 1 y 100 productos';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_master := nullif(v_item->>'master_product_id', '')::uuid;
    v_category := nullif(v_item->>'category_id', '')::int;
    v_price := nullif(v_item->>'price', '')::int;
    v_stock := coalesce(nullif(v_item->>'stock', '')::int, 0);
    if v_price is null or v_price <= 0 or v_stock < 0 or v_stock > 100000 then
      raise exception 'Revisa el precio y el stock';
    end if;
    if not exists (
      select 1 from categories c where c.id = v_category and c.business_id = p_business_id
    ) then
      raise exception 'La categoría no es de esta tienda';
    end if;
    select m.name, m.presentation, m.image_url, m.barcode
      into v_name, v_presentation, v_image, v_barcode
    from master_products m
    where m.id = v_master and m.active and not m.draft;
    if not found then
      raise exception 'Ese producto del catálogo no está disponible';
    end if;
    select p.id into v_existing
    from products p
    where p.business_id = p_business_id and p.master_product_id = v_master
    limit 1;
    if v_existing is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('name', v_name, 'reason', 'ya existe'));
      continue;
    end if;
    insert into products (
      business_id, category_id, name, description, price, image_url, master_product_id, barcode, kind
    ) values (
      p_business_id, v_category, v_name, nullif(v_presentation, ''), v_price, v_image, v_master, v_barcode, 'product'
    ) returning id into v_id;
    if v_owner and nullif(v_item->>'cost', '') is not null then
      v_cost := (v_item->>'cost')::int;
      if v_cost is null or v_cost < 0 then
        raise exception 'Costo o stock mínimo inválido';
      end if;
      update products set cost = v_cost where id = v_id;
    end if;
    if v_stock > 0 then
      insert into inventory_movements (business_id, product_id, quantity, reason, note)
      values (p_business_id, v_id, v_stock, 'entrada', 'Catálogo maestro');
    end if;
    v_created := v_created + 1;
  end loop;
  return jsonb_build_object('creados', v_created, 'omitidos', v_skipped);
end $$;

create function confirm_catalog_import(p_business_id uuid, p_lines jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_action text;
  v_name text;
  v_price int;
  v_qty int;
  v_cost int;
  v_master uuid;
  v_product uuid;
  v_category int;
  v_barcode text;
  v_saved int := 0;
  v_owner boolean := public.is_owner(p_business_id);
begin
  if not public.is_member(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 200 then
    raise exception 'La importación debe tener entre 1 y 200 líneas';
  end if;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_action := coalesce(v_item->>'action', '');
    if v_action = 'omitir' then
      continue;
    end if;
    if v_action not in ('crear', 'vincular', 'actualizar') then
      raise exception 'Acción no válida';
    end if;
    v_name := btrim(coalesce(v_item->>'name', ''));
    v_price := nullif(v_item->>'price', '')::int;
    v_qty := coalesce(nullif(v_item->>'quantity', '')::int, 0);
    v_barcode := nullif(btrim(coalesce(v_item->>'barcode', '')), '');
    v_master := nullif(v_item->>'master_product_id', '')::uuid;
    if v_price is null or v_price <= 0 or v_qty < 0 or v_qty > 100000 then
      raise exception 'Revisa el precio y el stock';
    end if;
    if char_length(v_name) < 1 or char_length(v_name) > 120 then
      raise exception 'Revisa el nombre';
    end if;
    if v_master is not null and not exists (
      select 1 from master_products m where m.id = v_master and m.active and not m.draft
    ) then
      raise exception 'Ese producto del catálogo no está disponible';
    end if;
    if v_action = 'vincular' and v_master is null then
      raise exception 'Elige el producto del catálogo';
    end if;

    if v_action = 'actualizar' then
      v_product := nullif(v_item->>'product_id', '')::uuid;
      update products
      set price = v_price,
          name = v_name,
          master_product_id = coalesce(v_master, master_product_id),
          barcode = coalesce(v_barcode, barcode)
      where id = v_product and business_id = p_business_id;
      if not found then
        raise exception 'No encontramos ese producto en la tienda';
      end if;
    else
      v_category := nullif(v_item->>'category_id', '')::int;
      if not exists (
        select 1 from categories c where c.id = v_category and c.business_id = p_business_id
      ) then
        raise exception 'La categoría no es de esta tienda';
      end if;
      insert into products (
        business_id, category_id, name, description, price, master_product_id, barcode, kind
      ) values (
        p_business_id, v_category, v_name, nullif(btrim(coalesce(v_item->>'presentation', '')), ''),
        v_price, v_master, v_barcode, 'product'
      ) returning id into v_product;
    end if;

    if v_owner and nullif(v_item->>'cost', '') is not null then
      v_cost := (v_item->>'cost')::int;
      if v_cost is null or v_cost < 0 then
        raise exception 'Costo o stock mínimo inválido';
      end if;
      update products set cost = v_cost where id = v_product and business_id = p_business_id;
    end if;
    if v_qty > 0 then
      insert into inventory_movements (business_id, product_id, quantity, reason, note)
      values (p_business_id, v_product, v_qty, 'entrada', 'Importación');
    end if;
    v_saved := v_saved + 1;
  end loop;
  return v_saved;
end $$;

create function ai_daily_limit(p_business_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select (s.value ->> b.plan::text)::int
      from platform_settings s
      join businesses b on b.id = p_business_id
      where s.key = 'ai_daily_reads'
    ),
    10
  );
$$;

create function ai_reads_today(p_business_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(u.units), 0)::int
  from ai_usage u
  join businesses b on b.id = u.business_id
  where u.business_id = p_business_id
    and u.used_on = (timezone(coalesce(nullif(b.timezone, ''), 'America/Bogota'), now()))::date
    and (public.is_member(p_business_id) or public.is_platform_admin());
$$;

create function record_ai_usage(p_business_id uuid, p_units int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date;
  v_used int;
begin
  if not public.is_member(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if p_units is null or p_units < 1 or p_units > 5 then
    raise exception 'No se pudo registrar la lectura';
  end if;
  select (timezone(coalesce(nullif(b.timezone, ''), 'America/Bogota'), now()))::date
    into v_today
  from businesses b where b.id = p_business_id;
  select coalesce(sum(units), 0) into v_used
  from ai_usage where business_id = p_business_id and used_on = v_today;
  if v_used + p_units > public.ai_daily_limit(p_business_id) then
    raise exception 'Llegaste al límite de lecturas con IA de hoy';
  end if;
  insert into ai_usage (business_id, used_on, units) values (p_business_id, v_today, p_units);
end $$;

create function platform_ai_usage()
returns table (business_id uuid, business_name text, units bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, coalesce(sum(u.units), 0)::bigint
  from businesses b
  left join ai_usage u
    on u.business_id = b.id
   and u.used_on >= (timezone('America/Bogota', now()))::date - 30
  where public.is_platform_admin()
  group by b.id, b.name
  order by 3 desc, b.name;
$$;

create function purge_expired_imports() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from storage.objects
  where bucket_id = 'imports'
    and created_at < now() - interval '7 days';
  update import_jobs
  set file_path = null
  where created_at < now() - interval '7 days'
    and file_path is not null;
end $$;

create function strip_import_costs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'No autorizado';
  end if;
  if new.result is not null and not public.is_owner(new.business_id) then
    new.result := jsonb_set(
      new.result,
      '{lineas}',
      coalesce((
        select jsonb_agg(item - 'costo' - 'precio_compra')
        from jsonb_array_elements(coalesce(new.result->'lineas', '[]'::jsonb)) item
      ), '[]'::jsonb),
      true
    );
  end if;
  return new;
end $$;

create trigger import_jobs_strip_costs
before insert or update on import_jobs
for each row execute function strip_import_costs();

alter table master_products enable row level security;
alter table import_jobs enable row level security;
alter table ai_usage enable row level security;

create policy "miembros leen catálogo maestro" on master_products for select to authenticated
  using (
    (active and not draft and exists (select 1 from business_members bm where bm.user_id = auth.uid()))
    or is_platform_admin()
  );
create policy "superadmin crea catálogo maestro" on master_products for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin edita catálogo maestro" on master_products for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

create policy "miembros leen importaciones" on import_jobs for select to authenticated
  using (is_member(business_id));
create policy "miembros crean importaciones" on import_jobs for insert to authenticated
  with check (is_member(business_id) and user_id = auth.uid());
create policy "miembros editan importaciones" on import_jobs for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));

create policy "miembros leen uso de IA" on ai_usage for select to authenticated
  using (is_member(business_id) or is_platform_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports', 'imports', false, 10485760,
  array['text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('master', 'master', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "miembros leen sus importaciones" on storage.objects for select to authenticated
  using (bucket_id = 'imports' and is_member(storage_object_business(name)));
create policy "miembros suben importaciones" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and is_member(storage_object_business(name)));
create policy "miembros borran importaciones" on storage.objects for delete to authenticated
  using (bucket_id = 'imports' and is_member(storage_object_business(name)));

create policy "fotos maestras públicas" on storage.objects for select to public
  using (bucket_id = 'master');
create policy "superadmin sube fotos maestras" on storage.objects for insert to authenticated
  with check (bucket_id = 'master' and is_platform_admin());
create policy "superadmin reemplaza fotos maestras" on storage.objects for update to authenticated
  using (bucket_id = 'master' and is_platform_admin())
  with check (bucket_id = 'master' and is_platform_admin());
create policy "superadmin borra fotos maestras" on storage.objects for delete to authenticated
  using (bucket_id = 'master' and is_platform_admin());

-- ============ Seguridad (RLS) ============
-- anon ve el catálogo activo de los negocios en prueba o activos.
-- authenticated solo ve y escribe el negocio del que es miembro.
-- El superadmin escribe negocios, ajustes, equipo, dominios, pagos y la auditoría.
-- No escribe el catálogo ni los pedidos por estas políticas.

alter table businesses enable row level security;
alter table business_settings enable row level security;
alter table business_members enable row level security;
alter table platform_admins enable row level security;
alter table business_domains enable row level security;
alter table business_order_counters enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table combos enable row level security;
alter table combo_items enable row level security;
alter table delivery_zones enable row level security;
alter table promotions enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table inventory_movements enable row level security;
alter table agenda_settings enable row level security;
alter table professionals enable row level security;
alter table professional_services enable row level security;
alter table professional_hours enable row level security;
alter table professional_blocks enable row level security;
alter table appointment_counters enable row level security;
alter table appointments enable row level security;
alter table platform_settings enable row level security;
alter table payments enable row level security;
alter table platform_audit_log enable row level security;

create policy "negocios públicos" on businesses for select to anon
  using (status in ('trial', 'active'));
create policy "miembros leen su negocio" on businesses for select to authenticated
  using (is_member(id) or is_platform_admin());
create policy "dueño actualiza su negocio" on businesses for update to authenticated
  using (is_owner(id)) with check (is_owner(id));
create policy "superadmin crea negocios" on businesses for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin actualiza negocios" on businesses for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy "superadmin borra negocios" on businesses for delete to authenticated
  using (is_platform_admin());

create policy "ajustes públicos" on business_settings for select to anon
  using (business_is_open(business_id));
create policy "miembros leen ajustes" on business_settings for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "dueño actualiza ajustes" on business_settings for update to authenticated
  using (is_owner(business_id)) with check (is_owner(business_id));
create policy "superadmin crea ajustes" on business_settings for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin actualiza ajustes" on business_settings for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

create policy "miembros ven el equipo" on business_members for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "dueño administra el equipo" on business_members for insert to authenticated
  with check (is_owner(business_id));
create policy "dueño cambia el equipo" on business_members for update to authenticated
  using (is_owner(business_id)) with check (is_owner(business_id));
create policy "dueño quita del equipo" on business_members for delete to authenticated
  using (is_owner(business_id));
create policy "superadmin agrega miembros" on business_members for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin cambia miembros" on business_members for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy "superadmin quita miembros" on business_members for delete to authenticated
  using (is_platform_admin());

create policy "superadmin se reconoce" on platform_admins for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());

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

create policy "dueño lee sus dominios" on business_domains for select to authenticated
  using (is_owner(business_id) or is_platform_admin());
create policy "superadmin crea dominios" on business_domains for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin edita dominios" on business_domains for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy "superadmin borra dominios" on business_domains for delete to authenticated
  using (is_platform_admin());

create policy "anon categorías" on categories for select to anon
  using (business_is_open(business_id));
create policy "miembros leen categorías" on categories for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean categorías" on categories for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan categorías" on categories for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran categorías" on categories for delete to authenticated
  using (is_owner(business_id));

create policy "anon productos activos" on products for select to anon
  using (active and business_is_open(business_id));
create policy "miembros leen productos" on products for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean productos" on products for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan productos" on products for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran productos" on products for delete to authenticated
  using (is_owner(business_id));

create policy "anon combos activos" on combos for select to anon
  using (active and business_is_open(business_id));
create policy "miembros leen combos" on combos for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean combos" on combos for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan combos" on combos for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran combos" on combos for delete to authenticated
  using (is_owner(business_id));

create policy "anon items de combo" on combo_items for select to anon
  using (business_is_open(business_id));
create policy "miembros leen items de combo" on combo_items for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean items de combo" on combo_items for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan items de combo" on combo_items for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran items de combo" on combo_items for delete to authenticated
  using (is_owner(business_id));

create policy "anon zonas activas" on delivery_zones for select to anon
  using (active and business_is_open(business_id));
create policy "miembros leen zonas" on delivery_zones for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean zonas" on delivery_zones for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan zonas" on delivery_zones for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran zonas" on delivery_zones for delete to authenticated
  using (is_owner(business_id));

create policy "anon promociones vigentes" on promotions for select to anon
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()) and business_is_open(business_id));
create policy "miembros leen promociones" on promotions for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean promociones" on promotions for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan promociones" on promotions for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran promociones" on promotions for delete to authenticated
  using (is_owner(business_id));

create policy "miembros leen clientes" on customers for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean clientes" on customers for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan clientes" on customers for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran clientes" on customers for delete to authenticated
  using (is_owner(business_id));

create policy "miembros leen pedidos" on orders for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean pedidos" on orders for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan pedidos" on orders for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran pedidos" on orders for delete to authenticated
  using (is_owner(business_id));

create policy "miembros leen items de pedido" on order_items for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean items de pedido" on order_items for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan items de pedido" on order_items for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran items de pedido" on order_items for delete to authenticated
  using (is_owner(business_id));

create policy "miembros leen inventario" on inventory_movements for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean inventario" on inventory_movements for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan inventario" on inventory_movements for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran inventario" on inventory_movements for delete to authenticated
  using (is_owner(business_id));

-- Fotos en products/{business_id}/archivo. Solo los miembros de ese negocio suben y borran.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "fotos de productos públicas" on storage.objects for select
  to public using (bucket_id = 'products');
create policy "miembros suben fotos" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'products' and is_member(storage_object_business(name))
  );
create policy "miembros actualizan fotos" on storage.objects for update
  to authenticated
  using (bucket_id = 'products' and is_member(storage_object_business(name)))
  with check (bucket_id = 'products' and is_member(storage_object_business(name)));
create policy "miembros borran fotos" on storage.objects for delete
  to authenticated using (bucket_id = 'products' and is_member(storage_object_business(name)));
