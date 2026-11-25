-- DondeNoe: esquema completo. Ejecutar una sola vez en Supabase > SQL Editor,
-- seguido de grants.sql y seed.sql.

create extension if not exists pgcrypto;

-- ============ Catálogo ============

create table categories (
  id serial primary key,
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  -- Ley 1335 de 2009: el tabaco no puede promocionarse (sin combos, sin promociones, sin destacar)
  allows_promotion boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id int not null references categories(id),
  name text not null,
  description text,
  price int not null check (price >= 0),
  cost int not null default 0 check (cost >= 0),
  stock int not null default 0,
  min_stock int not null default 0,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table combos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price int not null check (price >= 0),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table combo_items (
  combo_id uuid not null references combos(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null check (quantity > 0),
  primary key (combo_id, product_id)
);

create table delivery_zones (
  id serial primary key,
  name text not null,
  fee int not null check (fee >= 0),
  active boolean not null default true
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
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
  name text not null,
  phone text not null unique,
  address text,
  accepts_marketing boolean not null default false,
  created_at timestamptz not null default now()
);

create type order_status as enum ('nuevo', 'confirmado', 'en_camino', 'entregado', 'cancelado');
create type payment_method as enum ('efectivo', 'nequi', 'daviplata', 'transferencia');

create table orders (
  id uuid primary key default gen_random_uuid(),
  number serial unique,
  customer_id uuid not null references customers(id),
  zone_id int references delivery_zones(id),
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
  delivered_at timestamptz
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
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
  product_id uuid not null references products(id),
  quantity int not null,
  reason movement_reason not null,
  order_id uuid references orders(id),
  note text,
  created_at timestamptz not null default now()
);

create function apply_inventory_movement() returns trigger
language plpgsql as $$
begin
  update products set stock = stock + new.quantity where id = new.product_id;
  return new;
end $$;

create trigger inventory_movement_applies_stock
after insert on inventory_movements
for each row execute function apply_inventory_movement();

-- Al entregar un pedido se descuenta el inventario (incluidos los productos de cada combo)
create function discount_stock_on_delivery() returns trigger
language plpgsql as $$
begin
  if new.status = 'entregado' and old.status <> 'entregado' then
    new.delivered_at := now();

    insert into inventory_movements (product_id, quantity, reason, order_id)
    select product_id, -sum(qty), 'venta', new.id
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
    group by product_id;
  end if;
  return new;
end $$;

create trigger order_delivered_discounts_stock
before update of status on orders
for each row execute function discount_stock_on_delivery();

-- ============ Administradores ============

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ============ Crear pedido (lo llama la tienda pública) ============
-- Los precios se toman de la base de datos, nunca del navegador.
-- p_items: [{"type":"product"|"combo","id":"<uuid>","quantity":2}, ...]

create function create_order(
  p_name text,
  p_phone text,
  p_address text,
  p_zone_id int,
  p_payment payment_method,
  p_age_confirmed boolean,
  p_items jsonb,
  p_notes text default null
) returns table (order_number int, order_total int)
language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal int;
  v_fee int := 0;
  v_number int;
begin
  if not coalesce(p_age_confirmed, false) then
    raise exception 'Solo se vende a mayores de 18 años';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'Nombre y teléfono son obligatorios';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'El pedido está vacío';
  end if;

  if p_zone_id is not null then
    select fee into v_fee from delivery_zones where id = p_zone_id and active;
    if not found then
      raise exception 'Zona de domicilio no válida';
    end if;
  end if;

  insert into customers (name, phone, address)
  values (trim(p_name), trim(p_phone), p_address)
  on conflict (phone) do update
    set name = excluded.name, address = coalesce(excluded.address, customers.address)
  returning id into v_customer_id;

  insert into orders (customer_id, zone_id, address, subtotal, delivery_fee, total,
                      payment_method, age_confirmed, notes)
  values (v_customer_id, p_zone_id, p_address, 0, v_fee, 0, p_payment, true, p_notes)
  returning id, number into v_order_id, v_number;

  insert into order_items (order_id, product_id, name, unit_price, unit_cost, quantity)
  select v_order_id, p.id, p.name, p.price, p.cost, (i->>'quantity')::int
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i->>'id')::uuid and p.active
  where i->>'type' = 'product' and (i->>'quantity')::int > 0;

  insert into order_items (order_id, combo_id, name, unit_price, unit_cost, quantity)
  select v_order_id, c.id, c.name, c.price,
         (select coalesce(sum(p.cost * ci.quantity), 0)
            from combo_items ci join products p on p.id = ci.product_id
           where ci.combo_id = c.id),
         (i->>'quantity')::int
  from jsonb_array_elements(p_items) i
  join combos c on c.id = (i->>'id')::uuid and c.active
  where i->>'type' = 'combo' and (i->>'quantity')::int > 0;

  select coalesce(sum(unit_price * quantity), 0) into v_subtotal
  from order_items where order_id = v_order_id;

  if v_subtotal = 0 then
    raise exception 'Ningún producto del pedido está disponible';
  end if;

  update orders set subtotal = v_subtotal, total = v_subtotal + v_fee
  where id = v_order_id;

  return query select v_number, v_subtotal + v_fee;
end $$;

grant execute on function create_order to anon, authenticated;

-- ============ Seguridad (RLS) ============

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
alter table admins enable row level security;

create policy "catálogo público" on categories for select using (true);
create policy "productos activos públicos" on products for select using (active or is_admin());
create policy "combos activos públicos" on combos for select using (active or is_admin());
create policy "items de combo públicos" on combo_items for select using (true);
create policy "zonas activas públicas" on delivery_zones for select using (active or is_admin());
create policy "promociones activas públicas" on promotions for select
  using ((active and starts_at <= now() and (ends_at is null or ends_at > now())) or is_admin());

create policy "admin categorías" on categories for all using (is_admin()) with check (is_admin());
create policy "admin productos" on products for all using (is_admin()) with check (is_admin());
create policy "admin combos" on combos for all using (is_admin()) with check (is_admin());
create policy "admin items combo" on combo_items for all using (is_admin()) with check (is_admin());
create policy "admin zonas" on delivery_zones for all using (is_admin()) with check (is_admin());
create policy "admin promociones" on promotions for all using (is_admin()) with check (is_admin());
create policy "admin clientes" on customers for all using (is_admin()) with check (is_admin());
create policy "admin pedidos" on orders for all using (is_admin()) with check (is_admin());
create policy "admin items pedido" on order_items for all using (is_admin()) with check (is_admin());
create policy "admin inventario" on inventory_movements for all using (is_admin()) with check (is_admin());
create policy "admin ve admins" on admins for select using (is_admin());
