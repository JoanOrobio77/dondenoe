-- Dominios verificados, costos y borrados solo del dueño.
-- Correr una vez en una base que ya tiene 005_multinegocio.sql.
-- No vuelve a crear el esquema. No hace falta correr schema.sql ni grants.sql.

create or replace function domain_is_valid(p_domain text) returns boolean
language sql immutable set search_path = public as $$
  select p_domain is not null
    and char_length(p_domain) <= 253
    and p_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$';
$$;

alter table business_domains drop constraint if exists business_domains_domain_format;
alter table business_domains
  add constraint business_domains_domain_format check (domain_is_valid(domain));

create or replace function public_store_by_domain(p_domain text)
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
  from business_domains d
  join businesses b on b.id = d.business_id
  left join business_settings s on s.business_id = b.id
  where d.verified
    and b.status in ('trial', 'active')
    and domain_is_valid(lower(btrim(p_domain)))
    and d.domain = lower(btrim(p_domain));
$$;

create or replace function admin_list_products(business_id uuid)
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

create or replace function admin_sales_report(business_id uuid, desde timestamptz, hasta timestamptz)
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

create or replace function protect_last_owner() returns trigger
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

drop trigger if exists business_members_keep_owner on business_members;
create trigger business_members_keep_owner
before update or delete on business_members
for each row execute function protect_last_owner();

drop policy if exists "dueño lee sus dominios" on business_domains;
drop policy if exists "superadmin crea dominios" on business_domains;
drop policy if exists "superadmin edita dominios" on business_domains;
drop policy if exists "superadmin borra dominios" on business_domains;

create policy "dueño lee sus dominios" on business_domains for select to authenticated
  using (is_owner(business_id) or is_platform_admin());
create policy "superadmin crea dominios" on business_domains for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin edita dominios" on business_domains for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy "superadmin borra dominios" on business_domains for delete to authenticated
  using (is_platform_admin());

drop policy if exists "miembros borran categorías" on categories;
drop policy if exists "miembros borran productos" on products;
drop policy if exists "miembros borran combos" on combos;
drop policy if exists "miembros borran items de combo" on combo_items;
drop policy if exists "miembros borran zonas" on delivery_zones;
drop policy if exists "miembros borran promociones" on promotions;
drop policy if exists "miembros borran clientes" on customers;
drop policy if exists "miembros borran pedidos" on orders;
drop policy if exists "miembros borran items de pedido" on order_items;
drop policy if exists "miembros borran inventario" on inventory_movements;

create policy "miembros borran categorías" on categories for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran productos" on products for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran combos" on combos for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran items de combo" on combo_items for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran zonas" on delivery_zones for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran promociones" on promotions for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran clientes" on customers for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran pedidos" on orders for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran items de pedido" on order_items for delete to authenticated
  using (is_owner(business_id));
create policy "miembros borran inventario" on inventory_movements for delete to authenticated
  using (is_owner(business_id));

revoke all on function domain_is_valid(text) from public;
revoke all on function public_store_by_domain(text) from public;
revoke all on function admin_sales_report(uuid, timestamptz, timestamptz) from public;
revoke all on function protect_last_owner() from public;

grant execute on function domain_is_valid(text), public_store_by_domain(text) to anon, authenticated;
grant execute on function admin_sales_report(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function protect_last_owner() to anon, authenticated;

grant update (min_stock) on products to authenticated;

revoke all on table order_items from anon, authenticated;
grant select (id, business_id, order_id, product_id, combo_id, name, unit_price, quantity),
      insert (business_id, order_id, product_id, combo_id, name, unit_price, quantity),
      update (order_id, product_id, combo_id, name, unit_price, quantity),
      delete on order_items to authenticated;

revoke all on table business_domains from anon;
grant select, insert, update, delete on business_domains to authenticated;

insert into business_domains (business_id, domain, verified)
select id, 'dondenoe.vercel.app', true
from businesses
where slug = 'dondenoe'
on conflict (domain) do nothing;
