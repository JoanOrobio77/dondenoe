-- Seguridad de costos, permisos por tabla y pedidos más estrictos.
-- Ejecutar una vez en Supabase > SQL Editor, con el rol postgres.
-- No vuelve a crear las tablas. No hace falta correr schema.sql ni grants.sql.
--
-- Cómo quedan el costo y el stock mínimo:
-- se revocan products.cost y products.min_stock a anon y authenticated.
-- El panel los lee con admin_list_products() y los guarda con
-- admin_set_product_private(). Las dos son SECURITY DEFINER y exigen is_admin().
-- Una vista no basta aquí: en Supabase las vistas nuevas suelen ejecutarse
-- como quien consulta, y ese usuario ya no tiene permiso sobre esas columnas.
--
-- Checklist para revisar a mano (este SQL no puede cambiarlo):
-- [ ] Supabase → Authentication → Email → desactivar "Allow new users to sign up".
-- [ ] Supabase → Authentication → Email → exigir confirmación de correo.
-- [ ] Supabase → Authentication → política de contraseñas fuertes.
-- [ ] Vercel → Settings → Environment Variables: la clave service_role no debe
--     existir en ninguna variable pública NEXT_PUBLIC_*. En este proyecto solo
--     debe estar la llave publicable, en NEXT_PUBLIC_SUPABASE_ANON_KEY.

alter table orders add column if not exists customer_name text;

update orders o
set customer_name = c.name
from customers c
where o.customer_id = c.id
  and (o.customer_name is null or btrim(o.customer_name) = '');

drop function if exists create_order(text, text, text, int, payment_method, boolean, jsonb, text, boolean);
drop function if exists create_order(text, text, text, int, payment_method, boolean, jsonb, text);

create function create_order(
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
begin
  if not coalesce(p_age_confirmed, false) then
    raise exception 'Solo se vende a mayores de 18 años';
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
    where c.phone = v_phone and o.status = 'nuevo'
  ) >= 3 then
    raise exception 'Ya tienes 3 pedidos sin confirmar. Escríbenos por WhatsApp para seguir';
  end if;

  if p_zone_id is not null then
    select fee into v_fee from delivery_zones where id = p_zone_id and active;
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
        where p.id = (i->>'id')::uuid and p.active
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
        where c.id = (i->>'id')::uuid and c.active
      )
  ) then
    raise exception 'Un combo del pedido ya no está disponible';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) i
    join combo_items ci on ci.combo_id = (i->>'id')::uuid
    left join products p on p.id = ci.product_id and p.active
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
      where i->>'type' = 'product'
      union all
      select ci.product_id, (i->>'quantity')::int * ci.quantity
      from jsonb_array_elements(p_items) i
      join combo_items ci on ci.combo_id = (i->>'id')::uuid
      where i->>'type' = 'combo'
    ) lines
    group by product_id
  ) demand
  join products p on p.id = demand.product_id
  where demand.need > p.stock
  limit 1;

  if found then
    raise exception using message = format('No hay suficiente stock de %s (quedan %s)', v_short_name, v_have);
  end if;

  insert into customers (name, phone, address, accepts_marketing)
  values (v_name, v_phone, v_address, coalesce(p_accepts_marketing, false))
  on conflict (phone) do update
    set accepts_marketing = customers.accepts_marketing or excluded.accepts_marketing
  returning id into v_customer_id;

  insert into orders (
    customer_id, customer_name, zone_id, address, subtotal, delivery_fee, total,
    payment_method, age_confirmed, notes
  )
  values (v_customer_id, v_name, p_zone_id, v_address, 0, v_fee, 0, p_payment, true, v_notes)
  returning id, number into v_order_id, v_number;

  insert into order_items (order_id, product_id, name, unit_price, unit_cost, quantity)
  select v_order_id, p.id, p.name, p.price, p.cost, (i->>'quantity')::int
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i->>'id')::uuid and p.active
  where i->>'type' = 'product';

  insert into order_items (order_id, combo_id, name, unit_price, unit_cost, quantity)
  select v_order_id, c.id, c.name, c.price,
         (select coalesce(sum(p.cost * ci.quantity), 0)
            from combo_items ci join products p on p.id = ci.product_id
           where ci.combo_id = c.id),
         (i->>'quantity')::int
  from jsonb_array_elements(p_items) i
  join combos c on c.id = (i->>'id')::uuid and c.active
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

revoke all on function create_order(text, text, text, int, payment_method, boolean, jsonb, text, boolean) from public;
grant execute on function create_order(text, text, text, int, payment_method, boolean, jsonb, text, boolean) to anon, authenticated;

create or replace function admin_list_products()
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
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  return query
  select p.id, p.category_id, p.name, p.description, p.price, p.cost, p.stock,
         p.min_stock, p.image_url, p.active, p.created_at
  from products p
  order by p.name;
end $$;

create or replace function admin_set_product_private(p_id uuid, p_cost int, p_min_stock int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  if p_id is null or p_cost is null or p_min_stock is null or p_cost < 0 or p_min_stock < 0 then
    raise exception 'Costo o stock mínimo inválido';
  end if;
  update products
  set cost = p_cost, min_stock = p_min_stock
  where id = p_id;
  if not found then
    raise exception 'Producto no encontrado';
  end if;
end $$;

revoke all on function admin_list_products() from public, anon, authenticated;
revoke all on function admin_set_product_private(uuid, int, int) from public, anon, authenticated;
grant execute on function admin_list_products() to authenticated;
grant execute on function admin_set_product_private(uuid, int, int) to authenticated;

revoke all on all tables in schema public from anon, authenticated;

grant select on categories, combos, combo_items, delivery_zones, promotions to anon, authenticated;
grant select (id, category_id, name, description, price, stock, image_url, active) on products to anon;
grant select (id, category_id, name, description, price, stock, image_url, active, created_at) on products to authenticated;

grant insert, update, delete on categories to authenticated;
grant insert (category_id, name, description, price, stock, image_url, active),
      update (category_id, name, description, price, stock, image_url, active),
      delete on products to authenticated;
grant insert, update, delete on combos, combo_items, delivery_zones, promotions to authenticated;
grant select, insert, update, delete on customers, orders, order_items, inventory_movements to authenticated;

revoke insert, update, delete, truncate on admins from anon, authenticated;
grant select on admins to authenticated;

grant usage, select on all sequences in schema public to authenticated;
