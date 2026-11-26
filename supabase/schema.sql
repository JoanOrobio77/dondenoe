-- DondeNoe como plataforma: un negocio por dominio.
-- Instalación nueva, en este orden: schema.sql, grants.sql, seed.sql.
-- Si la base ya tiene el estanco de un solo negocio, no corras este archivo.
-- Usa migrations/005_multinegocio.sql.

create extension if not exists pgcrypto;

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
  appointments boolean not null default false
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

-- Preparada para dominios propios. La aplicación todavía no la consulta.
create table business_domains (
  business_id uuid not null references businesses(id) on delete cascade,
  domain text not null unique,
  verified boolean not null default false
);

create table business_order_counters (
  business_id uuid primary key references businesses(id) on delete cascade,
  last_number int not null default 0
);

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

create function business_is_open(business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from businesses
    where businesses.id = business_is_open.business_id
      and status in ('trial', 'active')
  );
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
  opening_hours jsonb
)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.logo_url, b.brand_color, b.whatsapp_number, b.timezone, b.status,
         coalesce(s.age_verification, true),
         coalesce(s.tobacco_rules, true),
         coalesce(s.delivery, true),
         coalesce(s.opening_hours, '{}'::jsonb)
  from businesses b
  left join business_settings s on s.business_id = b.id
  where b.slug = p_slug;
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

-- El costo solo se lee y se escribe por estas funciones.
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
  select p.id, p.category_id, p.name, p.description, p.price, p.cost, p.stock,
         p.min_stock, p.image_url, p.active, p.kind, p.duration_minutes, p.created_at
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

  if not found or v_status not in ('trial', 'active') then
    raise exception 'Este negocio no está recibiendo pedidos';
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

-- ============ Seguridad (RLS) ============
-- anon ve el catálogo activo de los negocios en prueba o activos.
-- authenticated solo ve y escribe el negocio del que es miembro.
-- platform_admins lee todo y no escribe por estas políticas.

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

create policy "negocios públicos" on businesses for select to anon
  using (status in ('trial', 'active'));
create policy "miembros leen su negocio" on businesses for select to authenticated
  using (is_member(id) or is_platform_admin());
create policy "dueño actualiza su negocio" on businesses for update to authenticated
  using (is_owner(id)) with check (is_owner(id));

create policy "ajustes públicos" on business_settings for select to anon
  using (business_is_open(business_id));
create policy "miembros leen ajustes" on business_settings for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "dueño actualiza ajustes" on business_settings for update to authenticated
  using (is_owner(business_id)) with check (is_owner(business_id));

create policy "miembros ven el equipo" on business_members for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "dueño administra el equipo" on business_members for insert to authenticated
  with check (is_owner(business_id));
create policy "dueño cambia el equipo" on business_members for update to authenticated
  using (is_owner(business_id)) with check (is_owner(business_id));
create policy "dueño quita del equipo" on business_members for delete to authenticated
  using (is_owner(business_id));

create policy "superadmin se reconoce" on platform_admins for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());

create policy "anon categorías" on categories for select to anon
  using (business_is_open(business_id));
create policy "miembros leen categorías" on categories for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean categorías" on categories for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan categorías" on categories for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran categorías" on categories for delete to authenticated
  using (is_member(business_id));

create policy "anon productos activos" on products for select to anon
  using (active and business_is_open(business_id));
create policy "miembros leen productos" on products for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean productos" on products for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan productos" on products for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran productos" on products for delete to authenticated
  using (is_member(business_id));

create policy "anon combos activos" on combos for select to anon
  using (active and business_is_open(business_id));
create policy "miembros leen combos" on combos for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean combos" on combos for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan combos" on combos for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran combos" on combos for delete to authenticated
  using (is_member(business_id));

create policy "anon items de combo" on combo_items for select to anon
  using (business_is_open(business_id));
create policy "miembros leen items de combo" on combo_items for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean items de combo" on combo_items for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan items de combo" on combo_items for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran items de combo" on combo_items for delete to authenticated
  using (is_member(business_id));

create policy "anon zonas activas" on delivery_zones for select to anon
  using (active and business_is_open(business_id));
create policy "miembros leen zonas" on delivery_zones for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean zonas" on delivery_zones for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan zonas" on delivery_zones for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran zonas" on delivery_zones for delete to authenticated
  using (is_member(business_id));

create policy "anon promociones vigentes" on promotions for select to anon
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()) and business_is_open(business_id));
create policy "miembros leen promociones" on promotions for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean promociones" on promotions for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan promociones" on promotions for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran promociones" on promotions for delete to authenticated
  using (is_member(business_id));

create policy "miembros leen clientes" on customers for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean clientes" on customers for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan clientes" on customers for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran clientes" on customers for delete to authenticated
  using (is_member(business_id));

create policy "miembros leen pedidos" on orders for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean pedidos" on orders for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan pedidos" on orders for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran pedidos" on orders for delete to authenticated
  using (is_member(business_id));

create policy "miembros leen items de pedido" on order_items for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean items de pedido" on order_items for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan items de pedido" on order_items for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran items de pedido" on order_items for delete to authenticated
  using (is_member(business_id));

create policy "miembros leen inventario" on inventory_movements for select to authenticated
  using (is_member(business_id) or is_platform_admin());
create policy "miembros crean inventario" on inventory_movements for insert to authenticated
  with check (is_member(business_id));
create policy "miembros editan inventario" on inventory_movements for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));
create policy "miembros borran inventario" on inventory_movements for delete to authenticated
  using (is_member(business_id));

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
