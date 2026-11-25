-- Permite guardar si el cliente quiere avisos de promociones por WhatsApp.
-- Ejecutar una vez en Supabase > SQL Editor, con el rol postgres.

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

  insert into customers (name, phone, address, accepts_marketing)
  values (trim(p_name), trim(p_phone), p_address, coalesce(p_accepts_marketing, false))
  on conflict (phone) do update
    set name = excluded.name,
        address = coalesce(excluded.address, customers.address),
        accepts_marketing = customers.accepts_marketing or excluded.accepts_marketing
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
